import { useMemo, useRef, useState } from 'react'
import { readSchedule, suggestLines, type ReadActivity } from '../lib/scheduleRead'
import { message } from '../lib/errors'
import type { Activity } from '../lib/schedule'

/**
 * The contractor's schedule, brought in from the PDF they sent.
 *
 * It is read, shown, and only then kept. Every row can be corrected or left out first, because
 * a scan is read imperfectly and a schedule holds rows nobody wants (the legend, the page
 * footer, a milestone that isn't one). A row whose name is already in the schedule updates that
 * activity's dates and progress instead of adding a second one — a contractor issues the same
 * schedule again every month, and what each activity was tied to should survive that.
 */

interface SovLine { id: string; item_no: string | null; description: string; is_heading: boolean }
interface Row extends ReadActivity { keep: boolean; lines: string[] }

export interface ImportResult {
  /** Everything read and kept this time, for the record of what this issue changed. */
  issue: { label: string | null; issued_on: string; rows: ReadActivity[] }
  add: (ReadActivity & { lines: string[] })[]
  update: { id: string; patch: Pick<Activity, 'starts_on' | 'ends_on' | 'percent'> }[]
}

const same = (a: string, b: string) => a.trim().toLowerCase().replace(/\s+/g, ' ') === b.trim().toLowerCase().replace(/\s+/g, ' ')

