import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageTitle } from '../components/PageTitle'
import { useProject } from '../lib/project'
import { message } from '../lib/errors'
import { today } from '../lib/dates'
import { figure, money, percent, standings, type Billed, type Figures } from '../lib/payapps'
import {
  listContracts, loadContract, newApplication, setApplication, setBilled,
  type LoadedContract,
} from '../lib/payappsDb'

/**
 * Applications for payment.
 *
 * The first tab answers the question the form never quite does — what the contract is worth, how
 * much has gone out, what is left, and where it is left — and the rest are the applications
 * themselves, laid out as the G702 and G703 are laid out, because that is what gets signed.
 *
 * Nothing on screen is a figure somebody typed except the schedule of values and what was
 * billed this period. Everything else is worked out, which is the whole reason for not doing
 * this in a spreadsheet that gets retyped every month.
 */

export default function PayApps() {
  const { current } = useProject()
  const [contracts, setContracts] = useState<{ id: string; name: string | null }[] | null>(null)
  const [chosen, setChosen] = useState<string | null>(null)
  const [data, setData] = useState<LoadedContract | null>(null)
  const [tab, setTab] = useState<'summary' | string>('summary')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const projectId = current?.id
  useEffect(() => {
    if (!projectId) { setContracts([]); return }
    listContracts(projectId)
      .then((cs) => { setContracts(cs); setChosen((v) => v ?? cs[0]?.id ?? null) })
      .catch((e) => setError(message(e)))
  }, [projectId])

  const load = useCallback(() => {
    if (!chosen) { setData(null); return }
    loadContract(chosen).then(setData).catch((e) => setError(message(e)))
  }, [chosen])
  useEffect(() => { load() }, [load])

  /** Every application worked out, in order, so the summary and the tabs agree by construction. */
  const figured = useMemo(() => {
    if (!data) return []
    const history = data.applications.map((a) => ({ billed: data.billed.get(a.id) ?? new Map<string, Billed>() }))
    return data.applications.map((a, i) =>
      figure(data.contract, data.lines, a, history[i].billed, history.slice(0, i), data.steps))
  }, [data])

  const latest = figured.length ? figured[figured.length - 1] : null

  async function addApplication() {
    if (!data || busy) return
    setBusy(true)
    try {
      const next = (data.applications[data.applications.length - 1]?.number ?? 0) + 1
      const id = await newApplication(data.contract.id, next, today())
      load()
      setTab(id)
    } catch (e) { setError(message(e)) } finally { setBusy(false) }
  }

  if (!current) {
    return (
      <section>
        <PageTitle>Applications for payment</PageTitle>
        <div className="card muted">Choose a project first, on the <Link to="/">Projects</Link> page.</div>
      </section>
    )
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <PageTitle>Applications for payment</PageTitle>
          <p className="lead">
            {current.number} {current.name}
            {data?.contract.contractor ? ` · ${data.contract.contractor}` : ''}
            {data ? ` · ${data.applications.length} ${data.applications.length === 1 ? 'application' : 'applications'}` : ''}
          </p>
        </div>
        {data && <button className="primary desk-only" onClick={() => void addApplication()} disabled={busy}>New application</button>}
      </div>

      {error && <div className="notice error">{error}</div>}

      {contracts?.length === 0 && (
        <div className="card muted">No contract set up for this project yet.</div>
      )}

      {contracts && contracts.length > 1 && (
        <div className="pay-contracts">
          {contracts.map((c) => (
            <button key={c.id} className={c.id === chosen ? 'on' : ''} onClick={() => { setChosen(c.id); setTab('summary') }}>
              {c.name ?? 'Contract'}
            </button>
          ))}
        </div>
      )}

      {data && (
        <>
          <div className="tabs pay-tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'summary'} className={tab === 'summary' ? 'on' : ''}
              onClick={() => setTab('summary')}>Summary</button>
            {data.applications.map((a) => (
              <button key={a.id} role="tab" aria-selected={tab === a.id} className={tab === a.id ? 'on' : ''}
                onClick={() => setTab(a.id)}>
                {a.number}
                {a.status === 'draft' && <span className="tag">draft</span>}
              </button>
            ))}
          </div>

          {tab === 'summary' && latest && <Summary data={data} figures={latest} all={figured} />}
          {tab !== 'summary' && (() => {
            const i = data.applications.findIndex((a) => a.id === tab)
            if (i < 0 || !figured[i]) return null
            return (
              <OneApplication
                data={data}
                index={i}
                figures={figured[i]}
                onChanged={load}
                onTrouble={setError}
              />
            )
          })()}
        </>
      )}
    </section>
  )
}

// ---------- Summary ----------

