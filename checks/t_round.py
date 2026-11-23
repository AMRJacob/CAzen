"""Right-click a G703 heading to round that column as the contractor does; rounded cells are blue with the exact figure on hover. Uncertify takes a certificate back."""
from common import *
import t_overview as o, json, re
con={'id':o.C,'project_id':PROJ,'form':'g702','original_sum':1000000,'retainage_work':5,'retainage_stored':0,'name':'General','contractor':'Builder','created_at':'2026-01-01T00:00:00Z','rounding':{}}
patches=[]; app_patches=[]
ex=dict(o.ex); ex['issued_form_links']=[]
ex['pay_contracts']=lambda r: con if 'pgrst.object' in (r.headers.get('accept') or '') else [con]
ex['pay_app_lines']=[{'pay_app_id':o.A1,'sov_line_id':o.L1,'this_period':200000,'stored':0},{'pay_app_id':o.A2,'sov_line_id':o.L1,'this_period':100000,'stored':0},{'pay_app_id':o.A2,'sov_line_id':o.L2,'this_period':150333.33,'stored':0}]
def patch_con(r): row=json.loads(r.post_data); patches.append(row); con.update(row); return []
ex['PATCH:pay_contracts']=patch_con
def patch_app(r): app_patches.append(json.loads(r.post_data)); return []
ex['PATCH:pay_apps']=patch_app
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1440,'height':900}); install(ctx,ex); signed_in(ctx)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_selector('.overview'); pg.goto(BASE+'#/pay'); pg.wait_for_timeout(1500)
    pg.locator('.tabs button').filter(has_text=re.compile('2')).first.click(); pg.wait_for_timeout(600)
    ret=lambda: pg.locator('.pay-703 tbody tr').nth(1).locator('td').nth(9)
    print('retainage before:',ret().inner_text(),'| class:',ret().get_attribute('class'))
    pg.locator('.pay-703-sub th', has_text='Retainage').click(button='right'); pg.wait_for_selector('.pay-round-menu')
    print('menu:',pg.inner_text('.pay-round-menu').replace('\n',' | '))
    pg.click('.pay-round-menu button:has-text("nearest")'); pg.wait_for_timeout(900)
    print('saved:',patches)
    print('retainage after:',ret().inner_text(),'| class:',ret().get_attribute('class'),'| hover:',ret().get_attribute('title'))
    print('total:',pg.locator('.pay-703-total td').nth(9).inner_text(),'| hover:',pg.locator('.pay-703-total td').nth(9).get_attribute('title'))
    print('heading:',pg.locator('.pay-703 thead tr').first.locator('th').nth(9).inner_text())
    pg.locator('.pay-703 tbody tr').nth(1).scroll_into_view_if_needed(); pg.screenshot(path='round.png')
    pg.locator('.tabs button').filter(has_text=re.compile('^1')).first.click(); pg.wait_for_timeout(600)
    pg.click('button:has-text("Uncertify")'); print('asks:',pg.inner_text('.pay-uncertify')[:260].replace('\n',' '))
    pg.click('.pay-uncertify button.primary'); pg.wait_for_timeout(600); print('app patch:',app_patches,'| errors:',errs); b.close()
