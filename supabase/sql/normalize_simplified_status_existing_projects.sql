-- PMS10 simplified status cleanup.
--
-- This normalizes existing project statuses using the accepted simple rule:
-- 1. Physical >= 100 or status Completed -> Completed
-- 2. Terminated / Cancelled / Suspended text -> same critical status
-- 3. Physical > 0 and < 100 -> Ongoing
-- 4. Physical = 0 with contract evidence -> Not Yet Started
-- 5. Physical = 0 with no contract evidence -> Under Procurement
--
-- Risk cleanup:
-- Completed or 100% physical -> risk_level = None

update public.projects
set
  status = case
    when coalesce(
      nullif(regexp_replace(coalesce(physical_accomplishment::text, ''), '[^0-9.]', '', 'g'), '')::numeric,
      0
    ) >= 100
      or lower(coalesce(status::text, '')) like '%complete%'
      then 'Completed'

    when lower(coalesce(status::text, '')) like '%terminat%'
      then 'Terminated'

    when lower(coalesce(status::text, '')) like '%cancel%'
      then 'Cancelled'

    when lower(coalesce(status::text, '')) like '%suspend%'
      then 'Suspended'

    when coalesce(
      nullif(regexp_replace(coalesce(physical_accomplishment::text, ''), '[^0-9.]', '', 'g'), '')::numeric,
      0
    ) > 0
      then 'Ongoing'

    when
      coalesce(contractor::text, '') <> ''
      or coalesce(
        nullif(regexp_replace(coalesce(contract_amount::text, ''), '[^0-9.]', '', 'g'), '')::numeric,
        0
      ) > 0
      or start_date is not null
      or contract_expiration_date is not null
      or revised_contract_expiration_date is not null
      then 'Not Yet Started'

    else 'Under Procurement'
  end,
  risk_level = case
    when coalesce(
      nullif(regexp_replace(coalesce(physical_accomplishment::text, ''), '[^0-9.]', '', 'g'), '')::numeric,
      0
    ) >= 100
      or lower(coalesce(status::text, '')) like '%complete%'
      then 'None'
    else risk_level
  end,
  updated_at = now();

-- Verification: these counts should add up to total_projects.
with status_counts as (
  select status, count(*) as records
  from public.projects
  group by status
),
total_count as (
  select count(*) as total_projects from public.projects
)
select * from status_counts
union all
select 'TOTAL PROJECTS', total_projects from total_count
order by status;
