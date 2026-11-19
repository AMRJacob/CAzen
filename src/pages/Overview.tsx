import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useProject } from '../lib/project'
import { listContracts, loadContract } from '../lib/payappsDb'
import { figure, type Billed, type Figures, type Application } from '../lib/payapps'
import { listRegister, type RegisterRow } from '../lib/issued'
import { listObservations, listTypes, nameOf, STATUS_LABELS, type Observation, type ObservationType } from '../lib/observations'
import { FORM_LABELS } from '../lib/templates/fields'
import { money, NOTHING } from '../lib/money'
import { usDate } from '../lib/dates'
import type { FormKind } from '../lib/templates/types'

/**
 * A project's front page.
 *
 * Somewhere to arrive: choosing a project, or closing a notebook, lands here rather than on
 * whichever list happened to be first. It says what the job is, what it is worth, how far along
 * it is, and what was last seen and last issued — each a line that leads to the page it came
 * from. Nothing is entered here.
 *
 * Every part is fetched on its own and fails on its own. A job with no contract set up still
 * shows its observations; with no signal it shows what the device holds and leaves the rest out.
 */

/** The order change documents are listed in: the ones that change the contract first. */
const KINDS: FormKind[] = ['change_order', 'ccd', 'pr', 'asi', 'rfi_response', 'field_report', 'meeting_notes']

interface Money_ { figures: Figures; application: Application; count: number }

export default function Overview() {
  const { current } = useProject()
  const [money_, setMoney] = useState<Money_ | null | 'none'>(null)
  const [observations, setObservations] = useState<Observation[] | null>(null)
  const [types, setTypes] = useState<ObservationType[]>([])
  const [issued, setIssued] = useState<RegisterRow[] | null>(null)
  const id = current?.id

  useEffect(() => {
    if (!id) return
    let gone = false
    setMoney(null); setObservations(null); setIssued(null)
    ;(async () => {
      const contracts = await listContracts(id)
      if (!contracts.length) return 'none' as const
      const data = await loadContract(contracts[0].id)
      if (!data.applications.length) return 'none' as const
      const history = data.applications.map((a) => ({ billed: data.billed.get(a.id) ?? new Map<string, Billed>() }))
      const i = data.applications.length - 1
      return {
        figures: figure(data.contract, data.lines, data.applications[i], history[i].billed, history.slice(0, i), data.steps),
        application: data.applications[i], count: data.applications.length,
      }
    })().then((m) => { if (!gone) setMoney(m) }).catch(() => { if (!gone) setMoney('none') })
    listObservations(id).then((o) => { if (!gone) setObservations(o) }).catch(() => { if (!gone) setObservations([]) })
    listTypes().then((t) => { if (!gone) setTypes(t) }).catch(() => {})
    listRegister(id).then((r) => { if (!gone) setIssued(r) }).catch(() => { if (!gone) setIssued([]) })
    return () => { gone = true }
  }, [id])

  if (!current) return <div className="card muted">Choose a project first, on the <Link to="/">Projects</Link> page.</div>

  const made = (o: Observation) => Date.parse(o.created_at) || Date.parse(`${o.observed_on}T12:00:00`)
  const lastSeen = (observations ?? []).slice().sort((a, b) => made(b) - made(a)).slice(0, 3)
  const open = (observations ?? []).filter((o) => o.status !== 'closed').length
  // The register comes newest first, so the first of each kind is the last one issued.
  const lastOf = KINDS.map((k) => (issued ?? []).find((r) => r.kind === k)).filter((r): r is RegisterRow => !!r)
  const m = money_ && money_ !== 'none' ? money_ : null
  const g = m?.figures.g702
  const percent = m ? Math.round(m.figures.totals.percent) : null

  return (
    <section className="overview">
      <header className="ov-head">
        <span className="ov-number">{current.number}</span>
        <h1>{current.name}</h1>
        <dl className="ov-facts">
          {current.owner_name && <><dt>Owner</dt><dd>{current.owner_name}</dd></>}
          {current.contractor_name && <><dt>Contractor</dt><dd>{current.contractor_name}</dd></>}
          {current.address && <><dt>Site</dt><dd>{current.address}</dd></>}
        </dl>
      </header>

      <div className="ov-grid">
        <Link to="/pay" className="ov-card">
          <h2>Contract</h2>
          {money_ === null ? <p className="muted">Looking…</p> : !m || !g ? (
            <p className="muted">No contract or pay application yet.</p>
          ) : (
            <>
              <p className="ov-big">{money(g.contractSum)}</p>
              <dl className="ov-lines">
                <dt>Original</dt><dd>{money(g.originalSum)}</dd>
                <dt>Change orders</dt><dd>{money(g.changeOrders)}</dd>
                <dt>Balance to finish</dt><dd>{money(g.balanceToFinish)}</dd>
              </dl>
            </>
          )}
        </Link>

        <Link to="/pay" className="ov-card">
          <h2>Progress</h2>
          {money_ === null ? <p className="muted">Looking…</p> : !m || !g || percent === null ? (
            <p className="muted">Nothing billed yet.</p>
          ) : (
            <>
              <p className="ov-big">{percent}%</p>
              <div className="ov-bar" role="img" aria-label={`${percent} percent complete`}><span style={{ width: `${Math.min(100, percent)}%` }} /></div>
              <dl className="ov-lines">
                <dt>Completed and stored</dt><dd>{money(g.completedAndStored)}</dd>
                <dt>As of</dt><dd>Application {m.application.number}, to {usDate(m.application.period_to)}</dd>
              </dl>
            </>
          )}
        </Link>

        <div className="ov-card ov-wide">
          <h2><Link to="/field-notes/observations">Observations</Link>{observations && observations.length > 0 && <span className="ov-count">{open} open of {observations.length}</span>}</h2>
          {observations === null ? <p className="muted">Looking…</p> : !lastSeen.length ? <p className="muted">None recorded.</p> : (
            <ul className="ov-list">
              {lastSeen.map((o) => (
                <li key={o.id}>
                  <Link to="/field-notes/observations">
                    <span className="ov-when">{usDate(o.observed_on)}</span>
                    <span className="ov-what"><span className="mono muted">{nameOf(o, types)}</span> {o.title}</span>
                    <span className="ov-state">{STATUS_LABELS[o.status]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="ov-card ov-wide">
          <h2><Link to="/ca-logs">Last issued</Link></h2>
          {issued === null ? <p className="muted">Looking…</p> : !lastOf.length ? <p className="muted">Nothing issued yet.</p> : (
            <ul className="ov-list">
              {lastOf.map((r) => (
                <li key={r.id}>
                  <Link to={r.kind === 'field_report' ? '/field-notes/reports' : r.kind === 'meeting_notes' ? '/field-notes/meetings' : '/ca-logs'}>
                    <span className="ov-when">{usDate(r.issued_at.slice(0, 10))}</span>
                    <span className="ov-what"><strong>{FORM_LABELS[r.kind]}{r.number ? ` ${r.number}` : ''}</strong>{r.title ? ` — ${r.title}` : ''}</span>
                    <span className="ov-state">{r.values?.['chg.cost'] && Number(r.values['chg.cost']) ? money(Number(r.values['chg.cost'])) : r.kind === 'pr' && Number(r.values?.['pr.price']) ? money(Number(r.values['pr.price'])) : ''}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <p className="muted small ov-foot">Contract and progress are from the latest pay application; {NOTHING} means there is no figure.</p>
    </section>
  )
}