function Summary({ data, figures, all }: { data: LoadedContract; figures: Figures; all: Figures[] }) {
  const g = figures.g702
  const paid = g.earnedLessRetainage
  const rows = standings(figures)
    .filter((s) => s.scheduled > 0)
    .sort((a, b) => b.outstanding - a.outstanding)

  return (
    <>
      <div className="card pay-summary">
        <div className="pay-figures">
          <Figure label="Contract sum to date" value={money(g.contractSum)}
            note={g.changeOrders ? `${money(g.originalSum)} original + ${money(g.changeOrders)} in change orders` : 'no change orders'} />
          <Figure label="Paid to date" value={money(paid)} note={`${percent(figures.totals.percent)} of the contract completed`} />
          <Figure label="Left to pay" value={money(g.contractSum - paid)} note="including retainage still held" />
          <Figure label="Retainage held" value={money(g.retainageTotal)}
            note={`${figures.rates.work}% on work${figures.rates.steppedTo != null ? ` (stepped at ${figures.rates.steppedTo}% complete)` : ''}, ${figures.rates.stored}% on stored`} />
        </div>
        <div className="pay-bar" role="img" aria-label={`${percent(figures.totals.percent)} complete`}>
          <span style={{ width: `${Math.min(100, figures.totals.percent)}%` }} />
        </div>
        <p className="muted small">
          {all.length} {all.length === 1 ? 'application' : 'applications'} to date.
          Last certified {money(all[all.length - 1].g702.due)}.
        </p>
      </div>

      <div className="card">
        <h3>By trade</h3>
        <p className="muted small">
          What each line still stands to collect: the balance to finish plus everything held back on
          what is already done.
        </p>
        <table className="pay-trades">
          <thead><tr>
            <th>Item</th><th className="right">Scheduled</th><th className="right">Done</th>
            <th>Progress</th><th className="right">Balance</th><th className="right">Retainage held</th>
            <th className="right">Still owed</th>
          </tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.line.id}>
                <td>{s.line.item_no ? <span className="mono pay-item">{s.line.item_no}</span> : null}{s.line.description}</td>
                <td className="right mono">{money(s.scheduled)}</td>
                <td className="right mono">{money(s.toDate)}</td>
                <td className="pay-progress">
                  <span className="pay-bar small"><span style={{ width: `${Math.min(100, s.percent)}%` }} /></span>
                  <span className="muted small">{s.percent.toFixed(0)}%</span>
                </td>
                <td className="right mono">{money(s.balance)}</td>
                <td className="right mono">{money(s.retainageHeld)}</td>
                <td className="right mono"><strong>{money(s.outstanding)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card muted pay-schedule-slot">
        <strong>Against the schedule</strong> — not built yet. Comparing percent complete here against
        a construction schedule needs the schedule in the app and each activity mapped to a line
        above, since a schedule's activities and a schedule of values rarely line up one to one.
        {void data}
      </div>
    </>
  )
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="pay-figure">
      <span className="pay-figure-label">{label}</span>
      <strong className="pay-figure-value">{value}</strong>
      {note && <span className="muted small">{note}</span>}
    </div>
  )
}

// ---------- One application ----------

