-- PMS10 strong cleanup:
-- Clear High Risk for projects and project updates where the project is Completed
-- or physical accomplishment is 100% or higher.
--
-- This is intentionally defensive because physical_accomplishment may be numeric
-- or stored as text depending on older app versions/imports.

do $$
begin
  if to_regclass('public.projects') is not null then
    execute $sql$
      update public.projects
      set
        risk_level = 'None',
        updated_at = now()
      where
        lower(coalesce(status::text, '')) like '%complete%'
        or coalesce(
          nullif(regexp_replace(coalesce(physical_accomplishment::text, ''), '[^0-9.]', '', 'g'), '')::numeric,
          0
        ) >= 100
    $sql$;
  end if;

  if to_regclass('public.project_updates') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'project_updates'
        and column_name = 'risk_level'
    ) then
      execute $sql$
        update public.project_updates
        set risk_level = 'None'
        where
          (
            exists (
              select 1
              from information_schema.columns
              where table_schema = 'public'
                and table_name = 'project_updates'
                and column_name = 'status'
            )
            and lower(coalesce(status::text, '')) like '%complete%'
          )
          or
          (
            exists (
              select 1
              from information_schema.columns
              where table_schema = 'public'
                and table_name = 'project_updates'
                and column_name = 'physical_accomplishment'
            )
            and coalesce(
              nullif(regexp_replace(coalesce(physical_accomplishment::text, ''), '[^0-9.]', '', 'g'), '')::numeric,
              0
            ) >= 100
          )
      $sql$;
    end if;
  end if;
end $$;

-- Verification: completed / 100% projects should no longer carry High risk.
select
  id,
  project_name,
  status,
  physical_accomplishment,
  risk_level
from public.projects
where
  lower(coalesce(status::text, '')) like '%complete%'
  or coalesce(
    nullif(regexp_replace(coalesce(physical_accomplishment::text, ''), '[^0-9.]', '', 'g'), '')::numeric,
    0
  ) >= 100
order by project_name
limit 100;
