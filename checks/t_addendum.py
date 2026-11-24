"""Addenda in the change documents register: offered to write, numbered "Addendum 1", with their own form."""
from common import *
import t_overview as o, re
ex = dict(o.ex); ex['issued_form_links'] = []
# The stand-in ignores filters; asked for addenda, there are none yet.
ex['issued_forms'] = lambda r: [] if 'kind=eq.addendum' in r.url else o.ex['issued_forms']
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome'); ctx = b.new_context(viewport={'width': 1440, 'height': 900}); install(ctx, ex); signed_in(ctx)
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_selector('.overview'); pg.goto(BASE + '#/ca-logs'); pg.wait_for_timeout(1500)
    print('write a new:', pg.inner_text('.new-doc-kinds').replace('\n', ' · '))
    print('show menu has addenda:', 'Addendum only' in pg.inner_text('.set-actions'))
    pg.click('.new-doc-kinds button:has-text("Addendum")'); pg.wait_for_timeout(2000)
    print('errors:', errs)  # addendum.png shows it numbered "Addendum 1"
    pg.screenshot(path='addendum.png'); b.close()
