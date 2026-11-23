# A fresh link for someone already listed opens under their row, not in the invite box at the top.
from common import *
U2='11111111-1111-4111-8111-111111111112'; U3='11111111-1111-4111-8111-111111111113'
people=[{'user_id':UID,'email':'tester@example.com','full_name':'Test Architect','role':'owner','joined_at':'2026-01-01T00:00:00Z','last_seen':'2026-11-19T00:00:00Z'},
        {'user_id':U2,'email':'james@example.com','full_name':None,'role':'member','joined_at':'2026-11-23T00:00:00Z','last_seen':None},
        {'user_id':U3,'email':'kate@example.com','full_name':None,'role':'member','joined_at':'2026-11-23T00:00:00Z','last_seen':None}]
calls=[]
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1440,'height':950}); install(ctx,{'firm_people':people,'project_members':[]}); signed_in(ctx)
    ctx.grant_permissions(['clipboard-read','clipboard-write'],origin=BASE.rstrip('/'))
    def inv(route):
        body=json.loads(route.request.post_data); calls.append(body['email']); n=len(calls)
        route.fulfill(status=200,content_type='application/json',body=json.dumps({'user_id':'x','invited':False,'link':f'https://stand-in.supabase.co/auth/v1/verify?token=t{n}-{body["email"]}','projects':0}))
    ctx.route(re.compile(r'.*/functions/v1/invite-user.*'),inv)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE+'#/settings'); pg.click('.set-group summary:has-text("People and access")'); pg.wait_for_selector('.access-table tbody tr')
    clip=lambda: pg.evaluate("navigator.clipboard.read().then(async i=>[await (await i[0].getType('text/html')).text(), await (await i[0].getType('text/plain')).text()])")
    def who(t): return sorted(set(re.findall(r'(\w+)@example\.com',t)))
    # 1. invite from the box: preview in the box
    pg.fill('.access-invite input[type=email]','sam@example.com'); pg.click('button:has-text("Add and make a link")'); pg.wait_for_selector('.access-invite .access-mail')
    print('1 box has mail:',pg.locator('.access-invite .access-mail').count(),'| rows with mail:',pg.locator('.access-relink').count())
    pg.click('.access-invite .access-link button.primary'); pg.wait_for_timeout(200); h,t=clip(); print('  copied names:',who(h),who(t),'| button:',pg.inner_text('.access-invite .access-link button.primary'))
    # 2. New link beside james: preview under james, box emptied
    row=lambda e: pg.locator(f'.access-table tr:has-text("{e}")').first
    row('james@example.com').locator('button:has-text("New link")').click(); pg.wait_for_selector('.access-relink')
    print('2 box has mail:',pg.locator('.access-invite .access-mail').count(),'| box message:',pg.locator('.access-invite .ok-text').count())
    rows=pg.evaluate("[...document.querySelectorAll('.access-table tbody tr')].map(r=>r.className+'|'+r.innerText.replace(/\\s+/g,' ').slice(0,60))"); print('  rows:'); [print('   ',r) for r in rows]
    print('  row button now:',row('james@example.com').locator('td').first.locator('button').first.inner_text())
    pg.click('.access-relink .access-link button.primary'); pg.wait_for_timeout(200); h,t=clip(); print('  copied names:',who(h),who(t),'| link token:',re.search(r'token=([\w@.-]+)',t).group(1))
    # 3. New link beside kate: moves to kate, james's closes; copy is kate's
    row('kate@example.com').locator('button:has-text("New link")').click(); pg.wait_for_function("document.querySelector('.access-relink')?.innerText.includes('kate@')")
    print('3 relink rows:',pg.locator('.access-relink').count(),'| under:',pg.evaluate("document.querySelector('.access-relink').previousElementSibling.innerText.split('\\n')[0]"))
    print('  button before copying:',pg.inner_text('.access-relink .access-link button.primary'))
    pg.click('.access-relink .access-link button.primary'); pg.wait_for_timeout(200); h,t=clip(); print('  copied names:',who(h),who(t),'| link token:',re.search(r'token=([\w@.-]+)',t).group(1))
    pg.locator('.access-relink').screenshot(path='relink.png')
    pg.click('.access-relink button:has-text("Close")'); print('4 after Close rows with mail:',pg.locator('.access-relink').count())
    print('calls:',calls,'errors:',errs); b.close()
