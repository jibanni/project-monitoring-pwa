/*
PMS10 PROGRAM / FUNDING SOURCE NORMALIZATION

Purpose:
- Normalize already-imported project funding_source values.
- FALGU prevails over Financial Assistance to Local Government Unit Program.
- GREEN, GREEN, GREEN prevails over GGG / Green Green Green.
- GEF prevails over Growth Equity Fund.
- SBDP prevails over Support to the Barangay Development Program.
- SAFPB prevails over Support and Assistance Fund to Participatory Budgeting.
- Also recognizes CMGP, KALSADA, RAPID, SALINTUBIG, LRBIP/RBIS, and LIME-20.

Run in Supabase SQL Editor after the code patch is applied.

This does not delete any data.
*/

create schema if not exists pms10_backup;

do $$
declare
  backup_suffix text := to_char(clock_timestamp(), 'YYYYMMDD_HH24MISS');
begin
  execute format(
    'create table pms10_backup.projects_before_program_normalization_%s as table public.projects',
    backup_suffix
  );

  raise notice 'PMS10 program normalization backup suffix: %', backup_suffix;
end $$;

create or replace function public.pms10_canonical_program_name(input_value text)
returns text
language plpgsql
immutable
as $$
declare
  compact text := regexp_replace(upper(coalesce(input_value, '')), '[^A-Z0-9]+', '', 'g');
  upper_text text := regexp_replace(upper(coalesce(input_value, '')), '[^A-Z0-9]+', ' ', 'g');
begin
  if compact = '' then
    return null;
  end if;

  if compact ~ '^(LGSF)?FALGU'
     or compact like '%FINANCIALASSISTANCETOLOCALGOVERNMENTUNIT%'
     or compact like '%FINANCIALASSISTANCETOLOCALGOVERNMENTUNITS%' then
    return 'FALGU';
  end if;

  if compact = 'GGG'
     or compact like '%GREENGREENGREEN%' then
    return 'GREEN, GREEN, GREEN';
  end if;

  if compact = 'GEF'
     or compact like 'LGSFGEF%'
     or compact like '%GROWTHEQUITYFUND%' then
    return 'GEF';
  end if;

  if compact = 'SBDP'
     or compact like 'LGSFSBDP%'
     or compact like '%SUPPORTTOTHEBARANGAYDEVELOPMENTPROGRAM%'
     or compact like '%SUPPORTTOBARANGAYDEVELOPMENTPROGRAM%'
     or compact like '%BARANGAYDEVELOPMENTPROGRAM%' then
    return 'SBDP';
  end if;

  if compact = 'SAFPB'
     or compact like 'LGSFSAFPB%'
     or compact like '%SUPPORTANDASSISTANCEFUNDTOPARTICIPATORYBUDGETING%'
     or compact like '%SUPPORTASSISTANCEFUNDTOPARTICIPATORYBUDGETING%'
     or compact like '%PARTICIPATORYBUDGETING%' then
    return 'SAFPB';
  end if;

  if compact = 'CMGP'
     or compact like 'LGSFCMGP%'
     or compact like '%CONDITIONALMATCHINGGRANTTOPROVINCES%'
     or compact like '%CONDITIONALMATCHINGGRANT%'
     or compact like '%KALSADACMGP%' then
    return 'CMGP';
  end if;

  if compact = 'KALSADA'
     or compact like 'LGSFKALSADA%'
     or compact like '%KONKRETONGAYOSLAMANGANATDALUYAN%'
     or compact like '%KALSADA%' then
    return 'KALSADA';
  end if;

  if compact = 'RAPID'
     or compact like 'RAPIDGROWTH%'
     or compact like '%RAPIDGROWTH%'
     or compact like '%RURALAGROENTERPRISEPARTNERSHIP%'
     or compact like '%INVESTMENTDEVELOPMENT%' then
    return 'RAPID';
  end if;

  if compact = 'SALINTUBIG'
     or compact like '%SALINTUBIG%'
     or compact like '%SAGANANGPATUBIG%'
     or compact like '%WATERSUPPLY%' then
    return 'SALINTUBIG';
  end if;

  if compact = 'LRBIP'
     or compact like '%LOCALROADANDBRIDGESINFORMATIONPROJECT%'
     or compact like '%LOCALROADSANDBRIDGESINFORMATIONPROJECT%'
     or compact like '%LOCALROADANDBRIDGEINFORMATIONPROJECT%' then
    return 'LRBIP';
  end if;

  if compact = 'RBIS'
     or compact like '%ROADSANDBRIDGESINFORMATIONSYSTEM%' then
    return 'RBIS';
  end if;

  if compact = 'LIME20'
     or compact = 'LIME'
     or compact like '%LIME20%'
     or compact like '%LOCALINFRASTRUCTUREMANAGEMENT%' then
    return 'LIME-20';
  end if;

  return null;
end;
$$;

update public.projects
set
  funding_source = coalesce(
    public.pms10_canonical_program_name(funding_source),
    case
      when nullif(trim(coalesce(funding_source, '')), '') is null
      then public.pms10_canonical_program_name(project_type)
      else null
    end,
    funding_source
  ),
  updated_at = now()
where public.pms10_canonical_program_name(funding_source) is not null
   or (
     nullif(trim(coalesce(funding_source, '')), '') is null
     and public.pms10_canonical_program_name(project_type) is not null
   );

select
  funding_source,
  count(*) as project_count
from public.projects
group by funding_source
order by funding_source;
