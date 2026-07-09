-- PMS10: Clear High Risk from completed projects.
-- Run this after importing SubayBAYAN data or whenever old completed projects still show as High Risk.

update public.projects
set
  risk_level = 'None',
  updated_at = now()
where
  (
    coalesce(physical_accomplishment, 0) >= 100
    or lower(coalesce(status, '')) like '%complete%'
  )
  and lower(coalesce(risk_level, '')) like '%high%';

-- Optional verification:
select
  id,
  project_name,
  status,
  physical_accomplishment,
  risk_level
from public.projects
where
  coalesce(physical_accomplishment, 0) >= 100
  or lower(coalesce(status, '')) like '%complete%';
