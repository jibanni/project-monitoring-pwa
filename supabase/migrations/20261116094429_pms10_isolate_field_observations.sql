begin;

-- An inspection is a separate record, never a masterlist refresh.
drop trigger if exists sync_project_after_update_insert on public.project_updates;

-- Older web/APK builds can still send the former date/GPS metadata patch.
-- Silently retain the stored masterlist values for a linked project so those
-- clients can finish saving their inspection and uploading its photos.
-- Non-linked projects and privileged maintenance without a user JWT are unaffected.
create or replace function pms10_private.keep_linked_masterlist_location()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if nullif(btrim(old.subaybayan_project_code), '') is not null and (select auth.uid()) is not null then
    new.last_inspection_date := old.last_inspection_date;
    new.latitude := old.latitude;
    new.longitude := old.longitude;
  end if;
  return new;
end;
$function$;

revoke all on function pms10_private.keep_linked_masterlist_location() from public, anon, authenticated;
drop trigger if exists a_pms10_keep_linked_masterlist_location on public.projects;
create trigger a_pms10_keep_linked_masterlist_location
  before update of latitude, longitude, last_inspection_date on public.projects
  for each row execute function pms10_private.keep_linked_masterlist_location();

commit;
