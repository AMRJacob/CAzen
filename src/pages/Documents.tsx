import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useProject } from '../lib/project'
import { useFirm } from '../lib/firm'
import { db } from '../lib/supabase'
import { splitDrawingSet, type SplitSheet } from '../lib/pdf/splitSet'
import { pageBody } from '../lib/pdf/pageText'
import {
  listCurrentSheets, listIssuances, listRevisions, listSheetsAsOf, saveIssuance, searchSheets,
  type IssuanceRow, type SearchHit, type SheetToSave,
} from '../lib/sheets'
import { listTemplates, readPage, type TitleblockTemplate } from '../lib/titleblocks'
import { effectiveOrder, groupByDiscipline, sortSheets, type Discipline } from '../lib/disciplines'
import { ISSUANCE_LABELS, type CurrentSheet, type IssuanceKind, type Project, type SheetRevision } from '../lib/types'
import { openFile } from '../lib/files'
import { ProjectFolder } from '../components/ProjectFolder'
import { SheetViewer, type ViewSheet } from '../components/SheetViewer'
import { TitleblockEditor } from '../components/TitleblockEditor'
import { DisciplineOrderEditor } from '../components/DisciplineOrder'

const today = () => new Date().toISOString().slice(0, 10)

const toView = (s: CurrentSheet): ViewSheet => ({
  number: s.number, title: s.title, revisionId: s.revision_id, revisionLabel: s.revision_label, filePath: s.file_path,
})

