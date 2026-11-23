import { useEffect, useMemo, useState } from 'react'
import { Money } from './Money'
import { MoneyInput } from './MoneyInput'
import { money as asMoney } from '../lib/money'
import { money as readMoney, readSov, sovTotal } from '../lib/sovPaste'
import { createContract } from '../lib/payappsDb'
import { message } from '../lib/errors'
import type { Project } from '../lib/types'

/**
 * Setting a contract up, which is the one thing a project's applications for payment wait on.
 *
 * The figures are four numbers off the agreement. The schedule of values is pasted, because it
 * already exists in the contractor's spreadsheet and nobody should type it twice — and what was
 * read out of the paste is shown, with its total set against the contract sum, before anything
 * is kept. A schedule that doesn't add up to the contract is the contractor's to correct, so the
 * difference is stated and not refused: the first application will say the same thing.
 */
export function ContractSetup({ project, onCreated, another, onCancel }: {
  project: Project
  onCreated: (id: string, name: string | null) => void
  /** A further contract on a project that has one: it needs a name to be told from the first. */
  another?: boolean
  onCancel?: () => void
}) {
  const [contractor, setContractor] = useState(another ? '' : project.contractor_name ?? '')
  const [name, setName] = useState('')
  const [sum, setSum] = useState('')
  const [work, setWork] = useState('5')
  const [stored, setStored] = useState('')
  const [pasted, setPasted] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const read = useMemo(() => readSov(pasted), [pasted])
  // Rows turned into headings, or back into lines, by hand: a heading can look like any other line.
  const [flipped, setFlipped] = useState<Set<number>>(new Set())
  useEffect(() => { setFlipped(new Set()) }, [pasted])
  const lines = useMemo(() => read.map((l, i) => (flipped.has(i) ? { ...l, is_heading: !l.is_heading } : l)), [read, flipped])
  const flip = (i: number) => setFlipped((f) => { const n = new Set(f); if (n.has(i)) n.delete(i); else n.add(i); return n })
  const total = sovTotal(lines)
  const counted = lines.filter((l) => !l.is_heading).length
  const typedSum = readMoney(sum)
  // With no sum typed, the schedule's own total is the contract sum: they are the same number.
  const contractSum = typedSum ?? total
  const off = typedSum !== null && counted > 0 ? Math.round((total - typedSum) * 100) / 100 : 0
  const pct = (v: string, fallback: number) => {
    const n = Number(v.replace('%', '').trim())
    return v.trim() && Number.isFinite(n) && n >= 0 && n <= 100 ? n : fallback
  }
  const ready = contractSum > 0 && !busy

  async function keep() {
    if (!ready) return
    setBusy(true)
    setError(null)
    try {
      const retainage = pct(work, 5)
      const named = name.trim() || null
      onCreated(await createContract(project.id, {
        contractor: contractor.trim() || null,
        name: named,
        original_sum: contractSum,
        retainage_work: retainage,
        // Stored material is held at the same rate as work unless the agreement says otherwise.
        retainage_stored: pct(stored, retainage),
      }, lines), named)
    } catch (e) { setError(message(e)) } finally { setBusy(false) }
  }

  return (
    <div className="card contract-setup">
      <h3>{another ? 'Add another contract' : 'Set up the contract'}</h3>
      <p className="muted small">
        {another
          ? 'A separate agreement on the same project — a second prime contractor, an owner-direct package. It has its own schedule of values, applications and retainage.'
          : 'Once, from the agreement. Every application for payment after this carries it forward.'}
      </p>
      <div className="form four">
        {another && (
          <label className="wide-2">What to call it
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sitework package" autoFocus />
          </label>
        )}
        <label className="wide-2">Contractor
          <input value={contractor} onChange={(e) => setContractor(e.target.value)} />
        </label>
        <label>Original contract sum
          <MoneyInput value={sum} onChange={setSum}
            placeholder={counted ? asMoney(total) : '$0.00'} />
        </label>
        <label>Retainage, %
          <input inputMode="decimal" value={work} onChange={(e) => setWork(e.target.value)} />
        </label>
        <label>On stored material, %
          <input inputMode="decimal" value={stored} onChange={(e) => setStored(e.target.value)}
            placeholder={`${pct(work, 5)} — same as work`} />
        </label>
      </div>

      <label className="stack">Schedule of values
        <textarea rows={8} className="mono-ish" value={pasted} onChange={(e) => setPasted(e.target.value)}
          placeholder={'Paste it from the contractor’s spreadsheet or G703 — item, description, scheduled value:\n\n1\tGeneral conditions\t125,000.00\n2\tSitework\t88,450.00'} />
      </label>

      {lines.length > 0 && (
        <>
          <p className="small">
            Read {counted} {counted === 1 ? 'line' : 'lines'}
            {lines.length > counted ? ` and ${lines.length - counted} ${lines.length - counted === 1 ? 'heading' : 'headings'}` : ''},
            totalling <strong>{asMoney(total)}</strong>.
            {off !== 0 && (
              <span className="bad-text"> That is {asMoney(Math.abs(off))} {off > 0 ? 'more' : 'less'} than the contract sum.</span>
            )}
            {off === 0 && typedSum !== null && counted > 0 && <span className="ok-text"> It matches the contract sum.</span>}
          </p>
          <div className="sov-preview">
            <table>
              <thead><tr><th title="A heading groups the lines under it and carries no value">Heading</th><th>Item</th><th>Description of work</th><th className="right">Scheduled value</th></tr></thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className={l.is_heading ? 'sov-heading' : ''}>
                    <td><input type="checkbox" checked={l.is_heading} onChange={() => flip(i)} aria-label={`${l.description} is a heading`} /></td>
                    <td className="mono">{l.item_no ?? ''}</td>
                    <td>{l.description}</td>
                    <td className="right">{l.is_heading ? (l.scheduled_value ? <span className="muted small" title="A heading carries no value, so this is left out of the total">{asMoney(l.scheduled_value)} left out</span> : '') : <Money n={l.scheduled_value} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="actions">
        <button className="primary" disabled={!ready || (another && !name.trim())} onClick={() => void keep()}>
          {busy ? 'Setting up…' : another ? 'Add the contract' : 'Set up the contract'}
        </button>
        {onCancel && <button className="link" onClick={onCancel}>Cancel</button>}
        {!lines.length && <span className="muted small">The schedule can also be added a line at a time afterwards.</span>}
      </div>
      {error && <div className="notice error">{error}</div>}
    </div>
  )
}
