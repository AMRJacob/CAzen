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
import { pageBody } from '../lib/pdf/pageText'
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
import { listIssuanceSheets } from '../lib/sheets'
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
  const [uploading, setUploading] = useState(false)
  const [params, setParams] = useSearchParams()
  useEffect(() => {
    if (params.get('upload') === null) return
    setUploading(true)
    // Taken out of the address once it's done its job, so a refresh doesn't reopen it.
    const next = new URLSearchParams(params)
    next.delete('upload')
    setParams(next, { replace: true })
  }, [params, setParams])
  const [dropped, setDropped] = useState<File[] | undefined>(undefined)
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
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
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
    onDrop: (e: React.DragEvent) => { e.preventDefault(); setPageDrag(false); const f = [...e.dataTransfer.files]; if (f.length) { setDropped(f); setUploading(true) } },
  }

  return (
    <section {...pageDropProps} className={`docs-page${phoneTools ? ' tools-open' : ''}${pageDrag ? ' page-drop' : ''}`}>
      <div className="page-head">
        <div>
          <PageTitle>Drawings</PageTitle>
          <p className="lead">{current.number} {current.name} · {sheets.length} sheets</p>
        </div>
        {/* Uploading a set from a phone is a rare thing done at a desk, so it isn't given the
            loudest control on a phone screen; it lives under More in the corner menu instead. */}
        {!uploading && <button className="primary desk-only" onClick={() => setUploading(true)}>Upload a set or revised sheets</button>}
      </div>

      {/* Whether the copy on this device is still the job. Silent unless it isn't. */}
      <FieldSync project={current} onSynced={load} />

      {uploading && firm && (
        <UploadIssuance
          project={current}
          firmId={firm.id}
          order={order}
          existingNumbers={new Set(sheets.map((s) => s.number))}
          initialFiles={dropped}
          onDone={() => { setUploading(false); setDropped(undefined); load() }}
          onCancel={() => { setUploading(false); setDropped(undefined) }}
        />
      )}

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
        <SetsList project={current} order={order} isAdmin={isAdmin} onChanged={load} />
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
                {selecting && <span className="muted small">A click selects; Shift-click takes everything between.</span>}
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
                    <tr className="group"><td colSpan={7}>{g.label}</td></tr>
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
          <div className="pick-menu" style={{ left: Math.min(menu.x, window.innerWidth - 290), top: Math.min(menu.y, window.innerHeight - 110) }}>
            <button onClick={() => { setMenu(null); setRereading(true) }}>Re-read title and date from {picked.size === 1 ? 'the sheet' : `these ${picked.size} sheets`}</button>
            <button onClick={() => { setMenu(null); setPicked(new Set()) }}>Clear the selection</button>
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
  const [editing, setEditing] = useState<{ number: string; title: string; filedUnder: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const startEdit = () => { setProblem(null); setEditing({ number: sheet.number, title: niceTitle(sheet.title), filedUnder: sheet.filed_under ?? '' }) }

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
                <span className="muted small" title="The date printed on the sheet itself"> · sheet {usDate(r.sheet_date)}</span>}
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

function SetsList({ project, order, isAdmin, onChanged }: { project: Project; order: Discipline[]; isAdmin: boolean; onChanged: () => void }) {
  const [rows, setRows] = useState<IssuanceRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id: string; kind: IssuanceKind; number: string; title: string; issuedOn: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const reload = useCallback(() => { listIssuances(project.id).then(setRows).catch((e) => setError(message(e))) }, [project.id])
  useEffect(() => { reload() }, [reload])
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
  /** This page is the cover or narrative of the change document, not a drawing. */
  cover?: boolean
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

export function UploadIssuance({ project, firmId, order, existingNumbers, initialFiles, onDone, onCancel }: {
  project: Project
  initialFiles?: File[]
  firmId: string
  order: Discipline[]
  existingNumbers: Set<string>
  onDone: () => void
  onCancel: () => void
}) {
  const [kind, setKind] = useState<IssuanceKind>(existingNumbers.size ? 'addendum' : 'bid_set')
  const [number, setNumber] = useState('')
  // The sets already on this project, so the next one can be named without being asked for.
  const [sets, setSets] = useState<{ kind: IssuanceKind; number: string | null }[]>([])
  const [namedByHand, setNamedByHand] = useState(false)
  useEffect(() => { existingSets(project.id).then(setSets).catch(() => setSets([])) }, [project.id])
  useEffect(() => {
    if (namedByHand) return
    setNumber(suggestSetName(kind, sets))
  }, [kind, sets, namedByHand])
  const [issuedOn, setIssuedOn] = useState(today())
  const [setRev, setSetRev] = useState('')
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [templates, setTemplates] = useState<TitleblockTemplate[]>([])
  const [preferred, setPreferred] = useState<string>('')
  const [editing, setEditing] = useState<{ template?: TitleblockTemplate; page: number } | null>(null)
  const [step, setStep] = useState<'pick' | 'splitting' | 'review' | 'saving'>('pick')
  const [progress, setProgress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sizeWarning, setSizeWarning] = useState<string | null>(null)
  const [reducing, setReducing] = useState<Set<number>>(new Set())
  const [reduceNote, setReduceNote] = useState<Record<number, string>>({})
  const [run, setRun] = useState<{ done: number; total: number; sheet: string; stage: string } | null>(null)
  const [dpi, setDpi] = useState(DEFAULT_DPI)
  // The page being looked at full size while the set is named.
  const [peek, setPeek] = useState<number | null>(null)

  useEffect(() => { listTemplates(firmId).then(setTemplates).catch((e) => setError(message(e))) }, [firmId])

  // Re-read every page when the templates or the preferred one change; hand edits stay.
  const reread = useCallback((list: Draft[], tpls: TitleblockTemplate[], pref: string) => list.map((d) => {
    if (d.pinned === 'none') return { ...d, templateId: null, unsure: false }
    const pinnedTpl = d.pinned ? tpls.find((t) => t.id === d.pinned) : undefined
    const r = pinnedTpl ? readWith(d.page.text, pinnedTpl) : readPage(d.page.text, tpls, pref || null)
    return {
      ...d,
      templateId: r.templateId,
      unsure: !pinnedTpl && !!r.unsure,
      number: d.touched.number ? d.number : r.number,
      title: d.touched.title ? d.title : niceTitle(r.title),
      revision: d.touched.revision ? d.revision : r.revision,
      date: d.touched.date ? d.date : r.date,
    }
  }), [])

  useEffect(() => { setDrafts((ds) => reread(ds, templates, preferred)) }, [templates, preferred, reread])
  // Files dropped before the templates loaded are read with whatever is current when they finish.
  const tplRef = useRef({ templates, preferred })
  tplRef.current = { templates, preferred }

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
        const split = await splitDrawingSet(await file.arrayBuffer(), (done, total) => setProgress(`${label}${done} of ${total}`))
        for (const p of split) pages.push({ ...p, pageIndex: pages.length })
        bytesTotal += file.size
      }
      setSizeWarning(sizeCheck(bytesTotal, pages))
      setDrafts(reread(pages.map((p) => ({
        pageIndex: p.pageIndex, page: p, include: true, number: '', title: '', revision: '', date: '', templateId: null, touched: {},
      })), tplRef.current.templates, tplRef.current.preferred))
      setStep('review')
    } catch (err) {
      setError(message(err))
      setStep('pick')
    }
  }
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => onFiles([...(e.target.files ?? [])])
  useEffect(() => { if (initialFiles?.length) onFiles(initialFiles) }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const type = (i: number, k: 'number' | 'title' | 'revision' | 'date', v: string) =>
    setDrafts(drafts.map((d, j) => (j === i ? { ...d, [k]: v, touched: { ...d.touched, [k]: true } } : d)))

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
   * Ticking with shift held carries the change across everything between this row and the last one
   * touched — the difference between unticking fourteen spec pages and unticking them one by one.
   */
  const lastTicked = useRef<number | null>(null)
  function tick(i: number, include: boolean, shift: boolean) {
    // Read the anchor before moving it: the updater below runs later, by which time
    // lastTicked would already be this row and the range would be a single row.
    const anchor = lastTicked.current
    lastTicked.current = i
    setDrafts((ds) => {
      if (!shift || anchor === null) return ds.map((d, j) => (j === i ? { ...d, include } : d))
      const from = Math.min(anchor, i)
      const to = Math.max(anchor, i)
      return ds.map((d, j) => (j >= from && j <= to ? { ...d, include } : d))
    })
  }

  /**
   * An addendum usually carries project manual pages behind its drawings, and they arrive here
   * looking like sheets. They give themselves away by size: letter pages among D-size sheets. The
   * median is the measure, so a set that is genuinely all letter-size flags nothing.
   */
  const pageSizes = drafts.map((d) => d.page.text.width * d.page.text.height).sort((a, b) => a - b)
  const median = pageSizes.length ? pageSizes[Math.floor(pageSizes.length / 2)] : 0
  const smallPages = median > 1_000_000
    ? drafts.map((d, i) => [i, d] as const).filter(([, d]) => d.page.text.width * d.page.text.height < median * 0.5)
    : []
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
  const covers = drafts.filter((d) => d.include && d.cover)
  const chosen = drafts.filter((d) => d.include && !d.cover)
  const setTotal = drafts.reduce((n, d) => n + (d.include ? d.page.bytes.length : 0), 0)
  const numbers = chosen.map((d) => d.number.trim().toUpperCase())
  const duplicates = new Set(numbers.filter((n, i) => n && numbers.indexOf(n) !== i))
  const missing = chosen.filter((d) => !d.number.trim()).length
  const readByTemplate = chosen.filter((d) => d.templateId).length
  const tplName = (id: string | null) => templates.find((t) => t.id === id)?.name
  const firstUnread = drafts.findIndex((d) => d.include && !d.templateId)

  async function save() {
    setStep('saving')
    setError(null)
    try {
      const out: SheetToSave[] = sortSheets(chosen, (d) => d.number, order).map((d) => ({
        // What the Rev. column says for this sheet: whatever the title block itself carried, then
        // a mark typed for the whole set, and failing both the set's own name — which is what an
        // architect would write there anyway ("Addendum 2"), and beats a row number nobody chose.
        number: d.number, title: d.title, revisionLabel: d.revision || setRev || number,
        sheetDate: d.date || null,
        bytes: d.page.bytes, body: pageBody(d.page.text),
      }))
      const saved = await saveIssuance(project, { kind, number, issuedOn }, out, (done, total) => setProgress(`${done} of ${total}`))

      // Uploading sheets as an ASI or a PR is issuing that ASI or PR, so the entry in the change
      // register is made here rather than typed again afterwards — with the cover that came up
      // with the drawings attached to it when there was one, and without when there wasn't. A
      // sketch issued with no narrative is still an ASI.
      if (saved?.id) {
        let coverPath: string | null = null
        if (covers.length) {
          try {
            setProgress('Filing the cover')
            const bytes = await joinPages(covers.map((d) => d.page.bytes))
            const setName = number || ISSUANCE_LABELS[kind]
            const name = `${issuedOn} ${setName} cover.pdf`
            coverPath = await putFile(project, bytes, `${project.id}/covers/${saved.id}.pdf`, {
              dirs: [SECTIONS.drawings, saved.setFolder], name,
            })
            await setIssuanceCover(saved.id, coverPath)
          } catch (e) {
            // Drawings are already in; losing the cover is worth saying, not worth undoing them.
            setError(`The sheets went in, but the cover didn’t: ${message(e)}`)
          }
        }
        if (DOCUMENT_FOR[kind]) {
          // The document is numbered by the set's name, because they are one thing: a package
          // called "ASI 003" is ASI-003.
          await documentForIssuance({
            projectId: project.id, issuanceId: saved.id, kind,
            name: number || ISSUANCE_LABELS[kind], issuedOn, filePath: coverPath,
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
      onDone()
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

  return (
    <div className="card upload-panel">
      <h2>Upload a set or revised sheets</h2>
      <p className="muted small">Each upload is one set or revision round. Its sheets replace the current ones with the same number, and the earlier versions stay in each sheet’s history.</p>
      <div className="form four">
        <label>Issued as
          <select value={kind} onChange={(e) => setKind(e.target.value as IssuanceKind)}>
            {(Object.entries(ISSUANCE_LABELS) as [IssuanceKind, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>Set name
          <input value={number} placeholder="Addendum 2, ASI-003, Rev 1…"
            onChange={(e) => { setNamedByHand(true); setNumber(e.target.value) }} />
        </label>
        <label>Issue date<input type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} /></label>
        {/* What this upload will do beyond putting sheets in, said before it does it. */}
        {(DOCUMENT_FOR[kind] || covers.length > 0) && (
          <p className="muted small upload-cover-note">
            {DOCUMENT_FOR[kind] && (
              <>This goes in Change documents as <strong>{number || ISSUANCE_LABELS[kind]}</strong>, with these sheets attached to it.{' '}</>
            )}
            {covers.length > 0
              ? <>{covers.length} {covers.length === 1 ? 'page is' : 'pages are'} marked as the cover, so {covers.length === 1 ? 'it is' : 'they are'} kept with the set rather than filed as {covers.length === 1 ? 'a drawing' : 'drawings'}{DOCUMENT_FOR[kind] ? ' and attached to that entry' : ''}.</>
              : DOCUMENT_FOR[kind] ? <>No page is marked as the cover, which is fine — one can be added to it later.</> : null}
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
          {smallPages.length > 0 && (
            <div className="notice">
              {smallPages.length} of {drafts.length} pages are {sizeOf(smallPages[0][1])}, much smaller than the{' '}
              {sizeOf(drafts.find((d) => d.page.text.width * d.page.text.height >= median)!)} sheets in this upload — project
              manual pages, most likely, rather than drawings.
              <div className="notice-actions">
                <button onClick={dropSmall} disabled={!smallStillIn.length}>
                  {smallStillIn.length ? `Leave them out (${smallStillIn.length})` : 'Left out'}
                </button>
                <span className="muted small">Pages: {smallPages.map(([i]) => i + 1).join(', ')}</span>
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

          <table>
            <thead><tr>
              <th>
                <input type="checkbox" aria-label="Include every page"
                  checked={drafts.length > 0 && drafts.every((d) => d.include)}
                  ref={(el) => { if (el) el.indeterminate = drafts.some((d) => d.include) && !drafts.every((d) => d.include) }}
                  onChange={(e) => setDrafts((ds) => ds.map((d) => ({ ...d, include: e.target.checked })))} />
              </th>
              <th>Page</th><th>View</th><th title="The cover sheet or narrative, filed as the document rather than as a drawing">Cover</th><th>Sheet no.</th><th>Title</th><th>Rev. mark</th>{datesRead && <th>Sheet date</th>}<th>Size</th><th>Read by</th><th>Result</th></tr></thead>
            <tbody>
              {drafts.map((d, i) => {
                const n = d.number.trim().toUpperCase()
                return (
                  <tr key={d.pageIndex} className={d.include ? '' : 'skipped'}>
                    <td>
                      {/* onClick rather than onChange: it carries the shift key, and by the time it
                          runs the box already holds its new value. */}
                      <input type="checkbox" checked={d.include} readOnly
                        onClick={(e) => tick(i, (e.target as HTMLInputElement).checked, e.shiftKey)}
                        aria-label={`Include page ${d.pageIndex + 1}`} />
                    </td>
                    <td>{d.pageIndex + 1}</td>
                    <td className="thumb-cell">
                      <PageThumb bytes={d.page.bytes} label={pageLabel(d)} onOpen={() => setPeek(i)} />
                    </td>
                    <td className="cover-cell">
                      <input type="checkbox" checked={!!d.cover}
                        aria-label={`Page ${d.pageIndex + 1} is the cover, not a drawing`}
                        onChange={(e) => setDrafts((ds) => ds.map((x, j) => (j === i ? { ...x, cover: e.target.checked } : x)))} />
                    </td>
                    <td><input className={`cell mono ${d.include && !d.cover && (!n || duplicates.has(n)) ? 'bad' : ''}`} value={d.number}
                      disabled={!!d.cover} onChange={(e) => type(i, 'number', e.target.value)} placeholder="A-201" /></td>
                    <td><input className="cell" value={d.title} disabled={!!d.cover} onChange={(e) => type(i, 'title', e.target.value)} /></td>
                    <td><input className="cell mono rev-cell" value={d.revision} disabled={!!d.cover}
                      onChange={(e) => type(i, 'revision', e.target.value)} aria-label={`Revision mark on page ${d.pageIndex + 1}`} /></td>
                    {datesRead && (
                      <td><input className="cell date-cell" type="date" value={d.date} disabled={!!d.cover}
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
                      {d.page.text.words.length === 0 ? <span className="muted">scan, no text</span> : templates.length === 0 ? (
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
                    <td className="small">{!d.include ? 'skip' : !n ? <span className="bad-text">needs number</span> : duplicates.has(n) ? <span className="bad-text">duplicate</span> : existingNumbers.has(n) ? 'replaces current' : 'new sheet'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="actions">
            <button className="primary" onClick={save} disabled={step === 'saving' || missing > 0 || duplicates.size > 0 || chosen.length === 0}>
              {step === 'saving' ? `Saving ${progress}…` : `Save ${chosen.length} ${chosen.length === 1 ? 'sheet' : 'sheets'}`}
            </button>
            <button onClick={onCancel} disabled={step === 'saving'}>Cancel</button>
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
                <label className="pv-check">
                  <input type="checkbox" checked={d.include}
                    onChange={(e) => setDrafts((ds) => ds.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))} />
                  Include
                </label>
                <label className="pv-check">
                  <input type="checkbox" checked={!!d.cover}
                    onChange={(e) => setDrafts((ds) => ds.map((x, j) => (j === i ? { ...x, cover: e.target.checked } : x)))} />
                  Cover
                </label>
                <label className="pv-field pv-number">Sheet no.
                  <input className="mono" value={d.number} disabled={!!d.cover} placeholder="A-201"
                    onChange={(e) => type(i, 'number', e.target.value)} />
                </label>
                <label className="pv-field pv-title">Title
                  <input value={d.title} disabled={!!d.cover}
                    onChange={(e) => type(i, 'title', e.target.value)} />
                </label>
                <label className="pv-field pv-rev">Rev. mark
                  <input value={d.revision} disabled={!!d.cover}
                    onChange={(e) => type(i, 'revision', e.target.value)} />
                </label>
                {datesRead && (
                  <label className="pv-field pv-date">Sheet date
                    <input type="date" value={d.date} disabled={!!d.cover}
                      onChange={(e) => type(i, 'date', e.target.value)} />
                  </label>
                )}
              </>
            )
          })()}
        />
      )}
      {error && <div className="notice error">{error}</div>}
    </div>
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
