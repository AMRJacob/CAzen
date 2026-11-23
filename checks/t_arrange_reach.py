"""Arranging a page longer than the screen: a block dragged to the bottom edge scrolls the page (desk);
by touch the block body lets the page scroll and the name pill picks the block up (tablet)."""
from common import *
import json
V={'id':'cccccccc-cccc-4ccc-8ccc-ccccccccc001','project_id':PROJ,'kind':'visit','visited_on':'2026-11-18','visited_at':'15:00:00','title':'OAC','weather':'Sunny','names':'\n'.join(f'P{i} | C | e' for i in range(12)),'notes':'\n'.join(f'{i}. Cat {i}\n  a. note' for i in range(1,9)),'photos':[],'photo_labels':{},'pad_id':None,'issued_id':None,'location':None,'widgets':{},'created_at':'2026-11-18T15:00:00Z'}
with sync_playwright() as p:
    b=p.chromium.launch()
    for name,vp in (('desk',dict(viewport={'width':1366,'height':768})),('tablet',dict(viewport={'width':1024,'height':768},has_touch=True,is_mobile=True))):
        ctx=b.new_context(**vp); install(ctx,{'site_visits':lambda r:[V],'note_pads':[],'pad_marks':[],'observations':[],'observation_types':[],'project_people':[],'notebook_layouts':lambda r:None}); signed_in(ctx)
        pg=ctx.new_page(); pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.locator('td.p-name, .p-card').first.click(); pg.wait_for_timeout(500)
        pg.goto(BASE+'#/field-notes/reports'); pg.wait_for_selector('.nb-toc li'); pg.click('.nb-toc li button'); pg.wait_for_selector('.nb-cell'); pg.wait_for_timeout(800)
        pg.click('.nb-menu .nb-menu-mark'); pg.wait_for_timeout(300); pg.click('.nb-menu .nb-menu-spot:has-text("Arrange")'); pg.wait_for_selector('.nb-arr')
        ta=pg.evaluate("[getComputedStyle(document.querySelector('.nb-arr')).touchAction, getComputedStyle(document.querySelector('.nb-arr-head')).touchAction]")
        h=pg.locator('.nb-cell[data-block="names"] .nb-arr-head').bounding_box()
        top0=pg.evaluate("document.querySelector('.nb-page').scrollTop")
        pg.mouse.move(h['x']+60,h['y']+15); pg.mouse.down(); pg.mouse.move(h['x']+60,760,steps=8); pg.wait_for_timeout(900); pg.mouse.move(h['x']+60,758); pg.mouse.up(); pg.wait_for_timeout(200)
        print(name,'| touch-action body/pill:',ta,'| page scrolled while held at the edge:',pg.evaluate("document.querySelector('.nb-page').scrollTop")-top0,
              '| names now at row y:',pg.evaluate("(()=>{const c=document.querySelector('.nb-cell[data-block=names]');return c.style.gridRow})()"))
        ctx.close()
    b.close()
