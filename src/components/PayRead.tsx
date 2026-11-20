import { useRef, useState } from 'react'
import { message } from '../lib/errors'
import { money } from '../lib/money'
import { readPayLines, type Known, type ReadRow } from '../lib/payRead'
import type { Billed } from '../lib/payapps'

/**
 * This period's figures, read from the contractor's own application.
 *
 * The PDF — printed or scanned — is read on this computer and each of its rows is matched to a
 * line of the schedule of values. What its arithmetic bears out is filled in plainly; what it
 * does not is filled in red with the reason, and nothing is kept until it has been looked over.
 */
export function PayRead({ known, current, onKeep }: {
  known: (Known & { heading?: boolean })[]
  /** What the application holds now, so a row the PDF does not have is left as it is. */
  current: (id: string) => Billed
  onKeep: (rows: { id: string; value: Billed }[]) => Promise<void>
}) {
  const file = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<ReadRow[] | null>(null)
  const [edits, setEdits] = useState<Record<string, { e: string; f: string }>>({})
  const [seen, setSeen] = useState<Set<string>>(new Set())
  const [over, setOver] = useState(false)

  async function read(f: File | undefined | null) {
    if (!f) return
    setError(null); setBusy('Opening…')
    try {
      const { scheduleText } = await import('../lib/pdf/scheduleText')
      const text = await scheduleText(new Uint8Array(await f.arrayBuffer()), (p) =>
        setBusy(p.reading ? `Reading page ${p.page} of ${p.pages} from the scan…` : `Reading page ${p.page} of ${p.pages}…`))
      const lines = text.lines.map((l) => (typeof l === 'string' ? l : [l.no, l.text].filter(Boolean).join(' ')))
      const out = readPayLines(lines, known.filter((k) => !k.heading))
      if (!out.found) { setError('None of this PDF’s rows could be matched to the schedule of values. Is it this contract’s application?'); return }
      setRows(out.rows); setEdits({}); setSeen(new Set())
    } catch (e) { setError(message(e)) } finally { setBusy(null); if (file.current) file.current.value = '' }
  }

  const byId = new Map(rows?.map((r) => [r.id, r]))
  const val = (r: ReadRow) => edits[r.id] ?? { e: r.this_period ? String(r.this_period) : '', f: r.stored ? String(r.stored) : '' }
  const red = (r: ReadRow) => !!r.unsure && !seen.has(r.id)
  const unsure = rows?.filter(red).length ?? 0
  const lines = known.filter((k) => !k.heading)

  async function keep() {
    if (!rows) return
    setBusy('Keeping…')
    try {
      await onKeep(rows.filter((r) => r.found).map((r) => {
        const v = val(r)
        return { id: r.id, value: { this_period: Number(v.e.replace(/[$,\s]/g, '')) || 0, stored: Number(v.f.replace(/[$,\s]/g, '')) || 0 } }
      }))
      setRows(null)
    } catch (e) { setError(message(e)) } finally { setBusy(null) }
  }

  return (
    <>
      <div className={`drop-spot pay-read-drop${over ? ' over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void read(e.dataTransfer.files?.[0]) }}>
        <button className="link" disabled={!!busy} onClick={() => file.current?.click()}>
          {busy ?? 'Read this period from the contractor’s PDF'}
        </button>
        {!busy && <span className="muted small"> — or drop it here. Printed or scanned.</span>}
        <input ref={file} type="file" accept="application/pdf" hidden onChange={(e) => void read(e.target.files?.[0])} />
      </div>
      {error && <div className="notice error" onClick={() => setError(null)}>{error}</div>}

      {rows && (
        <div className="take-ask pay-read" role="dialog" aria-label="What was read from the PDF">
          <div className="take-card pay-read-card">
            <h3>Read from the PDF</h3>
            <p className="muted small">
              {rows.filter((r) => r.found).length} of {lines.length} lines found.
              {unsure > 0
                ? <> <strong className="pay-read-warn">{unsure} in red</strong> — the row’s own figures did not bear the reading out. Click into one to accept or correct it.</>
                : ' Every row’s figures add up.'}
              {' '}Lines the PDF does not have are left as they are.
            </p>
            <div className="pay-read-table">
              <table>
                <thead><tr><th>Item</th><th>Description</th><th className="right">From previous</th><th className="right">This period</th><th className="right">Stored</th></tr></thead>
                <tbody>
                  {lines.map((k) => {
                    const r = byId.get(k.id)
                    if (!r?.found) {
                      const c = current(k.id)
                      return (
                        <tr key={k.id} className="pay-read-missing">
                          <td className="mono">{k.item_no ?? ''}</td><td>{k.description}<div className="muted small">not found on the PDF — left as it is</div></td>
                          <td className="right mono">{money(k.previous)}</td><td className="right mono">{money(c.this_period)}</td><td className="right mono">{money(c.stored)}</td>
                        </tr>
                      )
                    }
                    const v = val(r), bad = red(r)
                    const touch = () => setSeen((s) => new Set(s).add(r.id))
                    return (
                      <tr key={k.id} className={bad ? 'pay-read-unsure' : ''}>
                        <td className="mono">{k.item_no ?? ''}</td>
                        <td>{k.description}{r.unsure && <div className={`small ${bad ? 'pay-read-warn' : 'muted'}`}>{r.unsure}</div>}{bad && r.from && <div className="muted small pay-read-from">PDF: {r.from}</div>}</td>
                        <td className="right mono">{money(k.previous)}</td>
                        <td className="right"><input className="cell mono right" inputMode="decimal" value={v.e} onFocus={touch} aria-label={`This period for ${k.description}`}
                          onChange={(e) => setEdits((x) => ({ ...x, [r.id]: { ...v, e: e.target.value } }))} /></td>
                        <td className="right"><input className="cell mono right" inputMode="decimal" value={v.f} onFocus={touch} aria-label={`Stored for ${k.description}`}
                          onChange={(e) => setEdits((x) => ({ ...x, [r.id]: { ...v, f: e.target.value } }))} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="actions">
              <button className="primary" disabled={!!busy} onClick={() => void keep()}>{busy ?? 'Put these in the application'}</button>
              <button className="link" onClick={() => setRows(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
