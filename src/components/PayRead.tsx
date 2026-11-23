import { useEffect, useRef, useState } from 'react'
import { message } from '../lib/errors'
import { money } from '../lib/money'
import { MoneyInput } from './MoneyInput'
import { matchTable, readPayLines, type Extra, type Known, type MatchRead, type ReadRow } from '../lib/payRead'
import type { Billed } from '../lib/payapps'
import type { PdfRead } from '../lib/payCompare'

/**
 * This period's figures, read from the contractor's own application.
 *
 * The PDF — printed or scanned — is read on this computer and each of its rows is matched to a
 * line of the schedule of values. What its arithmetic bears out is filled in plainly; what it
 * does not is filled in red with the reason, and nothing is kept until it has been looked over.
 */
export function PayRead({ known, current, onKeep, onAddLines, number, start, onStarted, periodTo }: {
  /** Add lines the PDF has to the schedule of values; returns their ids, in the same order. */
  onAddLines?: (lines: { item_no: string | null; description: string; scheduled_value: number; is_heading?: boolean; is_change_order?: boolean; approved_on?: string | null }[]) => Promise<string[]>
  /** The application's period, the default approval date of change order lines added from it. */
  periodTo?: string
  known: (Known & { heading?: boolean })[]
  /** A PDF chosen while starting the application, to be read as soon as the application is open. */
  start?: File | null
  onStarted?: () => void
  /** This application's number, to say so if the PDF is a different one. */
  number?: number
  /** What the application holds now, so a row the PDF does not have is left as it is. */
  current: (id: string) => Billed
  /** The figures to put in, and everything the PDF said, kept to set the arithmetic against. */
  onKeep: (rows: { id: string; value: Billed }[], pdf: PdfRead | null, bytes: Uint8Array | null) => Promise<void>
}) {
  const file = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<ReadRow[] | null>(null)
  const [checks, setChecks] = useState<Omit<MatchRead, 'rows'> | null>(null)
  const [edits, setEdits] = useState<Record<string, { e: string; f: string }>>({})
  const [seen, setSeen] = useState<Set<string>>(new Set())
  const [over, setOver] = useState(false)
  const [fileName, setFileName] = useState<string | undefined>()
  const pdfBytes = useRef<Uint8Array | null>(null)
  /** The full drop zone, opened by clicking the strip. */
  const [open, setOpen] = useState(false)
  /** Lines on the PDF that are not in the schedule of values, and which of them to add. */
  const [extra, setExtra] = useState<Extra[]>([])
  const [adds, setAdds] = useState<Set<number>>(new Set())
  /** Lines to be added that are headings, though the PDF prints them like any other line. */
  const [heads, setHeads] = useState<Set<number>>(new Set())
  /** Lines to be added that are change order lines, and when the change order was approved. */
  const [cos, setCos] = useState<Set<number>>(new Set())
  const [coDate, setCoDate] = useState('')

  async function read(f: File | undefined | null) {
    if (!f) return
    setError(null); setBusy('Opening…'); setFileName(f.name)
    try {
      const sov = known.filter((k) => !k.heading)
      const bytes = new Uint8Array(await f.arrayBuffer())
      pdfBytes.current = bytes.slice()
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
      // A row with no figures at all, among lines that have them, is taken for a heading to begin
      // with ("CO 1" over the change order's lines); untick it if it is a line yet to be billed.
      const bare = (x: Extra) => !x.scheduled && !x.previous && !x.this_period && !x.stored
      setCos(new Set(more.map((x, i) => [x, i] as const).filter(([x]) => x.co).map(([, i]) => i)))
      // The approval date is left for you to give; the application's period is offered beside it.
      setCoDate('')
      setHeads(new Set(more.map((x, i) => [x, i] as const)
        .filter(([x]) => bare(x) && (sov.length > 0 || /^(c\.?\s?o\.?|change\s*order)\s*#?\s*\d+$/i.test(x.name.trim())))
        .map(([, i]) => i)))
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
        ? await onAddLines(chosen.map(([x, i]) => ({ item_no: x.item, description: x.name, scheduled_value: heads.has(i) ? 0 : x.scheduled, ...(heads.has(i) ? { is_heading: true } : {}),
          ...(cos.has(i) && !heads.has(i) ? { is_change_order: true, approved_on: coDate || null } : {}) })))
        : []
      await onKeep([
        ...rows.filter((r) => r.found).map((r) => {
          const v = val(r)
          return { id: r.id, value: { this_period: num(v.e), stored: num(v.f) } }
        }),
        ...chosen.flatMap(([x, i], k) => (heads.has(i) ? [] : [{ id: ids[k], value: { this_period: num(xval(x, i).e), stored: num(xval(x, i).f) } }])),
      ], checks ? {
        file: fileName, read_at: new Date().toISOString(),
        ...(checks.application ? { application: checks.application } : {}),
        ...(checks.g702 ? { g702: checks.g702 } : {}),
        ...(checks.total ? { total: checks.total } : {}),
        lines: Object.fromEntries([
          ...rows.filter((r) => r.found && r.pdf).map((r) => [r.id, r.pdf!] as const),
          ...chosen.filter(([, i]) => !heads.has(i)).map(([x, i]) => [ids[chosen.findIndex(([, j]) => j === i)], x.pdf] as const),
        ]),
      } : null, pdfBytes.current)
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
                <thead><tr>{extra.length > 0 && (
                  <th title="Add to the schedule of values">
                    <label className="pay-read-all">
                      <input type="checkbox" checked={adds.size === extra.length}
                        ref={(el) => { if (el) el.indeterminate = adds.size > 0 && adds.size < extra.length }}
                        aria-label="Add every line the PDF has that is not in the schedule of values"
                        onChange={(e) => setAdds(e.target.checked ? new Set(extra.map((_, i) => i)) : new Set())} />
                      {' '}Add
                    </label>
                  </th>
                )}{extra.length > 0 && (
                  <th title="A line of a change order: counted in the change order summary">
                    <label className="pay-read-all">
                      <input type="checkbox" checked={extra.every((_, i) => !adds.has(i) || heads.has(i) || cos.has(i)) && cos.size > 0}
                        aria-label="Every line to be added is a change order line"
                        onChange={(e) => setCos(e.target.checked ? new Set(extra.map((_, i) => i).filter((i) => adds.has(i) && !heads.has(i))) : new Set())} />
                      {' '}CO
                    </label>
                  </th>
                )}<th>Item</th><th>Description</th><th className="right">From previous</th><th className="right">This period</th><th className="right">Stored</th></tr></thead>
                <tbody>
                  {lines.map((k) => {
                    const r = byId.get(k.id)
                    if (!r?.found) {
                      const c = current(k.id)
                      return (
                        <tr key={k.id} className="pay-read-missing">
                          {extra.length > 0 && <><td /><td /></>}<td className="mono">{k.item_no ?? ''}</td><td>{k.description}<div className="muted small">not found on the PDF — left as it is</div></td>
                          <td className="right mono">{money(k.previous)}</td><td className="right mono">{money(c.this_period)}</td><td className="right mono">{money(c.stored)}</td>
                        </tr>
                      )
                    }
                    const v = val(r), bad = red(r)
                    const touch = () => setSeen((s) => new Set(s).add(r.id))
                    return (
                      <tr key={k.id} className={bad ? 'pay-read-unsure' : ''}>
                        {extra.length > 0 && <><td /><td /></>}<td className="mono">{k.item_no ?? ''}</td>
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
                    const v = xval(x, i), on = adds.has(i), head = heads.has(i)
                    const figures = x.scheduled || x.previous || x.this_period || x.stored
                    return (
                      <tr key={`x${i}`} className={`pay-read-new${on ? '' : ' off'}${head ? ' heading' : ''}`}>
                        <td><input type="checkbox" checked={on} aria-label={`Add ${x.name} to the schedule of values`}
                          onChange={(e) => setAdds((a) => { const n = new Set(a); if (e.target.checked) n.add(i); else n.delete(i); return n })} /></td>
                        <td><input type="checkbox" checked={cos.has(i) && !head} disabled={!on || head} aria-label={`${x.name} is a change order line`}
                          onChange={(e) => setCos((c) => { const n = new Set(c); if (e.target.checked) n.add(i); else n.delete(i); return n })} /></td>
                        <td className="mono">{x.item ?? ''}</td>
                        <td>{head ? <strong>{x.name}</strong> : x.name}{cos.has(i) && !head && x.co ? <span className="tag pay-read-co">{x.co}</span> : null}
                          <label className="pay-read-head small">
                            <input type="checkbox" checked={head} disabled={!on}
                              onChange={(e) => setHeads((h) => { const n = new Set(h); if (e.target.checked) n.add(i); else n.delete(i); return n })} />
                            {' '}a heading
                          </label>
                          {!head && <div className="small muted">{lines.length ? 'not in the schedule of values — ' : ''}scheduled {money(x.scheduled)}</div>}
                          {head && figures ? <div className="small pay-read-warn">As a heading it carries no value: the {money(x.scheduled)} scheduled and anything billed on this row are left out.</div> : null}
                          {on && x.previous !== 0 && <div className="small pay-read-warn">“From previous” on the PDF is {money(x.previous)}; added here, the line starts with nothing billed before this application.</div>}
                        </td>
                        <td className="right mono">{money(x.previous)}</td>
                        <td className="right"><MoneyInput className="cell mono right" value={v.e} disabled={!on || head} aria-label={`This period for ${x.name}`}
                          onChange={(raw) => setEdits((y) => ({ ...y, [`x${i}`]: { ...v, e: raw } }))} /></td>
                        <td className="right"><MoneyInput className="cell mono right" value={v.f} disabled={!on || head} aria-label={`Stored for ${x.name}`}
                          onChange={(raw) => setEdits((y) => ({ ...y, [`x${i}`]: { ...v, f: raw } }))} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {[...cos].some((i) => adds.has(i) && !heads.has(i)) && (
              <p className="small pay-read-codate">
                {[...cos].filter((i) => adds.has(i) && !heads.has(i)).length} change order lines, approved on{' '}
                <input type="date" value={coDate} onChange={(e) => setCoDate(e.target.value)} aria-label="Change order approved on" />
                {periodTo && coDate !== periodTo && (
                  <button className="link small" onClick={() => setCoDate(periodTo)}>{` this period, ${periodTo.slice(5, 7)}/${periodTo.slice(8, 10)}/${periodTo.slice(0, 4)}`}</button>
                )}
                <span className="muted"> — the change order summary counts them in the month they were approved{coDate ? '' : '; with no date they count as approved before the applications'}.</span>
              </p>
            )}
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
