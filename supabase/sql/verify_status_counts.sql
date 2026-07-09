-- Verification query for PMS10 simplified dashboard status counts.
-- These status counts should add up to TOTAL PROJECTS.
-- High Risk is intentionally NOT included here because it is a risk subset, not a status.

with normalized as (
  select
    case
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
    end as pms_status
  from public.projects
),
counts as (
  select pms_status, count(*) as records
  from normalized
  group by pms_status
),
total as (
  select count(*) as total_projects from public.projects
)
select pms_status as category, records from counts
union all
select 'TOTAL PROJECTS', total_projects from total
order by category;
