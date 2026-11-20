"""Phone contents page: the corner mark offers New page and Exit; buttons sit at the left of
their sections; at a desk the app fills the window; the re-read list scrolls under its buttons."""
from common import *
from playwright.sync_api import sync_playwright
import time
today=time.strftime('%Y-%m-%d')
with sync_playwright() as p:
    b = p.chromium.launch()
    made=[]
    def post(r):
        import json
        row=json.loads(r.post_data); row = row[0] if isinstance(row,list) else row
        made.append(row); return row
    ctx = b.new_context(**PHONE); install(ctx, {'site_visits': [], 'note_pads': [], 'observations': [], 'POST:site_visits': post}); signed_in(ctx)
    pg = ctx.new_page(); pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.tap('td.p-name'); pg.wait_for_selector('.overview')
    pg.goto(BASE + '#/field-notes/reports'); pg.wait_for_selector('.nb-contents'); pg.wait_for_timeout(500)
    m = pg.locator('.nb-menu-contents'); box = m.bounding_box(); vw = pg.viewport_size
    print('mark shown', m.is_visible(), 'right edge gap', round(vw['width']-box['x']-box['width']), 'bottom gap', round(vw['height']-box['y']-box['height']))
    print('top button hidden', not pg.locator('.nb-contents .nb-today').is_visible(), '| x hidden', not pg.locator('.nb-contents .nb-exit').is_visible())
    pg.tap('.nb-menu-contents .nb-menu-mark'); pg.wait_for_timeout(450)
    print('offers', pg.locator('.nb-menu-contents .nb-menu-spot').all_inner_texts())
    pg.screenshot(path='contents_menu.png')
    pg.tap('.nb-menu-contents .nb-menu-spot:has-text("New page")'); pg.wait_for_selector('.nb-page', timeout=5000); pg.wait_for_timeout(700)
    print('new page opened', pg.locator('.nb-page').count() == 1)
    for z in ('.nb-z-photos', '.nb-z-seen', '.nb-z-sketch'):
        if pg.locator(z).count() == 0: print(z, 'absent'); continue
        zb = pg.locator(z).first.bounding_box(); btn = pg.locator(z + ' .nb-z-top button').first
        bb = btn.bounding_box(); print(z, repr(btn.inner_text()), 'button left offset', round(bb['x']-zb['x']), 'of zone width', round(zb['width']))
    pg.screenshot(path='page_left.png', full_page=True)
    pg.tap('.nb-menu .nb-menu-mark'); pg.wait_for_timeout(450); print('page menu', pg.locator('.nb-menu .nb-menu-spot').all_inner_texts()); pg.tap('.nb-menu .nb-menu-spot:has-text("Close")'); pg.wait_for_selector('.nb-contents'); pg.wait_for_timeout(500)
    pg.tap('.nb-menu-contents .nb-menu-mark'); pg.wait_for_timeout(450); pg.tap('.nb-menu-contents .nb-menu-spot:has-text("Exit")'); pg.wait_for_timeout(600)
    print('exit lands', pg.url.split('#')[1])
    ctx.close()
    ctx = b.new_context(viewport={'width':1920,'height':1000}); install(ctx, {'site_visits': [], 'note_pads': [], 'observations': []}); signed_in(ctx)
    pg = ctx.new_page(); pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_selector('.overview')
    c = pg.locator('.content').bounding_box(); print('desk overview: content', round(c['x']), round(c['width']), 'of 1920; overview', round(pg.locator('.overview').bounding_box()['width']))
    pg.screenshot(path='desk_overview.png')
    pg.goto(BASE+'#/documents'); pg.wait_for_timeout(1500)
    c = pg.locator('.content').bounding_box(); print('desk drawings: content', round(c['x']), round(c['width']))
    pg.screenshot(path='desk_docs.png')
    pg.goto(BASE + '#/field-notes/reports'); pg.wait_for_selector('.nb-contents'); pg.wait_for_timeout(400)
    print('desk contents: mark hidden', not pg.locator('.nb-menu-contents').is_visible(), '| New page button shown', pg.locator('.nb-contents .nb-today').is_visible())
    b.close()
