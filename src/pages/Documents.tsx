import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useProject } from '../lib/project'
import { splitDrawingSet } from '../lib/pdf/splitSet'
import {
  listCurrentSheets, listRevisions, listSheetsAsOf, openStoredPdf, saveIssuance, type SheetToSave,
} from '../lib/sheets'
import { ISSUANCE_LABELS, type CurrentSheet, type IssuanceKind, type SheetRevision } from '../lib/types'

const today = () => new Date().toISOString().slice(0, 10)

export default function Documents() {
  const { current } = useProject()
  const [sheets, setSheets] = useState<CurrentSheet[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [asOf, setAsOf] = useState('')
  const [asOfRows, setAsOfRows] = useState<Awaited<ReturnType<typeof listSheetsAsOf>> | null>(null)
  const [filter, setFilter] = useState('')

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

  const visible = useMemo(() => {
    const q = filter.trim().toUpperCase()
    return q ? sheets.filter((s) => s.number.includes(q) || (s.title ?? '').toUpperCase().includes(q)) : sheets
  }, [sheets, filter])

  if (!current) {
    return (
      <section>
        <h1>Document control</h1>
        <div className="card muted">Choose a project first, on the <Link to="/">Projects</Link> page.</div>
      </section>
    )
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Drawings</h1>
          <p className="lead">{current.number} {current.name} · {sheets.length} sheets</p>
        </div>
        {!uploading && <button className="primary" onClick={() => setUploading(true)}>Upload set or revised sheets</button>}
      </div>

      {uploading && (
        <UploadIssuance
          projectId={current.id}
          existingNumbers={new Set(sheets.map((s) => s.number))}
          onDone={() => { setUploading(false); load() }}
          onCancel={() => setUploading(false)}
        />
      )}

      {error && <div className="notice error">{error}</div>}

      <div className="toolbar">
        <input placeholder="Filter by sheet no. or title" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <label className="inline">
          Set as of
          <input type="date" value={asOf} max={today()} onChange={(e) => setAsOf(e.target.value)} />
        </label>
        {asOf && <button onClick={() => setAsOf('')}>Show current</button>}
      </div>

      {asOfRows ? (
        <AsOfTable rows={asOfRows} date={asOf} />
      ) : loading ? (
        <p className="muted">Loading…</p>
      ) : sheets.length === 0 ? (
        <div className="card muted">No drawings yet. Upload the bid or permit set to start.</div>
      ) : (
        <table>
          <thead>
            <tr><th>Sheet</th><th>Title</th><th>Current rev.</th><th>From</th><th>Date</th><th>Revisions</th><th /></tr>
          </thead>
          <tbody>
            {visible.map((s) => <SheetRow key={s.sheet_id} sheet={s} />)}
          </tbody>
        </table>
      )}
    </section>
  )
}

function SheetRow({ sheet }: { sheet: CurrentSheet }) {
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
        <td>{sheet.issued_on}</td>
        <td>
          {sheet.revision_count > 1
            ? <button className="link" onClick={toggle}>{open ? 'Hide' : `History (${sheet.revision_count})`}</button>
            : <span className="muted">1</span>}
        </td>
        <td className="right"><button onClick={() => openStoredPdf(sheet.file_path)}>Open</button></td>
      </tr>
      {open && history?.map((r) => (
        <tr key={r.id} className="history">
          <td />
          <td>{r.title_at_rev ?? ''}</td>
          <td>{r.revision_label || r.revision_index}</td>
          <td>{r.issuances ? issuanceText(r.issuances.kind, r.issuances.number) : ''}</td>
          <td>{r.issuances?.issued_on ?? ''}</td>
          <td>{r.revision_index === sheet.revision_index ? <span className="tag">current</span> : <span className="tag muted">superseded</span>}</td>
          <td className="right"><button onClick={() => openStoredPdf(r.file_path)}>Open</button></td>
        </tr>
      ))}
    </>
  )
}