export function ScheduleImport({ existing, lines, onKeep, onDone }: {
  existing: Activity[]
  lines: SovLine[] | null
  onKeep: (r: ImportResult) => Promise<void>
  onDone: () => void
}) {
  const file = useRef<HTMLInputElement | null>(null)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [pasted, setPasted] = useState('')
  const [progress, setProgress] = useState<string | null>(null)
  const [scanned, setScanned] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const [issuedOn, setIssuedOn] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })
  const [issueName, setIssueName] = useState('')

  const label = useMemo(() => {
    const by = new Map((lines ?? []).map((l) => [l.id, `${l.item_no ? `${l.item_no} · ` : ''}${l.description}`]))
    return (id: string) => by.get(id) ?? ''
  }, [lines])

  function show(read: ReadActivity[]) {
    setRows(read.map((a) => ({
      ...a, keep: true,
      // A tie is suggested only for a new activity; one being updated keeps the ties it has.
      lines: a.is_heading || !lines || existing.some((e) => same(e.name, a.name)) ? [] : suggestLines(a.name, lines),
    })))
    if (!read.length) setError('No activities could be read from that — a line needs a name and at least one date with its year.')
  }

  async function open(f: File | undefined) {
    if (!f) return
    setError(null); setRows(null); setScanned(0)
    setProgress('Opening…')
    try {
      const { scheduleText } = await import('../lib/pdf/scheduleText')
      const text = await scheduleText(new Uint8Array(await f.arrayBuffer()), (p) =>
        setProgress(p.reading
          ? p.rows ? `Page ${p.page} of ${p.pages}: reading line ${p.row} of ${p.rows} by its number…`
            : `Reading page ${p.page} of ${p.pages} from the scan — finding the line numbers…`
          : `Reading page ${p.page} of ${p.pages}…`))
      setScanned(text.scanned)
      show(readSchedule(text.lines, { scanned: text.scanned > 0 }))
    } catch (e) { setError(message(e)) } finally {
      setProgress(null)
      if (file.current) file.current.value = ''
    }
  }

  const change = (i: number, patch: Partial<Row>) =>
    setRows((all) => (all ?? []).map((r, n) => (n === i ? { ...r, ...patch } : r)))

  const kept = (rows ?? []).filter((r) => r.keep && r.name.trim())
  const updating = (r: Row): Activity | undefined =>
    r.is_heading ? undefined : existing.find((e) => !e.is_heading && same(e.name, r.name))
  const news = kept.filter((r) => !updating(r) && !(r.is_heading && existing.some((e) => e.is_heading && same(e.name, r.name))))
  const updates = kept.filter((r) => updating(r))

  async function keep() {
    setBusy(true); setError(null)
    try {
      await onKeep({
        issue: { label: issueName.trim() || null, issued_on: issuedOn, rows: kept.map(({ keep: _k, lines: _l, ...r }) => ({ ...r, name: r.name.trim() })) },
        add: news.map(({ keep: _k, ...r }) => ({ ...r, name: r.name.trim() })),
        update: updates.map((r) => ({ id: updating(r)!.id, patch: { starts_on: r.starts_on, ends_on: r.ends_on, percent: r.percent } })),
      })
      onDone()
    } catch (e) { setError(message(e)) } finally { setBusy(false) }
  }

  return (
    <div className="card sched-import">
      <div className="pad-head">
        <h3>From the contractor’s schedule</h3>
        <button className="link" onClick={onDone}>Close</button>
      </div>

      {!rows && (
        <>
          <p className="muted small">
            Choose the PDF they sent — printed from their scheduling program or scanned from paper.
            It is read on this computer and nothing is added until you have looked it over.
          </p>
          {/* Dragged from a folder or out of an email, or chosen: either way it lands here. */}
          <div className={`drop-spot${over ? ' over' : ''}${progress ? ' busy' : ''}`}
            role="button" tabIndex={0} aria-label="Drop the schedule PDF here, or choose it"
            onClick={() => { if (!progress) file.current?.click() }}
            onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !progress) { e.preventDefault(); file.current?.click() } }}
            onDragOver={(e) => { e.preventDefault(); if (!progress) setOver(true) }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault(); setOver(false)
              if (progress) return
              const dropped = Array.from(e.dataTransfer.files).find((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name))
              if (dropped) void open(dropped)
              else setError('That isn’t a PDF. The schedule needs to be the PDF the contractor sent.')
            }}>
            {progress
              ? <span role="status">{progress}</span>
              : <><strong>Drop the schedule PDF here</strong><span className="muted small">or click to choose it</span></>}
          </div>
          <input ref={file} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => void open(e.target.files?.[0])} />
          <label className="stack sched-paste">Or paste the rows
            <textarea rows={4} className="mono-ish" value={pasted} onChange={(e) => setPasted(e.target.value)}
              placeholder={'A1000  Mobilization  5  05-Jan-26  09-Jan-26\nA1010  Sitework  10  12-Jan-26  23-Jan-26'} />
          </label>
          {pasted.trim() && <button onClick={() => { setError(null); show(readSchedule(pasted.split(/\r?\n/))) }}>Read what was pasted</button>}
        </>
      )}

      {rows && rows.length > 0 && (
        <>
          <p className="small">
            Read {rows.filter((r) => !r.is_heading).length} activities
            {rows.some((r) => r.is_heading) ? ` and ${rows.filter((r) => r.is_heading).length} headings` : ''}.
            {scanned > 0 && (
              <strong> {scanned === 1 ? 'A page was' : `${scanned} pages were`} read from a scan — check the dates against the page before keeping them.</strong>
            )}
          </p>
          <div className="sov-preview sched-read">
            <table>
              <thead><tr><th /><th className="right" title="The line number printed on the schedule">Line</th><th>Activity</th><th>Starts</th><th>Ends</th><th>Covers</th><th /></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={`${r.is_heading ? 'sov-heading' : ''}${r.keep ? '' : ' sched-left-out'}`}>
                    <td><input type="checkbox" checked={r.keep} aria-label={`Keep ${r.name}`} onChange={(e) => change(i, { keep: e.target.checked })} /></td>
                    <td className="right sched-no">{r.is_heading ? '' : r.no ?? ''}</td>
                    <td><input className="cell" value={r.name} aria-label="Activity name" onChange={(e) => change(i, { name: e.target.value })} /></td>
                    {r.is_heading ? <td colSpan={3} /> : (
                      <>
                        <td><input className="cell" type="date" value={r.starts_on ?? ''} aria-label="Starts" onChange={(e) => change(i, { starts_on: e.target.value || null })} /></td>
                        <td><input className="cell" type="date" value={r.ends_on ?? ''} aria-label="Ends" onChange={(e) => change(i, { ends_on: e.target.value || null })} /></td>
                        <td className="small">
                          {r.lines.map((id) => (
                            <span key={id} className="tag sched-tie">{label(id)}
                              <button className="link" aria-label={`Don’t tie to ${label(id)}`} onClick={() => change(i, { lines: r.lines.filter((x) => x !== id) })}>×</button>
                            </span>
                          ))}
                        </td>
                      </>
                    )}
                    <td className="small muted nowrap">{r.keep && updating(r) ? 'updates' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {lines && rows.some((r) => r.lines.length > 0) && (
            <p className="muted small">
              Under Covers is the line of the schedule of values each activity looks to belong to, going
              by its name. Take off any that are wrong; the rest can be tied afterwards.
            </p>
          )}
          {/* Which issue of the schedule this is: the history is kept by it. */}
          <div className="inline-form sched-issue">
            <label className="small">This issue is dated <input type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value || issuedOn)} /></label>
            <input value={issueName} onChange={(e) => setIssueName(e.target.value)} placeholder={existing.length ? 'What to call it, e.g. Update 3' : 'What to call it, e.g. Baseline'} aria-label="Name of this issue" />
          </div>
          <div className="actions">
            <button className="primary" disabled={busy || (!news.length && !updates.length)} onClick={() => void keep()}>
              {busy ? 'Keeping…' : [
                news.length ? `Add ${news.length}` : '',
                updates.length ? `${news.length ? 'and update' : 'Update'} ${updates.length}` : '',
              ].filter(Boolean).join(' ') || 'Nothing to keep'}
            </button>
            <button className="link" onClick={() => { setRows(null); setError(null) }}>Read a different one</button>
          </div>
        </>
      )}
      {rows && rows.length === 0 && (
        <div className="actions"><button onClick={() => { setRows(null); setError(null) }}>Try another</button></div>
      )}
      {error && <div className="notice error">{error}</div>}
    </div>
  )
}
