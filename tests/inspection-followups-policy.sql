-- Run only in a transaction in a PMS10 database with the pilot migration,
-- returning only the PASS marker. The surrounding runner must roll back.
do $test$
declare
  admin_id uuid;
  peo_id uuid;
  viewer_id uuid;
  viewer_lgu text;
  outside_id uuid;
  pilot_id uuid;
  other_project_id uuid;
  update_id uuid;
  other_update_id uuid;
  action_id uuid;
  affected integer;
begin
  select id into strict admin_id from public.profiles
    where role = 'Admin' and approved is true and is_active is not false limit 1;
  select id into strict peo_id from public.profiles
    where role = 'PEO' and lower(btrim(province)) = 'bukidnon' and approved is true and is_active is not false limit 1;
  select id, municipality into strict viewer_id, viewer_lgu from public.profiles
    where role = 'MLGOO' and lower(btrim(province)) = 'bukidnon'
      and approved is true and is_active is not false
      and nullif(btrim(municipality),'') is not null
      and not exists (select 1 from public.po_engineer_lgu_assignments a where a.user_id = profiles.id and a.is_active)
    limit 1;
  select id into strict outside_id from public.profiles
    where role = 'PEO' and lower(btrim(province)) <> 'bukidnon' and approved is true and is_active is not false limit 1;

  insert into public.projects(project_name, province, municipality, status, physical_accomplishment)
    values('QA Follow-up Rollback', 'Bukidnon', viewer_lgu, 'Completed', 100) returning id into pilot_id;
  insert into public.projects(project_name, province, municipality, status, physical_accomplishment)
    values('QA Other Rollback', 'Camiguin', 'Mambajao', 'Completed', 100) returning id into other_project_id;
  insert into public.project_updates(project_id, engineer_id, recommendations, inspection_date, physical_accomplishment, status)
    values(pilot_id, admin_id, 'Replace the guardrail.', current_date - 10, 100, 'Completed') returning id into update_id;
  insert into public.project_updates(project_id, engineer_id, recommendations, inspection_date, physical_accomplishment, status)
    values(other_project_id, admin_id, 'Test recommendation', current_date - 10, 100, 'Completed') returning id into other_update_id;

  perform set_config('request.jwt.claims', jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2')::text,true);
  execute 'set local role authenticated';
  insert into public.inspection_followups(project_id,source_update_id,source_item,recommendation,due_date)
    values(pilot_id,update_id,1,'Replace the guardrail.',current_date-1) returning id into action_id;
  begin
    insert into public.inspection_followups(project_id,source_update_id,source_item,recommendation)
      values(pilot_id,update_id,1,'Duplicate');
    raise exception 'duplicate source item was accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into public.inspection_followups(project_id,source_update_id,source_item,recommendation)
      values(pilot_id,other_update_id,1,'Mismatched source project');
    raise exception 'mismatched source project was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.inspection_followups(project_id,source_update_id,source_item,recommendation)
      values(other_project_id,other_update_id,1,'Out of pilot');
    raise exception 'non-Bukidnon project was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.inspection_followups set status='resolved' where id=action_id;
    raise exception 'resolved without note or evidence';
  exception when check_violation then null;
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', jsonb_build_object('sub',peo_id,'role','authenticated','aal','aal1')::text,true);
  execute 'set local role authenticated';
  update public.inspection_followups set status='in_progress', responsible_person='Municipal Engineering Office' where id=action_id;
  if not found then raise exception 'in-scope PEO cannot manage action'; end if;
  update public.inspection_followups set status='resolved',resolution_note='Evidence checked during follow-up.' where id=action_id;
  if not found then raise exception 'in-scope PEO cannot resolve action'; end if;
  execute 'reset role';

  perform set_config('request.jwt.claims', jsonb_build_object('sub',viewer_id,'role','authenticated','aal','aal1')::text,true);
  execute 'set local role authenticated';
  if not exists (select 1 from public.inspection_followups where id=action_id) then
    raise exception 'in-scope viewer cannot read assigned action';
  end if;
  update public.inspection_followups set status='in_progress',resolution_note=null where id=action_id;
  if found then raise exception 'read-only account edited action'; end if;
  execute 'reset role';

  perform set_config('request.jwt.claims', jsonb_build_object('sub',outside_id,'role','authenticated','aal','aal1')::text,true);
  execute 'set local role authenticated';
  if exists (select 1 from public.inspection_followups where id=action_id) then
    raise exception 'cross-area follow-up was visible';
  end if;
  update public.inspection_followups set responsible_person='Outside scope' where id=action_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'cross-area follow-up was writable'; end if;
  execute 'reset role';

  execute 'set local role anon';
  begin
    perform 1 from public.inspection_followups where id=action_id;
    raise exception 'signed-out read was granted';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';

  if not exists(select 1 from public.project_updates where id=update_id and recommendations='Replace the guardrail.') then
    raise exception 'source inspection changed';
  end if;
  if not exists(select 1 from public.projects where id=pilot_id and status='Completed' and physical_accomplishment=100) then
    raise exception 'official project status or progress changed';
  end if;
end
$test$;
