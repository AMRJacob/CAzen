import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { PdfStrip } from './PdfStrip'
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
export function PayRead({ known, current, onKeep, onAddLines, onSetScheduled, number, start, onStarted, periodTo, checkOnly, onHeadingsToLines }: {
  /** Headings in CAzen that carry figures on this PDF become line items. */
  onHeadingsToLines?: (ids: string[]) => Promise<void>
  /** A certified application: the PDF's scheduled values and the comparison are kept; what was billed isn't touched. */
  checkOnly?: boolean
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
  /** Put the PDF's scheduled values into the schedule of values, for lines where they differ. */
  onSetScheduled?: (changes: { id: string; scheduled_value: number }[]) => Promise<void>
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
  // Rows on the PDF that are headings in CAzen but carry figures here ("Balance of Work" before it
  // was broken out): they come in as line items, with their figures.
  const [headingHits, setHeadingHits] = useState<{ id: string; label: string; x: Extra }[]>([])
  const [adds, setAdds] = useState<Set<number>>(new Set())
  /** Lines to be added that are headings, though the PDF prints them like any other line. */
  const [heads, setHeads] = useState<Set<number>>(new Set())
  /** Lines to be added that are change order lines, and when the change order was approved. */
  const [cos, setCos] = useState<Set<number>>(new Set())
  const [coDate, setCoDate] = useState('')
  /** Where the PDF's scheduled values differ from the record: follow the PDF, or keep the record. Asked, not assumed. */
  const [svChoice, setSvChoice] = useState<'pdf' | 'keep' | null>(null)
  const [svOpen, setSvOpen] = useState(true)
  /** The contractor's PDF, shown beside the figures. */
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [zoom, setZoom] = useState(1)
  const [, setPage] = useState(1)
  const [goTo, setGoTo] = useState({ page: 1, ask: 0 })
  const [hereRow, setHereRow] = useState<string | null>(null)
  const show = (key: string, page?: number) => { setHereRow(key); if (page) setGoTo((g) => ({ page, ask: g.ask + 1 })) }
  useEffect(() => {
    if (!rows || !pdfBytes.current) return
    let live = true
    let task: { destroy: () => unknown; promise: Promise<PDFDocumentProxy> } | null = null
    import('../lib/pdf/pdfjs').then(({ getDocument }) => {
      if (!live) return
      task = getDocument({ data: pdfBytes.current!.slice() })
      return task.promise.then((d) => { if (live) setDoc(d) })
    }).catch(() => {})
    return () => { live = false; setDoc(null); void task?.destroy() }
  }, [rows])

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
      // The headings on record are left out of the matching (they carry no figures), so the PDF's
      // own heading rows come back unmatched; they are the same rows, not lines to add.
      const norm = (t: string | null | undefined) => (t ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^0+(?=\d)/, '')
      const headingsHere = known.filter((k) => k.heading)
      const hits: { id: string; label: string; x: Extra }[] = []
      for (let i = more.length - 1; i >= 0; i--) {
        const x = more[i]
        const h = headingsHere.find((h) => (h.item_no && x.item && norm(h.item_no) === norm(x.item)) || norm(h.description) === norm(x.name))
        if (!h) continue
        more.splice(i, 1)
        if (x.scheduled || x.previous || x.this_period || x.stored) hits.unshift({ id: h.id, label: [h.item_no, h.description].filter(Boolean).join(' '), x })
      }
      setHeadingHits(onHeadingsToLines ? hits : [])
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
      if (svChoice === 'pdf' && onSetScheduled) {
        const changes = rows.filter((r) => r.found && r.pdfScheduled != null).map((r) => ({ id: r.id, scheduled_value: r.pdfScheduled! }))
        if (changes.length) await onSetScheduled(changes)
      }
      if (headingHits.length && onHeadingsToLines) await onHeadingsToLines(headingHits.map((h) => h.id))
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
        ...headingHits.map((h) => ({ id: h.id, value: { this_period: h.x.this_period, stored: h.x.stored } })),
      ], checks ? {
        file: fileName, read_at: new Date().toISOString(),
        ...(checks.application ? { application: checks.application } : {}),
        ...(checks.periodTo ? { periodTo: checks.periodTo } : {}), ...(checks.appliedOn ? { appliedOn: checks.appliedOn } : {}),
        ...(checks.g702 ? { g702: checks.g702 } : {}),
        ...(checks.total ? { total: checks.total } : {}),
        lines: Object.fromEntries([
          ...rows.filter((r) => r.found && r.pdf).map((r) => [r.id, r.pdf!] as const),
          ...chosen.filter(([, i]) => !heads.has(i)).map(([x, i]) => [ids[chosen.findIndex(([, j]) => j === i)], x.pdf] as const),
          ...headingHits.map((h) => [h.id, h.x.pdf] as const),
        ]),
      } : null, pdfBytes.current)
      setRows(null); setChecks(null); setExtra([]); setHeadingHits([])
    } catch (e) { setError(message(e)) } finally { setBusy(null) }
  }

  return (
    <>
      {!open && (
        <div className={`drop-spot pay-read-drop${over ? ' over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); void read(e.dataTransfer.files?.[0]) }}>
          <button className="link" disabled={!!busy} onClick={() => setOpen(true)}>
            {busy ?? (checkOnly ? 'Read the contractor’s PDF to check this application' : known.some((k) => !k.heading) ? 'Read this period from the contractor’s PDF' : 'Read the schedule of values and this period from the contractor’s PDF')}
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

      {rows && (() => {
        const svRows = rows.filter((r) => r.found && r.pdfScheduled != null)
        const svNet = svRows.reduce((n, r) => n + r.pdfScheduled! - (known.find((k) => k.id === r.id)?.scheduled ?? 0), 0)
        const svWaiting = svRows.length > 0 && !!onSetScheduled && svChoice === null
        type As = 'skip' | 'line' | 'heading' | 'co'
        const asOf = (i: number): As => (!adds.has(i) ? 'skip' : heads.has(i) ? 'heading' : cos.has(i) ? 'co' : 'line')
        const setAs = (i: number, v: As) => {
          const put = (set: Set<number>, on: boolean) => { const n = new Set(set); if (on) n.add(i); else n.delete(i); return n }
          setAdds((x) => put(x, v !== 'skip')); setHeads((x) => put(x, v === 'heading')); setCos((x) => put(x, v === 'co'))
        }
        const coCount = [...cos].filter((i) => adds.has(i) && !heads.has(i)).length
        const close = () => { setRows(null); setChecks(null); setExtra([]); setSvChoice(null) }
        return (
          <div className="take-ask pay-read pay-read-full" role="dialog" aria-label="What was read from the PDF">
            <div className="pay-read-sheet">
              <div className="pay-read-pdf">
                {doc ? <PdfStrip pdf={doc} zoom={zoom} onZoom={setZoom} onPage={setPage} goTo={goTo} /> : <div className="muted small pay-read-pdf-wait">Opening the PDF…</div>}
              </div>
              <div className="pay-read-side">
                <div className="pay-read-top">
                  <h3>{number != null ? `Application ${number}` : 'The application'}, read from the PDF</h3>
                  <button className="link" onClick={close} aria-label="Cancel">×</button>
                </div>
                <p className="muted small pay-read-sum">
                  {!lines.length
                    ? <>No schedule of values on record yet: the PDF’s {extra.length} lines are offered as the schedule of values.</>
                    : <>{rows.filter((r) => r.found).length} of {lines.length} lines found.</>}
                  {unsure > 0 ? <> <strong className="pay-read-warn">{unsure} to check</strong>, in red — why is below.</> : ' Every row’s figures add up.'}
                  {' '}Click a line to see it on the PDF.
                </p>
                {unsure > 0 && (() => {
                  // The reasons counted together, so a pattern reads as one thing rather than many red rows.
                  const reds = rows.filter(red)
                  const of = (c: string) => reds.filter((x) => x.causes?.includes(c as never))
                  const prev = of('previous'), scan = of('scan'), numbering = of('numbering')
                  const pdfNo = checks?.application ? Number(checks.application) : null
                  const wrongApp = pdfNo != null && number != null && pdfNo !== number
                  const sumOf = (xs: ReadRow[], k: 'pdf' | 'ours') => xs.reduce((n, x) => n + (x.previous?.[k] ?? 0), 0)
                  return (
                    <ul className="pay-read-causes small">
                      {prev.length > 0 && (
                        <li>
                          <strong>{prev.length} {prev.length === 1 ? 'line' : 'lines'}: “from previous” is not what CAzen’s earlier applications billed.</strong>{' '}
                          {wrongApp
                            ? <>The PDF is Application No. {pdfNo} and this is Application {number}, so the PDF counts {pdfNo! > number! ? `${pdfNo! - number!} application${pdfNo! - number! === 1 ? '' : 's'} CAzen does not have yet` : 'fewer applications than CAzen'}.</>
                            : <>On these lines the PDF has {money(sumOf(prev, 'pdf'))} billed before this application and CAzen’s applications 1–{(number ?? 1) - 1} have {money(sumOf(prev, 'ours'))}. An earlier application in CAzen is missing figures or has different ones; the earlier applications’ “Against the contractor’s PDF” shows which.</>}
                        </li>
                      )}
                      {scan.length > 0 && <li><strong>{scan.length} {scan.length === 1 ? 'line' : 'lines'}: the scan could be read more than one way.</strong> The likeliest reading is filled in; the PDF is beside it to check.</li>}
                      {numbering.length > 0 && <li><strong>{numbering.length} {numbering.length === 1 ? 'line' : 'lines'}: the PDF’s line of that number has a different name.</strong> The PDF may be numbered differently from the schedule of values.</li>}
                    </ul>
                  )
                })()}
                <div className="pay-read-scroll">
                  {headingHits.length > 0 && (
                    <div className="pay-read-decide">
                      <strong>{headingHits.map((h) => h.label).join(', ')}</strong>
                      <span className="small"> {headingHits.length === 1 ? 'is a heading' : 'are headings'} in CAzen but {headingHits.length === 1 ? 'has' : 'have'} figures on this PDF ({headingHits.map((h) => money(h.x.scheduled)).join(', ')} scheduled), so {headingHits.length === 1 ? 'it comes' : 'they come'} in as {headingHits.length === 1 ? 'a line item' : 'line items'}. Each application’s value comes from its own PDF.</span>
                    </div>
                  )}
                  {checks && <ReadChecks checks={checks} number={number} listed={extra.length > 0} periodTo={periodTo} />}

                  {svRows.length > 0 && onSetScheduled && (
                    <div className={`pay-read-decide${svWaiting ? ' waiting' : ''}`}>
                      <strong>Scheduled values differ from the previous application on {svRows.length} {svRows.length === 1 ? 'line' : 'lines'}</strong>
                      <span className="muted small">
                        {Math.abs(svNet) < 0.005
                          ? ' — net $0: money moved between lines.'
                          : ` — net ${svNet > 0 ? '+' : '−'}${money(Math.abs(svNet))}, which changes the contract sum.`}
                        {' '}<button className="link small" onClick={() => setSvOpen((o) => !o)}>{svOpen ? 'hide them' : 'show them'}</button>
                      </span>
                      {svOpen && (
                        <table className="pay-read-sv small">
                          <thead><tr><th>Item</th><th>Description</th><th className="right">Carried</th><th></th><th className="right">PDF shows</th></tr></thead>
                          <tbody>
                            {svRows.map((r) => {
                              const k = known.find((x) => x.id === r.id)!
                              return (
                                <tr key={r.id} className={hereRow === r.id ? 'here' : ''} onClick={() => show(r.id, r.page)}>
                                  <td className="mono">{k.item_no ?? ''}</td><td>{k.description}</td>
                                  <td className="right mono">{money(k.scheduled)}</td><td>→</td><td className="right mono">{money(r.pdfScheduled!)}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      )}
                      <div className="pay-read-choose">
                        <button className={svChoice === 'pdf' ? 'on' : ''} onClick={() => setSvChoice('pdf')}>Use the PDF’s values on this application</button>
                        <button className={svChoice === 'keep' ? 'on' : ''} onClick={() => setSvChoice('keep')}>Keep the carried values</button>
                      </div>
                      <span className="muted small">{svChoice === 'pdf'
                        ? 'This application and the ones after it use the PDF’s values. Earlier applications keep theirs.'
                        : svChoice === 'keep' ? 'The lines show as differences from the PDF, and can be changed one at a time on the sheet.' : ''}</span>
                    </div>
                  )}

                  {extra.length > 0 && lines.length > 0 && (
                    <div className="pay-read-decide">
                      <strong>{extra.length} {extra.length === 1 ? 'line is' : 'lines are'} on the PDF and not in CAzen</strong>
                      <span className="muted small"> — choose how each comes in, at the foot of the list.</span>
                      <div className="pay-read-bulk small">
                        All of them as:{' '}
                        {(['line', 'co', 'heading', 'skip'] as As[]).map((v) => (
                          <button key={v} className="link small" onClick={() => extra.forEach((_, i) => setAs(i, v === 'line' || v === 'co' ? ((!extra[i].scheduled && !extra[i].this_period && !extra[i].previous && !extra[i].stored) ? 'heading' : v) : v))}>
                            {v === 'skip' ? 'not added' : v === 'co' ? 'change order lines' : v === 'heading' ? 'headings' : 'lines'}
                          </button>
                        ))}
                      </div>
                      {coCount > 0 && (
                        <p className="small pay-read-codate">
                          {coCount} change order {coCount === 1 ? 'line' : 'lines'}, approved on{' '}
                          <input type="date" value={coDate} onChange={(e) => setCoDate(e.target.value)} aria-label="Change order approved on" />
                          {periodTo && coDate !== periodTo && (
                            <button className="link small" onClick={() => setCoDate(periodTo)}>{` this period, ${periodTo.slice(5, 7)}/${periodTo.slice(8, 10)}/${periodTo.slice(0, 4)}`}</button>
                          )}
                          <span className="muted">{coDate ? '' : ' — left blank, it can be set on the change order’s heading later'}</span>
                        </p>
                      )}
                    </div>
                  )}

                  <table className="pay-read-list">
                    <thead><tr><th>Item</th><th>Description</th><th className="right">Scheduled (PDF)</th><th className="right">This period</th><th className="right">Stored</th></tr></thead>
                    <tbody>
                      {lines.map((k) => {
                        const r = byId.get(k.id)
                        if (!r?.found) {
                          const c = current(k.id)
                          return (
                            <tr key={k.id} className="pay-read-missing">
                              <td className="mono">{k.item_no ?? ''}</td><td>{k.description}<span className="muted small"> · not on the PDF, left as it is</span></td>
                              <td className="right mono muted">—</td>
                              <td className="right mono">{money(c.this_period)}</td><td className="right mono">{money(c.stored)}</td>
                            </tr>
                          )
                        }
                        const v = val(r), bad = red(r)
                        const touch = () => { setSeen((x) => new Set(x).add(r.id)); show(r.id, r.page) }
                        return (
                          <tr key={k.id} className={`${bad ? 'pay-read-unsure' : ''}${hereRow === r.id ? ' here' : ''}`} onClick={() => show(r.id, r.page)}>
                            <td className="mono">{k.item_no ?? ''}</td>
                            <td>{k.description}
                              {r.pdfScheduled != null && svChoice !== 'pdf' && <span className="tag pay-read-svtag" title={`Scheduled value: ${money(k.scheduled)} in CAzen, ${money(r.pdfScheduled)} on the PDF`}>SV</span>}
                              {r.unsure && (bad || hereRow === r.id) && <div className={`small ${bad ? 'pay-read-warn' : 'muted'}`}>{r.unsure}</div>}
                              {hereRow === r.id && r.pdf && (
                                <dl className="pay-read-pdfline small">
                                  {([['C', 'Scheduled'], ['D', 'From previous'], ['E', 'This period'], ['F', 'Stored'], ['G', 'Completed'], ['H', 'Balance']] as const).map(([c, label]) => (
                                    <div key={c} className={c === 'D' && r.previous ? 'off' : ''}><dt>{label}</dt><dd className="mono">{r.pdf![c] == null ? '—' : money(r.pdf![c]!)}</dd></div>
                                  ))}
                                </dl>
                              )}
                            </td>
                            <td className="right mono">{money(r.pdf?.C ?? r.pdfScheduled ?? k.scheduled)}</td>
                            <td className="right"><MoneyInput className="cell mono right" value={v.e} onFocus={touch} aria-label={`This period for ${k.description}`}
                              onChange={(raw) => setEdits((x) => ({ ...x, [r.id]: { ...v, e: raw } }))} /></td>
                            <td className="right"><MoneyInput className="cell mono right" value={v.f} onFocus={touch} aria-label={`Stored for ${k.description}`}
                              onChange={(raw) => setEdits((x) => ({ ...x, [r.id]: { ...v, f: raw } }))} /></td>
                          </tr>
                        )
                      })}
                      {extra.length > 0 && lines.length > 0 && <tr className="pay-read-sep"><td colSpan={5}>On the PDF, not in CAzen</td></tr>}
                      {extra.map((x, i) => {
                        const v = xval(x, i), as = asOf(i), on = as !== 'skip', head = as === 'heading'
                        return (
                          <tr key={`x${i}`} className={`pay-read-new${on ? '' : ' off'}${head ? ' heading' : ''}${hereRow === `x${i}` ? ' here' : ''}`} onClick={() => show(`x${i}`, x.page)}>
                            <td className="mono">{x.item ?? ''}</td>
                            <td>
                              <div className="pay-read-newname">
                                {head ? <strong>{x.name}</strong> : x.name}
                                <select className="cell small" value={as} aria-label={`How ${x.name} comes in`} onClick={(e) => e.stopPropagation()} onChange={(e) => setAs(i, e.target.value as As)}>
                                  <option value="line">Add as a line</option>
                                  <option value="co">Add as a change order line</option>
                                  <option value="heading">Add as a heading</option>
                                  <option value="skip">Don’t add</option>
                                </select>
                              </div>
                              {!head && x.co && <div className="small muted">under {x.co}</div>}
                              {head && (x.scheduled || x.this_period || x.stored) ? <div className="small pay-read-warn">As a heading it carries no value: {money(x.scheduled)} scheduled is left out.</div> : null}
                              {on && !head && x.previous !== 0 && <div className="small pay-read-warn">From previous on the PDF is {money(x.previous)}; added here, nothing is billed on it before this application.</div>}
                            </td>
                            <td className="right mono">{head ? '—' : money(x.scheduled)}</td>
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
                <div className="actions pay-read-foot">
                  <button className="primary" disabled={!!busy || svWaiting} onClick={() => void keep()}>
                    {busy ?? (checkOnly ? 'Check this application against the PDF' : adds.size ? `Add ${adds.size} ${adds.size === 1 ? 'line' : 'lines'} and put the figures in` : 'Put these in the application')}
                  </button>
                  <button className="link" onClick={close}>Cancel</button>
                  {checkOnly && <span className="muted small">Certified: only its scheduled values come from the PDF; what was billed stays.</span>}
                  {svWaiting && <span className="small pay-read-warn">Choose what to do with the changed scheduled values first.</span>}
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </>
  )
}

/** What the sheet's own checks said: the grand total, the run of line numbers, rows not on record. */
function ReadChecks({ checks, number, listed, periodTo }: { checks: Omit<MatchRead, 'rows'>; number?: number; listed?: boolean; periodTo?: string }) {
  const agree = checks.totals.filter((t) => t.agree).length
  const items: { warn: boolean; text: string }[] = []
  const us = (d: string) => `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}`
  if (checks.periodTo && periodTo && checks.periodTo !== periodTo)
    items.push({ warn: false, text: `The PDF’s period runs to ${us(checks.periodTo)}${checks.appliedOn ? `, applied ${us(checks.appliedOn)}` : ''}; this application has ${us(periodTo)}, and takes the PDF’s dates when these figures are put in. Change orders count by these dates.` })
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
