import { PageTitle } from '../components/PageTitle'
import { PanX } from '../components/PanX'
import { niceTitle } from '../lib/titles'
import { today } from '../lib/dates'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useProject } from '../lib/project'
import { useFirm } from '../lib/firm'
import { db } from '../lib/supabase'
import { splitDrawingSet, type SplitSheet } from '../lib/pdf/splitSet'
import { pageBody, type Region } from '../lib/pdf/pageText'
import { sectionInRegion, titleInRegion } from '../lib/pdf/specRead'
import { RegionPicker } from '../components/RegionPicker'
import { DEFAULT_DPI } from '../lib/pdf/shrink'
import { bundleName, bundleSheets, saveBundle, type BundleSheet } from '../lib/pdf/bundle'
import { PageThumb } from '../components/PageThumb'
import { PdfPreview } from '../components/PdfPreview'
import { FieldSync } from '../components/FieldSync'
import { ShrinkPool } from '../lib/pdf/shrinkPool'
import {
  deleteIssuance, deleteRevision, existingSets, listCurrentSheets, localCurrentSheets, listIssuances, listRevisions, listSheetsAsOf, renameIssuance, renameSheet, saveIssuance, searchSheets, setIssuanceCover, suggestSetName,
  type IssuanceRow, type SearchHit, type SheetToSave,
} from '../lib/sheets'
import { anchorsFrom, COVER, listTemplates, readPage, readWith, saveTemplate, type TitleblockTemplate } from '../lib/titleblocks'
import { fileSheetsUnder, listIssuanceSheets, setNameFor } from '../lib/sheets'
import { byNumberLabel, disciplineFor } from '../lib/disciplines'
import { effectiveOrder, groupByDiscipline, sortSheets, type Discipline } from '../lib/disciplines'
import { ISSUANCE_LABELS, type CurrentSheet, type IssuanceKind, type Project, type SheetRevision } from '../lib/types'
import { openFile } from '../lib/files'
import { ConfirmDelete } from '../components/ConfirmDelete'
import { useSearchParams } from 'react-router-dom'
import { useClickAway } from '../lib/clickAway'
import { joinPages } from '../lib/pdf/bundle'
import { putFile, SECTIONS } from '../lib/files'
import { documentForIssuance, DOCUMENT_FOR } from '../lib/issued'
import { classifyPages, countOf, linesOf, readCover, type CoverReading, type PageRole } from '../lib/pdf/changeDoc'
import { ChangeManual, type ManualEdit, type ManualPlan, type SectionMenu, type SpecPageIn } from '../components/ChangeManual'
import { saveManual } from '../lib/manual'
import { UPLOADED, useUploads } from '../lib/uploadHost'
import { reopenIssuance, takeAwayMoved, type Origin, type Reopened } from '../lib/resort'
import { setFolderName, setSheetDate, sheetDates } from '../lib/sheets'
import { useColumnWidths } from '../components/ResizableColumns'

/** The drawings register's columns, in order, for the widths a person can set by hand. */
const REGISTER_COLUMNS = [
  { key: 'sheet' }, { key: 'title' }, { key: 'rev' },
  { key: 'from' }, { key: 'date' }, { key: 'history' }, { key: 'actions' },
]
const SET_COLUMNS = [{ key: 'set-date' }, { key: 'set-as' }, { key: 'set-subject' }, { key: 'set-sheets' }, { key: 'set-download' }, { key: 'set-actions' }]
import { SheetViewer, type ViewSheet } from '../components/SheetViewer'
import { SheetReread } from '../components/SheetReread'
import { TitleblockEditor } from '../components/TitleblockEditor'
import { DisciplineOrderEditor } from '../components/DisciplineOrder'


/** True when a sheet has been filed somewhere other than where its number would put it. */
function movedAway(s: CurrentSheet, order: Discipline[]): boolean {
  if (!s.filed_under) return false
  return disciplineFor(s.number, order).discipline?.code !== s.filed_under.toUpperCase()
}

const toView = (s: CurrentSheet): ViewSheet => ({
  sheetId: s.sheet_id,
  number: s.number, title: s.title, revisionId: s.revision_id, revisionLabel: s.revision_label, filePath: s.file_path,
  filedUnder: s.filed_under,
})

