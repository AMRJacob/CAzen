# A section number that comes in twice, far apart: shown side by side above the list; keep one, or combine.
from common import *
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1440,'height':950}); install(ctx,{'current_specs':[]}); signed_in(ctx)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_selector('.overview'); pg.goto(BASE+'#/manual')
    pg.click('button:has-text("Upload the manual")'); pg.set_input_files('.upload-panel input[type=file]','repeat_spec.pdf'); pg.wait_for_selector('.upload-panel table tbody tr',timeout=30000)
    rows=lambda: pg.evaluate("[...document.querySelectorAll('.upload-panel table tbody tr')].map(r=>[...r.querySelectorAll('td')].map(t=>(t.querySelector('input.cell')?.value)||t.innerText.trim().replace(/\\s+/g,' ')).slice(1,6).join(' | '))")
    print('rows:'); [print('  ',r) for r in rows()]
    print('panel:',pg.inner_text('.manual-repeats').replace('\n',' / ')[:400])
    print('save enabled:',pg.is_enabled('.upload-panel .actions button.primary'))
    pg.wait_for_timeout(1500); pg.locator('.manual-repeats').screenshot(path='repeats.png')
    # keep the second copy
    pg.locator('.manual-copy').nth(1).locator('button:has-text("Keep this one")').click()
    print('after keep second: panel shown:',pg.locator('.manual-repeats').count(),'| rows:'); [print('  ',r) for r in rows()]
    print('save:',pg.inner_text('.upload-panel .actions button.primary'),pg.is_enabled('.upload-panel .actions button.primary'))
    # tick the first copy back in: panel returns; combine
    pg.locator('.upload-panel table tbody tr.skipped input[type=checkbox]').first.check()
    print('ticked back: panel shown:',pg.locator('.manual-repeats').count())
    pg.click('.manual-repeats button:has-text("Combine them")')
    print('after combine: panel shown:',pg.locator('.manual-repeats').count(),'| rows:'); [print('  ',r) for r in rows()]
    # renumber path
    print('errors:',errs); b.close()
# Renumber: the button selects that copy's number in the list; typing there ends the repeat.
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1440,'height':950}); install(ctx,{'current_specs':[]}); signed_in(ctx)
    pg=ctx.new_page(); pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_selector('.overview'); pg.goto(BASE+'#/manual')
    pg.click('button:has-text("Upload the manual")'); pg.set_input_files('.upload-panel input[type=file]','repeat_spec.pdf'); pg.wait_for_selector('.manual-repeats',timeout=30000)
    pg.locator('.manual-copy').nth(1).locator('button:has-text("Renumber")').click(); pg.wait_for_timeout(600)
    print('renumber: focused', pg.evaluate("document.activeElement.id"), 'selected', pg.evaluate("window.getSelection().toString()||document.activeElement.value.slice(document.activeElement.selectionStart,document.activeElement.selectionEnd)"))
    pg.keyboard.type('09 91 23'); print('  panel shown:',pg.locator('.manual-repeats').count(),'| row 5 number:',pg.input_value('#manual-num-4'),'| save:',pg.inner_text('.upload-panel .actions button.primary'))
    b.close()
