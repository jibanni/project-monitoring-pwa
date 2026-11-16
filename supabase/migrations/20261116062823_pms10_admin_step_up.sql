begin;

-- Separate enrollment from enforcement. This migration does not turn it on.
create table if not exists pms10_private.admin_security_settings (
  singleton boolean primary key default true check (singleton),
  require_mfa boolean not null default false
);
revoke all on pms10_private.admin_security_settings from public, anon, authenticated;
insert into pms10_private.admin_security_settings (singleton) values (true) on conflict do nothing;

create or replace function pms10_private.admin_mfa_required()
returns boolean language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null and pms10_private.active_account(true)
    and coalesce((select require_mfa from pms10_private.admin_security_settings where singleton),false)
$$;

create or replace function pms10_private.allow_sensitive_admin_write()
returns boolean language sql stable security invoker set search_path = ''
as $$
  select not pms10_private.admin_mfa_required() or coalesce((select auth.jwt())->>'aal'='aal2',false)
$$;

revoke all on function pms10_private.admin_mfa_required(), pms10_private.allow_sensitive_admin_write() from public, anon;
grant execute on function pms10_private.admin_mfa_required(), pms10_private.allow_sensitive_admin_write() to authenticated;

create or replace function public.pms10_admin_security_status()
returns boolean language sql stable security invoker set search_path = ''
as $$ select pms10_private.allow_sensitive_admin_write() $$;
revoke all on function public.pms10_admin_security_status() from public, anon;
grant execute on function public.pms10_admin_security_status() to authenticated;

create policy "Admin MFA for profile changes" on public.profiles as restrictive for update to authenticated
  using ((select pms10_private.allow_sensitive_admin_write()))
  with check ((select pms10_private.allow_sensitive_admin_write()));

-- Restrict assignment changes without applying the write gate to normal reads.
do $$
declare tab text; action text;
begin
  foreach tab in array array['po_engineer_lgu_assignments','ro_engineer_province_assignments','advisories'] loop
    foreach action in array array['insert','update','delete'] loop
      execute format('create policy %I on public.%I as restrictive for %s to authenticated %s',
        'Admin MFA for '||action,tab,action,
        case action when 'insert' then 'with check ((select pms10_private.allow_sensitive_admin_write()))'
          when 'delete' then 'using ((select pms10_private.allow_sensitive_admin_write()))'
          else 'using ((select pms10_private.allow_sensitive_admin_write())) with check ((select pms10_private.allow_sensitive_admin_write()))' end);
    end loop;
  end loop;
end $$;

create policy "Admin MFA for import batches" on public.subay_import_batches as restrictive for insert to authenticated
  with check ((select pms10_private.allow_sensitive_admin_write()));
create policy "Admin MFA for import source" on public.subay_import_source_rows as restrictive for insert to authenticated
  with check ((select pms10_private.allow_sensitive_admin_write()));
create policy "Admin MFA for project creation or import" on public.projects as restrictive for insert to authenticated
  with check ((select pms10_private.allow_sensitive_admin_write()));
create policy "Admin MFA for project deletion" on public.projects as restrictive for delete to authenticated
  using ((select pms10_private.allow_sensitive_admin_write()));
create policy "Admin MFA for project photo deletion" on public.project_photos as restrictive for delete to authenticated
  using ((select pms10_private.allow_sensitive_admin_write()));
create policy "Admin MFA for legacy file deletion" on storage.objects as restrictive for delete to authenticated
  using (bucket_id<>'project-photos' or (select pms10_private.allow_sensitive_admin_write()));

-- Leave routine inspection date/GPS writes and the Offline Sync upload path alone.
create or replace function pms10_private.guard_admin_master_edit()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if current_user='authenticated' and not pms10_private.allow_sensitive_admin_write()
    and (to_jsonb(old)-array['last_inspection_date','latitude','longitude'])
    is distinct from (to_jsonb(new)-array['last_inspection_date','latitude','longitude'])
  then raise exception 'Verify your authenticator in Admin Security before changing master data.' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function pms10_private.guard_admin_master_edit() from public, anon, authenticated;
create trigger pms10_admin_master_mfa before update on public.projects
  for each row execute function pms10_private.guard_admin_master_edit();

create or replace function pms10_private.remove_project_item(
  p_project_id uuid, p_item_kind text, p_item_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_inspection_date date;
begin
  if not exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'Admin'
      and approved is true and is_active is not false
  ) then
    raise exception 'Only an active, approved admin can remove project items.' using errcode = '42501';
  end if;

  if not pms10_private.allow_sensitive_admin_write() then
    raise exception 'Verify your authenticator in Admin Security before removing records.' using errcode='42501';
  end if;

  if p_project_id is null or p_item_id is null or p_item_kind is null then
    raise exception 'A project, item type and item are required.' using errcode = '22023';
  end if;

  case p_item_kind
    when 'update' then
      -- Serialize last-inspection-date changes for removals on the same project.
      perform 1 from public.projects where id = p_project_id for no key update;
      select inspection_date into v_inspection_date
      from public.project_updates
      where id = p_item_id and project_id = p_project_id
      for update;

      if not found then
        raise exception 'The update no longer exists on this project.' using errcode = 'P0002';
      end if;

      -- Keep inspection evidence in Files & Photos. The documents foreign
      -- key already detaches documents when the update is removed.
      update public.project_photos set project_update_id = null
      where project_id = p_project_id and project_update_id = p_item_id;

      delete from public.project_updates
      where id = p_item_id and project_id = p_project_id;

      -- If the project date referred to the removed update, refresh only
      -- that date. Never rewrite SubayBAYAN accomplishment, status or risk.
      update public.projects set last_inspection_date = (
        select max(inspection_date)
        from public.project_updates where project_id = p_project_id
      )
      where id = p_project_id and last_inspection_date = v_inspection_date;

    when 'photo' then
      delete from public.project_photos
      where id = p_item_id and project_id = p_project_id;
      if not found then
        raise exception 'The photo no longer exists on this project.' using errcode = 'P0002';
      end if;

    when 'document' then
      delete from public.documents
      where id = p_item_id and project_id = p_project_id;
      if not found then
        raise exception 'The document no longer exists on this project.' using errcode = 'P0002';
      end if;

    else
      raise exception 'Unknown project item type.' using errcode = '22023';
  end case;
end;
$function$;


commit;