export default function Documents() {
  const { current, reload: reloadProjects } = useProject()
  const { firm, isAdmin } = useFirm()
  const [sheets, setSheets] = useState<CurrentSheet[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Uploads run in the app's frame (src/lib/uploadHost.tsx), so they carry on when this page is left.
  const uploads = useUploads()
  const uploading = uploads.busy
  const [params, setParams] = useSearchParams()
  const [wantUpload, setWantUpload] = useState<{ files?: File[]; reopen?: string } | null>(null)
  useEffect(() => {
    if (params.get('upload') === null) return
    setWantUpload({})
    // Taken out of the address once it's done its job, so a refresh doesn't reopen it.
    const next = new URLSearchParams(params)
    next.delete('upload')
    setParams(next, { replace: true })
  }, [params, setParams])
  const [pageDrag, setPageDrag] = useState(false)
  const [view, setView] = useState<'sheets' | 'sets'>('sheets')
  const [asOf, setAsOf] = useState('')
  const [asOfRows, setAsOfRows] = useState<Awaited<ReturnType<typeof listSheetsAsOf>> | null>(null)
  const [query, setQuery] = useState('')
  const [allRevs, setAllRevs] = useState(false)
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const [viewing, setViewing] = useState<{ start: ViewSheet; highlight?: string } | null>(null)
  /** Sheets chosen with Ctrl- or Shift-click, to do something to several at once. */
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const lastPick = useRef<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; filing?: boolean } | null>(null)
  const [filing, setFiling] = useState(false)
  const [rereading, setRereading] = useState(false)
  /** In this mode a plain click on a sheet selects it instead of opening it. */
  const [selecting, setSelecting] = useState(false)
  /** On a phone: the search box, and the rest of the toolbar, are each shown only when asked for. */
  const [phoneSearch, setPhoneSearch] = useState(false)
  const [phoneTools, setPhoneTools] = useState(false)
  function pick(id: string, range: boolean, inOrder: string[]) {
    // The sheet clicked before this one is read now, not inside the updater: the updater runs
    // later, by which time it has been overwritten with this one and the run has no length.
    const from = lastPick.current
    setPicked((was) => {
      const next = new Set(was)
      const a = from ? inOrder.indexOf(from) : -1, b = inOrder.indexOf(id)
      if (range && a >= 0 && b >= 0) for (let i = Math.min(a, b); i <= Math.max(a, b); i++) next.add(inOrder[i])
      else if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    lastPick.current = id
  }
  const [ordering, setOrdering] = useState(false)
  // The search row and the column headings stay at the top of the window while the list scrolls
  // under them. The headings sit below the search row (and the selection bar, when it is up),
  // so their heights are measured and handed to the stylesheet.
  const pageBox = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const box = pageBox.current
    if (!box || typeof ResizeObserver === 'undefined') return
    const measure = () => {
      const h = (sel: string) => Math.round(box.querySelector<HTMLElement>(sel)?.getBoundingClientRect().height ?? 0)
      box.style.setProperty('--docs-tools-h', `${h('.toolbar')}px`)
      box.style.setProperty('--docs-pick-h', `${h('.pick-bar')}px`)
    }
    const watch = new ResizeObserver(measure)
    watch.observe(box)
    const seen = new MutationObserver(() => { measure(); for (const el of box.querySelectorAll('.toolbar, .pick-bar')) watch.observe(el) })
    seen.observe(box, { childList: true, subtree: true })
    measure()
    return () => { watch.disconnect(); seen.disconnect() }
  }, [])

  const order = effectiveOrder(firm?.discipline_order, current?.discipline_order)

  const load = useCallback(async () => {
    if (!current) return
    setLoading(true)
    // A project taken to the field is listed from the device at once, and the server's list
    // replaces it when it answers. One bar that never delivers is then no worse than none.
    const here = await localCurrentSheets(current.id).catch(() => [])
    if (here.length) { setSheets(here); setLoading(false) }
    try {
      setSheets(await listCurrentSheets(current.id))
      setError(null)
    } catch (e) {
      if (!here.length) setError(message(e))
    } finally {
      setLoading(false)
    }
  }, [current])

  useEffect(() => { load() }, [load])

  // An upload asked for here is handed to the app's frame with what it needs from this page.
  useEffect(() => {
    if (!wantUpload || !current || !firm) return
    uploads.open({
      project: current, firmId: firm.id, order,
      existingNumbers: new Set(sheets.map((s) => s.number)),
      existingTitles: new Map(sheets.filter((s) => s.title).map((s) => [s.number.toUpperCase(), s.title!])),
      initialFiles: wantUpload.files, reopen: wantUpload.reopen,
    })
    setWantUpload(null)
  }, [wantUpload, current, firm, order, sheets, uploads])
  // An upload finished (here or after leaving and coming back): the list is read again.
  useEffect(() => {
    const again = (e: Event) => { if ((e as CustomEvent).detail === current?.id) load() }
    window.addEventListener(UPLOADED, again)
    return () => window.removeEventListener(UPLOADED, again)
  }, [load, current?.id])

  useEffect(() => {
    if (!current || !asOf) { setAsOfRows(null); return }
    listSheetsAsOf(current.id, asOf).then(setAsOfRows).catch((e) => setError(message(e)))
  }, [current, asOf])

  // Search the words on the sheets, a moment after typing stops.
  useEffect(() => {
    const q = query.trim()
    if (!current || q.length < 2) { setHits(null); return }
    const t = window.setTimeout(() => {
      searchSheets(current.id, q, allRevs).then(setHits).catch((e) => setError(message(e)))
    }, 300)
    return () => window.clearTimeout(t)
  }, [current, query, allRevs])

  const ordered = useMemo(() => sortSheets(sheets, (s) => s.number, order, (s) => s.filed_under), [sheets, order])
  const viewSheets = useMemo(() => ordered.map(toView), [ordered])
  const visible = useMemo(() => {
    const q = query.trim().toUpperCase()
    return q ? ordered.filter((s) => s.number.includes(q) || s.number.replace(/-/g, '').includes(q.replace(/-/g, '')) || (s.title ?? '').toUpperCase().includes(q)) : ordered
  }, [ordered, query])
  const groups = useMemo(() => groupByDiscipline(visible, (s) => s.number, order, (s) => s.filed_under), [visible, order])
  /** The selected sheets, for the right-click menu. */
  const chosen = sheets.filter((s) => picked.has(s.sheet_id))
  /** File the selected sheets under one discipline (null: where each number puts it). Numbers stay as they are. */
  async function fileUnder(code: string | null) {
    setFiling(true)
    try {
      await fileSheetsUnder(chosen.map((s) => ({ id: s.sheet_id, number: s.number })), code, (n) => disciplineFor(n, order).discipline?.code)
      setMenu(null)
      await load()
    } catch (e) {
      setError(message(e))
    } finally {
      setFiling(false)
    }
  }
  const cols = useColumnWidths(REGISTER_COLUMNS)

  if (!current) {
    return (
      <section>
        <PageTitle>Drawings</PageTitle>
        <div className="card muted">Choose a project first, on the <Link to="/">Projects</Link> page.</div>
      </section>
    )
  }

  async function saveProjectOrder(list: Discipline[] | null) {
    const { error } = await db().from('projects').update({ discipline_order: list }).eq('id', current!.id)
    if (error) throw error
    await reloadProjects()
  }

  const openHit = (h: SearchHit) => setViewing({
    start: { sheetId: h.sheet_id, number: h.number, title: h.title, revisionId: h.revision_id, revisionLabel: null, filePath: h.file_path, superseded: !h.is_current },
    highlight: query.trim(),
  })

  // Dropping PDFs anywhere on the page starts an upload with them.
  const pageDropProps = uploading ? {} : {
    onDragOver: (e: React.DragEvent) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); setPageDrag(true) } },
    onDragLeave: (e: React.DragEvent) => { if (e.currentTarget === e.target) setPageDrag(false) },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); setPageDrag(false); const f = [...e.dataTransfer.files]; if (f.length) setWantUpload({ files: f }) },
  }

  return (
    <section ref={pageBox} {...pageDropProps} className={`docs-page${phoneTools ? ' tools-open' : ''}${pageDrag ? ' page-drop' : ''}`}>
      <div className="page-head">
        <div>
          <PageTitle>Drawings</PageTitle>
          <p className="lead">{current.number} {current.name} · {sheets.length} sheets</p>
        </div>
        {/* Uploading a set from a phone is a rare thing done at a desk, so it isn't given the
            loudest control on a phone screen; it lives under More in the corner menu instead. */}
        {!uploading && <button className="primary desk-only" onClick={() => setWantUpload({})}>Upload a set or revised sheets</button>}
      </div>

      {/* Whether the copy on this device is still the job. Silent unless it isn't. */}
      <FieldSync project={current} onSynced={load} />

      {error && <div className="notice error">{error}</div>}

      {/* On a phone the top of the page is one short row: which list, a search button, and the
          rest of the controls behind the dots. The full tabs and toolbar are the desk's. */}
      <div className="docs-mini">
        <div className="docs-mini-tabs" role="tablist">
          <button role="tab" aria-selected={view === 'sheets'} className={view === 'sheets' ? 'on' : ''} onClick={() => setView('sheets')}>Sheets</button>
          <button role="tab" aria-selected={view === 'sets'} className={view === 'sets' ? 'on' : ''} onClick={() => setView('sets')}>Sets and revisions</button>
        </div>
        <button className={`docs-mini-key${phoneSearch || query ? ' on' : ''}`} aria-label="Search the drawings" aria-expanded={phoneSearch}
          onClick={() => { setView('sheets'); setPhoneSearch(!phoneSearch) }}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></svg>
        </button>
        <button className={`docs-mini-key${phoneTools ? ' on' : ''}`} aria-label="More options" aria-expanded={phoneTools}
          onClick={() => { setView('sheets'); setPhoneTools(!phoneTools) }}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" /></svg>
        </button>
      </div>
      {phoneSearch && view === 'sheets' && (
        <div className="docs-mini-search">
          <input autoFocus type="search" enterKeyHint="search" value={query} placeholder="Sheet number, title or words on a drawing"
            onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
          <button aria-label="Close the search" onClick={() => { setQuery(''); setPhoneSearch(false) }}>×</button>
        </div>
      )}

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={view === 'sheets'} className={view === 'sheets' ? 'on' : ''} onClick={() => setView('sheets')}>Current sheets</button>
        <button role="tab" aria-selected={view === 'sets'} className={view === 'sets' ? 'on' : ''} onClick={() => setView('sets')}>Sets and revisions</button>
      </div>

      {view === 'sets' ? (
        <SetsList project={current} order={order} isAdmin={isAdmin} onChanged={load}
          onResort={(id) => setWantUpload({ reopen: id })} reloadKey={uploading} />
      ) : (
        <>
          <div className="toolbar">
            <input className="grow" placeholder="Search sheet numbers, titles and the words on the drawings" value={query} onChange={(e) => setQuery(e.target.value)} />
            <label className="inline">
              Set as of
              <input type="date" value={asOf} max={today()} onChange={(e) => setAsOf(e.target.value)} />
            </label>
            {asOf && <button onClick={() => setAsOf('')}>Show current</button>}
            <button onClick={() => setOrdering(!ordering)}>{ordering ? 'Close sheet order' : 'Sheet order'}</button>
            {/* The way in to anything done to several sheets at once. Ctrl- and Shift-click do the
                same without it, but nobody finds a thing that only appears after they have used it. */}
            <button className={selecting ? 'on' : ''} aria-pressed={selecting} onClick={() => { setSelecting(!selecting); if (selecting) setPicked(new Set()) }}>
              {selecting ? 'Done selecting' : 'Re-read titles and dates'}
            </button>
          </div>

          {ordering && (
            <div className="card order-panel">
              <h2>Sheet order for this project</h2>
              <p className="muted small">
                {current.discipline_order?.length ? 'This project has its own order.' : 'Using your firm’s order (set in Settings).'} Drag disciplines into the order sheets should appear. Sheets are matched by their leading letters: FP-101 goes under FP if it’s listed, otherwise under F.
              </p>
              <DisciplineOrderEditor
                key={current.discipline_order ? 'own' : 'firm'}
                value={order}
                saveLabel="Save for this project"
                onSave={(list) => saveProjectOrder(list)}
                extra={current.discipline_order?.length ? <button type="button" className="link" onClick={() => saveProjectOrder(null)}>Use firm order</button> : null}
              />
            </div>
          )}

          {hits && (
            <div className="card search-hits">
              <div className="search-head">
                <span><strong>{hits.length}</strong> {hits.length === 1 ? 'sheet mentions' : 'sheets mention'} “{query.trim()}”</span>
                <label className="check small"><input type="checkbox" checked={allRevs} onChange={(e) => setAllRevs(e.target.checked)} /> Include superseded revisions</label>
              </div>
              {hits.length === 0 && <p className="muted small">Nothing on the drawings matches. Sheets uploaded before search was added, and scanned sheets, have no words to search.</p>}
              {sortSheets(hits, (h) => h.number, order).map((h) => (
                <button key={h.revision_id} className="hit" onClick={() => openHit(h)}>
                  <span className="mono">{h.number}</span>
                  <span className="hit-title">{niceTitle(h.title)}{!h.is_current && <span className="tag muted">rev {h.revision_index}, superseded</span>}</span>
                  <span className="hit-snip">{snippet(h.snippet)}</span>
                </button>
              ))}
            </div>
          )}

          {(asOfRows ? asOfRows.length > 0 : sheets.length > 0) && (
            <div className="set-actions">
              <span className="muted small">
                {asOfRows
                  ? `${asOfRows.length} sheets as of ${usDate(asOf)}`
                  : `${sheets.length} current ${sheets.length === 1 ? "sheet" : "sheets"}`}
              </span>
              <DownloadSet
                project={current}
                order={order}
                label="Record set"
                date={asOfRows ? asOf.slice(0, 10) : today()}
                gather={async () => (asOfRows
                  ? asOfRows.map((r) => ({ number: r.sheet_number, title: r.sheet_title, revisionLabel: null, filePath: r.file_path }))
                  : sheets.map((s) => ({ number: s.number, title: s.title, revisionLabel: s.revision_label, filePath: s.file_path, filedUnder: s.filed_under })))}
              />
            </div>
          )}

          {asOfRows ? (
            <AsOfTable rows={asOfRows} date={asOf} order={order} onOpen={(p) => openFile(current, p).catch((e) => setError(message(e)))} />
          ) : loading ? (
            <p className="muted">Loading…</p>
          ) : sheets.length === 0 ? (
            <div className="card muted">No drawings yet. Upload the bid or permit set to start.</div>
          ) : (
            <>
            {(picked.size > 0 || selecting) && (
              <div className="pick-bar">
                <strong>{picked.size ? `${picked.size} ${picked.size === 1 ? 'sheet' : 'sheets'} selected` : 'Click the sheets to re-read'}</strong>
                {selecting && <span className="muted small">A click selects; Shift-click takes everything between; a discipline’s heading takes the whole discipline.</span>}
                <button className="link" onClick={() => setPicked(new Set(groups.flatMap((g) => g.items.map((i) => i.sheet_id))))}>Select all {groups.reduce((n, g) => n + g.items.length, 0)}</button>
                {picked.size > 0 && <button className="primary" onClick={() => setRereading(true)}>Re-read {picked.size === 1 ? 'its' : 'their'} title and date</button>}
                <button className="link" onClick={() => { setPicked(new Set()); setSelecting(false) }}>{selecting ? 'Cancel' : 'Clear'}</button>
              </div>
            )}
<PanX className="register-pan">
                        <table className="register sizable" ref={cols.table}>
              {cols.cols}
              <thead>
                {/* col-* classes set which columns give way first on a small screen (index.css).
                    The grips let a width be set by hand; double-clicking one gives it back. */}
                <tr>
                  <th>Sheet{cols.grip('sheet', 64)}</th>
                  <th className="col-title">Title{cols.grip('title', 100)}</th>
                  <th>Rev.{cols.grip('rev', 48)}</th>
                  <th className="col-from">From{cols.grip('from', 72)}</th>
                  <th className="col-date">Date{cols.grip('date', 72)}</th>
                  <th className="col-history">History{cols.grip('history', 72)}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <Fragment key={g.key}>
                    {/* A discipline's heading selects the whole discipline: while selecting, or with
                        Ctrl held. Clicked again with all of it selected, it lets all of it go. */}
                    <tr className={`group${selecting ? ' group-pick' : ''}${g.items.length && g.items.every((i) => picked.has(i.sheet_id)) ? ' group-picked' : ''}`}
                      title={selecting ? `Select every ${g.label} sheet` : 'Ctrl-click to select every sheet in this discipline'}
                      onClick={(e) => {
                        if (!(selecting || e.ctrlKey || e.metaKey)) return
                        const ids = g.items.map((i) => i.sheet_id)
                        setPicked((was) => {
                          const next = new Set(was)
                          const all = ids.every((id) => next.has(id))
                          for (const id of ids) { if (all) next.delete(id); else next.add(id) }
                          return next
                        })
                        lastPick.current = ids[ids.length - 1] ?? null
                      }}>
                      <td colSpan={7}>{g.label}{selecting && <span className="group-pick-say">{g.items.every((i) => picked.has(i.sheet_id)) ? 'all selected' : `select all ${g.items.length}`}</span>}</td>
                    </tr>
                    {g.items.map((s) => <SheetRow key={s.sheet_id} sheet={s} project={current} order={order} isAdmin={isAdmin} onChanged={load} onOpen={(v) => setViewing({ start: v })}
                      picked={picked.has(s.sheet_id)} anyPicked={picked.size > 0} selecting={selecting}
                      onPick={(range) => pick(s.sheet_id, range, groups.flatMap((x) => x.items.map((i) => i.sheet_id)))}
                      onMenu={(x, y) => setMenu({ x, y })} />)}
                  </Fragment>
                ))}
              </tbody>
            </table>
            </PanX>
            </>
          )}
        </>
      )}

      {menu && (
        <div className="pick-menu-shade" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null) }}>
          <div className="pick-menu" role="menu" onClick={(e) => e.stopPropagation()}
            style={{ left: Math.min(menu.x, window.innerWidth - 290), top: Math.max(8, Math.min(menu.y, window.innerHeight - (menu.filing ? 470 : 150))) }}>
            {!menu.filing ? (
              <>
                <button role="menuitem" onClick={() => setMenu({ ...menu, filing: true })}>Change discipline ▸</button>
                <button role="menuitem" onClick={() => { setMenu(null); setRereading(true) }}>Re-read title and date from {picked.size === 1 ? 'the sheet' : `these ${picked.size} sheets`}</button>
                <button role="menuitem" onClick={() => { setMenu(null); setPicked(new Set()) }}>Clear the selection</button>
              </>
            ) : (
              <>
                <button role="menuitem" className="pick-menu-back" onClick={() => setMenu({ ...menu, filing: false })}>◂ File {picked.size === 1 ? 'the sheet' : `these ${picked.size} sheets`} under</button>
                <div className="pick-menu-list">
                  <button role="menuitem" disabled={filing} onClick={() => fileUnder(null)}>Where {picked.size === 1 ? 'its number puts it' : 'each one’s number puts it'}</button>
                  {order.map((d) => {
                    const here = chosen.length > 0 && chosen.every((s) => (disciplineFor(s.number, order, s.filed_under).discipline?.code ?? '') === d.code)
                    return <button role="menuitem" key={d.code} disabled={filing} className={here ? 'pick-menu-here' : undefined} onClick={() => fileUnder(d.code)}>{d.code} · {d.name}{here ? ' ✓' : ''}</button>
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {rereading && current && firm && (
        <SheetReread project={current} firmId={firm.id} sheets={sheets.filter((s) => picked.has(s.sheet_id))}
          onDone={(changed) => { setRereading(false); if (changed) { setPicked(new Set()); setSelecting(false); load() } }} />
      )}
      {viewing && (
        <SheetViewer project={current} sheets={viewSheets} start={viewing.start} highlight={viewing.highlight} onClose={() => setViewing(null)} onSheetChanged={load} />
      )}
    </section>
  )
}

function snippet(s: string) {
  return s.split(/(«[^»]*»)/).map((part, i) => part.startsWith('«') ? <mark key={i}>{part.slice(1, -1)}</mark> : part)
}

/**
 * The sheets in one set, readable at a glance.
 *
 * Eighty-seven sheet numbers in one run of commas is a wall of text that answers nothing: the
 * question a set list is asked is what is in it — how much of each discipline — and only then
 * which sheets exactly. So the count by discipline comes first, and the numbers themselves open
 * underneath, grouped and lined up, for when that is the question.
 */
function IssuanceSheets({ sheets, order }: { sheets: { number: string; revision_label: string | null }[]; order: Discipline[] }) {
  const [open, setOpen] = useState(false)
  const groups = groupByDiscipline(sheets, (s) => s.number, order)

  return (
    <div className="issued-sheets">
      <button className="link" onClick={() => setOpen(!open)} aria-expanded={open}>
        <strong>{sheets.length}</strong> {sheets.length === 1 ? 'sheet' : 'sheets'}
      </button>
      <span className="muted">
        {groups.map((g) => `${g.key === 'COVER' ? 'Cover' : g.key} ${g.items.length}`).join(' · ')}
      </span>
      {open && (
        <div className="issued-grid">
          {groups.map((g) => (
            <div key={g.key} className="issued-group">
              <div className="issued-label">{g.label}</div>
              <div className="issued-numbers">
                {g.items.map((s) => (
                  <span key={s.number} className="mono">
                    {s.number}{s.revision_label ? <span className="muted"> {s.revision_label}</span> : null}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Download a set as one PDF. Sheets live one file each, which is what makes revisions and search
 * work, but nobody sends them that way — a set goes out as a single file in sheet order.
 */
function DownloadSet({ project, order, label, date, gather, className }: {
  project: Project
  order: Discipline[]
  /** What this set is, for the file name: "Record set", "Addendum 2". */
  label: string
  date?: string
  gather: () => Promise<BundleSheet[]>
  className?: string
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  async function go() {
    setProblem(null)
    setBusy('gathering')
    try {
      const sheets = await gather()
      if (!sheets.length) { setProblem('No sheets in this set.'); return }
      const bundle = await bundleSheets(project, sheets, order, (done, total, number) =>
        setBusy(done >= total ? 'writing the file' : `sheet ${done + 1} of ${total} · ${number}`))
      saveBundle(bundle.bytes, bundleName(project, label, date))
      if (bundle.missing.length) setProblem(`${bundle.missing.length} sheet${bundle.missing.length === 1 ? '' : 's'} could not be read and ${bundle.missing.length === 1 ? 'is' : 'are'} not in the file: ${bundle.missing.join(', ')}.`)
    } catch (e) {
      setProblem(message(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <button className={className} onClick={go} disabled={!!busy}>
        {busy ? `Building… ${busy}` : 'Download'}
      </button>
      {problem && <div className="notice warn small">{problem}</div>}
    </>
  )
}

function SheetRow({ sheet, project, order, isAdmin, onChanged, onOpen, picked, anyPicked, selecting, onPick, onMenu }: {
  sheet: CurrentSheet; project: Project; order: Discipline[]; isAdmin: boolean; onChanged: () => void; onOpen: (v: ViewSheet) => void
  picked: boolean; anyPicked: boolean; selecting: boolean; onPick: (range: boolean) => void; onMenu: (x: number, y: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [history, setHistory] = useState<SheetRevision[] | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ number: string; title: string; filedUnder: string; revDate: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  // The current revision's own date (the one printed on the sheet), as it was when the panel opened.
  const revDateWas = useRef('')

  const startEdit = () => {
    setProblem(null)
    setEditing({ number: sheet.number, title: niceTitle(sheet.title), filedUnder: sheet.filed_under ?? '', revDate: '' })
    revDateWas.current = ''
    sheetDates([sheet.revision_id]).then((m) => {
      const d = (m.get(sheet.revision_id) ?? '').slice(0, 10)
      revDateWas.current = d
      setEditing((e) => (e ? { ...e, revDate: d } : e))
    }).catch(() => {})
  }

  const onEditKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); saveEdit() }
    if (e.key === 'Escape') { e.preventDefault(); setEditing(null) }
  }

  // Clicking anywhere else leaves the rename, as Cancel does.
  const editBox = useRef<HTMLDivElement>(null)
  useClickAway(editBox, () => { if (!saving) setEditing(null) }, !!editing)

  async function saveEdit() {
    if (!editing || saving) return
    setSaving(true)
    setProblem(null)
    try {
      await renameSheet(sheet.sheet_id, editing, sheet.revision_id)
      if (editing.revDate !== revDateWas.current) await setSheetDate(sheet.revision_id, editing.revDate || null)
      setEditing(null)
      setHistory(null)
      onChanged()
    } catch (e) {
      setProblem(message(e))
    } finally {
      setSaving(false)
    }
  }

  async function toggle() {
    if (!open && !history) setHistory(await listRevisions(sheet.sheet_id))
    setOpen(!open)
  }

  const openRevision = (r: SheetRevision) => onOpen({
    sheetId: sheet.sheet_id,
    number: sheet.number, title: r.title_at_rev ?? sheet.title, revisionId: r.id, revisionLabel: r.revision_label,
    filePath: r.file_path, superseded: r.revision_index !== sheet.revision_index,
  })

  return (
    <>
      {/* The row is the way in. Anything else on it — the revisions toggle — stops the click
          getting this far, so only the row's own space opens the sheet. */}
      {/* Ctrl- or Shift-click chooses the row instead of opening it; a right-click on a chosen
          row is about the chosen ones, and on any other row it renames that one, as before. */}
      <tr className={`opens${editing ? ' editing' : ''}${picked ? ' picked' : ''}`} tabIndex={0} role="button" aria-label={`Open ${sheet.number}`} aria-selected={picked}
        onClick={(e) => {
          if (editing || (e.target as HTMLElement).closest('button, a')) return
          if (selecting || e.ctrlKey || e.metaKey || e.shiftKey) { e.preventDefault(); onPick(e.shiftKey); return }
          onOpen(toView(sheet))
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          if (picked) onMenu(e.clientX, e.clientY)
          else if (anyPicked) { onPick(false); onMenu(e.clientX, e.clientY) }
          else startEdit()
        }}
        onKeyDown={(e) => { if (!editing && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(toView(sheet)) } }}>
        <td className="mono">
          {sheet.number}
          {movedAway(sheet, order) && <span className="filed-tag" title={`Filed under ${sheet.filed_under}, not where its number puts it`}>filed {sheet.filed_under}</span>}
        </td>
        <td className="col-title">{niceTitle(sheet.title)}</td>
        <td>{sheet.revision_label || sheet.revision_index}</td>
        <td className="col-from">{issuanceText(sheet.issuance_kind, sheet.issuance_number)}</td>
        <td className="col-date">{usDate(sheet.issued_on)}</td>
        <td className="col-history">
          {sheet.revision_count > 1 || isAdmin
            ? <button className="link" onClick={toggle}>{open ? 'Hide' : sheet.revision_count > 1 ? `${sheet.revision_count} revisions` : 'original'}</button>
            : <span className="muted">original</span>}
        </td>
        <td className="right nowrap">
          {!editing && <button className="link row-edit" onClick={startEdit} title={`Rename ${sheet.number}`}>Rename</button>}
        </td>
      </tr>

      {/* Correcting a number or title read wrong off a titleblock. It opens under the row rather
          than inside it, so the fields have room to be typed into on a phone. */}
      {editing && (
        <tr className="confirm-row"><td colSpan={7}>
          <div ref={editBox}>
          <div className="sheet-edit">
            <label className="f-number">Sheet
              <input value={editing.number} autoFocus aria-label="Sheet number"
                onChange={(e) => setEditing({ ...editing, number: e.target.value })} onKeyDown={onEditKey} />
            </label>
            <label className="f-title">Title
              <input value={editing.title} aria-label="Sheet title"
                onChange={(e) => setEditing({ ...editing, title: e.target.value })} onKeyDown={onEditKey} />
            </label>
            {/* The date of the sheet's current revision, as printed on it (often not the set's date). */}
            <label className="f-date">Revision date
              <input type="date" value={editing.revDate} aria-label="Revision date"
                onChange={(e) => setEditing({ ...editing, revDate: e.target.value })} onKeyDown={onEditKey} />
            </label>
            {/* Where the sheet is filed, for the sheets whose numbers don't say their trade. The
                number stays as printed; only the list it appears in changes. */}
            <label className="f-filed">Filed under
              <select value={editing.filedUnder} aria-label="Filed under which discipline"
                onChange={(e) => setEditing({ ...editing, filedUnder: e.target.value })} onKeyDown={onEditKey}>
                <option value="">{byNumberLabel(editing.number, order)}</option>
                {order.map((d) => <option key={d.code} value={d.code}>{d.code} · {d.name}</option>)}
              </select>
            </label>
            <div className="sheet-edit-go">
              <button className="primary-lite" onClick={saveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              <button onClick={() => setEditing(null)} disabled={saving}>Cancel</button>
            </div>
          </div>
          <p className="muted small">
            {problem
              ? <span className="bad-text">{problem}</span>
              : editing.filedUnder
                ? <>Filed under {editing.filedUnder} whatever its number says, so it appears there in the drawing list, the sheet index and a downloaded set. The number stays {editing.number.trim() || 'as it is'}.</>
                : <>Fixes the sheet and this revision’s title. Earlier revisions keep the title they were issued with, and the stored file keeps its own name.</>}
          </p>
          </div>
        </td></tr>
      )}
      {open && history?.map((r) => (
        <Fragment key={r.id}>
          <tr className="history opens" tabIndex={0} role="button"
            aria-label={`Open ${sheet.number} revision ${r.revision_label || r.revision_index}`}
            onClick={(e) => { if (!(e.target as HTMLElement).closest('button, a')) openRevision(r) }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRevision(r) } }}>
            <td />
            <td className="col-title">{niceTitle(r.title_at_rev)}</td>
            <td>{r.revision_label || r.revision_index}</td>
            <td className="col-from">{r.issuances ? issuanceText(r.issuances.kind, r.issuances.number) : ''}</td>
            <td className="col-date">
              {r.issuances ? usDate(r.issuances.issued_on) : ''}
              {/* The sheet's own date, where its title block carried one that isn't the set's. */}
              {r.sheet_date && r.sheet_date !== r.issuances?.issued_on &&
                <span className="muted small" title="The revision date printed on the sheet itself"> · revision date {usDate(r.sheet_date)}</span>}
            </td>
            <td className="col-history">{r.revision_index === sheet.revision_index ? <span className="tag">current</span> : <span className="tag muted">superseded</span>}</td>
            <td className="right nowrap">
              {isAdmin && <button className="link danger-link" onClick={() => setDeleting(deleting === r.id ? null : r.id)}>Delete</button>}
            </td>
          </tr>
          {deleting === r.id && (
            <tr className="confirm-row"><td colSpan={7}>
              <ConfirmDelete
                what={`${sheet.number} revision ${r.revision_label || r.revision_index}`}
                detail={history.length === 1 ? 'It’s the only revision, so the sheet is removed from the project.' : r.revision_index === sheet.revision_index ? 'The sheet goes back to its previous revision.' : ''}
                folderOption projectId={project.id}
                onCancel={() => setDeleting(null)}
                onConfirm={async (alsoFolder) => {
                  await deleteRevision(project, r.id, alsoFolder)
                  setDeleting(null)
                  setHistory(await listRevisions(sheet.sheet_id))
                  onChanged()
                }}
              />
            </td></tr>
          )}
        </Fragment>
      ))}
    </>
  )
}

function SetsList({ project, order, isAdmin, onChanged, onResort, reloadKey }: {
  project: Project; order: Discipline[]; isAdmin: boolean; onChanged: () => void
  /** Open a set's pages again in the upload screen, to move them between drawings, cover and manual. */
  onResort?: (issuanceId: string) => void
  reloadKey?: unknown
}) {
  const [rows, setRows] = useState<IssuanceRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id: string; kind: IssuanceKind; number: string; title: string; issuedOn: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const reload = useCallback(() => { listIssuances(project.id).then(setRows).catch((e) => setError(message(e))) }, [project.id])
  useEffect(() => { reload() }, [reload, reloadKey])
  const setBox = useRef<HTMLDivElement>(null)
  const cols = useColumnWidths(SET_COLUMNS)
  useClickAway(setBox, () => { if (!saving) setEditing(null) }, !!editing)
  if (error) return <div className="notice error">{error}</div>
  if (!rows) return <p className="muted">Loading…</p>
  if (!rows.length) return <div className="card muted">No sets uploaded yet.{note && <> {note}</>}</div>
  return (
    <>
      {note && <div className="notice">{note}</div>}
      <table className="sets sizable" ref={cols.table}>
        {cols.cols}
        <thead><tr><th>Date{cols.grip('set-date', 72)}</th><th>Issued as{cols.grip('set-as', 80)}</th><th>Subject{cols.grip('set-subject', 100)}</th><th>Sheets{cols.grip('set-sheets', 90)}</th><th /><th /></tr></thead>
        <tbody>
          {rows.map((r) => (
            <Fragment key={r.id}>
              <tr className={editing?.id === r.id ? 'editing' : undefined}
                onContextMenu={(e) => {
                  e.preventDefault(); setProblem(null)
                  setEditing({ id: r.id, kind: r.kind, number: r.number ?? '', title: r.title ?? '', issuedOn: r.issued_on.slice(0, 10) })
                }}>
                <td className="nowrap">{usDate(r.issued_on)}</td>
                <td className="nowrap">{issuanceText(r.kind, r.number)}</td>
                {/* The subject of the change document it was issued with; failing that, the set's own. */}
                <td className="col-title">{r.subject ?? r.title ?? ''}</td>
                <td className="small">
                  {/* "0 sheets" on the upload that holds the project manual read as an empty set. */}
                  {r.sheets.length > 0 || !r.sections ? <IssuanceSheets sheets={r.sheets} order={order} /> : null}
                  {r.sections > 0 && <span className="muted">{r.sheets.length ? ' · ' : ''}{r.sections} project manual {r.sections === 1 ? 'section' : 'sections'}</span>}
                </td>
                <td className="right nowrap">
                  <DownloadSet
                    project={project}
                    order={order}
                    label={issuanceText(r.kind, r.number)}
                    date={r.issued_on.slice(0, 10)}
                    gather={() => listIssuanceSheets(r.id)}
                  />
                </td>
                <td className="right nowrap">
                  {editing?.id !== r.id && (
                    <button className="link" onClick={() => {
                      setProblem(null)
                      setEditing({ id: r.id, kind: r.kind, number: r.number ?? '', title: r.title ?? '', issuedOn: r.issued_on.slice(0, 10) })
                    }}>Rename</button>
                  )}
                  {isAdmin && onResort && <> <button className="link" title="Open its pages again to move them between drawings, set introduction and project manual" onClick={() => onResort(r.id)}>Pages</button></>}
                  {isAdmin && <> <button className="link danger-link" onClick={() => setDeleting(deleting === r.id ? null : r.id)}>Delete set</button></>}
                </td>
              </tr>
              {editing?.id === r.id && (
                <tr className="confirm-row"><td colSpan={6}>
                  <div ref={setBox}>
                  {/* Same order as the row it opens under: date, then what it was issued as. */}
                  <div className="sheet-edit">
                    <label className="f-date">Date
                      <input type="date" value={editing.issuedOn} aria-label="Issued on"
                        onChange={(e) => setEditing({ ...editing, issuedOn: e.target.value })} />
                    </label>
                    <label className="f-kind">Category
                      <select value={editing.kind} onChange={(e) => setEditing({ ...editing, kind: e.target.value as IssuanceKind })}>
                        {(Object.keys(ISSUANCE_LABELS) as IssuanceKind[]).map((k) => <option key={k} value={k}>{ISSUANCE_LABELS[k]}</option>)}
                      </select>
                    </label>
                    <label className="f-name">Set name
                      <input value={editing.number} placeholder="Addendum 2" aria-label="Set name"
                        onChange={(e) => setEditing({ ...editing, number: e.target.value })} />
                    </label>
                    <label className="f-title">Note (optional)
                      <input value={editing.title} aria-label="Set note"
                        onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
                    </label>
                    <div className="sheet-edit-go">
                      <button className="primary-lite" disabled={saving} onClick={async () => {
                        setSaving(true); setProblem(null)
                        try { await renameIssuance(editing.id, editing); setEditing(null); reload(); onChanged() }
                        catch (e) { setProblem(message(e)) }
                        finally { setSaving(false) }
                      }}>{saving ? 'Saving…' : 'Save'}</button>
                      <button disabled={saving} onClick={() => setEditing(null)}>Cancel</button>
                    </div>
                  </div>
                  {problem && <p className="muted small"><span className="bad-text">{problem}</span></p>}
                  </div>
                </td></tr>
              )}
              {deleting === r.id && (
                <tr className="confirm-row"><td colSpan={6}>
                  <ConfirmDelete
                    what={issuanceText(r.kind, r.number)}
                    detail={`Its ${r.sheets.length} ${r.sheets.length === 1 ? 'sheet is' : 'sheets are'} removed; sheets it revised go back to their previous revision.`}
                    folderOption projectId={project.id}
                    onCancel={() => setDeleting(null)}
                    onConfirm={async (alsoFolder) => {
                      const res = await deleteIssuance(project, r.id, alsoFolder)
                      setDeleting(null)
                      setNote(`Deleted ${issuanceText(r.kind, r.number)}: ${res.deleted} ${res.deleted === 1 ? 'file' : 'files'} removed from the cloud${alsoFolder ? `, ${res.localRemoved} from the project folder` : ''}${res.failed ? `; ${res.failed} couldn’t be removed (they’ll show in Settings → File storage)` : ''}.`)
                      reload()
                      onChanged()
                    }}
                  />
                </td></tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </>
  )
}

function AsOfTable({ rows, date, order, onOpen }: { rows: Awaited<ReturnType<typeof listSheetsAsOf>>; date: string; order: Discipline[]; onOpen: (path: string) => void }) {
  const sorted = sortSheets(rows, (r) => r.sheet_number, order)
  return (
    <>
      <div className="notice">The set as it stood on {usDate(date)}: {sorted.length} sheets.</div>
      <table>
        <thead><tr><th>Sheet</th><th>Title</th><th>Rev.</th><th>Issued</th><th /></tr></thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.sheet_number}>
              <td className="mono">{r.sheet_number}</td>
              <td>{niceTitle(r.sheet_title)}</td>
              <td>{r.revision_index}</td>
              <td>{usDate(r.issued_on)}</td>
              <td className="right"><button onClick={() => onOpen(r.file_path)}>Open</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}



interface Draft {
  pageIndex: number
  page: SplitSheet
  /** Set once this sheet has been reduced, so it can be put back. */
  full?: { bytes: Uint8Array; before: number; after: number; note: string }
  include: boolean
  /**
   * What the page is: a drawing, the cover or narrative of the change document, or a page of the
   * project manual. Sorted when the file is read (classifyPages); changed by hand per page.
   */
  role: PageRole
  roleByHand?: boolean
  /** Where the page is filed now, when a saved change document is opened again to be re-sorted. */
  origin?: Origin
  number: string
  title: string
  revision: string
  /** The date read from this sheet's own title block, where the template looks for one. */
  date: string
  templateId: string | null
  /** A template chosen for this sheet by hand ('none' = type it in), instead of the best fit. */
  pinned?: string | null
  /** Best fit was close between two templates. */
  unsure?: boolean
  /** Fields typed by hand: kept when templates change. */
  touched: { number?: boolean; title?: boolean; revision?: boolean; date?: boolean }
}

/** Sort pages into cover, manual and drawings; a page sorted by hand stays where it was put. */
function sortRoles(list: Draft[]): Draft[] {
  const roles = classifyPages(list.map((d) => ({ text: d.page.text, readByTemplate: !!d.templateId })))
  // A letter page among large sheets is a project manual page, whatever its text says (a scan
  // with no readable footer is still one); it can be made a drawing by hand.
  const areas = list.map((d) => d.page.text.width * d.page.text.height).sort((a, b) => a - b)
  const median = areas.length ? areas[Math.floor(areas.length / 2)] : 0
  const small = (d: Draft) => median > 1_000_000 && d.page.text.width * d.page.text.height < median * 0.5
  return list.map((d, i) => {
    const role = roles[i] === 'sheet' && small(d) && !d.templateId ? 'spec' : roles[i]
    return d.roleByHand || d.role === role ? d : { ...d, role }
  })
}

// "Set Introduction": the narrative and cover pages of the change document or set — each
// discipline's, ours included — kept together as the set's own document, apart from the drawings
// (and from the drawing cover sheet).
const ROLE_LABEL: Record<PageRole, string> = { sheet: 'Drawing', cover: 'Set Introduction', spec: 'Manual' }

/** Which part of the upload a page is, as a select. */
function RolePick({ value, onChange, label }: { value: PageRole; onChange: (r: PageRole) => void; label: string }) {
  return (
    <select className={`cell role-cell role-${value}`} value={value} aria-label={label} onChange={(e) => onChange(e.target.value as PageRole)}>
      {(Object.keys(ROLE_LABEL) as PageRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
    </select>
  )
}

export function UploadIssuance({ project, firmId, order, existingNumbers, existingTitles, initialFiles, onDone, onCancel, reopen }: {
  /** The project's current sheets' titles by number, to fill a title when its number is typed. */
  existingTitles?: Map<string, string>
  project: Project
  initialFiles?: File[]
  /** A change document already saved, opened again as its pages to be sorted again. */
  reopen?: string
  firmId: string
  order: Discipline[]
  existingNumbers: Set<string>
  /** Saved; what was saved, in a few words, for the corner. */
  onDone: (what?: string) => void
  onCancel: () => void
}) {
  const [kind, setKind] = useState<IssuanceKind>(existingNumbers.size ? 'addendum' : 'bid_set')
  const [number, setNumber] = useState('')
  // The sets already on this project, so the next one can be named without being asked for.
  const [sets, setSets] = useState<{ kind: IssuanceKind; number: string | null }[]>([])
  const [namedByHand, setNamedByHand] = useState(false)
  // What the change document's cover says it is, and which of the fields it filled have since
  // been typed over (those are left alone when the cover is read again).
  const [coverRead, setCoverRead] = useState<CoverReading | null>(null)
  const [byHand, setByHand] = useState<{ kind?: boolean; date?: boolean; subject?: boolean }>({})
  const [subject, setSubject] = useState('')
  useEffect(() => { existingSets(project.id).then(setSets).catch(() => setSets([])) }, [project.id])
  useEffect(() => {
    if (namedByHand) return
    // The number on the cover, written the way this project writes its sets; else the next one.
    const n = countOf(coverRead?.number ?? null)
    setNumber(n != null && coverRead?.kind === kind ? setNameFor(kind, n, sets) : suggestSetName(kind, sets))
  }, [kind, sets, namedByHand, coverRead])
  const [issuedOn, setIssuedOn] = useState(today())
  const [setRev, setSetRev] = useState('')
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [templates, setTemplates] = useState<TitleblockTemplate[]>([])
  const [preferred, setPreferred] = useState<string>('')
  const [editing, setEditing] = useState<{ template?: TitleblockTemplate; page: number } | null>(null)
  const [step, setStep] = useState<'pick' | 'splitting' | 'review' | 'saving'>('pick')
  const [progress, setProgress] = useState('')
  // In the corner while it saves (or reads a long file), so other work can go on; how far it has got.
  const [collapsed, setCollapsed] = useState(false)
  const [units, setUnits] = useState<{ done: number; total: number } | null>(null)
  // Reading the file failed while in the corner: open again, to say so.
  useEffect(() => { if (collapsed && step === 'pick') setCollapsed(false) }, [collapsed, step])
  // Closing or reloading the tab would stop it: the browser asks first.
  useEffect(() => {
    if (step !== 'saving' && step !== 'splitting') return
    const ask = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', ask)
    return () => window.removeEventListener('beforeunload', ask)
  }, [step])
  const [error, setError] = useState<string | null>(null)
  const [sizeWarning, setSizeWarning] = useState<string | null>(null)
  const [reducing, setReducing] = useState<Set<number>>(new Set())
  const [reduceNote, setReduceNote] = useState<Record<number, string>>({})
  const [run, setRun] = useState<{ done: number; total: number; sheet: string; stage: string } | null>(null)
  const [dpi, setDpi] = useState(DEFAULT_DPI)
  // The page being looked at full size while the set is named.
  const [peek, setPeek] = useState<number | null>(null)

  useEffect(() => { listTemplates(firmId).then(setTemplates).catch((e) => setError(message(e))) }, [firmId])

  // A saved change document opened again: its pages, each in the part it is filed under now.
  const [reopened, setReopened] = useState<Reopened | null>(null)
  useEffect(() => {
    if (!reopen) return
    let live = true
    setStep('splitting'); setProgress('')
    reopenIssuance(project, reopen, (what) => setProgress(`reading ${what}`)).then((r) => {
      if (!live) return
      setReopened(r)
      setKind(r.issuance.kind); setNumber(r.issuance.number ?? ''); setNamedByHand(true)
      setIssuedOn(r.issuance.issued_on.slice(0, 10)); setSubject(r.issuance.title ?? '')
      setByHand({ kind: true, date: true, subject: true })
      setDrafts(r.pages.map(({ origin, page }): Draft => ({
        pageIndex: page.pageIndex, page, include: true, origin, roleByHand: true,
        role: origin.t === 'cover' ? 'cover' : origin.t === 'spec' ? 'spec' : 'sheet',
        number: origin.t === 'sheet' ? origin.number : '', title: origin.t === 'sheet' ? origin.title ?? '' : '',
        revision: origin.t === 'sheet' ? origin.label ?? '' : '', date: origin.t === 'sheet' ? origin.date ?? '' : '',
        templateId: null, pinned: 'none', touched: { number: true, title: true, revision: true, date: true },
      })))
      setStep('review')
    }).catch((e) => { if (live) { setError(message(e)); setStep('pick') } })
    return () => { live = false }
  }, [reopen, project])
  // The sections this document already put in the manual, and how many of their pages stay there.
  const keptSpecs = (reopened?.specRevs ?? []).map((rev) => ({
    rev,
    keep: drafts.filter((d) => d.origin?.t === 'spec' && d.origin.revId === rev.revId && d.include && d.role === 'spec').length,
  }))


  // Re-read every page when the templates or the preferred one change; hand edits stay.
  /**
   * The drawing cover sheet as the project already has it — its number and title from an earlier
   * set — or, on a project that has none, COVER / Cover Sheet (which the drawings list files under
   * Cover). A cover sheet has no ordinary title block, so it is recognised by what it carries (a
   * list of the other sheets, readPage) or chosen by hand from the right-click menu.
   */
  const priorCover = useMemo(() => {
    for (const [n, t] of existingTitles ?? []) {
      if (n === COVER || /^(?:G|T|CS|A)[-\s.]?0{1,3}$/.test(n) || /\bCOVER\b/i.test(t)) return { number: n, title: niceTitle(t) || 'Cover Sheet' }
    }
    return { number: COVER, title: 'Cover Sheet' }
  }, [existingTitles])
  const reread = useCallback((list: Draft[], tpls: TitleblockTemplate[], pref: string) => list.map((d) => {
    if (d.pinned === 'none') return { ...d, templateId: null, unsure: false }
    const pinnedTpl = d.pinned ? tpls.find((t) => t.id === d.pinned) : undefined
    const r = pinnedTpl ? readWith(d.page.text, pinnedTpl) : readPage(d.page.text, tpls, pref || null)
    // Read as the cover sheet: the number and title the project's cover sheet already has.
    const asCover = r.number === COVER
    return {
      ...d,
      templateId: r.templateId,
      unsure: !pinnedTpl && !!r.unsure,
      number: d.touched.number ? d.number : asCover ? priorCover.number : r.number,
      title: d.touched.title ? d.title : asCover ? priorCover.title : niceTitle(r.title),
      revision: d.touched.revision ? d.revision : r.revision,
      date: d.touched.date ? d.date : r.date,
    }
  }), [priorCover])

  useEffect(() => { setDrafts((ds) => sortRoles(reread(ds, templates, preferred))) }, [templates, preferred, reread])
  // Files dropped before the templates loaded are read with whatever is current when they finish.
  const tplRef = useRef({ templates, preferred })
  tplRef.current = { templates, preferred }

  // Cover, manual or drawing, page by page. A page whose part was chosen by hand keeps it.
  const setRole = (i: number, role: PageRole) =>
    setDrafts((ds) => ds.map((x, j) => (j === i ? { ...x, role, roleByHand: true } : x)))
  // Pages moved between the project manual, the cover and the drawings, by their place in the upload.
  const pagesTo = (ats: number[], role: PageRole) =>
    setDrafts((ds) => ds.map((d) => (ats.includes(d.pageIndex) ? { ...d, role, roleByHand: true, include: true } : d)))

  // Pages chosen together — click a page number; Shift-click for a run, Ctrl-click one more — in
  // the drawings list or in a manual section's page list, then moved at once with the bar that
  // appears or a right-click. Kept by each page's place in the upload, so the choice spans both.
  const [sel, setSel] = useState<Set<number>>(new Set())
  // The set introduction's pages in the order they are to be filed (by place in the upload); a
  // page not yet placed follows in its upload order.
  const [introOrder, setIntroOrder] = useState<number[]>([])
  const inIntroOrder = (ds: Draft[]) => {
    const rank = (d: Draft) => { const k = introOrder.indexOf(d.pageIndex); return k < 0 ? introOrder.length + d.pageIndex : k }
    return ds.filter((d) => d.include && d.role === 'cover').sort((a, b) => rank(a) - rank(b))
  }
  const [introOpen, setIntroOpen] = useState(false)
  // The set introduction read straight through, opened at one of its pages.
  const [introPeek, setIntroPeek] = useState<{ at?: number } | null>(null)
  const [introBytes, setIntroBytes] = useState<{ ats: string; bytes: Uint8Array } | null>(null)
  const introSeen = useRef(1)
  /** The first line of words on a page: what tells one introduction page from another. */
  const introHead = (d: Draft) => linesOf(d.page.text).map((l) => l.str.trim()).find((t) => (t.match(/[A-Za-z]/g) ?? []).length >= 4) ?? ''
  const moveIntro = (at: number, by: -1 | 1) => {
    const order = inIntroOrder(drafts).map((d) => d.pageIndex)
    const k = order.indexOf(at), j = k + by
    if (k < 0 || j < 0 || j >= order.length) return
    ;[order[k], order[j]] = [order[j], order[k]]
    setIntroOrder(order)
  }
  const lastSel = useRef<number | null>(null)
  const pickPage = (at: number, e: React.MouseEvent, list: number[]) => {
    setSel((cur) => {
      const n = new Set(e.ctrlKey || e.metaKey || e.shiftKey ? cur : [])
      const from = lastSel.current != null ? list.indexOf(lastSel.current) : -1
      const to = list.indexOf(at)
      if (e.shiftKey && from >= 0 && to >= 0) {
        for (let k = Math.min(from, to); k <= Math.max(from, to); k++) n.add(list[k])
      } else if (cur.has(at) && (e.ctrlKey || e.metaKey)) n.delete(at)
      else if (cur.has(at) && cur.size === 1 && !e.shiftKey) n.delete(at)
      else n.add(at)
      return n
    })
    lastSel.current = at
  }
  /** The pages (by their place in the upload) a right-click on a page acts on: the chosen ones, if it is one of them. */
  const pagesFor = (at: number) => (sel.has(at) ? [...sel].sort((a, b) => a - b) : [at])
  const [rowMenu, setRowMenu] = useState<{ x: number; y: number; ats: number[]; section?: SectionMenu; introGroup?: boolean } | null>(null)
  // Project manual pages split off by hand to start a section of their own (by their place in the upload).
  const [specSplits, setSpecSplits] = useState<Set<number>>(new Set())
  // Sections folded into the one before them by hand, by their first page's place in the upload.
  const [specJoins, setSpecJoins] = useState<Set<number>>(new Set())
  /** Fold the section starting at this page into the one before: undo a split, or join a cut the footers made. */
  const joinAt = (at: number) => {
    if (specSplits.has(at)) setSpecSplits((s) => { const n = new Set(s); n.delete(at); return n })
    setSpecJoins((s) => new Set(s).add(at))
  }
  // A manual section opened to read straight through, at one of its pages.
  const [secPeek, setSecPeek] = useState<{ key: string; at?: number } | null>(null)
  const [secBytes, setSecBytes] = useState<{ ats: string; bytes: Uint8Array } | null>(null)
  const moveChosen = (role: PageRole) => { pagesTo([...sel], role); setSel(new Set()) }
  /** Take pages out of the upload, or put them back (by their place in the upload). */
  const includePages = (ats: number[], include: boolean) =>
    setDrafts((ds) => ds.map((d) => (ats.includes(d.pageIndex) ? { ...d, include } : d)))
  /** A click on one of a row's own controls is not a click to choose the row. */
  const onControl = (e: React.MouseEvent) => !!(e.target as HTMLElement).closest('input, select, textarea, button, a, label, .thumb-cell')

  // The cover read again whenever which pages make it up changes; fields typed by hand stay.
  const coverKey = drafts.filter((d) => d.include && d.role === 'cover').map((d) => d.pageIndex).join(',')
  useEffect(() => {
    const pages = drafts.filter((d) => d.include && d.role === 'cover').map((d) => d.page.text)
    const r = pages.length ? readCover(pages) : null
    setCoverRead(r)
    if (!r) return
    if (r.kind && !byHand.kind) setKind(r.kind)
    if (r.date && !byHand.date) setIssuedOn(r.date)
    if (r.subject && !byHand.subject) setSubject(r.subject)
  }, [coverKey])  // eslint-disable-line react-hooks/exhaustive-deps

  const [dragOver, setDragOver] = useState(false)

  async function onFiles(list: File[]) {
    const files = list.filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
    if (!files.length) { setError('Drop PDF files only.'); return }
    setStep('splitting')
    setError(null)
    try {
      // Several PDFs make one upload round, pages numbered straight through.
      const pages: SplitSheet[] = []
      let bytesTotal = 0
      for (const [i, file] of files.entries()) {
        const label = files.length > 1 ? `${file.name} (${i + 1} of ${files.length}): ` : ''
        const split = await splitDrawingSet(await file.arrayBuffer(), (done, total) => { setProgress(`${label}${done} of ${total}`); setUnits({ done, total }) },
          { onPage: (page, total) => setProgress(`${label}page ${page} of ${total} is a scan — reading it`) })
        for (const p of split) pages.push({ ...p, pageIndex: pages.length })
        bytesTotal += file.size
      }
      setSizeWarning(sizeCheck(bytesTotal, pages))
      setDrafts(sortRoles(reread(pages.map((p) => ({
        pageIndex: p.pageIndex, page: p, include: true, role: 'sheet' as PageRole, number: '', title: '', revision: '', date: '', templateId: null, touched: {},
      })), tplRef.current.templates, tplRef.current.preferred)))
      setStep('review')
    } catch (err) {
      setError(message(err))
      setStep('pick')
    }
  }
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => onFiles([...(e.target.files ?? [])])
  useEffect(() => { if (initialFiles?.length) onFiles(initialFiles) }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const type = (i: number, k: 'number' | 'title' | 'revision' | 'date', v: string) =>
    setDrafts(drafts.map((d, j) => {
      if (j !== i) return d
      const next = { ...d, [k]: v, touched: { ...d.touched, [k]: true } }
      // A sheet number typed that the project already has brings its title with it, until the
      // title is typed over by hand.
      if (k === 'number' && !d.touched.title) {
        const known = existingTitles?.get(v.trim().toUpperCase())
        if (known) next.title = known
      }
      return next
    }))

  // Choose a template for one sheet (or 'none' to type it in, or null for best fit) and re-read it.
  const pin = (i: number, value: string | null) => {
    // Choosing a template for a sheet confirms it fits: a template that hasn't learned its fixed
    // wording or sheet size learns them from this sheet, which sharpens best fit for the rest.
    const t = templates.find((x) => x.id === value)
    let tpls = templates
    if (t && (!t.anchors?.length || !t.page_size)) {
      const page = drafts[i].page.text
      const learned: TitleblockTemplate = { ...t, anchors: t.anchors?.length ? t.anchors : anchorsFrom(page, t), page_size: t.page_size ?? { w: Math.round(page.width), h: Math.round(page.height) } }
      tpls = templates.map((x) => (x.id === t.id ? learned : x))
      setTemplates(tpls)
      saveTemplate(learned).catch(() => { /* learning is a bonus */ })
    }
    setDrafts((ds) => reread(ds.map((d, j) => (j === i ? { ...d, pinned: value } : d)), tpls, preferred))
  }
  // The same choice for every other sheet with the same discipline letters (one consultant, one title block).
  const letters = (d: Draft) => disciplineFor(d.number, order).discipline?.code ?? d.number.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? ''
  const pinLike = (i: number) => setDrafts((ds) => {
    const src = ds[i], code = letters(src)
    return reread(ds.map((d, j) => (j !== i && code && letters(d) === code && !d.touched.number ? { ...d, pinned: src.pinned } : d)), templates, preferred)
  })
  const sameLetters = (i: number) => { const code = letters(drafts[i]); return code ? drafts.filter((d, j) => j !== i && letters(d) === code && d.pinned !== drafts[i].pinned).length : 0 }

  /**
   * Make one sheet lighter. Which way that happens is decided per sheet by whether the page has a
   * text layer — see shrinkSheet. The full-size original is kept so it can be put back.
   */
  /** The workers that do the reducing. Made on first use and kept for the rest of the upload. */
  const poolRef = useRef<ShrinkPool | null>(null)
  const pool = () => {
    if (!poolRef.current || poolRef.current.closed) poolRef.current = new ShrinkPool()
    return poolRef.current
  }
  useEffect(() => () => poolRef.current?.close(), [])

  async function reduce(i: number, onStage?: (stage: string) => void) {
    const d = drafts[i]
    if (d.full) return
    setReducing((s) => new Set(s).add(i))
    try {
      const r = await pool().shrink(d.page.bytes, d.page.text.words.length > 0, {
        dpi,
        onStage: (stage) => {
          onStage?.(stage)
          setReduceNote((n) => ({ ...n, [i]: stage }))
        },
      })
      setDrafts((ds) => ds.map((x, j) => (j === i && r.changed
        ? { ...x, page: { ...x.page, bytes: r.bytes }, full: { bytes: d.page.bytes, before: r.before, after: r.after, note: r.note } }
        : j === i ? { ...x, full: undefined } : x)))
      setReduceNote((n) => ({ ...n, [i]: r.changed ? '' : r.note }))
    } finally {
      setReducing((s) => { const next = new Set(s); next.delete(i); return next })
    }
  }

  const restore = (i: number) => setDrafts((ds) => ds.map((x, j) => (j === i && x.full
    ? { ...x, page: { ...x.page, bytes: x.full.bytes }, full: undefined } : x)))


  /**
   * An addendum usually carries project manual pages behind its drawings, and they arrive here
   * looking like sheets. They give themselves away by size: letter pages among D-size sheets. The
   * median is the measure, so a set that is genuinely all letter-size flags nothing.
   */
  const pageSizes = drafts.map((d) => d.page.text.width * d.page.text.height).sort((a, b) => a - b)
  const median = pageSizes.length ? pageSizes[Math.floor(pageSizes.length / 2)] : 0
  // Letter pages among large sheets, whichever part they are in now (cover pages aside).
  const smallLetter = median > 1_000_000
    ? drafts.map((d, i) => [i, d] as const).filter(([, d]) => d.role !== 'cover' && d.page.text.width * d.page.text.height < median * 0.5)
    : []
  const smallPages = smallLetter
  const smallAsManual = smallLetter.filter(([, d]) => d.role === 'spec').length
  const roleAllSmall = (role: PageRole) => setDrafts((ds) => ds.map((d, j) => (smallLetter.some(([i]) => i === j) ? { ...d, role, roleByHand: true } : d)))
  const smallStillIn = smallPages.filter(([, d]) => d.include)
  const inches1 = (pts: number) => Number((pts / 72).toFixed(1))
  const sizeOf = (d: Draft) => {
    const w = inches1(Math.min(d.page.text.width, d.page.text.height))
    const h = inches1(Math.max(d.page.text.width, d.page.text.height))
    return `${w} × ${h} in`
  }
  const dropSmall = () => setDrafts((ds) => ds.map((d, j) => (smallPages.some(([i]) => i === j) ? { ...d, include: false } : d)))

  const heavy = (d: Draft) => d.page.bytes.length > 5 * MB

  /**
   * Reduce every heavy sheet. They go to the pool together and come back as they finish, several
   * at a time, so this is as fast as the machine allows rather than one sheet after another.
   * Stopping leaves the sheets already in hand to finish; everything done stays done.
   */
  async function reduceAll() {
    const queue = drafts.map((d, i) => [i, d] as const).filter(([, d]) => heavy(d) && !d.full)
    if (!queue.length) return
    const p = pool()
    let done = 0
    setRun({ done: 0, total: queue.length, sheet: `${queue.length} sheets`, stage: p.onMainThread ? 'starting' : `${p.width} at a time` })
    try {
      await Promise.all(queue.map(([i, d]) => reduce(i, (stage) =>
        setRun((r) => (r ? { ...r, sheet: d.number || `page ${d.pageIndex + 1}`, stage } : r)),
      ).then(() => {
        done++
        setRun((r) => (r ? { ...r, done } : r))
      })))
    } finally {
      setRun(null)
    }
  }

  const stopAll = () => poolRef.current?.stop()

  // Cover pages are included in the upload but are not drawings, so every count about sheets
  // leaves them out: no sheet number to miss, no duplicate to clash with, no template to read.
  // The date column only appears when a template is looking for one, since most sheets take
  // the set's date and a column of empty boxes is a column in the way.
  const datesRead = templates.some((t) => t.regions.date) || drafts.some((d) => d.date)
  const covers = inIntroOrder(drafts)
  const chosen = drafts.filter((d) => d.include && d.role === 'sheet')
  // The manual pages, remade only when which pages they are changes: typing a sheet number must
  // not re-cut the manual.
  // Manual pages to file: those already in a section of this document (re-sorting) stay where they are.
  const isNewSpec = (d: Draft) => d.include && d.role === 'spec' && d.origin?.t !== 'spec'
  const specKey = drafts.filter(isNewSpec).map((d) => `${d.pageIndex}:${d.page.bytes.length}`).join(',')
  const specPages = useMemo<SpecPageIn[]>(
    () => drafts.filter(isNewSpec).map((d) => ({ at: d.pageIndex, text: d.page.text, bytes: d.page.bytes })),
    [specKey],  // eslint-disable-line react-hooks/exhaustive-deps
  )
  const [manualPlan, setManualPlan] = useState<ManualPlan | null>(null)
  // Section numbers and titles typed or read from a box, here or in the manual card.
  const [manualEdits, setManualEdits] = useState<Record<string, ManualEdit>>({})
  const editSection = (key: string, patch: ManualEdit) => setManualEdits((es) => ({ ...es, [key]: { ...es[key], ...patch } }))
  // A box drawn round the section number that every manual page in this upload is cut by.
  const [cutBox, setCutBox] = useState<Region | null>(null)
  // Drawing a box on one manual page to read its section's number or title from.
  const [boxing, setBoxing] = useState<{ at: number; what: 'number' | 'title'; box: Region | null } | null>(null)
  const [lastNumberBox, setLastNumberBox] = useState<Region | null>(null)
  const sections = specPages.length ? manualPlan?.sections ?? [] : []
  const introAts = introPeek ? covers.map((d) => d.pageIndex).join(',') : ''
  useEffect(() => {
    if (!introAts) return
    let stop = false
    const want = introAts.split(',').map((a) => drafts.find((d) => d.pageIndex === Number(a))?.page.bytes).filter((b): b is Uint8Array => !!b)
    joinPages(want).then((bytes) => { if (!stop) setIntroBytes({ ats: introAts, bytes }) }, () => {})
    return () => { stop = true }
  }, [introAts])  // eslint-disable-line react-hooks/exhaustive-deps
  // The open section's pages as one PDF, made again when its pages change (a join, a split).
  const secAts = secPeek ? sections.find((x) => x.key === secPeek.key)?.ats.join(',') ?? '' : ''
  useEffect(() => {
    if (!secAts) return
    let stop = false
    const want = secAts.split(',').map((a) => drafts.find((d) => d.pageIndex === Number(a))?.page.bytes).filter((b): b is Uint8Array => !!b)
    joinPages(want).then((bytes) => { if (!stop) setSecBytes({ ats: secAts, bytes }) }, () => {})
    return () => { stop = true }
  }, [secAts])  // eslint-disable-line react-hooks/exhaustive-deps
  const manualProblem = specPages.length ? (manualPlan ? manualPlan.problem : 'Reading the manual pages…') : null

  const setTotal = drafts.reduce((n, d) => n + (d.include ? d.page.bytes.length : 0), 0)
  const numbers = chosen.map((d) => d.number.trim().toUpperCase())
  const duplicates = new Set(numbers.filter((n, i) => n && numbers.indexOf(n) !== i))
  const missing = chosen.filter((d) => !d.number.trim()).length
  const sheetTrouble = chosen.length > 0 && (missing > 0 || duplicates.size > 0)
  const nothing = chosen.length === 0 && sections.length === 0 && covers.length === 0
  const readByTemplate = chosen.filter((d) => d.templateId).length
  const tplName = (id: string | null) => templates.find((t) => t.id === id)?.name
  const firstUnread = drafts.findIndex((d) => d.include && !d.templateId)

  /**
   * Save a re-sorted change document: what moved in is filed first (so the document is never
   * empty part-way), then what moved out is taken away. Pages left where they were are untouched.
   */
  async function saveResort(r: Reopened) {
    const id = r.issuance.id
    const newSheets = chosen.filter((d) => d.origin?.t !== 'sheet')
    const keptSheets = chosen.filter((d) => d.origin?.t === 'sheet')
    const drop = drafts.filter((d) => d.origin?.t === 'sheet' && !(d.include && d.role === 'sheet')).map((d) => (d.origin as { revId: string }).revId)
    const specsOut = keptSpecs.filter((k) => k.keep < k.rev.pages)
    const coverNow = covers
    const coverWas = drafts.filter((d) => d.origin?.t === 'cover')
    const coverChanged = coverNow.length !== coverWas.length || coverNow.some((d, k) => d !== coverWas[k])
    const left = keptSheets.length + newSheets.length + sections.length + keptSpecs.reduce((n, k) => n + (k.keep ? 1 : 0), 0)
    if (!left) { setError('That would leave this document with no drawings and no manual pages, and CAzen removes a set with nothing in it. Keep at least one page as a drawing or a manual page.'); return }
    setStep('saving'); setCollapsed(true); setError(null); setUnits(null); setProgress('starting')
    try {
      const head = { kind, number, issuedOn, title: subject }
      if (kind !== r.issuance.kind || number !== (r.issuance.number ?? '') || issuedOn !== r.issuance.issued_on.slice(0, 10) || subject !== (r.issuance.title ?? '')) {
        setProgress('renaming'); await renameIssuance(id, { kind, number, title: subject, issuedOn })
      }
      if (newSheets.length) {
        const out: SheetToSave[] = sortSheets(newSheets, (d) => d.number, order).map((d) => ({
          number: d.number, title: d.title, revisionLabel: d.revision || setRev || number, sheetDate: d.date || issuedOn,
          bytes: d.page.bytes, body: pageBody(d.page.text),
        }))
        await saveIssuance(project, head, out, (done, total) => setProgress(`drawings ${done} of ${total}`), id)
      }
      if (sections.length) {
        const built = []
        for (const [k, sec] of sections.entries()) { setProgress(`putting together ${sec.number} (${k + 1} of ${sections.length})`); built.push(await sec.build()) }
        await saveManual(project, { kind, number, issuedOn }, built, (done, total, sec) => setProgress(`manual ${done} of ${total}${sec ? ` · ${sec}` : ''}`), id)
      }
      await takeAwayMoved(project, {
        issuanceId: id, setFolder: setFolderName(head), dropSheets: drop,
        specs: specsOut.map((k) => ({ rev: k.rev, keep: drafts.filter((d) => d.origin?.t === 'spec' && d.origin.revId === k.rev.revId && d.include && d.role === 'spec').map((d) => d.page) })),
        cover: coverChanged ? coverNow.map((d) => d.page) : undefined,
        onProgress: (what) => setProgress(`tidying ${what}`),
      })
      onDone(`${number || ISSUANCE_LABELS[kind]}: pages re-sorted`)
    } catch (e) {
      setError(`Part of the re-sort may have gone in before this stopped: ${message(e)}`)
      setStep('review')
    }
  }

  async function save() {
    if (reopened) return saveResort(reopened)
    setStep('saving')
    setCollapsed(true)
    setProgress('starting')
    setError(null)
    const total = chosen.length + sections.length + (covers.length ? 1 : 0)
    setUnits({ done: 0, total })
    try {
      const out: SheetToSave[] = sortSheets(chosen, (d) => d.number, order).map((d) => ({
        // What the Rev. column says for this sheet: whatever the title block itself carried, then
        // a mark typed for the whole set, and failing both the set's own name — which is what an
        // architect would write there anyway ("Addendum 2"), and beats a row number nobody chose.
        number: d.number, title: d.title, revisionLabel: d.revision || setRev || number,
        sheetDate: d.date || issuedOn,
        bytes: d.page.bytes, body: pageBody(d.page.text),
      }))
      const saved = await saveIssuance(project, { kind, number, issuedOn, title: subject }, out, (done, all) => { setProgress(`${done} of ${all}`); setUnits({ done, total }) })

      // The manual pages go in under the same issuance, so the change document carries its
      // sections as well as its sheets.
      if (saved?.id && sections.length) {
        const built = []
        for (const [k, sec] of sections.entries()) {
          setProgress(`putting together ${sec.number} (${k + 1} of ${sections.length})`)
          built.push(await sec.build())
        }
        await saveManual(project, { kind, number, issuedOn }, built,
          (done, all, sec) => { setProgress(`manual ${done} of ${all}${sec ? ` · ${sec}` : ''}`); setUnits({ done: out.length + done, total }) }, saved.id)
      }

      // Uploading sheets as an ASI or a PR is issuing that ASI or PR, so the entry in the change
      // register is made here rather than typed again afterwards — with the cover that came up
      // with the drawings attached to it when there was one, and without when there wasn't. A
      // sketch issued with no narrative is still an ASI.
      if (saved?.id) {
        let coverPath: string | null = null
        if (covers.length) {
          try {
            setProgress('Filing the set introduction')
            const bytes = await joinPages(covers.map((d) => d.page.bytes))
            const setName = number || ISSUANCE_LABELS[kind]
            const name = `${issuedOn} ${setName} cover.pdf`
            coverPath = await putFile(project, bytes, `${project.id}/covers/${saved.id}.pdf`, {
              dirs: [SECTIONS.drawings, saved.setFolder], name,
            })
            await setIssuanceCover(saved.id, coverPath)
          } catch (e) {
            // Drawings are already in; losing the cover is worth saying, not worth undoing them.
            setError(`The sheets went in, but the set introduction didn’t: ${message(e)}`)
          }
        }
        if (DOCUMENT_FOR[kind]) {
          // The document is numbered by the set's name, because they are one thing: a package
          // called "ASI 003" is ASI-003.
          await documentForIssuance({
            projectId: project.id, issuanceId: saved.id, kind,
            name: number || ISSUANCE_LABELS[kind], issuedOn, filePath: coverPath, title: subject,
          }).catch((e: unknown) => {
            setError(`The sheets went in, but the change register entry didn’t: ${message(e)}`)
          })
        }
      }
      // Templates drawn before CAzen recorded sheet sizes learn theirs from the sheets they read.
      for (const t of templates.filter((t) => !t.page_size)) {
        const d = chosen.find((x) => x.templateId === t.id && x.pinned === t.id) ?? chosen.find((x) => x.templateId === t.id && !x.unsure)
        if (d) await saveTemplate({ ...t, page_size: { w: Math.round(d.page.text.width), h: Math.round(d.page.text.height) } }).catch(() => {})
      }
      onDone(`${number || ISSUANCE_LABELS[kind]} saved — ${[chosen.length ? `${chosen.length} ${chosen.length === 1 ? 'sheet' : 'sheets'}` : '', sections.length ? `${sections.length} manual ${sections.length === 1 ? 'section' : 'sections'}` : ''].filter(Boolean).join(', ') || 'the set introduction'}`)
    } catch (err) {
      setError(message(err))
      setStep('review')
    }
  }

  const pagesForEditor = drafts.map((d) => ({ bytes: d.page.bytes, text: d.page.text, label: `Page ${d.pageIndex + 1}${d.number ? ` · ${d.number}` : ''}` }))

  if (editing) {
    return (
      <TitleblockEditor
        firmId={firmId}
        pages={pagesForEditor}
        initialPage={editing.page}
        template={editing.template}
        onCancel={() => setEditing(null)}
        onSaved={(t) => {
          setTemplates((ts) => [...ts.filter((x) => x.id !== t.id), t].sort((a, b) => a.name.localeCompare(b.name)))
          setPreferred(t.id)
          setEditing(null)
        }}
      />
    )
  }

  // In the corner: what it is doing, how far it has got, and the way back to it.
  if (collapsed) {
    const name = number || ISSUANCE_LABELS[kind]
    const pct = units && units.total ? Math.round((units.done / units.total) * 100) : null
    const stopped = step === 'review' && !!error
    return (
      <div className={`upload-chip${stopped ? ' bad' : ''}`} role="status" aria-live="polite">
        <div className="upload-chip-head">
          <strong>{step === 'saving' ? `Saving ${name}` : step === 'splitting' ? 'Reading the PDF' : stopped ? `${name} stopped` : `${name} ready to review`}</strong>
          <button className="link small" onClick={() => setCollapsed(false)}>Show</button>
        </div>
        {(step === 'saving' || step === 'splitting') && (
          <div className={`upload-bar${pct == null ? ' busy' : ''}`}><span style={pct == null ? undefined : { width: `${pct}%` }} /></div>
        )}
        <div className="muted small upload-chip-say">{stopped ? error : step === 'review' ? 'The pages are read.' : progress || '…'}</div>
      </div>
    )
  }

  return (
    <>
    {/* The upload opens wide over whatever page is showing: there is a lot to see at once. */}
    <div className="upload-backdrop" aria-hidden="true" />
    <div className="card upload-panel wide" role="dialog" aria-label="Upload">
      {step !== 'saving' && <button className="link upload-close" onClick={onCancel} aria-label="Cancel the upload">×</button>}
      {(step === 'splitting' || step === 'saving') && (
        <button className="link small upload-min" onClick={() => setCollapsed(true)} title="Keep it going in the corner and work on something else">Work on something else</button>
      )}
      <h2>{reopen ? `Pages of ${reopened ? issuanceText(reopened.issuance.kind, reopened.issuance.number) : 'this set'}` : 'Upload a set, revised sheets or a change document'}</h2>
      {reopen && <p className="muted small">Each page is shown where it is filed now. Move one by its Part, by right-clicking it, or by dragging it between the project manual and the drawings; Shift- or Ctrl-click page numbers to move several. Saving files what moved and leaves the rest as it is.</p>}
      {!reopen && <p className="muted small">Each upload is one set or revision round. Its sheets replace the current ones with the same number, and the earlier versions stay in each sheet’s history.
        A change document can come as one PDF — cover, project manual pages and drawings — and each page is sorted into its part.</p>}
      <div className="form four">
        <label>Issued as
          <select value={kind} onChange={(e) => { setByHand((b) => ({ ...b, kind: true })); setKind(e.target.value as IssuanceKind) }}>
            {(Object.entries(ISSUANCE_LABELS) as [IssuanceKind, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>Set name
          <input value={number} placeholder="Addendum 2, ASI-003, Rev 1…"
            onChange={(e) => { setNamedByHand(true); setNumber(e.target.value) }} />
        </label>
        <label>Issue date<input type="date" value={issuedOn} onChange={(e) => { setByHand((b) => ({ ...b, date: true })); setIssuedOn(e.target.value) }} /></label>
        <label>Subject<input value={subject} placeholder="Revised storefront head detail"
          onChange={(e) => { setByHand((b) => ({ ...b, subject: true })); setSubject(e.target.value) }} /></label>
        {/* What this upload will do beyond putting sheets in, said before it does it. */}
        {(DOCUMENT_FOR[kind] || covers.length > 0) && (
          <p className="muted small upload-cover-note">
            {DOCUMENT_FOR[kind] && (
              <>This goes in Change documents as <strong>{number || ISSUANCE_LABELS[kind]}</strong>, with these sheets attached to it.{' '}</>
            )}
            {coverRead && (coverRead.kind || coverRead.number || coverRead.date || coverRead.subject) && (
              <>Read from the cover: {[
                coverRead.kind && `${ISSUANCE_LABELS[coverRead.kind]}${coverRead.number ? ` ${coverRead.number}` : ''}`,
                coverRead.date && usDate(coverRead.date),
                coverRead.subject && `“${coverRead.subject}”`,
              ].filter(Boolean).join(' · ')}.{' '}</>
            )}
            {covers.length > 0
              ? <>{covers.length} {covers.length === 1 ? 'page is' : 'pages are'} marked as the set introduction, so {covers.length === 1 ? 'it is' : 'they are'} kept with the set rather than filed as {covers.length === 1 ? 'a drawing' : 'drawings'}{DOCUMENT_FOR[kind] ? ' and attached to that entry' : ''}.</>
              : DOCUMENT_FOR[kind] ? <>No page is marked as the set introduction, which is fine — one can be added to it later.</> : null}
          </p>
        )}
        <label>Revision mark<input value={setRev} onChange={(e) => setSetRev(e.target.value)} placeholder={number || '1, A, Δ2…'} />
          <span className="hint">For every sheet in this upload, unless its title block shows one.</span>
        </label>
      </div>

      {step === 'pick' && (
        <>
          <label
            className={`dropzone ${dragOver ? 'over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); onFiles([...e.dataTransfer.files]) }}
          >
            <input type="file" accept="application/pdf,.pdf" multiple onChange={onFile} />
            <span className="dz-icon" aria-hidden="true">⇪</span>
            <strong>Drop PDFs here</strong>
            <span className="muted small">or click to choose: a full set, a few sheets or single sheets. Several PDFs become one upload.</span>
          </label>
          <button className="link" onClick={onCancel}>Cancel</button>
        </>
      )}
      {step === 'splitting' && <p className="muted">Reading pages… {progress}</p>}

      {(step === 'review' || step === 'saving') && (
        <>
          {rowMenu && (
            <div className="pick-menu-shade" onClick={() => setRowMenu(null)} onContextMenu={(e) => { e.preventDefault(); setRowMenu(null) }}>
              <div className="pick-menu" role="menu" style={{ left: Math.min(rowMenu.x, window.innerWidth - 220), top: Math.min(rowMenu.y, window.innerHeight - 300) }} onClick={(e) => e.stopPropagation()}>
                {(() => {
                  const ds = rowMenu.ats.map((a) => drafts.find((d) => d.pageIndex === a)).filter((d): d is Draft => !!d)
                  const done = () => { setRowMenu(null); setSel(new Set()) }
                  const some = (r: PageRole) => ds.some((d) => d.role !== r || !d.include)
                  const out = ds.some((d) => !d.include), inn = ds.some((d) => d.include)
                  const sec = rowMenu.section
                  if (sec) return (
                    <>
                      <div className="muted small pick-menu-title">{sec.number || 'Section'} · {sec.ats.length} {sec.ats.length === 1 ? 'page' : 'pages'}</div>
                      <button role="menuitem" onClick={() => { setSecPeek({ key: sec.key }); done() }}>View</button>
                      {sec.joinUp != null && <button role="menuitem" title="This section is really part of the one above" onClick={() => { joinAt(sec.joinUp!); done() }}>Join up</button>}
                      {sec.joinDown != null && <button role="menuitem" title="The section below is really part of this one" onClick={() => { joinAt(sec.joinDown!); done() }}>Join down</button>}
                      <button role="menuitem" onClick={() => { pagesTo(sec.ats, 'sheet'); done() }}>Move to drawings</button>
                      <button role="menuitem" onClick={() => { pagesTo(sec.ats, 'cover'); done() }}>Make part of the set introduction</button>
                      <button role="menuitem" onClick={() => { sec.setInclude(!sec.include); done() }}>{sec.include ? 'Leave out' : 'Put back'}</button>
                    </>
                  )
                  if (rowMenu.introGroup) return (
                    <>
                      <div className="muted small pick-menu-title">Set Introduction · {covers.length} {covers.length === 1 ? 'page' : 'pages'}</div>
                      <button role="menuitem" onClick={() => { setIntroPeek({}); done() }}>View</button>
                      <button role="menuitem" onClick={() => { setIntroOpen((o) => !o); done() }}>{introOpen ? 'Fold the pages away' : 'Show the pages'}</button>
                    </>
                  )
                  const introAt = ds.length === 1 && ds[0].include && ds[0].role === 'cover' ? covers.indexOf(ds[0]) : -1
                  return (
                    <>
                      <div className="muted small pick-menu-title">{ds.length === 1 ? `Page ${ds[0].pageIndex + 1}` : `${ds.length} pages`}</div>
                      {introAt >= 0 && <>
                        <button role="menuitem" onClick={() => { setIntroPeek({ at: ds[0].pageIndex }); done() }}>View</button>
                        {introAt > 0 && <button role="menuitem" onClick={() => { moveIntro(ds[0].pageIndex, -1); done() }}>Move earlier</button>}
                        {introAt < covers.length - 1 && <button role="menuitem" onClick={() => { moveIntro(ds[0].pageIndex, 1); done() }}>Move later</button>}
                      </>}
                      {some('spec') && <button role="menuitem" onClick={() => { pagesTo(rowMenu.ats, 'spec'); done() }}>Move to the project manual</button>}
                      {some('sheet') && <button role="menuitem" onClick={() => { pagesTo(rowMenu.ats, 'sheet'); done() }}>Move to drawings</button>}
                      {some('cover') && <button role="menuitem" onClick={() => { pagesTo(rowMenu.ats, 'cover'); done() }}>Make part of the set introduction</button>}
                      {ds.length === 1 && (
                        <button role="menuitem" title={`Files it as ${priorCover.number} — ${priorCover.title}, as the project's earlier sets have it`} onClick={() => {
                          const at = ds[0].pageIndex
                          setDrafts((all) => all.map((d) => (d.pageIndex === at ? {
                            ...d, role: 'sheet' as PageRole, roleByHand: true, include: true, number: priorCover.number, title: priorCover.title,
                            touched: { ...d.touched, number: true, title: true },
                          } : d)))
                          done()
                        }}>Drawing cover sheet <span className="muted small">— {priorCover.number}</span></button>
                      )}
                      {ds.length > 0 && ds.every((d) => d.role === 'spec' && d.include) && (
                        <button role="menuitem" onClick={() => {
                          // One page: a new section starts there. Several: they become a section of their own.
                          const order = specPages.map((p) => p.at)
                          const ats = [...rowMenu.ats].sort((a, b) => order.indexOf(a) - order.indexOf(b))
                          const next = new Set(specSplits)
                          next.add(ats[0])
                          if (ats.length > 1) { const after = order[order.indexOf(ats[ats.length - 1]) + 1]; if (after != null) next.add(after) }
                          setSpecSplits(next)
                          setSpecJoins((j) => { const n = new Set(j); for (const a of next) n.delete(a); return n })
                          done()
                        }}>Split to a new section</button>
                      )}
                      {inn && <button role="menuitem" onClick={() => { includePages(rowMenu.ats, false); done() }}>Remove from the upload</button>}
                      {out && <button role="menuitem" onClick={() => { includePages(rowMenu.ats, true); done() }}>Put back in the upload</button>}
                    </>
                  )
                })()}
              </div>
            </div>
          )}
          {reopened && keptSpecs.length > 0 && (
            <div className="card change-manual">
              <h3>In the project manual from this document</h3>
              <p className="small">
                {keptSpecs.map((k) => (
                  <span key={k.rev.revId} className="kept-spec">
                    <span className="mono">{k.rev.number}</span> {k.rev.title ?? ''} · {k.keep} of {k.rev.pages} pages
                    {k.keep < k.rev.pages && <span className="pay-read-warn"> — {k.keep ? `put together again from the ${k.keep} left` : 'this revision is removed'}</span>}
                  </span>
                ))}
              </p>
              <p className="muted small">Its pages are listed with the drawings below, marked Manual, so each can be moved on its own.</p>
            </div>
          )}
          {/* The project manual's pages first, with the manual's own tools; the drawings below. */}
          {sel.size > 0 && (
            <div className="pick-bar" role="toolbar" aria-label="Move the chosen pages">
              <strong>{sel.size} {sel.size === 1 ? 'page' : 'pages'} chosen</strong>
              <span className="muted small">make {sel.size === 1 ? 'it' : 'them'}:</span>
              <button onClick={() => moveChosen('sheet')}>Drawings</button>
              <button onClick={() => moveChosen('spec')}>Project manual</button>
              <button onClick={() => moveChosen('cover')}>Set Introduction</button>
              <button onClick={() => { includePages([...sel], false); setSel(new Set()) }}>Remove from the upload</button>
              <button className="link" onClick={() => setSel(new Set())}>Clear</button>
            </div>
          )}
          {(covers.length > 0 || !!DOCUMENT_FOR[kind]) && <div className="card change-intro">
            <h3>Set Introduction <span className="muted small">{covers.length} {covers.length === 1 ? 'page' : 'pages'}</span></h3>
            <p className="muted small">The change document’s own pages and any cover sheets or narratives from the disciplines, filed together as the document in this order. These pages often have no header or footer, so their order is set here: right-click a page to move it earlier or later.</p>
            {covers.length ? (
              <table className="intro-table">
                <tbody>
                  <tr className="intro-group" title="Right-click for view"
                    onContextMenu={(e) => { e.preventDefault(); setRowMenu({ x: e.clientX, y: e.clientY, ats: covers.map((d) => d.pageIndex), introGroup: true }) }}>
                    <td className="intro-name"><strong>Set Introduction</strong></td>
                    <td className="small nowrap">
                      <button className="link small cm-fold" aria-expanded={introOpen} onClick={() => setIntroOpen((o) => !o)}>
                        {introOpen ? '▾' : '▸'} {covers.length} {covers.length === 1 ? 'page' : 'pages'} · upload {covers.map((d) => d.pageIndex + 1).join(', ')}
                      </button>
                    </td>
                    <td className="intro-head muted small">{covers.map(introHead).filter(Boolean).slice(0, 3).join(' · ')}</td>

                  </tr>
                  {introOpen && covers.map((d, k) => {
                    const head = introHead(d)
                    return (
                      <tr key={d.pageIndex} className={`cm-page page-row${sel.has(d.pageIndex) ? ' picked' : ''}`}
                        onClick={(e) => { if (!onControl(e)) pickPage(d.pageIndex, e, covers.map((x) => x.pageIndex)) }}
                        onContextMenu={(e) => { e.preventDefault(); setRowMenu({ x: e.clientX, y: e.clientY, ats: pagesFor(d.pageIndex) }) }}>
                        <td className="intro-n">{k + 1}</td>
                        <td className="thumb-cell"><PageThumb bytes={d.page.bytes} label={pageLabel(d)} onOpen={() => setIntroPeek({ at: d.pageIndex })} /></td>
                        <td className="intro-head"><span className="muted small">Upload page {d.pageIndex + 1} · </span>{head ? (head.length > 80 ? head.slice(0, 78) + '…' : head) : <span className="muted">no text</span>}</td>

                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              <div className="drop-empty muted small">Set introduction pages go here — the cover, a narrative, a discipline’s cover sheet. Choose pages below and make them Set Introduction.</div>
            )}
          </div>}
          {(specPages.length > 0 || smallLetter.length > 0 || !!DOCUMENT_FOR[kind]) && <div>
            {specPages.length > 0 ? (
              <ChangeManual project={project} pages={specPages} revisionLabel={setRev || number} onPlan={setManualPlan}
                edits={manualEdits} onEdits={setManualEdits} cutBox={cutBox}
                onPeek={(at) => setPeek(drafts.findIndex((d) => d.pageIndex === at))}
                onDrawings={(ats) => pagesTo(ats, 'sheet')}
                picked={sel} onPick={pickPage} isControl={onControl} onMenu={(at, e) => setRowMenu({ x: e.clientX, y: e.clientY, ats: pagesFor(at) })}
                splits={specSplits} joins={specJoins} onJoin={joinAt} onPeekSection={(key, at) => setSecPeek({ key, at })}
                onSectionMenu={(e, section) => setRowMenu({ x: e.clientX, y: e.clientY, ats: section.ats, section })} />
            ) : (
              <div className="drop-empty muted small">Project manual pages go here. Choose pages in the drawings below (click their page numbers) and make them Project manual.</div>
            )}
          </div>}
          {sizeWarning && (
            <div className="notice warn">
              {sizeWarning}
              <div className="notice-actions">
                <button onClick={reduceAll} disabled={reducing.size > 0 || !drafts.some((d) => heavy(d) && !d.full)}>
                  {`Reduce all sheets over 5 MB (${drafts.filter((d) => heavy(d) && !d.full).length})`}
                </button>
                <label className="inline small">
                  to{' '}
                  <select value={dpi} onChange={(e) => setDpi(Number(e.target.value))} aria-label="Resolution to reduce to">
                    <option value={100}>100 dpi · on screen</option>
                    <option value={150}>150 dpi · reading in the field</option>
                    <option value={200}>200 dpi · printing</option>
                    <option value={300}>300 dpi · barely a reduction on a large sheet</option>
                  </select>
                </label>
                <span className="muted small">Set total {(setTotal / MB).toFixed(0)} MB</span>
              </div>
              {run && (
                <div className="run" role="status" aria-live="polite">
                  <div className="run-bar"><span style={{ width: `${(run.done / Math.max(1, run.total)) * 100}%` }} /></div>
                  <div className="run-line">
                    <span className="small">Sheet {run.done + 1} of {run.total} · {run.sheet} · {run.stage}</span>
                    <button className="link small" onClick={stopAll}>stop</button>
                  </div>
                </div>
              )}
            </div>
          )}
          {smallLetter.length > 0 && (
            <div className="notice">
              {smallLetter.length} of {drafts.length} pages are {sizeOf(smallLetter[0][1])}, much smaller than the{' '}
              {sizeOf(drafts.find((d) => d.page.text.width * d.page.text.height >= median)!)} sheets —{' '}
              {smallAsManual === smallLetter.length ? 'project manual pages, so they are with the project manual above.'
                : smallAsManual ? `${smallAsManual} are with the project manual above and ${smallLetter.length - smallAsManual} are drawings.`
                : 'they are being taken as drawings.'}
              <div className="notice-actions">
                {smallAsManual < smallLetter.length && <button onClick={() => roleAllSmall('spec')}>Make them all manual pages</button>}
                {smallAsManual > 0 && <button onClick={() => roleAllSmall('sheet')}>Make them all drawings</button>}
                <button onClick={dropSmall} disabled={!smallStillIn.length}>{smallStillIn.length ? `Leave them out (${smallStillIn.length})` : 'Left out'}</button>
                <span className="muted small">Pages: {smallLetter.map(([i]) => i + 1).join(', ')}</span>
              </div>
            </div>
          )}

          <div className="tb-bar">
            <div>
              <strong>Title blocks</strong>{' '}
              {templates.length === 0
                ? <span className="muted small">No templates yet. Draw one so CAzen reads the sheet number and title from every sheet.</span>
                : <span className="muted small">{readByTemplate} of {chosen.length} sheets read from a template{missing ? `, ${missing} need a number` : ''}.</span>}
            </div>
            <div className="tb-bar-actions">
              {templates.length > 0 && (
                <select value={preferred} onChange={(e) => setPreferred(e.target.value)} aria-label="Preferred template">
                  <option value="">Best fit for each sheet</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>Prefer “{t.name}”</option>)}
                </select>
              )}
              {preferred && <button onClick={() => setEditing({ template: templates.find((t) => t.id === preferred), page: Math.max(0, drafts.findIndex((d) => d.templateId === preferred)) })}>Edit template</button>}
              <button className={templates.length ? '' : 'primary'} onClick={() => setEditing({ page: Math.max(0, firstUnread) })}>New template</button>
            </div>
          </div>

          <div>
          <p className="muted small drop-hint">Drawings. Click a row to choose it — Shift-click for a run, Ctrl-click for one more — then right-click, or use the bar above, to move or remove them.</p>
          <table>
            <thead><tr>
              <th>Page</th><th>View</th><th title="A drawing; the set introduction — the cover or narrative of the change document, filed as the document; or a page of the project manual, filed into its section">Part</th><th>Sheet no.</th><th>Title</th><th>Rev. mark</th>{datesRead && <th>Revision date</th>}<th>Size</th><th>Read by</th><th>Result</th></tr></thead>
            <tbody>
              {drafts.map((d, i) => {
                const n = d.number.trim().toUpperCase()
                const listed = drafts.filter((x) => !(x.role === 'spec' && x.include && x.origin?.t !== 'spec') && !(x.role === 'cover' && x.include)).map((x) => x.pageIndex)
                // Manual pages are with the project manual above, not here among the drawings.
                // (Re-sorting a saved document, its pages already in the manual are listed here too, so
                // each can be moved on its own.)
                if (d.role === 'spec' && d.include && d.origin?.t !== 'spec') return null
                // The set introduction's pages are in their own zone above.
                if (d.role === 'cover' && d.include) return null
                return (
                  <tr key={d.pageIndex} className={`page-row${d.include ? '' : ' skipped'}${sel.has(d.pageIndex) ? ' picked' : ''}`}
                    // A click on the row, outside its boxes and buttons, chooses it: Shift for a run,
                    // Ctrl for one more. A right-click acts on the chosen pages, or on this one.
                    onClick={(e) => { if (!onControl(e)) pickPage(d.pageIndex, e, listed) }}
                    onContextMenu={(e) => {
                      if ((e.target as HTMLElement).closest('input, select, textarea')) return
                      e.preventDefault(); setRowMenu({ x: e.clientX, y: e.clientY, ats: pagesFor(d.pageIndex) })
                    }}>
                    <td className="page-no">{d.pageIndex + 1}</td>
                    <td className="thumb-cell">
                      <PageThumb bytes={d.page.bytes} label={pageLabel(d)} onOpen={() => setPeek(i)} />
                    </td>
                    <td className="cover-cell">
                      <RolePick value={d.role} onChange={(r) => setRole(i, r)} label={`What page ${d.pageIndex + 1} is`} />
                    </td>
                    <td><input className={`cell mono ${d.include && d.role === 'sheet' && (!n || duplicates.has(n)) ? 'bad' : ''}`} value={d.role === 'sheet' ? d.number : ''}
                      disabled={d.role !== 'sheet' || d.origin?.t === 'sheet'} onChange={(e) => type(i, 'number', e.target.value)} placeholder={d.role === 'sheet' ? 'A-201' : ''} /></td>
                    <td><input className="cell" value={d.role === 'sheet' ? d.title : ''} disabled={d.role !== 'sheet' || d.origin?.t === 'sheet'} onChange={(e) => type(i, 'title', e.target.value)} /></td>
                    <td><input className="cell mono rev-cell" value={d.role === 'sheet' ? d.revision : ''} disabled={d.role !== 'sheet' || d.origin?.t === 'sheet'}
                      onChange={(e) => type(i, 'revision', e.target.value)} aria-label={`Revision mark on page ${d.pageIndex + 1}`} /></td>
                    {datesRead && (
                      <td><input className="cell date-cell" type="date" value={d.role === 'sheet' ? d.date : ''} disabled={d.role !== 'sheet'}
                        onChange={(e) => type(i, 'date', e.target.value)} aria-label={`Date on page ${d.pageIndex + 1}`} /></td>
                    )}
                    <td className="small nowrap size-cell">
                      {d.full ? (
                        <>
                          <span title={d.full.note}>{(d.full.before / MB).toFixed(1)} → <strong>{(d.full.after / MB).toFixed(1)} MB</strong></span>
                          <button className="link small" onClick={() => restore(i)}>undo</button>
                        </>
                      ) : reducing.has(i) ? <span className="muted">{reduceNote[i] || 'reducing'}…</span> : (
                        <>
                          {(d.page.bytes.length / MB).toFixed(1)} MB
                          {heavy(d) && <button className="link small" onClick={() => reduce(i)}>reduce</button>}
                          {reduceNote[i] && <span className="muted"> {reduceNote[i]}</span>}
                        </>
                      )}
                    </td>
                    <td className="small read-by">
                      {d.role !== 'sheet' ? <span className="muted">{d.role === 'cover' ? 'filed as the document' : 'filed into its section, below'}</span> : d.page.text.words.length === 0 ? <span className="muted">scan, no text</span> : templates.length === 0 ? (
                        d.number === COVER && !d.touched.number
                          ? <span className="muted" title="No sheet number in its title block, and it lists other sheets">cover sheet</span>
                          : <button className="link" onClick={() => setEditing({ page: i })}>{d.number ? 'guessed · ' : ''}draw template</button>
                      ) : (
                        <>
                          <select
                            className={`cell ${d.unsure ? 'unsure' : ''}`}
                            value={d.pinned ?? ''}
                            onChange={(e) => pin(i, e.target.value || null)}
                            aria-label={`Template for page ${d.pageIndex + 1}`}
                            title={d.unsure ? 'Two templates fit about equally well: check this one' : undefined}
                          >
                            <option value="">{`Best fit: ${d.templateId ? tplName(d.templateId) : d.number === COVER ? 'cover sheet' : 'none'}`}</option>
                            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                            <option value="none">Type it myself</option>
                          </select>
                          {d.unsure && !d.pinned && <span className="unsure-note">check</span>}
                          {d.pinned && d.pinned !== 'none' && sameLetters(i) > 0 && (
                            <button className="link small" onClick={() => pinLike(i)}>Use for all {letters(d)} sheets ({sameLetters(i)})</button>
                          )}
                        </>
                      )}
                    </td>
                    <td className="small">{!d.include ? 'skip' : d.role === 'cover' ? 'set introduction' : d.role === 'spec' ? 'manual' : !n ? <span className="bad-text">needs number</span> : duplicates.has(n) ? <span className="bad-text">duplicate</span> : existingNumbers.has(n) ? 'replaces current' : 'new sheet'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
          <div className="actions">
            {reopened ? (
              <button className="primary" onClick={save} disabled={step === 'saving' || sheetTrouble || !!manualProblem}>
                {step === 'saving' ? `Saving ${progress}…` : (() => {
                  const was = (d: Draft) => (d.origin?.t === 'cover' ? 'cover' : d.origin?.t === 'spec' ? 'spec' : 'sheet')
                  const moved = drafts.filter((d) => !d.include || d.role !== was(d)).length
                  return moved ? `Save — ${moved} ${moved === 1 ? 'page' : 'pages'} moved` : 'Save'
                })()}
              </button>
            ) : (
            <button className="primary" onClick={save} disabled={step === 'saving' || sheetTrouble || nothing || !!manualProblem}>
              {step === 'saving' ? `Saving ${progress}…` : `Save ${[
                chosen.length ? `${chosen.length} ${chosen.length === 1 ? 'sheet' : 'sheets'}` : '',
                sections.length ? `${sections.length} manual ${sections.length === 1 ? 'section' : 'sections'}` : '',
                covers.length && !chosen.length && !sections.length ? 'the set introduction' : '',
              ].filter(Boolean).join(' and ')}`}
            </button>
            )}
            <button onClick={onCancel} disabled={step === 'saving'}>Cancel</button>
            {manualProblem && step !== 'saving' && <span className="muted small">{manualProblem}</span>}
            {chosen.length > 0 && <span className="muted small">{chosen.filter((d) => existingNumbers.has(d.number.trim().toUpperCase())).length} replace current sheets · {chosen.filter((d) => d.number.trim() && !existingNumbers.has(d.number.trim().toUpperCase())).length} new</span>}
          </div>
        </>
      )}

      {/* Looking at a sheet while naming it. The fields come with it, because the reason to open
          the page is to read the title block and type what it says. */}
      {peek !== null && drafts[peek] && (
        <PdfPreview
          bytes={drafts[peek].page.bytes}
          title={`Page ${drafts[peek].pageIndex + 1}${drafts[peek].number ? ` · ${drafts[peek].number}` : ''}`}
          onClose={() => setPeek(null)}
          step={{
            label: `${peek + 1} of ${drafts.length}`,
            onPrev: peek > 0 ? () => setPeek(peek - 1) : undefined,
            onNext: peek < drafts.length - 1 ? () => setPeek(peek + 1) : undefined,
          }}
          extra={(() => {
            const d = drafts[peek]
            const i = peek
            return (
              <>
                <button className="link small pv-include" onClick={() => setDrafts((ds) => ds.map((x, j) => (j === i ? { ...x, include: !x.include } : x)))}>
                  {d.include ? 'Remove from the upload' : 'Put back in the upload'}
                </button>
                <label className="pv-field pv-role">Part
                  <RolePick value={d.role} onChange={(r) => setRole(i, r)} label="What this page is" />
                </label>
                {d.role === 'spec' ? (() => {
                  // A manual page: the fields are its section's, the same as in the manual card.
                  const sec = sections.find((x) => x.ats.includes(d.pageIndex))
                  const e = sec ? manualEdits[sec.key] ?? {} : {}
                  return (
                    <>
                      <label className="pv-field pv-number">Section no.
                        <input className="mono" value={sec ? e.number ?? sec.number : ''} disabled={!sec} placeholder="09 91 00"
                          onChange={(ev) => sec && editSection(sec.key, { number: ev.target.value })} aria-label="Section number of this page" />
                      </label>
                      <label className="pv-field pv-title">Section title
                        <input value={sec ? e.title ?? sec.title : ''} disabled={!sec}
                          onChange={(ev) => sec && editSection(sec.key, { title: ev.target.value })} aria-label="Section title of this page" />
                      </label>
                      <div className="pv-boxes">
                        <button className="link small" disabled={!sec} onClick={() => setBoxing({ at: d.pageIndex, what: 'number', box: null })}
                          title="Draw a box round the section number on this page — in the header, the footer or the heading">Box the number</button>
                        <button className="link small" disabled={!sec} onClick={() => setBoxing({ at: d.pageIndex, what: 'title', box: null })}
                          title="Draw a box round the section title on this page">Box the title</button>
                        {cutBox
                          ? <button className="link small" onClick={() => setCutBox(null)} title="Go back to reading each page's header and footer">Stop cutting by the box</button>
                          : lastNumberBox && <button className="link small" onClick={() => setCutBox(lastNumberBox)}
                              title="Read the section number of every manual page in this upload from the box drawn last">Cut every manual page by that box</button>}
                      </div>
                    </>
                  )
                })() : (
                  <>
                    <label className="pv-field pv-number">Sheet no.
                      <input className="mono" value={d.role === 'sheet' ? d.number : ''} disabled={d.role !== 'sheet'} placeholder="A-201"
                        onChange={(e) => type(i, 'number', e.target.value)} />
                    </label>
                    <label className="pv-field pv-title">Title
                      <input value={d.role === 'sheet' ? d.title : ''} disabled={d.role !== 'sheet'}
                        onChange={(e) => type(i, 'title', e.target.value)} />
                    </label>
                  </>
                )}
                <label className="pv-field pv-rev">Rev. mark
                  <input value={d.role === 'sheet' ? d.revision : ''} disabled={d.role !== 'sheet'}
                    onChange={(e) => type(i, 'revision', e.target.value)} />
                </label>
                {datesRead && (
                  <label className="pv-field pv-date">Revision date
                    <input type="date" value={d.role === 'sheet' ? d.date : ''} disabled={d.role !== 'sheet'}
                      onChange={(e) => type(i, 'date', e.target.value)} />
                  </label>
                )}
              </>
            )
          })()}
        />
      )}
      {/* The set introduction read straight through; the page in view can be moved earlier or later. */}
      {introPeek && introBytes && introBytes.ats === introAts && covers.length > 0 && (() => {
        const order = covers.map((d) => d.pageIndex)
        const start = introPeek.at != null && order.includes(introPeek.at) ? order.indexOf(introPeek.at) + 1 : 1
        const moveSeen = (by: -1 | 1) => {
          const at = order[introSeen.current - 1]
          if (at == null) return
          moveIntro(at, by)
          setIntroPeek({ at })
        }
        return (
          <PdfPreview key={introAts} flow bytes={introBytes.bytes} startPage={start}
            onPageSeen={(n) => { introSeen.current = n }}
            title={`Set Introduction · ${order.length} ${order.length === 1 ? 'page' : 'pages'}`}
            onClose={() => { setIntroPeek(null); setIntroBytes(null) }}
            extra={(
              <span className="pv-joins">
                <span className="muted small">The page in view:</span>
                <button onClick={() => moveSeen(-1)} title="Move the page in view earlier in the set introduction">Move earlier</button>
                <button onClick={() => moveSeen(1)} title="Move the page in view later in the set introduction">Move later</button>
              </span>
            )} />
        )
      })()}
      {/* A manual section read straight through, with its fields and joins to hand: where a
          section ends is decided by looking at its pages. */}
      {secPeek && (() => {
        const k = sections.findIndex((x) => x.key === secPeek.key)
        const sec = sections[k]
        if (!sec) return null
        const ats = sec.ats.join(',')
        if (secBytes?.ats !== ats) return null
        const e = manualEdits[sec.key] ?? {}
        const go = (to: number) => setSecPeek({ key: sections[to].key })
        const at = secPeek.at != null && sec.ats.includes(secPeek.at) ? secPeek.at : sec.ats[0]
        return (
          <PdfPreview key={ats} flow bytes={secBytes.bytes} startPage={sec.ats.indexOf(at) + 1}
            title={`${sec.number || 'Section'} · upload pages ${sec.ats.map((a) => a + 1).join(', ')}`}
            onClose={() => { setSecPeek(null); setSecBytes(null) }}
            step={{
              label: `section ${k + 1} of ${sections.length}`,
              onPrev: k > 0 ? () => go(k - 1) : undefined,
              onNext: k < sections.length - 1 ? () => go(k + 1) : undefined,
            }}
            extra={(
              <>
                <label className="pv-field pv-number">Section no.
                  <input className="mono" value={e.number ?? sec.number} placeholder="09 91 00"
                    onChange={(ev) => editSection(sec.key, { number: ev.target.value })} aria-label="Section number of this section" />
                </label>
                <label className="pv-field pv-title">Section title
                  <input value={e.title ?? sec.title} onChange={(ev) => editSection(sec.key, { title: ev.target.value })} aria-label="Section title of this section" />
                </label>
                <span className="pv-joins">
                  <button disabled={k === 0} title="This section is really part of the one above"
                    onClick={() => { const up = sections[k - 1].key; joinAt(sec.ats[0]); setSecPeek({ key: up }) }}>Join up</button>
                  <button disabled={k >= sections.length - 1} title="The section below is really part of this one"
                    onClick={() => joinAt(sections[k + 1].ats[0])}>Join down</button>
                </span>
                <div className="pv-boxes">
                  <button className="link small" onClick={() => setBoxing({ at, what: 'number', box: null })}
                    title="Draw a box round the section number — in the header, the footer or the heading">Box the number</button>
                  <button className="link small" onClick={() => setBoxing({ at, what: 'title', box: null })}
                    title="Draw a box round the section title">Box the title</button>
                </div>
              </>
            )} />
        )
      })()}
      {boxing && (() => {
        const page = drafts.find((d) => d.pageIndex === boxing.at)
        const sec = sections.find((x) => x.ats.includes(boxing.at))
        if (!page || !sec) return null
        const readOn = (at: number) => {
          const t = drafts.find((d) => d.pageIndex === at)?.page.text
          if (!t || !boxing.box) return null
          return boxing.what === 'number' ? sectionInRegion(t, boxing.box) : titleInRegion(t, boxing.box) || null
        }
        // The number box is checked against every manual page, since it may be used for all of them;
        // the title box against this section's pages.
        const over = boxing.what === 'number' ? specPages.map((p) => p.at) : sec.ats
        const here = readOn(boxing.at)
        return (
          <RegionPicker bytes={page.page.bytes} value={boxing.box}
            reads={{ here, across: over.filter((a) => readOn(a)).length, total: over.length }}
            onChange={(box) => setBoxing({ ...boxing, box })}
            onClose={() => {
              if (here) editSection(sec.key, boxing.what === 'number' ? { number: here } : { title: niceTitle(here) })
              if (boxing.what === 'number' && boxing.box && here) setLastNumberBox(boxing.box)
              setBoxing(null)
            }}
            label={`Page ${boxing.at + 1} · ${boxing.what === 'number' ? 'the section number' : 'the section title'}`}
            hint={boxing.what === 'number'
              ? 'Draw a box round the section number — in the header, the footer or the heading. Done puts it on this section.'
              : 'Draw a box round the section title — the heading or the footer. Done puts it on this section.'} />
        )
      })()}
      {error && <div className="notice error">{error}</div>}
    </div>
    </>
  )
}

/** What a page is called before it has a sheet number: its place in the upload. */
const pageLabel = (d: Draft) => `page ${d.pageIndex + 1}${d.number ? ` (${d.number})` : ''}`

const MB = 1024 * 1024

/**
 * Warn before storing an unusually heavy set. Sheets exported from CAD or Revit are mostly
 * vector and stay small; heavy pages are usually scans or embedded images at a high resolution.
 * The 5 MB-a-sheet and 20 MB-a-page thresholds are a judgement call, not a standard. The 50 MB
 * figure is Supabase's free-plan file limit (https://supabase.com/docs/guides/storage/uploads/file-limits).
 */
function sizeCheck(fileBytes: number, pages: SplitSheet[]): string | null {
  const heaviest = pages.reduce((a, p) => (p.bytes.length > a.bytes.length ? p : a), pages[0])
  const perSheet = fileBytes / Math.max(1, pages.length)
  const scans = pages.filter((p) => p.text.words.length === 0).length
  const parts: string[] = []
  if (perSheet > 5 * MB) parts.push(`This PDF is ${(fileBytes / MB).toFixed(0)} MB, about ${(perSheet / MB).toFixed(1)} MB a sheet.`)
  if (heaviest && heaviest.bytes.length > 20 * MB) parts.push(`Page ${heaviest.pageIndex + 1} alone is ${(heaviest.bytes.length / MB).toFixed(0)} MB.`)
  const tooBig = pages.filter((p) => p.bytes.length > 100 * MB).length
  if (tooBig) parts.push(`${tooBig} ${tooBig === 1 ? 'sheet is' : 'sheets are'} over the 100 MB a file that CAzen accepts by default, so ${tooBig === 1 ? 'it' : 'they'} will fail to save. An admin can change that limit in Settings.`)
  if (!parts.length) return null
  if (scans) parts.push(`${scans} of ${pages.length} pages have no text, so they are probably scans.`)
  // Not a dpi figure: "300 dpi" is advice for letter paper, and a 36 x 24 sheet at 300 dpi is 78
  // megapixels — no reduction at all. What a sheet needs is pixels across its own width.
  parts.push('Heavy sheets are usually scans, or images placed at a far higher resolution than a sheet can show. Reduce works that out from each sheet’s size, and keeps the linework and the text that sheet search reads.')
  return parts.join(' ')
}

function usDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return y && m && d ? `${m}/${d}/${y}` : iso
}

function issuanceText(kind: IssuanceKind, number: string | null) {
  const label = ISSUANCE_LABELS[kind]
  if (!number) return label
  // "Addendum 1" already says what it is; "2" or "Rev B" needs the label in front.
  return number.toLowerCase().startsWith(label.toLowerCase()) ? number : `${label} · ${number}`
}

function message(e: unknown) {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return String(e)
}
