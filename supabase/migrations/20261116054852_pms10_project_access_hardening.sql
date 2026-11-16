-- Phase 1: remove legacy unauthenticated access and protect official fields.
begin;

-- Remove the original permissive policies. Keeping any one of these alongside
-- stricter permissive policies would allow it to override the intended limits.
drop policy if exists "Allow public read projects" on public.projects;
drop policy if exists "Allow public insert projects" on public.projects;
drop policy if exists "Allow public update projects" on public.projects;
drop policy if exists "public can read project_updates" on public.project_updates;
drop policy if exists "public can insert project_updates" on public.project_updates;
drop policy if exists project_updates_select on public.project_updates;
drop policy if exists project_updates_insert on public.project_updates;
drop policy if exists "Allow public insert project photos" on public.project_photos;
drop policy if exists "Allow public select project photos" on public.project_photos;
drop policy if exists "Allow public uploads 1pweoxh_0" on storage.objects;
drop policy if exists "Allow public viewing 1pweoxh_0" on storage.objects;

revoke all on public.projects, public.project_updates, public.project_photos, public.documents, public.profiles from anon;
revoke execute on function public.current_user_role(), public.current_user_approved(), public.is_current_admin() from public, anon;
grant execute on function public.current_user_role(), public.current_user_approved(), public.is_current_admin() to authenticated;
revoke execute on function public.handle_new_user(), public.sync_project_latest_update() from public, anon, authenticated;

create schema if not exists pms10_private;
grant usage on schema pms10_private to authenticated;

-- Same active-assignment/fallback rule used by the Drive upload functions.
create function pms10_private.field_access(p_province text, p_lgu text, p_edit boolean)
returns boolean language sql stable security definer set search_path = ''
as $function$
  with account as (
    select id, lower(btrim(role)) as role, province, municipality
    from public.profiles
    where id = (select auth.uid()) and approved is true and is_active is not false
  ),
  location as (
    select nullif(lower(regexp_replace(btrim(p_province), '\s+', ' ', 'g')), '') as province,
           nullif(lower(regexp_replace(btrim(p_lgu), '\s+', ' ', 'g')), '') as lgu
  )
  select coalesce((
    select case
      when a.role = 'admin' then true
      when a.role in ('ro engineer','ro engineers') then
        case when exists (select 1 from public.ro_engineer_province_assignments r where r.user_id=a.id and r.is_active is true)
          then exists (select 1 from public.ro_engineer_province_assignments r where r.user_id=a.id and r.is_active is true
                       and lower(regexp_replace(btrim(r.province), '\s+', ' ', 'g'))=l.province)
          else lower(regexp_replace(btrim(a.province), '\s+', ' ', 'g'))=l.province end
      when not p_edit and a.role in ('peo','project evaluation officer') then
        lower(regexp_replace(btrim(a.province), '\s+', ' ', 'g'))=l.province
      when not p_edit and a.role in ('engineer','po engineer','po engineers') then
        case when exists (select 1 from public.po_engineer_lgu_assignments r where r.user_id=a.id and r.is_active is true)
          then exists (select 1 from public.po_engineer_lgu_assignments r where r.user_id=a.id and r.is_active is true
                       and lower(regexp_replace(btrim(r.province), '\s+', ' ', 'g'))=l.province
                       and lower(regexp_replace(btrim(r.municipality), '\s+', ' ', 'g'))=l.lgu)
          else lower(regexp_replace(btrim(a.province), '\s+', ' ', 'g'))=l.province
           and lower(regexp_replace(btrim(a.municipality), '\s+', ' ', 'g'))=l.lgu end
      else false end
    from account a cross join location l
  ), false)
$function$;

create function pms10_private.active_account(p_admin boolean)
returns boolean language sql stable security definer set search_path = ''
as $function$
  select exists (select 1 from public.profiles where id = (select auth.uid())
    and approved is true and is_active is not false
    and (not p_admin or lower(btrim(role)) = 'admin'))
$function$;

revoke all on function pms10_private.field_access(text,text,boolean), pms10_private.active_account(boolean) from public, anon;
grant execute on function pms10_private.field_access(text,text,boolean), pms10_private.active_account(boolean) to authenticated;

-- A suspended admin must not regain permissions through profile management
-- or the older helpers used by advisories and import-history policies.
drop policy if exists "Admins view profiles" on public.profiles;
drop policy if exists "Admins update profiles" on public.profiles;
create policy "Active admins view profiles" on public.profiles for select to authenticated
  using ((select pms10_private.active_account(true)));
create policy "Active admins update profiles" on public.profiles for update to authenticated
  using ((select pms10_private.active_account(true)))
  with check ((select pms10_private.active_account(true)));