function AsOfTable({ rows, date }: { rows: Awaited<ReturnType<typeof listSheetsAsOf>>; date: string }) {
  const sorted = [...rows].sort((a, b) => a.sheet_number.localeCompare(b.sheet_number, undefined, { numeric: true }))
  return (
    <>
      <div className="notice">Showing the set as it stood on {date}: {sorted.length} sheets.</div>
      <table>
        <thead><tr><th>Sheet</th><th>Title</th><th>Rev.</th><th>Issued</th><th /></tr></thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.sheet_number}>
              <td className="mono">{r.sheet_number}</td>
              <td>{r.sheet_title ?? ''}</td>
              <td>{r.revision_index}</td>
              <td>{r.issued_on}</td>
              <td className="right"><button onClick={() => openStoredPdf(r.file_path)}>Open</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

interface Draft extends SheetToSave {
  include: boolean
  pageIndex: number
}

function UploadIssuance({ projectId, existingNumbers, onDone, onCancel }: {
  projectId: string
  existingNumbers: Set<string>
  onDone: () => void
  onCancel: () => void
}) {
  const [kind, setKind] = useState<IssuanceKind>(existingNumbers.size ? 'asi' : 'bid_set')
  const [number, setNumber] = useState('')
  const [issuedOn, setIssuedOn] = useState(today())
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [step, setStep] = useState<'pick' | 'splitting' | 'review' | 'saving'>('pick')
  const [progress, setProgress] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setStep('splitting')
    setError(null)
    try {
      const pages = await splitDrawingSet(await file.arrayBuffer())
      setDrafts(pages.map((p) => ({
        pageIndex: p.pageIndex,
        number: p.detectedNumber ?? '',
        title: '',
        revisionLabel: '',
        bytes: p.bytes,
        include: true,
      })))
      setStep('review')
    } catch (err) {
      setError(message(err))
      setStep('pick')
    }
  }

  const update = (i: number, patch: Partial<Draft>) =>
    setDrafts(drafts.map((d, j) => (j === i ? { ...d, ...patch } : d)))

  const chosen = drafts.filter((d) => d.include)
  const numbers = chosen.map((d) => d.number.trim().toUpperCase())
  const duplicates = new Set(numbers.filter((n, i) => n && numbers.indexOf(n) !== i))
  const missing = chosen.some((d) => !d.number.trim())

  async function save() {
    setStep('saving')
    setError(null)
    try {
      await saveIssuance(projectId, { kind, number, issuedOn }, chosen, (done, total) => setProgress(`${done} of ${total}`))
      onDone()
    } catch (err) {
      setError(message(err))
      setStep('review')
    }
  }

  return (
    <div className="card upload-panel">
      <div className="form three">
        <label>Issued as
          <select value={kind} onChange={(e) => setKind(e.target.value as IssuanceKind)}>
            {(Object.entries(ISSUANCE_LABELS) as [IssuanceKind, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>Number / name<input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Addendum 2, ASI-003…" /></label>
        <label>Issue date<input type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} /></label>
      </div>

      {step === 'pick' && (
        <label className="upload">
          <input type="file" accept="application/pdf" onChange={onFile} />
          Choose PDF (full set or just the revised sheets)
        </label>
      )}
      {step === 'splitting' && <p className="muted">Splitting pages and reading sheet numbers…</p>}

      {(step === 'review' || step === 'saving') && (
        <>
          <p className="small muted">
            Check each sheet number against the titleblock. Numbers already in the project become a new revision of that sheet;
            new numbers become new sheets. Untick pages to skip them (cover, blank pages).
          </p>
          <table>
            <thead><tr><th /><th>Page</th><th>Sheet no.</th><th>Title (optional)</th><th>Rev. mark</th><th>Result</th><th /></tr></thead>
            <tbody>
              {drafts.map((d, i) => {
                const n = d.number.trim().toUpperCase()
                return (
                  <tr key={d.pageIndex} className={d.include ? '' : 'skipped'}>
                    <td><input type="checkbox" checked={d.include} onChange={(e) => update(i, { include: e.target.checked })} /></td>
                    <td>{d.pageIndex + 1}</td>
                    <td><input className={`cell mono ${d.include && (!n || duplicates.has(n)) ? 'bad' : ''}`} value={d.number} onChange={(e) => update(i, { number: e.target.value })} placeholder="A-201" /></td>
                    <td><input className="cell" value={d.title} onChange={(e) => update(i, { title: e.target.value })} /></td>
                    <td><input className="cell short" value={d.revisionLabel} onChange={(e) => update(i, { revisionLabel: e.target.value })} placeholder="1" /></td>
                    <td className="small">{!d.include ? 'skip' : !n ? <span className="bad-text">needs number</span> : duplicates.has(n) ? <span className="bad-text">duplicate</span> : existingNumbers.has(n) ? 'new revision' : 'new sheet'}</td>
                    <td className="right"><button onClick={() => window.open(URL.createObjectURL(new Blob([d.bytes as BlobPart], { type: 'application/pdf' })), '_blank')}>View</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="actions">
            <button className="primary" onClick={save} disabled={step === 'saving' || missing || duplicates.size > 0 || chosen.length === 0}>
              {step === 'saving' ? `Saving ${progress}…` : `Save ${chosen.length} sheets`}
            </button>
            <button onClick={onCancel} disabled={step === 'saving'}>Cancel</button>
          </div>
        </>
      )}
      {step === 'pick' && <button className="link" onClick={onCancel}>Cancel</button>}
      {error && <div className="notice error">{error}</div>}
    </div>
  )
}

function issuanceText(kind: IssuanceKind, number: string | null) {
  return number ? `${ISSUANCE_LABELS[kind]} · ${number}` : ISSUANCE_LABELS[kind]
}

function message(e: unknown) {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return String(e)
}
