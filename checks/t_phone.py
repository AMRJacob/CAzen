"""Phone numbers hyphenated as typed, in Settings (firm phone) and the notebook's new-person row."""
from common import *
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1440,'height':900})
    install(ctx,{}); signed_in(ctx)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.goto(BASE+'#/settings'); pg.wait_for_timeout(1200)
    f=pg.locator('label:has-text("Phone") input').first
    f.click(); f.fill(''); pg.keyboard.type('5015550123'); print('typed 5015550123 →', f.input_value())
    pg.keyboard.press('End'); [pg.keyboard.press('ArrowLeft') for _ in range(4)]; pg.keyboard.press('Backspace'); print('backspace after the 2nd hyphen →', f.input_value())
    f.fill(''); pg.keyboard.type('(501) 555 0123 x12'); print('typed with brackets and ext →', f.input_value(), '| errors', errs)
    b.close()
