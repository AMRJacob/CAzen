"""The note box on a phone: words, Tag, Add. Tags are behind the button."""
from common import *
V={'id':'cccccccc-cccc-4ccc-8ccc-cccccccccccc','project_id':PROJ,'kind':'visit','visited_on':time.strftime('%Y-%m-%d'),'visited_at':'10:00:00','title':None,'weather':'Clear','location':None,'notes':'1. Site\n  a. \n2. Structure\n  a. \n3. Envelope\n  a. \n4. Interior\n  a. \n5. Additional Notes\n  a. ','names':None,'photos':[],'photo_labels':{},'cover_photo':None,'pad_id':None,'issued_id':None,'created_at':'2026-11-19T16:00:00Z'}
ex={'site_visits':lambda r: [V] if 'kind=eq.visit' in r.url else [], 'observation_types':[], 'project_people':[]}
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(**PHONE); install(ctx,ex); signed_in(ctx)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)[:200]))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.tap('td.p-name'); pg.wait_for_timeout(400); pg.goto(BASE+'#/field-notes/reports'); pg.tap('.nb-toc-title'); pg.wait_for_selector('.nb-quick textarea'); pg.wait_for_timeout(400)
    q=pg.locator('.nb-quick').bounding_box(); t=pg.locator('.nb-quick-tag').bounding_box(); a=pg.locator('.nb-quick-keep').bounding_box()
    print('box is %d px tall | chips showing: %d | Tag then Add at the right, Add last: %s | both disabled with nothing typed: %s'%(q['height'],pg.locator('.nb-quick .chip').count(),t['x']<a['x'] and a['x']+a['width']>q['x']+q['width']-30,[pg.locator('.nb-quick-tag').is_disabled(),pg.locator('.nb-quick-keep').is_disabled()]))
    pg.screenshot(path='quick_empty.png',clip={'x':0,'y':max(0,q['y']-20),'width':402,'height':q['height']+60})
    pg.fill('.nb-quick textarea','Anchor bolts at grid C are out of plumb'); pg.wait_for_timeout(200); print('typing:',pg.inner_text('.nb-quick-say'))
    pg.tap('.nb-quick-tag'); pg.wait_for_selector('.nb-quick-tags'); print('Tag opens:',pg.locator('.nb-quick-tags button').all_inner_texts()); pg.screenshot(path='quick_tags.png',clip={'x':0,'y':max(0,q['y']-20),'width':402,'height':420})
    pg.tap('.nb-quick-tags button:has-text("Envelope")'); pg.wait_for_timeout(200); print('chose Envelope:',pg.inner_text('.nb-quick-say'),'| list closed:',pg.locator('.nb-quick-tags').count()==0)
    pg.tap('.nb-quick-keep'); pg.wait_for_timeout(300); notes=pg.input_value('.nb-z-notes textarea.nb-outline'); i=notes.index('Anchor bolts'); print('Add filed it under:',notes[:i].strip().split('\n')[-2 if notes[:i].strip().split('\n')[-1].strip().startswith(('a.','b.')) else -1].strip(),'|',pg.inner_text('.nb-quick-say'))
    pg.tap('.nb-quick-tag'); pg.tap('.nb-quick-tags button:has-text("Structure")'); pg.wait_for_timeout(300); notes=pg.input_value('.nb-z-notes textarea.nb-outline'); print('Tag after adding moves it:', notes.index('2. Structure')<notes.index('Anchor bolts')<notes.index('3. Envelope'),'|',pg.inner_text('.nb-quick-say'))
    pg.fill('.nb-quick textarea','Gypsum board finish level 4 in corridor'); pg.keyboard.press('Enter'); pg.wait_for_timeout(300); print('Enter still adds, guessed:',pg.inner_text('.nb-quick-say'))
    pg.tap('.nb-quick-tag'); pg.touchscreen.tap(200,800); pg.wait_for_timeout(200); print('touch elsewhere closes the list:',pg.locator('.nb-quick-tags').count()==0,'| errors:',errs[:2]); b.close()
