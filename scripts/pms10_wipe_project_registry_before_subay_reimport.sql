/*
PMS10 ONE-TIME PROJECT REGISTRY RESET BEFORE SAFE SUBAYBAYAN RE-IMPORT

Purpose:
- Backup current project-related data.
- Wipe current project registry data so the corrected SubayBAYAN parser can re-import clean data.

IMPORTANT:
- Run this only in Supabase SQL Editor when you are ready to wipe the current project registry.
- This does NOT delete users, profiles, roles, engineer assignments, or auth accounts.
- This deletes:
  public.project_photos rows
  public.project_updates rows
  public.projects rows

Recommended before running:
1. Confirm that the current projects are initial/import-test data or that you intentionally want a clean registry.
2. Download/keep copies of the two SubayBAYAN extracted Excel files.
3. Run this script once.
4. Verify that projects/project updates/project photo rows are zero.
*/

create schema if not exists pms10_backup;

do $$
declare
  backup_suffix text := to_char(clock_timestamp(), 'YYYYMMDD_HH24MISS');
begin
  execute format(
    'create table pms10_backup.projects_before_subay_reset_%s as table public.projects',
    backup_suffix
  );

  if to_regclass('public.project_updates') is not null then
    execute format(
      'create table pms10_backup.project_updates_before_subay_reset_%s as table public.project_updates',
      backup_suffix
    );
  end if;

  if to_regclass('public.project_photos') is not null then
    execute format(
      'create table pms10_backup.project_photos_before_subay_reset_%s as table public.project_photos',
      backup_suffix
    );
  end if;

  raise notice 'PMS10 backup suffix: %', backup_suffix;
end $$;

-- Delete child rows first.
delete from public.project_photos
where project_id in (select id from public.projects)
   or project_update_id in (
      select id from public.project_updates
      where project_id in (select id from public.projects)
   );

delete from public.project_updates
where project_id in (select id from public.projects);

delete from public.projects;

-- Verification counts.
select 'projects' as table_name, count(*) as remaining_rows from public.projects
union all
select 'project_updates' as table_name, count(*) as remaining_rows from public.project_updates
union all
select 'project_photos' as table_name, count(*) as remaining_rows from public.project_photos;
