begin;

create or replace function pms10_private.location_key(label text)
returns text language sql immutable set search_path = ''
as $$
  select nullif(btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    lower(coalesce(label, '')), '\([^)]*\)', ' ', 'g'), '\mprovince\s+of\M', ' ', 'g'),
    '^\s*city\s+of\s+|\s+city\s*$', '', 'g'), '[^a-z0-9]+', ' ', 'g')), '')
$$;

create or replace function pms10_private.huc_key(label text)
returns text language sql immutable set search_path = ''
as $$
  select case pms10_private.location_key(label)
    when 'cdo' then 'cagayan de oro'
    when 'cagayan de oro' then 'cagayan de oro'
    when 'iligan' then 'iligan'
    else null end
$$;

create or replace function pms10_private.read_grants()
returns table(scope_kind text, scope_province text, scope_lgu text)
language sql stable security definer set search_path = ''
as $function$
  with account as (
    select id, lower(regexp_replace(btrim(role), '\s+', ' ', 'g')) as r,
           pms10_private.location_key(aor_level) as a,
           pms10_private.location_key(province) as prov,
           pms10_private.location_key(municipality) as lgu,
           pms10_private.location_key(city) as city_key,
           pms10_private.huc_key(huc) as huc_key
    from public.profiles
    where id=(select auth.uid()) and approved is true and is_active is not false
  ),
  ro as (
    select pms10_private.location_key(r.province) as prov
    from public.ro_engineer_province_assignments r join account a on r.user_id=a.id
    where r.is_active is true
  ),
  po as (
    select pms10_private.location_key(p.province) as prov, pms10_private.location_key(p.municipality) as lgu
    from public.po_engineer_lgu_assignments p join account a on p.user_id=a.id
    where p.is_active is true
  )
  select 'regional',null::text,null::text from account where r in
    ('admin','rd','regional director','ard','assistant regional director','pdmu chief','pdmu chief/head','pdmu head','pdmu')
  union all
  select 'province',coalesce(pms10_private.huc_key(prov),prov),null from account
    where r in ('po engineer','po engineers','engineer','pd','provincial director','peo','project evaluation officer')
       or (r in ('ro engineer','ro engineers') and not exists(select from ro))
  union all
  select 'province',coalesce(pms10_private.huc_key(ro.prov),ro.prov),null from account cross join ro
    where r in ('ro engineer','ro engineers')
  union all
  select 'province',coalesce(pms10_private.huc_key(po.prov),po.prov),null from account cross join po
    where r in ('po engineer','po engineers','engineer')
  union all
  select 'pair',coalesce(pms10_private.huc_key(po.prov),po.prov),coalesce(pms10_private.huc_key(po.lgu),po.lgu)
    from account cross join po where r in ('mlgoo','municipal local government operations officer')
  union all
  select 'pair',coalesce(pms10_private.huc_key(prov),prov),coalesce(pms10_private.huc_key(lgu),lgu)
    from account where r in ('mlgoo','municipal local government operations officer') and not exists(select from po)
  union all
  select 'huc',huc_key,null from account where r in ('cd','city director')
  union all
  select 'lgu',null,coalesce(pms10_private.huc_key(city_key),city_key) from account
    where r in ('clgoo','city local government operations officer')
  union all
  select case a
    when 'regional' then 'regional'
    when 'province' then 'province'
    when 'provincial' then 'province'
    when 'huc' then 'huc'
    when 'city' then 'lgu'
    when 'municipality' then 'lgu'
    when 'municipality lgu' then 'lgu'
    when 'assigned lgu' then 'pair'
    when 'assigned lgu s' then 'pair'
    end,
    case when a='huc' then huc_key else coalesce(pms10_private.huc_key(prov),prov) end,
    case when a='city' then coalesce(pms10_private.huc_key(city_key),city_key)
         else coalesce(pms10_private.huc_key(lgu),lgu) end
  from account where r='viewer'
$function$;

-- Materialize only the caller's scope once per request. Compare both the raw
-- province and the app's canonical HUC so current provincial access is kept.
create or replace function pms10_private.matches_read_scope(p_province text, p_lgu text, grants jsonb)
returns boolean language sql immutable set search_path = ''
as $function$
  with project as (
    select coalesce(pms10_private.huc_key(p_province),pms10_private.location_key(p_province)) as raw_province,
           coalesce(pms10_private.huc_key(p_lgu),pms10_private.huc_key(p_province),pms10_private.location_key(p_province)) as area,
           coalesce(pms10_private.huc_key(p_lgu),pms10_private.huc_key(p_province),pms10_private.location_key(p_lgu)) as lgu
  )
  select exists (
    select 1 from jsonb_to_recordset(coalesce(grants,'[]')) as g(scope_kind text,scope_province text,scope_lgu text)
    cross join project p
    where g.scope_kind='regional'
       or (g.scope_kind='province' and g.scope_province in (p.raw_province,p.area))
       or (g.scope_kind='pair' and g.scope_province in (p.raw_province,p.area) and g.scope_lgu=p.lgu)
       or (g.scope_kind='huc' and g.scope_province=p.area)
       or (g.scope_kind='lgu' and g.scope_lgu=p.lgu)
  )
$function$;

revoke all on function pms10_private.location_key(text), pms10_private.huc_key(text),
 pms10_private.read_grants(), pms10_private.matches_read_scope(text,text,jsonb) from public, anon;
grant execute on function pms10_private.location_key(text), pms10_private.huc_key(text),
 pms10_private.read_grants(), pms10_private.matches_read_scope(text,text,jsonb) to authenticated;

drop policy "Active PMS10 users read projects" on public.projects;
create policy "Assigned scope can read projects" on public.projects for select to authenticated
using (pms10_private.matches_read_scope(province, municipality,
  (select jsonb_agg(g) from pms10_private.read_grants() g)));

drop policy "Active PMS10 users read updates" on public.project_updates;
create policy "Assigned scope can read updates" on public.project_updates for select to authenticated
using (exists (select 1 from public.projects p where p.id=project_updates.project_id));

drop policy "Active PMS10 users read photos" on public.project_photos;
create policy "Assigned scope can read photos" on public.project_photos for select to authenticated
using (exists (select 1 from public.projects p where p.id=project_photos.project_id));

drop policy "Active PMS10 users read documents" on public.documents;
create policy "Assigned scope can read documents" on public.documents for select to authenticated
using (exists (select 1 from public.projects p where p.id=documents.project_id));

commit;