create or replace function public.current_user_approved()
returns boolean language sql stable security definer set search_path = ''
as $function$
  select coalesce((select approved and is_active is not false
                   from public.profiles where id=(select auth.uid())), false)
$function$;
alter function public.current_user_role() set search_path = '';
alter function public.handle_new_user() set search_path = '';
alter function public.is_current_admin() set search_path = '';

drop policy if exists "Approved users view projects" on public.projects;
drop policy if exists "View updates" on public.project_updates;
drop policy if exists "Read photos" on public.project_photos;
drop policy if exists "Approved users view project documents" on public.documents;

create policy "Active PMS10 users read projects" on public.projects for select to authenticated using ((select pms10_private.active_account(false)));
create policy "Active PMS10 users read updates" on public.project_updates for select to authenticated using ((select pms10_private.active_account(false)));
create policy "Active PMS10 users read photos" on public.project_photos for select to authenticated using ((select pms10_private.active_account(false)));
create policy "Active PMS10 users read documents" on public.documents for select to authenticated using ((select pms10_private.active_account(false)));

drop policy if exists "Admin insert projects" on public.projects;
drop policy if exists "Admin update projects" on public.projects;
drop policy if exists "Admin delete projects" on public.projects;

create policy "Assigned editors create projects" on public.projects for insert to authenticated
  with check (pms10_private.field_access(province, municipality, true) and
    ((select pms10_private.active_account(true)) or nullif(btrim(subaybayan_project_code), '') is null));
create policy "Assigned staff update projects" on public.projects for update to authenticated
  using (pms10_private.field_access(province, municipality, false))
  with check (pms10_private.field_access(province, municipality, false));
create policy "Active admin deletes projects" on public.projects for delete to authenticated
  using ((select pms10_private.active_account(true)));

-- Existing clients write the latest inspection coordinates/date on both
-- online submit and Offline Sync. Only allow those fields for field users
-- or for any non-admin updating a SubayBAYAN-linked project.
create function pms10_private.guard_project_edit()
returns trigger language plpgsql set search_path = ''
as $function$
begin
  if current_user <> 'authenticated' or pms10_private.active_account(true) then
    return new;
  end if;
  if old.id is distinct from new.id or old.subaybayan_project_code is distinct from new.subaybayan_project_code then
    raise exception 'Only admins can change official project identifiers.' using errcode='42501';
  end if;
  if nullif(btrim(old.subaybayan_project_code), '') is not null
    or not pms10_private.field_access(old.province, old.municipality, true)
    or not pms10_private.field_access(new.province, new.municipality, true) then
    if (to_jsonb(old) - array['last_inspection_date','latitude','longitude'])
       is distinct from (to_jsonb(new) - array['last_inspection_date','latitude','longitude']) then
      raise exception 'Field updates can change only the inspection date and coordinates.' using errcode='42501';
    end if;
  end if;
  return new;
end
$function$;
revoke all on function pms10_private.guard_project_edit() from public, anon, authenticated;
create trigger pms10_guard_project_edit before update on public.projects
  for each row execute function pms10_private.guard_project_edit();

drop policy if exists "Insert updates" on public.project_updates;
create policy "Assigned staff post own updates" on public.project_updates for insert to authenticated
  with check (engineer_id=(select auth.uid()) and exists (
    select 1 from public.projects p where p.id=project_updates.project_id
      and pms10_private.field_access(p.province,p.municipality,false)));

drop policy if exists "Upload photos" on public.project_photos;
create policy "Assigned staff link project photos" on public.project_photos for insert to authenticated
  with check (
    photo_url ~ '^https://drive\.google\.com/(thumbnail\?|uc\?|open\?|file/d/)'
    and exists (
      select 1 from public.project_updates u join public.projects p on p.id=u.project_id
      where u.id=project_photos.project_update_id and p.id=project_photos.project_id
        and pms10_private.field_access(p.province,p.municipality,false)));
create policy "Active admin deletes photo entries" on public.project_photos for delete to authenticated
  using ((select pms10_private.active_account(true)));

-- The old trigger let inspection submissions overwrite official status,
-- amounts and risk. Keep the project-level inspection date only.
create or replace function public.sync_project_latest_update()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  if new.inspection_date is not null then
    update public.projects set last_inspection_date = new.inspection_date
    where id = new.project_id and (last_inspection_date is null or last_inspection_date < new.inspection_date);
  end if;
  return new;
end
$function$;

-- Keep existing public storage URLs working during the transition. Stop new
-- direct uploads to the legacy bucket and let admins clean up old objects.
create policy "Active admin reads legacy photo storage" on storage.objects for select to authenticated
  using (bucket_id='project-photos' and (select pms10_private.active_account(true)));
create policy "Active admin deletes legacy photo storage" on storage.objects for delete to authenticated
  using (bucket_id='project-photos' and (select pms10_private.active_account(true)));

commit;
