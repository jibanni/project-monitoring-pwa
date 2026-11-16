import datetime
import base64
import json
import os
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect

# Run against the fixture-only Vite dev server described in the pilot README.
base_url = os.environ.get('PMS10_TEST_URL', 'http://127.0.0.1:4168')
today = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).date()
iso = lambda n: (today + datetime.timedelta(days=n)).isoformat()
now = datetime.datetime.now(datetime.timezone.utc)
id_user='11111111-1111-4111-8111-111111111111'
id_project='22222222-2222-4222-8222-222222222222'
id_update='33333333-3333-4333-8333-333333333333'
id_older='44444444-4444-4444-8444-444444444444'
id_fu='55555555-5555-4555-8555-555555555555'
project = {'id': id_project, 'project_name':'QA Bukidnon Water System', 'province':'Bukidnon', 'municipality':'Talakag','status':'Completed','physical_accomplishment':100,'budget':1000000,'funding_year':2025,'funding_source':'SBDP'}
new = {'id':id_update, 'project_id':id_project,'inspection_date':iso(-8),'issues':'Inspection finding','recommendations':'Replace the guardrail.','remarks':f'Update Type: Site Update\nTimeline 1: {iso(-1)}','status':'Completed','created_at': now.isoformat()}
old = {**new, 'id':id_older, 'inspection_date':iso(-12),'issues':'Original older inspection','recommendations':'Clear the drainage.','remarks':f'Update Type: Site Update\nTimeline 1: {iso(3)}'}
profile = {'id':id_user,'role':'Admin','approved':True,'is_active':True,'full_name':'QA Admin','email':'qa@example.test'}
user = {'id':id_user,'aud':'authenticated','role':'authenticated','email':'qa@example.test','app_metadata':{},'user_metadata':{}}
enc = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip('=')
session = {'access_token':enc({'alg':'HS256'})+'.'+enc({'sub':id_user,'role':'authenticated','exp':int(now.timestamp())+7200,'aal':'aal1'})+'.fixture','refresh_token':'fixture-refresh','expires_at':int(now.timestamp())+7200,'expires_in':7200,'token_type':'bearer','user':user}
rows = []
requests = []
def api(route):
    req=route.request
    url=urlparse(req.url)
    q=parse_qs(url.query)
    table=url.path.rsplit('/',1)[-1]
    requests.append((req.method,table))
    cors={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*','content-type':'application/json'}
    def finish(data, status=200):
        route.fulfill(status=status, headers=cors, body=json.dumps(data) if status!=204 else '')
    if req.method=='OPTIONS': return finish(None,204)
    if table=='user': return finish(user)
    if table=='profiles': return finish(profile if 'application/vnd.pgrst.object' in req.headers.get('accept','') else [profile])
    if table=='projects': return finish(project if 'application/vnd.pgrst.object' in req.headers.get('accept','') else [project])
    if table=='project_updates':
        if q.get('id')==['eq.'+id_older]: return finish([old])
        if 'project.province' in q: return finish([{**new,'project':project},{**old,'project':project}])
        return finish([new])
    if table=='inspection_followups':
        if req.method=='POST':
            body=req.post_data_json
            assert set(body)=={'project_id','source_update_id','source_item','recommendation','due_date','responsible_person'}
            rows.append({**body,'id':id_fu,'project':project,'status':'open','resolution_note':None,'evidence_url':None,'updated_at':now.isoformat()})
            return finish(None,201)
        if req.method=='PATCH':
            assert q.get('updated_at')==['eq.'+now.isoformat()]
            rows[0].update(req.post_data_json)
            return finish([{'id':id_fu}])
        return finish(rows)
    return finish([])

with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=os.environ.get('PMS10_TEST_CHROMIUM'), headless=True)
    context=browser.new_context(viewport={'width':1440,'height':960}, service_workers='block')
    context.add_init_script('localStorage.setItem("sb-followup-fixture-auth-token", '+json.dumps(json.dumps(session))+');')
    context.route('https://followup-fixture.supabase.co/**',api)
    page=context.new_page()
    errors=[]
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(base_url+'/dashboard')
    switches=page.locator('.pms10-floating-view-switch')
    actual=switches.get_by_role('button',name='Actual On-Site')
    official=switches.get_by_role('button',name='SubayBAYAN Official')
    bell=switches.get_by_role('button',name='Inspection Follow-ups',exact=True)
    card=page.get_by_role('region',name='Inspection Follow-ups')
    expect(official).to_be_visible(timeout=25000)
    expect(official).to_have_attribute('aria-pressed','true')
    expect(page.locator('.pms-fu')).to_have_count(0)
    assert not any(table=='inspection_followups' for _,table in requests)
    actual.click()
    expect(bell).to_be_visible()
    expect(bell).to_have_attribute('aria-expanded','false')
    assert (bell.bounding_box()['x'] > switches.get_by_role('button',name='Detailed View').bounding_box()['x'])
    expect(card).to_have_count(0)
    bell.click()
    expect(card).to_be_visible()
    official.click()
    expect(page.locator('.pms-fu')).to_have_count(0)
    actual.click()
    expect(bell).to_have_attribute('aria-expanded','false')
    switches.get_by_role('button',name='Detailed View').click()
    expect(page.locator('.pms-dashboard-view-stage.is-detailed')).to_be_visible()
    expect(bell).to_be_visible()
    bell.click()
    page.keyboard.press('Escape')
    expect(bell).to_have_attribute('aria-expanded','false')
    expect(bell).to_be_focused()
    bell.click()
    page.mouse.click(500, 55)
    expect(card).to_have_count(0)
    switches.get_by_role('button',name='Executive View').click()
    expect(page.locator('.pms-dashboard-view-stage.is-executive')).to_be_visible()
    bell.click()
    expect(card).to_contain_text('0 overdue',timeout=25000)
    print('PASS visibility: hidden without API calls on SubayBAYAN, one bell beside the switches on Actual in both views, closes on Escape or outside click')
    card.get_by_role('button',name='Track an inspection recommendation').click()
    expect(card.get_by_text('Replace the guardrail.')).to_be_visible()
    candidate = card.locator('li').filter(has_text='Replace the guardrail.')
    candidate.get_by_role('button',name='Track',exact=True).click()
    editor=page.get_by_role('dialog')
    expect(editor.get_by_label('Due date')).to_have_value(iso(-1))
    editor.get_by_label('Responsible person or office').fill('QA Engineer')
    editor.get_by_role('button',name='Save follow-up').click()
    expect(card).to_contain_text('1 overdue')
    expect(bell.locator('.pms-fu-badge')).to_have_text('1')
    expect(card.locator('tbody')).to_contain_text('QA Engineer')
    card.get_by_role('button',name='Manage follow-up for QA Bukidnon Water System').click()
    editor.get_by_label('Status').select_option('in_progress')
    editor.get_by_role('button',name='Save follow-up').click()
    expect(card.locator('tbody')).to_contain_text('In Progress')
    card.get_by_role('button',name='Manage follow-up for QA Bukidnon Water System').click()
    editor.get_by_label('Status').select_option('resolved')
    editor.get_by_role('button',name='Save follow-up').click()
    expect(editor.get_by_role('alert')).to_contain_text('resolution note')
    editor.get_by_label('Resolution note').fill('Guardrail replaced and checked.')
    editor.get_by_role('button',name='Save follow-up').click()
    expect(card).to_contain_text('0 overdue')
    expect(bell.locator('.pms-fu-badge')).to_have_count(0)
    card.get_by_role('button',name='Resolved (1)').click()
    expect(card.locator('tbody')).to_contain_text('Guardrail replaced and checked.')
    card.locator('li').filter(has_text='Clear the drainage.').get_by_role('link').click()
    expect(page.get_by_role('tab',name='Inspections')).to_have_attribute('aria-selected','true',timeout=18000)
    expect(page.get_by_text('Original older inspection',exact=True)).to_be_visible()
    expect(page.locator('.pms-fu')).to_have_count(0)
    assert not errors, errors
    print('PASS desktop: track, prefill due date, assign, open → in progress → resolved, require evidence, remove reminder, deep-link older inspection')
    mobile=context.new_page()
    mobile.set_viewport_size({'width':390,'height':844})
    req_start=len(requests)
    mobile.goto(base_url+'/dashboard')
    expect(mobile.get_by_role('heading',name='PDMU Project Monitoring Dashboard')).to_be_visible(timeout=18000)
    expect(mobile.get_by_role('region',name='Inspection follow-ups')).to_have_count(0)
    expect(mobile.locator('.pms-fu')).to_have_count(0)
    assert not any(table=='inspection_followups' for _,table in requests[req_start:])
    print('PASS mobile: existing dashboard, no tracker markup or tracker API calls')
    browser.close()
