"""At a desk the all-projects page is the phone's landing page: no sidebar, the same cards, the corner mark for the menu."""
from common import *
with sync_playwright() as p:
    b=p.chromium.launch(); shots={}
    for name,vp in (('phone',PHONE),('desk',dict(viewport={'width':1600,'height':950}))):
        ctx=b.new_context(**vp); install(ctx,{}); signed_in(ctx); pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.wait_for_timeout(600)
        r=pg.evaluate("""(()=>{const row=document.querySelector('.projects tr.opens'),c=getComputedStyle(row),nm=getComputedStyle(row.querySelector('.p-name')),sb=document.querySelector('.sidebar'),nav=document.querySelector('.phone-nav'),nb=nav&&nav.getBoundingClientRect();
          return {sidebar:!!sb&&getComputedStyle(sb).display!=='none',rowDisplay:c.display,rowPadding:c.padding,rowRadius:c.borderRadius,nameSize:nm.fontSize,thead:getComputedStyle(document.querySelector('.projects thead')).display,who:getComputedStyle(row.querySelector('.p-who')).display,edit:getComputedStyle(row.querySelector('.p-edit')).display,
            rowWidth:Math.round(row.getBoundingClientRect().width),mark:nav?getComputedStyle(nav).display!=='none':false,markLeft:nb?Math.round(nb.left):null,markBottomGap:nb?Math.round(innerHeight-nb.bottom):null}})()""")
        print(name,r); pg.screenshot(path='home_%s.png'%name)
        if name=='desk':
            pg.click('.phone-nav > button'); pg.wait_for_timeout(450); print('  menu:',[t for t in pg.locator('.phone-nav .pn-spot').all_inner_texts()][:8]); pg.screenshot(path='home_desk_menu.png'); pg.mouse.click(800,300); pg.wait_for_timeout(300)
            pg.click('td.p-name'); pg.wait_for_selector('.overview'); print('  inside a project: sidebar shown',pg.evaluate("getComputedStyle(document.querySelector('.sidebar')).display!=='none'"),'| corner mark shown',pg.evaluate("getComputedStyle(document.querySelector('.phone-nav')).display!=='none'"),'| errors:',errs)
        ctx.close()
    b.close()
