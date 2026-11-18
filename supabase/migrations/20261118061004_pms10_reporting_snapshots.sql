begin;

create table public.pms10_reporting_snapshots (
  id uuid primary key default gen_random_uuid(),
  report_month date not null check (extract(day from report_month) = 1),
  program text check (program is null or char_length(program) between 1 and 160),
  funding_year integer check (funding_year is null or funding_year between 1900 and 2200),
  province text check (province is null or char_length(province) between 1 and 160),
  captured_at timestamptz not null default statement_timestamp(),
  captured_by uuid default auth.uid() references auth.users(id) on delete set null,
  official_rows jsonb not null check (jsonb_typeof(official_rows) = 'array'),
  project_count integer generated always as (jsonb_array_length(official_rows)) stored
);

create index pms10_reporting_snapshots_recency on public.pms10_reporting_snapshots (report_month desc, captured_at desc, id desc);
alter table public.pms10_reporting_snapshots enable row level security;
revoke all on public.pms10_reporting_snapshots from public, anon, authenticated;
grant select on public.pms10_reporting_snapshots to authenticated;
create policy "Approved admins read reporting snapshots" on public.pms10_reporting_snapshots
  for select to authenticated using ((select pms10_private.active_account(true)));

-- Select only official master records and reporting fields. Actual on-site
-- statuses and accomplishments live in project_updates and are not queried.
create function pms10_private.reporting_official_rows(p_program text, p_year integer, p_province text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with official as (
    select p.id, btrim(p.subaybayan_project_code) as code, btrim(p.project_name) as title,
           nullif(btrim(p.province), '') as province, nullif(btrim(p.municipality), '') as municipality,
           p.funding_year, p.physical_accomplishment as physical, p.financial_accomplishment as financial,
           regexp_replace(lower(coalesce(p.status, '')), '[_-]+', ' ', 'g') as project_status,
           p.contractor, p.start_date, p.contract_expiration_date,
           p.revised_contract_expiration_date,
           coalesce(nullif(btrim(p.funding_source), ''), nullif(btrim(p.project_type), ''), 'Unspecified') as program_label
    from public.projects p
    where (select pms10_private.active_account(true))
      and nullif(btrim(p.subaybayan_project_code), '') is not null
      and (p_year is null or p.funding_year = p_year)
      and (p_province is null or lower(btrim(p.province)) = lower(p_province))
  ), classified as (
    select o.*,
           case when program_label ~* '(^|[[:space:]-])(UA|Unprogrammed([[:space:]]+(Appropriations?|Funds?))?)$'
                then regexp_replace(program_label, '([[:space:]-]+)(UA|Unprogrammed([[:space:]]+(Appropriations?|Funds?))?)$', '', 'i') || '-UA'
                when code ~* '(^|-)UA(-|$)' then program_label || '-UA'
                else program_label end as program,
           case
             when physical >= 100 or project_status like '%complete%' then 'Completed'
             when project_status like '%terminat%' then 'Terminated'
             when project_status like '%cancel%' then 'Cancelled'
             when project_status like '%suspend%' then 'Suspended'
             when project_status like '%procurement%' then 'Under Procurement'
             when project_status like '%not%start%' then 'Not Yet Started'
             when project_status like '%ongoing%' or project_status like '%on going%' or project_status like '%implementation%' or physical > 0 then 'Ongoing'
             when nullif(btrim(contractor), '') is not null or start_date is not null
               or contract_expiration_date is not null or revised_contract_expiration_date is not null then 'Not Yet Started'
             else 'Under Procurement'
           end as status
    from official o
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'code', code, 'title', title, 'province', province, 'municipality', municipality,
    'program', program, 'fundingYear', funding_year, 'status', status, 'physical', physical, 'financial', financial
  ) order by id), '[]'::jsonb)
  from classified
  where p_program is null or lower(program) = lower(p_program);
$$;

-- Only the server may write the contents; clients cannot fabricate or edit
-- snapshots with direct insert/update/delete. Keep the definer in the private schema.
create function pms10_private.save_reporting_snapshot(p_month date, p_program text, p_year integer, p_province text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_program text := nullif(btrim(p_program), '');
  v_province text := nullif(btrim(p_province), '');
  v_rows jsonb;
  v_id uuid;
begin
  if not pms10_private.active_account(true) then
    raise exception 'An approved, active admin is required.' using errcode='42501';
  end if;
  if not pms10_private.allow_sensitive_admin_write() then
    raise exception 'Verify your authenticator in Admin Security before saving a snapshot.' using errcode='42501';
  end if;
  if p_month is null or extract(day from p_month) <> 1 or extract(year from p_month) not between 1900 and 2200
     or (p_year is not null and p_year not between 1900 and 2200)
     or length(v_program) > 160 or length(v_province) > 160 then
    raise exception 'Select a valid reporting month and scope.' using errcode='22023';
  end if;
  v_rows := pms10_private.reporting_official_rows(v_program, p_year, v_province);
  if jsonb_array_length(v_rows) = 0 then
    raise exception 'There are no SubayBAYAN Official projects in this scope.' using errcode='22023';
  end if;
  insert into public.pms10_reporting_snapshots (report_month, program, funding_year, province, official_rows)
    values (p_month, v_program, p_year, v_province, v_rows) returning id into v_id;
  return v_id;
end;
$$;

create function public.pms10_save_reporting_snapshot(p_month date, p_program text, p_year integer, p_province text)
returns uuid language sql security invoker set search_path = '' as $$
  select pms10_private.save_reporting_snapshot(p_month, p_program, p_year, p_province);
$$;

create function public.pms10_compare_reporting_snapshot(p_snapshot_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'comparedAt', statement_timestamp(),
    'baseline', s.official_rows,
    'current', pms10_private.reporting_official_rows(s.program, s.funding_year, s.province)
  )
  from public.pms10_reporting_snapshots s
  where s.id = p_snapshot_id;
$$;

revoke all on function pms10_private.reporting_official_rows(text,integer,text),
  pms10_private.save_reporting_snapshot(date,text,integer,text),
  public.pms10_save_reporting_snapshot(date,text,integer,text),
  public.pms10_compare_reporting_snapshot(uuid) from public, anon, authenticated;
grant execute on function pms10_private.reporting_official_rows(text,integer,text),
  pms10_private.save_reporting_snapshot(date,text,integer,text),
  public.pms10_save_reporting_snapshot(date,text,integer,text),
  public.pms10_compare_reporting_snapshot(uuid) to authenticated;
commit;
