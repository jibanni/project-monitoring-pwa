-- Remove individual project records without deleting external file binaries
-- or changing the official SubayBAYAN physical, financial, status or risk data.
begin;

create schema if not exists pms10_private;
revoke all on schema pms10_private from public, anon;
grant usage on schema pms10_private to authenticated;

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

revoke all on function pms10_private.remove_project_item(uuid, text, uuid) from public, anon;
grant execute on function pms10_private.remove_project_item(uuid, text, uuid) to authenticated;

-- Only the checked RPC is exposed to the Data API. Existing table policies
-- are unchanged, and the privileged function lives outside public.
create or replace function public.pms10_admin_remove_project_item(
  p_project_id uuid, p_item_kind text, p_item_id uuid
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select pms10_private.remove_project_item(p_project_id, p_item_kind, p_item_id);
$function$;

revoke all on function public.pms10_admin_remove_project_item(uuid, text, uuid) from public, anon;
grant execute on function public.pms10_admin_remove_project_item(uuid, text, uuid) to authenticated;

commit;