export default function Documents() {
  const { current, reload: reloadProjects } = useProject()
  const { firm } = useFirm()
  const [sheets, setSheets] = useState<CurrentSheet[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [view, setView] = useState<'sheets' | 'sets'>('sheets')
  const [asOf, setAsOf] = useState('')
  const [asOfRows, setAsOfRows] = useState<Awaited<ReturnType<typeof listSheetsAsOf>> | null>(null)
  const [query, setQuery] = useState('')
  const [allRevs, setAllRevs] = useState(false)
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const [viewing, setViewing] = useState<{ start: ViewSheet; highlight?: string } | null>(null)
  const [ordering, setOrdering] = useState(false)

  const order = effectiveOrder(firm?.discipline_order, current?.discipline_order)

  const load = useCallback(async () => {
    if (!current) return
    setLoading(true)
    try {
      setSheets(await listCurrentSheets(current.id))
      setError(null)
    } catch (e) {
      setError(message(e))
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

  const ordered = useMemo(() => sortSheets(sheets, (s) => s.number, order), [sheets, order])
  const viewSheets = useMemo(() => ordered.map(toView), [ordered])
  const visible = useMemo(() => {
    const q = query.trim().toUpperCase()
    return q ? ordered.filter((s) => s.number.includes(q) || s.number.replace(/-/g, '').includes(q.replace(/-/g, '')) || (s.title ?? '').toUpperCase().includes(q)) : ordered
  }, [ordered, query])
  const groups = useMemo(() => groupByDiscipline(visible, (s) => s.number, order), [visible, order])

  if (!current) {
    return (
      <section>
        <h1>Drawings</h1>
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
    start: { number: h.number, title: h.title, revisionId: h.revision_id, revisionLabel: null, filePath: h.file_path, superseded: !h.is_current },
    highlight: query.trim(),
  })

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Drawings</h1>
          <p className="lead">{current.number} {current.name} · {sheets.length} sheets</p>
        </div>
        {!uploading && <button className="primary" onClick={() => setUploading(true)}>Upload a set or revised sheets</button>}
      </div>

      <ProjectFolder project={current} />

      {uploading && firm && (
        <UploadIssuance
          project={current}
          firmId={firm.id}
          order={order}
          existingNumbers={new Set(sheets.map((s) => s.number))}
          onDone={() => { setUploading(false); load() }}
          onCancel={() => setUploading(false)}
        />
      )}

      {error && <div className="notice error">{error}</div>}

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={view === 'sheets'} className={view === 'sheets' ? 'on' : ''} onClick={() => setView('sheets')}>Current sheets</button>
        <button role="tab" aria-selected={view === 'sets'} className={view === 'sets' ? 'on' : ''} onClick={() => setView('sets')}>Sets and revisions</button>
      </div>

      {view === 'sets' ? (
        <SetsList projectId={current.id} order={order} />
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
                  <span className="hit-title">{h.title ?? ''}{!h.is_current && <span className="tag muted">rev {h.revision_index}, superseded</span>}</span>
                  <span className="hit-snip">{snippet(h.snippet)}</span>
                </button>
              ))}
            </div>
          )}

          {asOfRows ? (
            <AsOfTable rows={asOfRows} date={asOf} order={order} onOpen={(p) => openFile(current, p).catch((e) => setError(message(e)))} />
          ) : loading ? (
            <p className="muted">Loading…</p>
          ) : sheets.length === 0 ? (
            <div className="card muted">No drawings yet. Upload the bid or permit set to start.</div>
          ) : (
            <table className="register">
              <thead>
                <tr><th>Sheet</th><th>Title</th><th>Rev.</th><th>From</th><th>Date</th><th>History</th><th /></tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <Fragment key={g.key}>
                    <tr className="group"><td colSpan={7}>{g.label}</td></tr>
                    {g.items.map((s) => <SheetRow key={s.sheet_id} sheet={s} onOpen={(v) => setViewing({ start: v })} />)}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {viewing && (
        <SheetViewer project={current} sheets={viewSheets} start={viewing.start} highlight={viewing.highlight} onClose={() => setViewing(null)} />
      )}
    </section>
  )
}

function snippet(s: string) {
  return s.split(/(«[^»]*»)/).map((part, i) => part.startsWith('«') ? <mark key={i}>{part.slice(1, -1)}</mark> : part)
}

function SheetRow({ sheet, onOpen }: { sheet: CurrentSheet; onOpen: (v: ViewSheet) => void }) {
  const [open, setOpen] = useState(false)
  const [history, setHistory] = useState<SheetRevision[] | null>(null)

  async function toggle() {
    if (!open && !history) setHistory(await listRevisions(sheet.sheet_id))
    setOpen(!open)
  }

  return (
    <>
      <tr>
        <td className="mono">{sheet.number}</td>
        <td>{sheet.title ?? ''}</td>
        <td>{sheet.revision_label || sheet.revision_index}</td>
        <td>{issuanceText(sheet.issuance_kind, sheet.issuance_number)}</td>
        <td>{usDate(sheet.issued_on)}</td>
        <td>
          {sheet.revision_count > 1
            ? <button className="link" onClick={toggle}>{open ? 'Hide' : `${sheet.revision_count} revisions`}</button>
            : <span className="muted">original</span>}
        </td>
        <td className="right"><button onClick={() => onOpen(toView(sheet))}>View</button></td>
      </tr>
      {open && history?.map((r) => (
        <tr key={r.id} className="history">
          <td />
          <td>{r.title_at_rev ?? ''}</td>
          <td>{r.revision_label || r.revision_index}</td>
          <td>{r.issuances ? issuanceText(r.issuances.kind, r.issuances.number) : ''}</td>
          <td>{r.issuances ? usDate(r.issuances.issued_on) : ''}</td>
          <td>{r.revision_index === sheet.revision_index ? <span className="tag">current</span> : <span className="tag muted">superseded</span>}</td>
          <td className="right">
            <button onClick={() => onOpen({
              number: sheet.number, title: r.title_at_rev ?? sheet.title, revisionId: r.id, revisionLabel: r.revision_label,
              filePath: r.file_path, superseded: r.revision_index !== sheet.revision_index,
            })}>View</button>
          </td>
        </tr>
      ))}
    </>
  )
}

function SetsList({ projectId, order }: { projectId: string; order: Discipline[] }) {
  const [rows, setRows] = useState<IssuanceRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { listIssuances(projectId).then(setRows).catch((e) => setError(message(e))) }, [projectId])
  if (error) return <div className="notice error">{error}</div>
  if (!rows) return <p className="muted">Loading…</p>
  if (!rows.length) return <div className="card muted">No sets uploaded yet.</div>
  return (
    <table>
      <thead><tr><th>Date</th><th>Issued as</th><th>Sheets</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="nowrap">{usDate(r.issued_on)}</td>
            <td className="nowrap">{issuanceText(r.kind, r.number)}{r.title ? ` · ${r.title}` : ''}</td>
            <td className="small">
              <strong>{r.sheets.length}</strong>{' '}
              <span className="muted">{sortSheets(r.sheets, (s) => s.number, order).map((s) => s.number + (s.revision_label ? ` (${s.revision_label})` : '')).join(', ')}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
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
              <td>{r.sheet_title ?? ''}</td>
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
  include: boolean
  number: string
  title: string
  revision: string
  templateId: string | null
  /** Fields typed by hand: kept when templates change. */
  touched: { number?: boolean; title?: boolean; revision?: boolean }
}

function UploadIssuance({ project, firmId, order, existingNumbers, onDone, onCancel }: {
  project: Project
  firmId: string
  order: Discipline[]
  existingNumbers: Set<string>
  onDone: () => void
  onCancel: () => void
}) {
  const [kind, setKind] = useState<IssuanceKind>(existingNumbers.size ? 'addendum' : 'bid_set')
  const [number, setNumber] = useState('')
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

  useEffect(() => { listTemplates(firmId).then(setTemplates).catch((e) => setError(message(e))) }, [firmId])

  // Re-read every page when the templates or the preferred one change; hand edits stay.
  const reread = useCallback((list: Draft[], tpls: TitleblockTemplate[], pref: string) => list.map((d) => {
    const r = readPage(d.page.text, tpls, pref || null)
    return {
      ...d,
      templateId: r.templateId,
      number: d.touched.number ? d.number : r.number,
      title: d.touched.title ? d.title : r.title,
      revision: d.touched.revision ? d.revision : r.revision,
    }
  }), [])

  useEffect(() => { setDrafts((ds) => reread(ds, templates, preferred)) }, [templates, preferred, reread])

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setStep('splitting')
    setError(null)
    try {
      const pages = await splitDrawingSet(await file.arrayBuffer(), (done, total) => setProgress(`${done} of ${total}`))
      setSizeWarning(sizeCheck(file.size, pages))
      setDrafts(reread(pages.map((p) => ({
        pageIndex: p.pageIndex, page: p, include: true, number: '', title: '', revision: '', templateId: null, touched: {},
      })), templates, preferred))
      setStep('review')
    } catch (err) {
      setError(message(err))
      setStep('pick')
    }
  }

  const update = (i: number, patch: Partial<Draft>) => setDrafts(drafts.map((d, j) => (j === i ? { ...d, ...patch } : d)))
  const type = (i: number, k: 'number' | 'title' | 'revision', v: string) =>
    setDrafts(drafts.map((d, j) => (j === i ? { ...d, [k]: v, touched: { ...d.touched, [k]: true } } : d)))

  const chosen = drafts.filter((d) => d.include)
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
        number: d.number, title: d.title, revisionLabel: d.revision || setRev, bytes: d.page.bytes, body: pageBody(d.page.text),
      }))
      await saveIssuance(project, { kind, number, issuedOn }, out, (done, total) => setProgress(`${done} of ${total}`))
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
        <label>Set name or number<input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Addendum 2, ASI-003, Rev 1…" /></label>
        <label>Issue date<input type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} /></label>
        <label>Revision mark<input value={setRev} onChange={(e) => setSetRev(e.target.value)} placeholder="1, A, Δ2…" />
          <span className="hint">For every sheet in this upload, unless its title block shows one.</span>
        </label>
      </div>

      {step === 'pick' && (
        <>
          <label className="upload">
            <input type="file" accept="application/pdf" onChange={onFile} />
            Choose a PDF: a full set, a few sheets or a single sheet
          </label>
          <button className="link" onClick={onCancel}>Cancel</button>
        </>
      )}
      {step === 'splitting' && <p className="muted">Reading pages… {progress}</p>}

      {(step === 'review' || step === 'saving') && (
        <>
          {sizeWarning && <div className="notice warn">{sizeWarning}</div>}
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
            <thead><tr><th /><th>Page</th><th>Sheet no.</th><th>Title</th><th>Rev. mark</th><th>Read by</th><th>Result</th></tr></thead>
            <tbody>
              {drafts.map((d, i) => {
                const n = d.number.trim().toUpperCase()
                return (
                  <tr key={d.pageIndex} className={d.include ? '' : 'skipped'}>
                    <td><input type="checkbox" checked={d.include} onChange={(e) => update(i, { include: e.target.checked })} aria-label={`Include page ${d.pageIndex + 1}`} /></td>
                    <td>{d.pageIndex + 1}</td>
                    <td><input className={`cell mono ${d.include && (!n || duplicates.has(n)) ? 'bad' : ''}`} value={d.number} onChange={(e) => type(i, 'number', e.target.value)} placeholder="A-201" /></td>
                    <td><input className="cell" value={d.title} onChange={(e) => type(i, 'title', e.target.value)} /></td>
                    <td><input className="cell short" value={d.revision} onChange={(e) => type(i, 'revision', e.target.value)} placeholder={setRev || '—'} /></td>
                    <td className="small">
                      {d.templateId ? tplName(d.templateId) : d.page.text.words.length === 0 ? <span className="muted">scan, no text</span> : (
                        <button className="link" onClick={() => setEditing({ page: i })}>{d.number ? 'guessed · ' : ''}draw template</button>
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
      {error && <div className="notice error">{error}</div>}
    </div>
  )
}

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
  const tooBig = pages.filter((p) => p.bytes.length > 50 * MB).length
  if (tooBig) parts.push(`${tooBig} ${tooBig === 1 ? 'sheet is' : 'sheets are'} over 50 MB, the largest file Supabase’s free plan accepts, so ${tooBig === 1 ? 'it' : 'they'} will fail to save there.`)
  if (!parts.length) return null
  if (scans) parts.push(`${scans} of ${pages.length} pages have no text, so they are probably scans.`)
  parts.push('Large sheets are usually scans or images at a very high resolution. Re-exporting or re-scanning at 200–300 dpi would make them much smaller. You can still save them as they are.')
  return parts.join(' ')
}

function usDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return y && m && d ? `${m}/${d}/${y}` : iso
}

function issuanceText(kind: IssuanceKind, number: string | null) {
  return number ? `${ISSUANCE_LABELS[kind]} · ${number}` : ISSUANCE_LABELS[kind]
}

function message(e: unknown) {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return String(e)
}