function OneApplication({ data, index, figures, onChanged, onTrouble }: {
  data: LoadedContract
  index: number
  figures: Figures
  onChanged: () => void
  onTrouble: (m: string) => void
}) {
  const app = data.applications[index]
  const editable = app.status === 'draft'
  const g = figures.g702
  const [edits, setEdits] = useState<Record<string, Billed>>({})

  useEffect(() => { setEdits({}) }, [app.id])

  const valueOf = (lineId: string): Billed =>
    edits[lineId] ?? data.billed.get(app.id)?.get(lineId) ?? { this_period: 0, stored: 0 }

  async function save(lineId: string, next: Billed) {
    setEdits((e) => ({ ...e, [lineId]: next }))
    try {
      await setBilled(app.id, lineId, next)
      onChanged()
    } catch (e) { onTrouble(message(e)) }
  }

  async function certify() {
    try {
      await setApplication(app.id, { status: 'certified', certified_sum: g.due } as never)
      onChanged()
    } catch (e) { onTrouble(message(e)) }
  }

  return (
    <>
      <div className="card pay-702">
        <div className="pay-702-head">
          <h3>Application {app.number}</h3>
          <span className="muted small">Period to {app.period_to} · {app.status}</span>
          {editable && <button className="primary-lite" onClick={() => void certify()}>Certify</button>}
        </div>
        <table className="pay-702-lines">
          <tbody>
            <Row n="1" label="Original contract sum" value={g.originalSum} />
            <Row n="2" label="Net change by change orders" value={g.changeOrders} />
            <Row n="3" label="Contract sum to date" value={g.contractSum} strong />
            <Row n="4" label="Total completed and stored to date" value={g.completedAndStored} />
            <Row n="5a" label={`Retainage, ${figures.rates.work}% of completed work`} value={g.retainageWork} />
            <Row n="5b" label={`Retainage, ${figures.rates.stored}% of stored material`} value={g.retainageStored} />
            <Row n="5" label="Total retainage" value={g.retainageTotal} />
            <Row n="6" label="Total earned less retainage" value={g.earnedLessRetainage} strong />
            <Row n="7" label="Less previous certificates for payment" value={g.previousCertificates} />
            <Row n="8" label="Current payment due" value={g.due} strong highlight />
            <Row n="9" label="Balance to finish, including retainage" value={g.balanceToFinish} />
          </tbody>
        </table>
        {figures.rates.steppedTo != null && (
          <p className="muted small">
            Retainage stepped to {figures.rates.work}% once the job passed {figures.rates.steppedTo}% complete.
          </p>
        )}
      </div>

      <div className="card">
        <h3>Continuation sheet</h3>
        <div className="pay-703-wrap">
          <table className="pay-703">
            <thead>
              <tr>
                <th>A</th><th>B</th><th className="right">C</th><th className="right">D</th>
                <th className="right">E</th><th className="right">F</th><th className="right">G</th>
                <th className="right">%</th><th className="right">H</th><th className="right">I</th>
              </tr>
              <tr className="pay-703-sub">
                <th>Item</th><th>Description of work</th><th className="right">Scheduled value</th>
                <th className="right">From previous</th><th className="right">This period</th>
                <th className="right">Stored</th><th className="right">Completed and stored</th>
                <th className="right">%</th><th className="right">Balance</th><th className="right">Retainage</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((l) => {
                if (l.is_heading) {
                  return <tr key={l.id} className="pay-703-heading"><td /><td colSpan={9}>{l.description}</td></tr>
                }
                const f = figures.lines.find((x) => x.line.id === l.id)
                if (!f) return null
                const v = valueOf(l.id)
                return (
                  <tr key={l.id} className={l.change_order_id ? 'pay-703-co' : ''}>
                    <td className="mono">{l.item_no ?? ''}</td>
                    <td>{l.description}</td>
                    <td className="right mono">{money(l.scheduled_value)}</td>
                    <td className="right mono">{money(f.previous)}</td>
                    <td className="right">
                      {editable
                        ? <input className="cell mono right" inputMode="decimal" value={v.this_period || ''}
                            onChange={(e) => setEdits((x) => ({ ...x, [l.id]: { ...v, this_period: Number(e.target.value) || 0 } }))}
                            onBlur={() => void save(l.id, valueOf(l.id))} aria-label={`This period for ${l.description}`} />
                        : <span className="mono">{money(f.thisPeriod)}</span>}
                    </td>
                    <td className="right">
                      {editable
                        ? <input className="cell mono right" inputMode="decimal" value={v.stored || ''}
                            onChange={(e) => setEdits((x) => ({ ...x, [l.id]: { ...v, stored: Number(e.target.value) || 0 } }))}
                            onBlur={() => void save(l.id, valueOf(l.id))} aria-label={`Stored for ${l.description}`} />
                        : <span className="mono">{money(f.stored)}</span>}
                    </td>
                    <td className="right mono">{money(f.toDate)}</td>
                    <td className="right mono">{f.percent.toFixed(2)}%</td>
                    <td className="right mono">{money(f.balance)}</td>
                    <td className="right mono">{money(f.retainage)}</td>
                  </tr>
                )
              })}
              <tr className="pay-703-total">
                <td /><td><strong>Total</strong></td>
                <td className="right mono"><strong>{money(figures.totals.scheduled)}</strong></td>
                <td className="right mono"><strong>{money(figures.totals.previous)}</strong></td>
                <td className="right mono"><strong>{money(figures.totals.thisPeriod)}</strong></td>
                <td className="right mono"><strong>{money(figures.totals.stored)}</strong></td>
                <td className="right mono"><strong>{money(figures.totals.toDate)}</strong></td>
                <td className="right mono"><strong>{figures.totals.percent.toFixed(2)}%</strong></td>
                <td className="right mono"><strong>{money(figures.totals.balance)}</strong></td>
                <td className="right mono"><strong>{money(figures.totals.retainage)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

function Row({ n, label, value, strong, highlight }: {
  n: string; label: string; value: number; strong?: boolean; highlight?: boolean
}) {
  return (
    <tr className={highlight ? 'pay-702-due' : ''}>
      <td className="pay-702-n">{n}</td>
      <td>{label}</td>
      <td className="right mono">{strong ? <strong>{money(value)}</strong> : money(value)}</td>
    </tr>
  )
}
