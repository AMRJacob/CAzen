from common import *
C='88888888-8888-4888-8888-888888888881'
state={'contract':None,'lines':[]}
def post_contract(req):
    state['contract']=dict(json.loads(req.post_data),id=C,form='g702_g703'); return {'id':C}
def post_lines(req):
    state['lines']=[dict(l,id='9%07d-0000-4000-8000-000000000000'%i,is_change_order=False,change_order_id=None,retainage_rate=None,parent_id=None,approved_on=None) for i,l in enumerate(json.loads(req.post_data))]; return []
def get_contracts(req):
    if 'pgrst.object' in (req.headers.get('accept') or ''): return state['contract']
    return [state['contract']] if state['contract'] else []
extra={'pay_contracts':get_contracts,'POST:pay_contracts':post_contract,'POST:sov_lines':post_lines,'sov_lines':lambda r: state['lines']}
SOV="Item No.\tDescription of Work\tScheduled Value\n1\tGeneral Conditions\t$125,000.00\n2\tSitework\t88,450.00\nDIVISION 03\n3\tConcrete\t210,000\nGRAND TOTAL\t\t423,450.00"
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1440,'height':900}); install(ctx,extra); signed_in(ctx)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_timeout(300); pg.goto(BASE+'#/documents'); pg.goto(BASE+'#/pay'); pg.wait_for_selector('text=Set up the contract')
    pg.fill('.contract-setup textarea',SOV); pg.fill('input[placeholder^="$"]','423,500')
    print(pg.inner_text('.contract-setup p.small'))
    pg.fill('.contract-setup .form label:nth-child(2) input','423,450'); print(pg.inner_text('.contract-setup p.small'))
    pg.screenshot(path='pay_setup.png')
    pg.click('button:has-text("Set up the contract")'); pg.wait_for_timeout(1500)
    print('contract sent:',{k:state['contract'][k] for k in ('contractor','original_sum','retainage_work','retainage_stored')}, '| lines:',len(state['lines']),'sorts',[l['sort'] for l in state['lines']])
    pg.screenshot(path='pay_after.png'); print('page now:',pg.inner_text('main')[:200].replace('\n',' | ')); print('errors:',errs)
    b.close()
