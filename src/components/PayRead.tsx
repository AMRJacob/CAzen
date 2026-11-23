import { useEffect, useRef, useState } from 'react'
import { message } from '../lib/errors'
import { money } from '../lib/money'
import { MoneyInput } from './MoneyInput'
import { matchTable, readPayLines, type Extra, type Known, type MatchRead, type ReadRow } from '../lib/payRead'
import type { Billed } from '../lib/payapps'

/**
 * This period's figures, read from the contractor's own application.
 *
 * The PDF — printed or scanned — is read on this computer and each of its rows is matched to a
 * line of the schedule of values. What its arithmetic bears out is filled in plainly; what it
 * does not is filled in red with the reason, and nothing is kept until it has been looked over.
 */
export function PayRead({ known, current, onKeep, onAddLines, number, start, onStarted }: {
  /** Add lines the PDF has to the schedule of values; returns their ids, in the same order. */
  onAddLines?: (lines: { item_no: string | null; description: string; scheduled_value: number }[]) => Promise<string[]>
  known: (Known & { heading?: boolean })[]
  /** A PDF chosen while starting the application, to be read as soon as the application is open. */
  start?: File | null
  onStarted?: () => void
  /** This application's number, to say so if the PDF is a different one. */
  number?: number
  /** What the application holds now, so a row the PDF does not have is left as it is. */
  current: (id: string) => Billed
  onKeep: (rows: { id: string; value: Billed }[]) => Promise<void>
}) {
  const file = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<ReadRow[] | null>(null)
  const [checks, setChecks] = useState<Omit<MatchRead, 'rows'> | null>(null)
  const [edits, setEdits] = useState<Record<string, { e: string; f: string }>>({})
  const [seen, setSeen] = useState<Set<string>>(new Set())
  const [over, setOver] = useState(false)
  /** The full drop zone, opened by clicking the strip. */
  const [open, setOpen] = useState(false)
  /** Lines on the PDF that are not in the schedule of values, and which of them to add. */
  const [extra, setExtra] = useState<Extra[]>([])
  const [adds, setAdds] = useState<Set<number>>(new Set())

  async function read(f: File | undefined | null) {
    if (!f) return
    setError(null); setBusy('Opening…')
    try {
      const sov = known.filter((k) => !k.heading)
      const bytes = new Uint8Array(await f.arrayBuffer())
      const progress = (p: { page: number; pages: number; reading: boolean }) =>
        setBusy(p.reading ? `Reading page ${p.page} of ${p.pages} from the scan…` : `Reading page ${p.page} of ${p.pages}…`)
      // The continuation sheet as a table, by its columns, line numbers and grand total.
      const { payText } = await import('../lib/pdf/payText')
      const t = await payText(bytes, progress)
      let out: { rows: ReadRow[]; found: number } | null = null
      if (t.table.pages) {
        const m = matchTable(t.table, sov)
        if (m.found || (onAddLines && m.extra.length)) { out = m; const { rows: _rows, ...rest } = m; void _rows; setChecks(rest) }
      }
      // A sheet whose columns could not be made out is read a line at a time, as before.
      if (!out) {
        const { scheduleText } = await import('../lib/pdf/scheduleText')
        const text = await scheduleText(bytes, progress)
        out = readPayLines(text.lines.map((l) => (typeof l === 'string' ? l : [l.no, l.text].filter(Boolean).join(' '))), sov)
        setChecks(null)
      }
      const more = out && 'extra' in out ? (out as MatchRead).extra : []
      if (!out.found && !(onAddLines && more.length)) { setError('None of this PDF’s rows could be matched to the schedule of values. Is it this contract’s application?'); return }
      // A contract with no schedule of values yet takes the PDF's lines as its schedule of values.
      setExtra(onAddLines ? more : [])
      setAdds(new Set(sov.length ? [] : more.map((_, i) => i)))
      setRows(out.rows); setEdits({}); setSeen(new Set()); setOpen(false)
    } catch (e) { setError(message(e)) } finally { setBusy(null); if (file.current) file.current.value = '' }
  }

  // Read once per file, however often the effect runs.
  const started = useRef<File | null>(null)
  useEffect(() => {
    if (!start || started.current === start) return
    started.current = start
    onStarted?.()
    void read(start)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start])

  const byId = new Map(rows?.map((r) => [r.id, r]))
  const val = (r: ReadRow) => edits[r.id] ?? { e: r.this_period ? String(r.this_period) : '', f: r.stored ? String(r.stored) : '' }
  const red = (r: ReadRow) => !!r.unsure && !seen.has(r.id)
  const unsure = rows?.filter(red).length ?? 0
  const lines = known.filter((k) => !k.heading)

  const num = (t: string) => Number(t.replace(/[$,\s]/g, '')) || 0
  const xval = (x: Extra, i: number) => edits[`x${i}`] ?? { e: x.this_period ? String(x.this_period) : '', f: x.stored ? String(x.stored) : '' }

  async function keep() {
    if (!rows) return
    setBusy('Keeping…')
    try {
      const chosen = extra.map((x, i) => [x, i] as const).filter(([, i]) => adds.has(i))
      const ids = chosen.length && onAddLines
        ? await onAddLines(chosen.map(([x]) => ({ item_no: x.item, description: x.name, scheduled_value: x.scheduled })))
        : []
      await onKeep([
        ...rows.filter((r) => r.found).map((r) => {
          const v = val(r)
          return { id: r.id, value: { this_period: num(v.e), stored: num(v.f) } }
        }),
        ...chosen.map(([x, i], k) => ({ id: ids[k], value: { this_period: num(xval(x, i).e), stored: num(xval(x, i).f) } })),
      ])
      setRows(null); setChecks(null); setExtra([])
    } catch (e) { setError(message(e)) } finally { setBusy(null) }
  }

  return (
    <>
      {!open && (
        <div className={`drop-spot pay-read-drop${over ? ' over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); void read(e.dataTransfer.files?.[0]) }}>
          <button className="link" disabled={!!busy} onClick={() => setOpen(true)}>
            {busy ?? (known.some((k) => !k.heading) ? 'Read this period from the contractor’s PDF' : 'Read the schedule of values and this period from the contractor’s PDF')}
          </button>
          {!busy && <span className="muted small"> — or drop it here. Printed or scanned.</span>}
        </div>
      )}
      {open && (
        <div className="pay-read-open">
          <div className={`drop-spot${over ? ' over' : ''}${busy ? ' busy' : ''}`}
            role="button" tabIndex={0} aria-label="Drop the contractor’s application PDF here, or choose it"
            onClick={() => { if (!busy) file.current?.click() }}
            onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !busy) { e.preventDefault(); file.current?.click() } }}
            onDragOver={(e) => { e.preventDefault(); if (!busy) setOver(true) }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault(); setOver(false)
              if (busy) return
              const f = Array.from(e.dataTransfer.files).find((x) => x.type === 'application/pdf' || /\.pdf$/i.test(x.name))
              if (f) void read(f)
              else setError('That isn’t a PDF. The application needs to be the PDF the contractor sent.')
            }}>
            {busy
              ? <span role="status">{busy}</span>
              : <><strong>Drop the contractor’s application PDF here</strong>
                <span className="muted small">or click to choose it — printed or scanned.{known.some((k) => !k.heading) ? '' : ' With no schedule of values on record yet, its lines are offered as the schedule of values.'}</span></>}
          </div>
          {!busy && <button className="link small" onClick={() => setOpen(false)}>Close</button>}
        </div>
      )}
      <input ref={file} className="pay-read-file" type="file" accept="application/pdf,.pdf" hidden onChange={(e) => void read(e.target.files?.[0])} />
      {error && <div className="notice error" onClick={() => setError(null)}>{error}</div>}

      {rows && (
        <div className="take-ask pay-read" role="dialog" aria-label="What was read from the PDF">
          <div className="take-card pay-read-card">
            <h3>Read from the PDF</h3>
            <p className="muted small">
              {!lines.length
                ? <>There is no schedule of values on record yet, so the PDF’s {extra.length} lines are set up as the schedule of values, with this period’s figures. Untick any that shouldn’t be.</>
                : <>{rows.filter((r) => r.found).length} of {lines.length} lines found.</>}
              {unsure > 0
                ? <> <strong className="pay-read-warn">{unsure} in red</strong> — the row’s own figures did not bear the reading out. Click into one to accept or correct it.</>
                : ' Every row’s figures add up.'}
              {lines.length > 0 && ' Lines the PDF does not have are left as they are.'}
            </p>
            {checks && <ReadChecks checks={checks} number={number} listed={extra.length > 0} />}
            <div className="pay-read-table">
              <table>
                <thead><tr>{extra.length > 0 && <th title="Add to the schedule of values">Add</th>}<th>Item</th><th>Description</th><th className="right">From previous</th><th className="right">This period</th><th className="right">Stored</th></tr></thead>
                <tbody>
                  {lines.map((k) => {
                    const r = byId.get(k.id)
                    if (!r?.found) {
                      const c = current(k.id)
                      return (
                        <tr key={k.id} className="pay-read-missing">
                          {extra.length > 0 && <td />}<td className="mono">{k.item_no ?? ''}</td><td>{k.description}<div className="muted small">not found on the PDF — left as it is</div></td>
                          <td className="right mono">{money(k.previous)}</td><td className="right mono">{money(c.this_period)}</td><td className="right mono">{money(c.stored)}</td>
                        </tr>
                      )
                    }
                    const v = val(r), bad = red(r)
                    const touch = () => setSeen((s) => new Set(s).add(r.id))
                    return (
                      <tr key={k.id} className={bad ? 'pay-read-unsure' : ''}>
                        {extra.length > 0 && <td />}<td className="mono">{k.item_no ?? ''}</td>
                        <td>{k.description}{r.unsure && <div className={`small ${bad ? 'pay-read-warn' : 'muted'}`}>{r.unsure}</div>}{r.note && <div className="small muted">{r.note}</div>}{bad && r.from && <div className="muted small pay-read-from">PDF: {r.from}</div>}</td>
                        <td className="right mono">{money(k.previous)}</td>
                        <td className="right"><MoneyInput className="cell mono right" value={v.e} onFocus={touch} aria-label={`This period for ${k.description}`}
                          onChange={(raw) => setEdits((x) => ({ ...x, [r.id]: { ...v, e: raw } }))} /></td>
                        <td className="right"><MoneyInput className="cell mono right" value={v.f} onFocus={touch} aria-label={`Stored for ${k.description}`}
                          onChange={(raw) => setEdits((x) => ({ ...x, [r.id]: { ...v, f: raw } }))} /></td>
                      </tr>
                    )
                  })}
                  {extra.map((x, i) => {
                    const v = xval(x, i), on = adds.has(i)
                    return (
                      <tr key={`x${i}`} className={`pay-read-new${on ? '' : ' off'}`}>
                        <td><input type="checkbox" checked={on} aria-label={`Add ${x.name} to the schedule of values`}
                          onChange={(e) => setAdds((a) => { const n = new Set(a); if (e.target.checked) n.add(i); else n.delete(i); return n })} /></td>
                        <td className="mono">{x.item ?? ''}</td>
                        <td>{x.name}
                          <div className="small muted">{lines.length ? 'not in the schedule of values — ' : ''}scheduled {money(x.scheduled)}</div>
                          {on && x.previous !== 0 && <div className="small pay-read-warn">“From previous” on the PDF is {money(x.previous)}; added here, the line starts with nothing billed before this application.</div>}
                        </td>
                        <td className="right mono">{money(x.previous)}</td>
                        <td className="right"><MoneyInput className="cell mono right" value={v.e} disabled={!on} aria-label={`This period for ${x.name}`}
                          onChange={(raw) => setEdits((y) => ({ ...y, [`x${i}`]: { ...v, e: raw } }))} /></td>
                        <td className="right"><MoneyInput className="cell mono right" value={v.f} disabled={!on} aria-label={`Stored for ${x.name}`}
                          onChange={(raw) => setEdits((y) => ({ ...y, [`x${i}`]: { ...v, f: raw } }))} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="actions">
              <button className="primary" disabled={!!busy} onClick={() => void keep()}>{busy ?? (adds.size ? `Add ${adds.size} ${adds.size === 1 ? 'line' : 'lines'} and put the figures in the application` : 'Put these in the application')}</button>
              <button className="link" onClick={() => { setRows(null); setChecks(null); setExtra([]) }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/** What the sheet's own checks said: the grand total, the run of line numbers, rows not on record. */
function ReadChecks({ checks, number, listed }: { checks: Omit<MatchRead, 'rows'>; number?: number; listed?: boolean }) {
  const agree = checks.totals.filter((t) => t.agree).length
  const items: { warn: boolean; text: string }[] = []
  if (checks.application && number != null && Number(checks.application) !== number)
    items.push({ warn: true, text: `The PDF says it is Application No. ${checks.application}; this is Application ${number}.` })
  if (checks.totals.length && agree === checks.totals.length)
    items.push({ warn: false, text: 'Every column adds up to the grand total printed on the PDF.' })
  else if (!checks.totals.length)
    items.push({ warn: false, text: 'No grand total was found on the PDF to check the columns against.' })
  for (const n of checks.totalNotes) items.push({ warn: true, text: n })
  if (checks.missing.length)
    items.push({ warn: true, text: `${checks.missing.length === 1 ? 'Line' : 'Lines'} ${checks.missing.join(', ')} should be on the PDF, by the run of the line numbers, and ${checks.missing.length === 1 ? 'was' : 'were'} not read.` })
  if (!listed) for (const x of checks.extra)
    items.push({ warn: true, text: `On the PDF and not in the schedule of values: ${[x.item, x.name].filter(Boolean).join(' ')} — scheduled ${money(x.scheduled)}${x.this_period ? `, ${money(x.this_period)} this period` : ''}${x.stored ? `, ${money(x.stored)} stored` : ''}.` })
  return (
    <ul className="pay-read-checks small">
      {items.map((i, k) => <li key={k} className={i.warn ? 'pay-read-warn' : 'pay-read-ok'}>{i.text}</li>)}
    </ul>
  )
}
