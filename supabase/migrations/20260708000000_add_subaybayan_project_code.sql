-- PMS10 SubayBAYAN import support
-- Keeps the phone UI simple while using SubayBAYAN PROJECT CODE as the duplicate-prevention key.

alter table public.projects
  add column if not exists subaybayan_project_code text;

create unique index if not exists projects_subaybayan_project_code_unique
  on public.projects (subaybayan_project_code)
  where subaybayan_project_code is not null
    and btrim(subaybayan_project_code) <> '';
