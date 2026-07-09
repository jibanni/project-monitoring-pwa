-- Normalize existing FALGU variants already imported in PMS10.
-- This keeps only the main program name for filtering/grouping.

update public.projects
set
  funding_source = 'FALGU',
  updated_at = now()
where
  funding_source is not null
  and (
    upper(trim(funding_source::text)) = 'FALGU'
    or upper(trim(funding_source::text)) like 'FALGU-%'
    or upper(trim(funding_source::text)) like 'FALGU %'
    or upper(trim(funding_source::text)) like 'FALGU/%'
    or upper(trim(funding_source::text)) like 'FALGU_%'
    or upper(trim(funding_source::text)) like 'LGSF-FALGU%'
    or upper(trim(funding_source::text)) like 'LGSF FALGU%'
  );

-- Quick check
select funding_source, count(*) as records
from public.projects
group by funding_source
order by records desc, funding_source;
