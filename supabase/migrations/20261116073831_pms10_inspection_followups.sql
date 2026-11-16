-- Desktop inspection follow-up pilot. Source inspections and official project
-- fields stay untouched. Project AOR policies also govern tracker visibility.
begin;

create table public.inspection_followups (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_update_id uuid references public.project_updates(id) on delete set null,
  source_item integer not null check (source_item > 0),
  recommendation text not null check (char_length(btrim(recommendation)) between 1 and 8000),
  responsible_person text check (responsible_person is null or char_length(btrim(responsible_person)) between 1 and 180),
  due_date date,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  resolution_note text check (resolution_note is null or char_length(btrim(resolution_note)) between 1 and 2000),
  evidence_url text check (evidence_url is null or (char_length(evidence_url) <= 2048 and evidence_url ~ '^https://[^[:space:]]+$')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint followup_source_item_key unique (source_update_id, source_item),
  constraint followup_resolution_evidence check (
    (status = 'resolved' and (resolution_note is not null or evidence_url is not null))
    or (status <> 'resolved' and resolution_note is null and evidence_url is null)
  )
);

create index inspection_followups_project_idx on public.inspection_followups (project_id);

alter table public.inspection_followups enable row level security;
revoke all on public.inspection_followups from public, anon, authenticated;
grant select on public.inspection_followups to authenticated;
grant insert (project_id, source_update_id, source_item, recommendation, responsible_person, due_date)
  on public.inspection_followups to authenticated;
grant update (responsible_person, due_date, status, resolution_note, evidence_url)
  on public.inspection_followups to authenticated;

create policy "Read follow-ups for visible pilot projects"
on public.inspection_followups for select to authenticated
using (exists (
  select 1 from public.projects p
  where p.id = inspection_followups.project_id and lower(btrim(p.province)) = 'bukidnon'
));

create policy "Track follow-ups for writable pilot projects"
on public.inspection_followups for insert to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.projects p
    join public.project_updates u on u.project_id = p.id
    where p.id = inspection_followups.project_id
      and u.id = inspection_followups.source_update_id
      and nullif(btrim(u.recommendations), '') is not null
      and lower(btrim(p.province)) = 'bukidnon'
      and pms10_private.field_access(p.province, p.municipality, false)
  )
);

create policy "Manage follow-ups for writable pilot projects"
on public.inspection_followups for update to authenticated
using (exists (
  select 1 from public.projects p
  where p.id = inspection_followups.project_id
    and lower(btrim(p.province)) = 'bukidnon'
    and pms10_private.field_access(p.province, p.municipality, false)
))
with check (exists (
  select 1 from public.projects p
  where p.id = inspection_followups.project_id
    and lower(btrim(p.province)) = 'bukidnon'
    and pms10_private.field_access(p.province, p.municipality, false)
));

create function pms10_private.touch_inspection_followup()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function pms10_private.touch_inspection_followup() from public, anon, authenticated;

create trigger touch_inspection_followup before update on public.inspection_followups
for each row execute function pms10_private.touch_inspection_followup();

commit;
