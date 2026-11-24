"""A change document downloaded whole: its cover, the manual sections it replaced, the sheets it revised — one PDF, in that order."""
from common import *
import t_overview as o, re, json, os
from pypdf import PdfReader
ISS = '77777777-7777-4777-8777-777777777701'
forms = [dict(f) for f in o.ex['issued_forms']]
for f in forms:
    if f['number'] == 'ASI-003': f.update(issuance_id=ISS, file_path='r2:' + PROJ + '/forms/asi/cover.pdf')
ex = dict(o.ex); ex['issued_form_links'] = []; ex['issued_forms'] = forms
ex['spec_revisions'] = [{'file_path': 'r2:' + PROJ + '/specs/087100.pdf', 'spec_sections': {'number': '08 71 00'}}, {'file_path': 'r2:' + PROJ + '/specs/081113.pdf', 'spec_sections': {'number': '08 11 13'}}]
ex['sheet_revisions'] = [{'revision_label': 'ASI-003', 'title_at_rev': 'Door schedule', 'file_path': 'r2:' + PROJ + '/sheets/a601.pdf', 'sheets': {'number': 'A-601', 'title': 'Door schedule', 'filed_under': None}},
                         {'revision_label': 'ASI-003', 'title_at_rev': 'Plan', 'file_path': 'r2:' + PROJ + '/sheets/a101.pdf', 'sheets': {'number': 'A-101', 'title': 'Plan', 'filed_under': None}}]
# One-page PDFs that say what they are, so the order can be read back.
from reportlab.pdfgen import canvas
def page(name):
    p = f'/tmp/cdl_{re.sub(r"[^a-z0-9]", "", name.lower())}.pdf'
    c = canvas.Canvas(p); c.drawString(72, 720, name); c.save(); return open(p, 'rb').read()
files = {'cover': page('COVER ASI-003'), '087100': page('SECTION 08 71 00'), '081113': page('SECTION 08 11 13'), 'a601': page('SHEET A-601'), 'a101': page('SHEET A-101')}
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome'); ctx = b.new_context(viewport={'width': 1440, 'height': 900}, accept_downloads=True); install(ctx, ex); signed_in(ctx)
    ctx.route(re.compile(r'https://stand-in\.supabase\.co/functions/v1/files.*'), lambda route: route.fulfill(status=200, content_type='application/json',
        body=json.dumps({'url': 'https://r2.stand-in.test/' + json.loads(route.request.post_data or '{}').get('key', '').split('/')[-1]})))
    ctx.route(re.compile(r'https://r2\.stand-in\.test/.*'), lambda route: route.fulfill(status=200, content_type='application/pdf', body=files[route.request.url.split('/')[-1].replace('.pdf', '')]))
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_selector('.overview'); pg.goto(BASE + '#/ca-logs'); pg.wait_for_timeout(1500)
    row = pg.locator('tr', has_text='ASI-003').first
    with pg.expect_download() as dl:
        row.locator('button:has-text("Download")').click()
    path = '/tmp/cdl_out.pdf'; dl.value.save_as(path)
    print('file name:', dl.value.suggested_filename)
    print('pages, in order:', [pg_.extract_text().strip() for pg_ in PdfReader(path).pages])
    print('notices:', pg.locator('.notice.error').all_inner_texts(), '| errors:', errs); b.close()
