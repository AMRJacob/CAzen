from common import *
import copy, t_fix
ex=copy.deepcopy(t_fix.extra); S=ex['sheets'][0]; R=ex['sheet_revisions'][0]; C=ex['current_sheets'][0]
ex['sheets'][0]['title']='Flor pln'; ex['current_sheets'][0]['title']='Flor pln'
s=dict(S,id=S['id'][:-1]+'2',number='A-102',title=''); r=dict(R,id=R['id'][:-1]+'2',sheet_id=s['id']); c=dict(C,sheet_id=s['id'],revision_id=r['id'],number='A-102',title='')
ex['sheets'].append(s); ex['sheet_revisions'].append(r); ex['current_sheets'].append(c)
saved=[]; ex['titleblock_templates']=lambda req: saved
def post(req):
    row=json.loads(req.post_data); row=row[0] if isinstance(row,list) else row; row.setdefault('id','99999999-9999-4999-8999-999999999991'); saved.append(row); return row if 'pgrst.object' in (req.headers.get('accept') or '') else [row]
ex['POST:titleblock_templates']=post
def patch(req):
    saved[0].update(json.loads(req.post_data)); return saved[0]
ex['PATCH:titleblock_templates']=patch
pdf=open('tb.pdf','rb').read()
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1440,'height':900}); install(ctx,ex); signed_in(ctx)
    ctx.route(re.compile(r'.*/functions/v1/files.*'), lambda r: r.fulfill(status=200,content_type='application/json',body=json.dumps({'url':'https://stand-in.supabase.co/blob/sheet.pdf','configured':True})))
    ctx.route(re.compile(r'.*/blob/sheet\.pdf'), lambda r: r.fulfill(status=200,content_type='application/pdf',body=pdf))
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: m.type=='error' and errs.append(m.text[:200]))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_timeout(300); pg.goto(BASE+'#/documents'); pg.wait_for_selector('tr.opens >> nth=1')
    pg.click('button:has-text("Re-read titles and dates")'); pg.click('tr.opens >> nth=0'); pg.click('tr.opens >> nth=1',modifiers=['Shift']); pg.click('.pick-bar button:has-text("Re-read their")'); pg.wait_for_selector('.reread'); pg.wait_for_function("!document.querySelector('.reread p strong')",timeout=30000); pg.wait_for_timeout(400)
    nb=pg.locator('button:has-text("New template from these sheets")'); print('with no template — read titles:',[i.input_value() for i in pg.locator('input[aria-label="Title read"]').all()],'| New template button enabled:',nb.is_enabled()); pg.screenshot(path='tpl_1.png')
    nb.click(); pg.wait_for_selector('.tb-page img'); pg.wait_for_timeout(1200)
    def box_of(text):
        # where the words are on the page, from the page's own text positions (fractions of the sheet)
        W,H=36*72,24*72; spots={'A-101':(W-380,90,130,40),'FIRST FLOOR PLAN':(W-380,200,250,24),'09/01/2026':(W-380,300,90,16)}
        x,y,w,h=spots[text]; return (x-8)/W, 1-(y+h+6)/H, (w+16)/W, (h+14)/H
    def drag(text):
        fx,fy,fw,fh=box_of(text); r=pg.locator('.tb-page').bounding_box(); pg.locator('.tb-page').scroll_into_view_if_needed()
        x0=r['x']+fx*r['width']; y0=r['y']+fy*r['height']; x1=x0+fw*r['width']; y1=y0+fh*r['height']
        sc=pg.locator('.tb-scroll').bounding_box()
        inside=sc['y']<=y0 and y1<=sc['y']+sc['height'] and y1<=900
        if not inside:
            pg.evaluate("([fx,fy])=>{const s=document.querySelector('.tb-scroll'),p=document.querySelector('.tb-page');s.scrollTop=Math.max(0,p.offsetTop+fy*p.offsetHeight-s.clientHeight/2);s.scrollLeft=Math.max(0,p.offsetLeft+fx*p.offsetWidth-s.clientWidth/2)}",[fx,fy]); pg.wait_for_timeout(200)
            r=pg.locator('.tb-page').bounding_box(); x0=r['x']+fx*r['width']; y0=r['y']+fy*r['height']; x1=x0+fw*r['width']; y1=y0+fh*r['height']
        pg.mouse.move(x0,y0); pg.mouse.down(); pg.mouse.move((x0+x1)/2,(y0+y1)/2,steps=4); pg.mouse.move(x1,y1,steps=4); pg.mouse.up(); pg.wait_for_timeout(250)
        return inside
    zr=lambda: pg.inner_text('.tb-zoom').replace('\n',' ')
    pb=pg.locator('.tb-page').bounding_box(); z0=zr(); w0=pb['width']; pg.mouse.move(pb['x']+pb['width']*0.9,pb['y']+pb['height']*0.9); pg.mouse.wheel(0,-300); pg.wait_for_timeout(300); w1=pg.locator('.tb-page').bounding_box()['width']
    sc=lambda: pg.evaluate("[document.querySelector('.tb-scroll').scrollLeft,document.querySelector('.tb-scroll').scrollTop]"); s0=sc(); pg.mouse.down(button='middle'); pg.mouse.move(pb['x']+pb['width']*0.9-120,pb['y']+pb['height']*0.9-80,steps=5); pg.mouse.up(button='middle'); pg.wait_for_timeout(200); s1=sc()
    print('wheel over the title block: sheet',round(w0),'→',round(w1),'px wide | wheel pressed and dragged: scrolled by',[round(s1[0]-s0[0]),round(s1[1]-s0[1])],'| no box drawn by it:',pg.locator('.tb-box').count()==0)
    pg.click('.tb-zoom button:has-text("Fit")'); pg.wait_for_timeout(300)
    print('number box reachable without scrolling:',drag('A-101')); print('keys now:',[t.replace('\n',' = ') for t in pg.locator('.tb-key').all_inner_texts()])
    drag('FIRST FLOOR PLAN'); pg.click('.tb-key:has-text("Issue date")'); drag('09/01/2026'); print('keys:',[t.replace('\n',' = ') for t in pg.locator('.tb-key').all_inner_texts()])
    pg.fill('.tb-name input','AMR 24x36'); sv=pg.locator('button:has-text("Save template")'); print('Save enabled:',sv.is_enabled()); pg.screenshot(path='tpl_3.png'); sv.click(); pg.wait_for_timeout(1500); pg.screenshot(path='tpl_4.png')
    print('saved to server:',[(t.get('name'),sorted((t.get('regions') or {}).keys())) for t in saved],'| back at table:',pg.locator('.reread-table').count()==1,'| editor error:',pg.locator('.tb-editor .error, .tb-editor .notice').all_inner_texts())
    if pg.locator('.reread-table').count(): print('re-read with it:',pg.evaluate("[...document.querySelectorAll('.reread tbody tr')].map(r=>[r.cells[0].innerText.replace(/\\n/g,' / '),r.querySelector('input[aria-label=\"Title read\"]')?.value,r.querySelector('input[type=date]')?.value,!r.classList.contains('reread-off')])"),'| Read with:',pg.locator('.reread-with select').input_value()[:8],'| apply button:',pg.inner_text('.reread .actions .primary'))
    pg.click('.reread-with button:has-text("Rename")'); pg.fill('.reread-name input','AMR Architects 24x36'); pg.keyboard.press('Enter'); pg.wait_for_timeout(600)
    print('renamed — on the server:',saved[0]['name'],'| in the list:',pg.locator('.reread-with select option:checked').inner_text(),'| rows kept:',pg.locator('input[aria-label="Title read"]').first.input_value(),'| dialog still open:',pg.locator('.reread-table').count()==1); pg.screenshot(path='tpl_5.png',clip={'x':150,'y':150,'width':1140,'height':200})
    print('errors:',errs[:4]); b.close()
