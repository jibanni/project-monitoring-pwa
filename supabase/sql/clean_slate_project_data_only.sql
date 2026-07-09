-- PMS10 CLEAN SLATE FOR PROJECT DATA ONLY
-- This deletes enrolled projects and their monitoring records.
-- It does NOT delete users, profiles, authentication accounts, or app settings.
-- It does NOT delete Google Drive files/folders already uploaded.

begin;

-- Delete child/dependent records first where the tables exist.
do $$
begin
  if to_regclass('public.project_photos') is not null then
    execute 'delete from public.project_photos';
  end if;

  if to_regclass('public.project_updates') is not null then
    execute 'delete from public.project_updates';
  end if;

  if to_regclass('public.projects') is not null then
    execute 'delete from public.projects';
  end if;
end $$;

commit;

-- Optional verification:
select
  coalesce((select count(*) from public.projects), 0) as projects_count;
