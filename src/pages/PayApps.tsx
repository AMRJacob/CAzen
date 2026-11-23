import { ConfirmDelete } from '../components/ConfirmDelete'
import { ContractSetup } from '../components/ContractSetup'
import { PayRead } from '../components/PayRead'
import { MoneyInput } from '../components/MoneyInput'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageTitle } from '../components/PageTitle'
import { useProject } from '../lib/project'
import { message } from '../lib/errors'
import { today, usDate } from '../lib/dates'
import { figure, standings, type Billed, type Figures, type RetainageStep, type RoundColumn, type RoundWay, type SovLine } from '../lib/payapps'
import { money, percent, roughPercent } from '../lib/money'
import { Money } from '../components/Money'
import { changeCost, listRegister, type RegisterRow } from '../lib/issued'
import { compare, listActivities, ScheduleNotSetUp, type Comparison } from '../lib/schedule'
import {
  addSovLine, listContracts, loadContract, newApplication, removeApplication, setApplication, setBilled, setContract,
  setSovLine, setSteps,
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
  const [adding, setAdding] = useState(false)
  /** The New application panel: a PDF to read it from, or a blank one. */
  const [starting, setStarting] = useState(false)
  const [startFile, setStartFile] = useState<{ appId: string; file: File } | null>(null)

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

  async function addApplication(file?: File) {
    if (!data || busy) return
    setBusy(true)
    try {
      const next = (data.applications[data.applications.length - 1]?.number ?? 0) + 1
      const id = await newApplication(data.contract.id, next, today())
      if (file) setStartFile({ appId: id, file })
      setStarting(false)
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
        {data && !starting && <button className="primary desk-only" onClick={() => setStarting(true)} disabled={busy}>New application</button>}
      </div>

      {error && <div className="notice error">{error}</div>}

      {data && starting && (
        <NewApplication
          number={(data.applications[data.applications.length - 1]?.number ?? 0) + 1}
          busy={busy}
          onFile={(f) => void addApplication(f)}
          onBlank={() => void addApplication()}
          onCancel={() => setStarting(false)}
          onTrouble={setError} />
      )}

      {contracts?.length === 0 && (
        <ContractSetup project={current} onCreated={(id) => {
          setContracts([{ id, name: null }])
          setChosen(id)
          setTab('summary')
        }} />
      )}

      {contracts && contracts.length > 0 && !adding && (
        <div className="pay-contracts">
          {contracts.length > 1 && contracts.map((c, i) => (
            <button key={c.id} className={c.id === chosen ? 'on' : ''} onClick={() => { setChosen(c.id); setTab('summary') }}>
              {c.name ?? (i === 0 ? 'Contract' : `Contract ${i + 1}`)}
            </button>
          ))}
          <button className="link pay-another" onClick={() => setAdding(true)}>Add another contract</button>
        </div>
      )}
      {adding && (
        <ContractSetup project={current} another onCancel={() => setAdding(false)} onCreated={(id, name) => {
          setContracts([...(contracts ?? []), { id, name }])
          setChosen(id); setTab('summary'); setAdding(false)
        }} />
      )}

      {data && !adding && (
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

          {tab === 'summary' && latest && (
            <Summary data={data} figures={latest} all={figured} onChanged={load} onTrouble={setError} />
          )}
          {tab !== 'summary' && (() => {
            const i = data.applications.findIndex((a) => a.id === tab)
            if (i < 0 || !figured[i]) return null
            return (
              <OneApplication
                data={data}
                index={i}
                figures={figured[i]}
                onChanged={load}
                onRemoved={() => { setTab('summary'); load() }}
                onTrouble={setError}
                start={startFile?.appId === data.applications[i].id ? startFile.file : null}
                onStarted={() => setStartFile(null)}
              />
            )
          })()}
        </>
      )}
    </section>
  )
}

// ---------- Starting an application ----------

/**
 * New application: the contractor's PDF dropped or chosen here opens the application and reads
 * this period from it straight away; without one, the application starts blank.
 */
function NewApplication({ number, busy, onFile, onBlank, onCancel, onTrouble }: {
  number: number
  busy: boolean
  onFile: (f: File) => void
  onBlank: () => void
  onCancel: () => void
  onTrouble: (m: string) => void
}) {
  const file = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const take = (f: File | undefined | null) => {
    if (!f) return
    if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) onFile(f)
    else onTrouble('That isn’t a PDF. The application needs to be the PDF the contractor sent.')
  }
  return (
    <div className="card pay-new">
      <div className="pad-head">
        <h3>Application {number}</h3>
        <button className="link" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
      <div className={`drop-spot${over ? ' over' : ''}${busy ? ' busy' : ''}`}
        role="button" tabIndex={0} aria-label="Drop the contractor’s application PDF here, or choose it"
        onClick={() => { if (!busy) file.current?.click() }}
        onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !busy) { e.preventDefault(); file.current?.click() } }}
        onDragOver={(e) => { e.preventDefault(); if (!busy) setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault(); setOver(false)
          if (busy) return
          take(Array.from(e.dataTransfer.files).find((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) ?? e.dataTransfer.files?.[0])
        }}>
        {busy
          ? <span role="status">Opening the application…</span>
          : <><strong>Drop the contractor’s application PDF here</strong><span className="muted small">or click to choose it — printed or scanned. This period is read from it and shown before anything is kept.</span></>}
      </div>
      <input ref={file} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { take(e.target.files?.[0]); e.target.value = '' }} />
      <button className="link" onClick={onBlank} disabled={busy}>Start it without a PDF</button>
    </div>
  )
}

// ---------- Summary ----------

function Summary({ data, figures, all, onChanged, onTrouble }: {
  data: LoadedContract
  figures: Figures
  all: Figures[]
  onChanged: () => void
  onTrouble: (m: string) => void
}) {
  const g = figures.g702
  const paid = g.earnedLessRetainage
  const rows = standings(figures)
    .filter((s) => s.scheduled > 0)
    .sort((a, b) => b.outstanding - a.outstanding)

  // Jacob, 11/20: the summary was too much.
  return (
    <>
      {/* The project's money at the top (Jacob, 11/20: "I really like the top portion"), then
          how it stands against the schedule; the by-trade table and retainage are folded away. */}
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

      <AgainstTheSchedule data={data} figures={figures} />
      <details className="pay-more">
        <summary>By trade, and retainage</summary>
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
                <td className="pay-trade-name">{s.line.item_no ? <span className="mono pay-item">{s.line.item_no}</span> : null}{s.line.description}</td>
                <td className="right mono" data-label="Scheduled"><Money n={s.scheduled} /></td>
                <td className="right mono" data-label="Done"><Money n={s.toDate} /></td>
                <td className="pay-progress" data-label="Progress">
                  <span className="pay-bar small"><span style={{ width: `${Math.min(100, s.percent)}%` }} /></span>
                  <span className="muted small">{roughPercent(s.percent)}</span>
                </td>
                <td className="right mono" data-label="Balance"><Money n={s.balance} /></td>
                <td className="right mono" data-label="Retainage held"><Money n={s.retainageHeld} /></td>
                <td className="right mono" data-label="Still owed"><Money n={s.outstanding} strong /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Retainage data={data} figures={figures} onChanged={onChanged} onTrouble={onTrouble} />
      </details>
    </>
  )
}

/**
 * How much is held back, and when that changes.
 *
 * Retainage is almost never one rate for the life of a job. It is ten percent until the job
 * is half done and five after, or it drops again at substantial completion — and the amount
 * held is the single biggest lever on whether a subcontractor stays interested in finishing.
 * The arithmetic has always read these steps; this is where they are written.
 */
function Retainage({ data, figures, onChanged, onTrouble }: {
  data: LoadedContract
  figures: Figures
  onChanged: () => void
  onTrouble: (m: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [work, setWork] = useState(String(data.contract.retainage_work))
  const [stored, setStored] = useState(String(data.contract.retainage_stored))
  const [steps, setLocalSteps] = useState<RetainageStep[]>(data.steps)
  const [busy, setBusy] = useState(false)

  async function save() {
    if (busy) return
    setBusy(true)
    try {
      await setContract(data.contract.id, {
        retainage_work: Number(work) || 0,
        retainage_stored: Number(stored) || 0,
      })
      await setSteps(data.contract.id, steps
        .filter((s) => Number.isFinite(s.at_percent) && Number.isFinite(s.rate))
        .sort((a, b) => a.at_percent - b.at_percent))
      setOpen(false)
      onChanged()
    } catch (e) { onTrouble(message(e)) } finally { setBusy(false) }
  }

  const inForce = figures.rates

  return (
    <div className="card">
      <div className="pad-head">
        <h3>Retainage</h3>
        <button className="link" onClick={() => setOpen(!open)}>{open ? 'Done' : 'Change'}</button>
      </div>
      <p className="muted small">
        Holding {percent(inForce.work)} of completed work and {percent(inForce.stored)} of stored
        material{inForce.steppedTo != null ? `, having stepped down once the job passed ${percent(inForce.steppedTo)} complete` : ''}.
        {data.steps.length === 0 && ' One rate for the whole job.'}
      </p>

      {open && (
        <div className="retainage-edit">
          <div className="pay-add-fields">
            <label className="stack">On completed work
              <input className="mono" inputMode="decimal" value={work} onChange={(e) => setWork(e.target.value)} />
            </label>
            <label className="stack">On stored material
              <input className="mono" inputMode="decimal" value={stored} onChange={(e) => setStored(e.target.value)} />
            </label>
          </div>

          <p className="small"><strong>Milestones</strong> — from this much of the job complete, hold this much instead.</p>
          {steps.map((step, i) => (
            <div key={i} className="retainage-step">
              <span className="muted small">From</span>
              <input className="mono" inputMode="decimal" value={step.at_percent} aria-label="Percent complete"
                onChange={(e) => setLocalSteps((all) => all.map((x, j) => (j === i ? { ...x, at_percent: Number(e.target.value) || 0 } : x)))} />
              <span className="muted small">% complete, hold</span>
              <input className="mono" inputMode="decimal" value={step.rate} aria-label="Rate from then on"
                onChange={(e) => setLocalSteps((all) => all.map((x, j) => (j === i ? { ...x, rate: Number(e.target.value) || 0 } : x)))} />
              <span className="muted small">%</span>
              <button className="link danger-link" onClick={() => setLocalSteps((all) => all.filter((_, j) => j !== i))}>Remove</button>
            </div>
          ))}
          <div className="folder-actions">
            <button className="link" onClick={() => setLocalSteps((all) => [...all, { at_percent: 50, rate: 5 }])}>
              Add a milestone
            </button>
            <button className="primary-lite" disabled={busy} onClick={() => void save()}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
          <p className="muted small">
            A milestone is judged on the job as a whole, not line by line, and the highest one the
            job has passed is the rate in force. A line held at its own rate ignores them.
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * The schedule's opinion of this application.
 *
 * Only the activities that say which lines they cover can be compared, and only the ones that
 * disagree are worth the space — a row saying the schedule and the application agree is a row
 * nobody reads. The link goes to where the rest of it is.
 */
function AgainstTheSchedule({ data, figures }: { data: LoadedContract; figures: Figures }) {
  const [rows, setRows] = useState<Comparison[] | null>(null)
  const [absent, setAbsent] = useState(false)

  // The activities belong to the project, which the contract row carries.
  useEffect(() => {
    let gone = false
    const pid = (data.contract as unknown as { project_id?: string }).project_id
    if (!pid) { setRows([]); return }
    listActivities(pid)
      .then((acts) => {
        if (gone) return
        const value = new Map(data.lines.map((l) => [l.id, l.scheduled_value]))
        const billed = new Map(figures.lines.map((f) => [f.line.id, f.toDate]))
        setRows(compare(acts, (id) => value.get(id) ?? 0, (id) => billed.get(id) ?? 0))
      })
      .catch((e) => { if (!gone) { if (e instanceof ScheduleNotSetUp) setAbsent(true); setRows([]) } })
    return () => { gone = true }
  }, [data, figures])

  const apart = (rows ?? []).filter((r) => Math.abs(r.gap) >= 5)
  const agree = (rows?.length ?? 0) - apart.length

  return (
    <div className="card">
      <div className="pay-sched-head">
        <h3>Against the schedule</h3>
        <Link className="trb-open" to="/trades">Sort into trades</Link>
      </div>
      {absent ? (
        <p className="muted small">The construction schedule is not set up on this project yet.</p>
      ) : !rows ? <p className="muted small">Loading…</p>
        : !rows.length ? (
          <p className="muted small">
            Nothing to compare yet. An activity is compared once it says which lines of the schedule
            of values it covers — <Link to="/schedule">the schedule</Link> is where that is set.
          </p>
        ) : (
          <>
            <div className="pay-figures pay-sched-figures">
              <Figure label="Tied to the schedule" value={String(rows.length)} note={rows.length === 1 ? 'activity with pay lines' : 'activities with pay lines'} />
              <Figure label="Agree" value={String(agree)} note="within five points" />
              <Figure label="Billed ahead" value={String(apart.filter((r) => r.gap > 0).length)} note="five points or more over the schedule" />
              <Figure label="Billed behind" value={String(apart.filter((r) => r.gap < 0).length)} note="five points or more under the schedule" />
            </div>
            <table className="pay-trades pay-sched">
              <thead><tr>
                <th>Activity</th><th className="right">Schedule says</th>
                <th className="right">Billed</th><th className="right">Difference</th>
              </tr></thead>
              <tbody>
                {[...rows].sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap)).map((r) => {
                  const off = Math.abs(r.gap) >= 5
                  return (
                    <tr key={r.activity.id} className={off ? (r.gap > 0 ? 'ahead' : 'behind') : 'agrees'}>
                      <td>{r.activity.name}</td>
                      <td className="right mono">{percent(r.planned)}</td>
                      <td className="right mono">{percent(r.billed)}</td>
                      <td className="right mono">
                        {!off ? <span className="muted">agrees</span> : r.gap > 0 ? `+${percent(r.gap)} billed` : `${percent(Math.abs(r.gap))} behind`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="muted small">
              Only activities that say which pay lines they cover are here — <Link to="/schedule">the schedule</Link> is where that is set.
            </p>
          </>
        )}
    </div>
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

function OneApplication({ data, index, figures, onChanged, onRemoved, onTrouble, start, onStarted }: {
  onRemoved: () => void
  start?: File | null
  onStarted?: () => void
  data: LoadedContract
  index: number
  figures: Figures
  onChanged: () => void
  onTrouble: (m: string) => void
}) {
  const app = data.applications[index]
  const editable = app.status === 'draft'
  const g = figures.g702
  const co = figures.changeOrderSummary
  const askAbout = figures.lines.filter((f) => f.storedUnaccounted)
  const nextSort = data.lines.reduce((m, l) => Math.max(m, l.sort), 0) + 1
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

  // Only the last application can go: each one's "from previous" is what the ones before it
  // add up to, so taking one out of the middle would quietly change every later one.
  const last = data.applications[data.applications.length - 1]?.id === app.id
  const [deleting, setDeleting] = useState(false)

  async function certify() {
    try {
      await setApplication(app.id, { status: 'certified', certified_sum: g.due } as never)
      onChanged()
    } catch (e) { onTrouble(message(e)) }
  }

  // Taking a certificate back, to put right a mistake found later. The application goes back to
  // draft so its figures can be changed; the applications after it work their line 7 out from
  // it, so they follow whatever it is corrected to.
  const [uncertifying, setUncertifying] = useState(false)
  async function uncertify() {
    try {
      await setApplication(app.id, { status: 'draft', certified_sum: null } as never)
      setUncertifying(false)
      onChanged()
    } catch (e) { onTrouble(message(e)) }
  }
  const later = data.applications.slice(index + 1)

  // Columns the contractor rounds: right-click a heading to choose. Rounded figures are blue, with
  // the exact figure on hover.
  const rounding = data.contract.rounding ?? {}
  const [roundMenu, setRoundMenu] = useState<{ col: RoundColumn; x: number; y: number } | null>(null)
  const roundHead = (col: RoundColumn) => ({
    className: `right pay-round-head${rounding[col] ? ' on' : ''}`,
    title: `${ROUND_SAYS[rounding[col] ?? 'exact']} — right-click to change`,
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); setRoundMenu({ col, x: e.clientX, y: e.clientY }) },
  })
  const roundCell = (exact: number | undefined, pct = false) => exact == null
    ? { className: 'right mono' }
    : { className: 'right mono pay-rounded', title: `Rounded. Exact: ${pct ? `${exact.toFixed(2)}%` : exact.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}` }

  return (
    <>
      <div className="card pay-702">
        <div className="pay-702-head">
          <h3>Application {app.number}</h3>
          <span className="muted small">Period to {usDate(app.period_to)} · {app.status}</span>
          {editable && <button className="primary-lite" onClick={() => void certify()}>Certify</button>}
          {app.status === 'certified' && <button className="link" onClick={() => setUncertifying(true)}>Uncertify</button>}
          <button className="link danger-link pay-delete" disabled={!last} onClick={() => setDeleting(true)}
            title={last ? 'Delete this application' : 'Only the last application can be deleted — delete the later ones first'}>Delete</button>
        </div>
        {uncertifying && (
          <div className="notice warn pay-uncertify">
            <span>
              <strong>Take back the certificate for Application {app.number}?</strong>{' '}
              It goes back to draft so its figures can be corrected, and is certified again afterwards.
              {app.certified_sum != null && <> It was certified at {money(app.certified_sum)}.</>}
              {later.length > 0 && <> {later.length === 1 ? `Application ${later[0].number} works` : `Applications ${later.map((a) => a.number).join(', ')} work`} its line 7 and “from previous” out from this one, so {later.length === 1 ? 'it follows' : 'they follow'} any correction.</>}
            </span>
            <div className="notice-actions">
              <button className="primary" onClick={() => void uncertify()}>Uncertify</button>
              <button className="link" onClick={() => setUncertifying(false)}>Cancel</button>
            </div>
          </div>
        )}
        {deleting && (
          <ConfirmDelete what={`Application ${app.number}`}
            detail={`Period to ${usDate(app.period_to)}${app.status === 'certified' ? ' — certified' : ''}. Everything entered on it for this period goes with it. The schedule of values and the other applications are not touched.`}
            onCancel={() => setDeleting(false)}
            onConfirm={async () => { await removeApplication(app.id); setDeleting(false); onRemoved() }} />
        )}
        <p className="pay-702-preamble">
          Application is made for payment, as shown below, in connection with the contract.
          The continuation sheet below is the G703.
        </p>

        <div className="g702">
          <Line n="1." label="Original contract sum" value={g.originalSum} />
          <Line n="2." label="Net change by change orders" value={g.changeOrders} />
          <Line n="3." label="Contract sum to date" note="line 1 ± 2" value={g.contractSum} strong />
          <Line n="4." label="Total completed &amp; stored to date" note="column G on G703" value={g.completedAndStored} />

          <div className="g702-n">5.</div>
          <div className="g702-label g702-label-plain">Retainage:</div>
          <div className="g702-inner" /><div className="g702-outer" />

          <Line sub n="a." rate={figures.rates.work} rateOf="of completed work"
            note="columns D + E on G703" value={g.retainageWork} />
          <Line sub n="b." rate={figures.rates.stored} rateOf="of stored material"
            note="column F on G703" value={g.retainageStored} />
          <Line n="" label="Total retainage" note="lines 5a + 5b, or column I on G703"
            value={g.retainageTotal} />

          <Line n="6." label="Total earned less retainage" note="line 4 less line 5"
            value={g.earnedLessRetainage} strong />
          <Line n="7." label="Less previous certificates for payment" note="line 6 from the prior certificate"
            value={g.previousCertificates} />
          <Line n="8." label="Current payment due" value={g.due} boxed />
          <Line sub n="9." label="Balance to finish, including retainage" note="line 3 less line 6"
            value={g.balanceToFinish} />
        </div>

        {figures.rates.steppedTo != null && (
          <p className="muted small">
            Retainage stepped to {figures.rates.work}% once the job passed {figures.rates.steppedTo}% complete.
          </p>
        )}

        <table className="g702-co">
          <thead>
            <tr>
              <th>Change order summary</th>
              <th className="right">Additions</th>
              <th className="right">Deductions</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Total changes approved in previous months by owner</td>
              <td className="right mono"><Money n={co.previousAdditions} /></td>
              <td className="right mono"><Money n={co.previousDeductions} /></td>
            </tr>
            <tr>
              <td>Total approved this month</td>
              <td className="right mono"><Money n={co.thisAdditions} /></td>
              <td className="right mono"><Money n={co.thisDeductions} /></td>
            </tr>
            <tr className="g702-co-total">
              <td className="right">Totals</td>
              <td className="right mono"><Money n={co.totalAdditions} strong /></td>
              <td className="right mono"><Money n={co.totalDeductions} strong /></td>
            </tr>
            <tr className="g702-co-net">
              <td colSpan={2}>Net change by change order</td>
              <td className="right mono"><Money n={co.net} strong /></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Continuation sheet</h3>
        {askAbout.length > 0 && (
          <div className="notice warn">
            <span>
              <strong>{askAbout.length === 1 ? 'One line has' : `${askAbout.length} lines have`} stored
              material that is no longer stored, without the work to match</strong>
              {' — '}
              {askAbout.slice(0, 4).map((f) => f.line.description).join(', ')}
              {askAbout.length > 4 ? ` and ${askAbout.length - 4} more` : ''}.
              {' '}Either it went into the work and was not billed, or it has left the site.
            </span>
          </div>
        )}
        {editable && (
          <PayRead
            known={data.lines.map((l) => ({ id: l.id, item_no: l.item_no, description: l.description, scheduled: l.scheduled_value,
              previous: figures.lines.find((x) => x.line.id === l.id)?.previous ?? 0, heading: l.is_heading }))}
            current={valueOf}
            number={app.number}
            start={start}
            onStarted={onStarted}
            onAddLines={async (lines) => {
              const ids: string[] = []
              for (const [k, l] of lines.entries()) ids.push(await addSovLine(data.contract.id, { ...l, sort: nextSort + k }))
              return ids
            }}
            onKeep={async (rows) => {
              for (const r of rows) await setBilled(app.id, r.id, r.value)
              setEdits({}); onChanged()
            }} />
        )}
        <div className="pay-703-wrap">
          <table className="pay-703">
            <thead>
              <tr>
                <th>A</th><th>B</th><th className="right">C</th><th className="right">D</th>
                <th className="right">E</th><th className="right">F</th>
                {(['G', 'pct', 'H', 'I'] as const).map((c) => (
                  <th key={c} {...roundHead(c)}>{c === 'pct' ? '%' : c}{rounding[c] && <span className="pay-round-mark" title={ROUND_SAYS[rounding[c]!]}>{ROUND_MARK[rounding[c]!]}</span>}</th>
                ))}
              </tr>
              <tr className="pay-703-sub">
                <th>Item</th><th>Description of work</th><th className="right">Scheduled value</th>
                <th className="right">From previous</th><th className="right">This period</th>
                <th className="right">Stored</th>
                <th {...roundHead('G')}>Completed and stored</th>
                <th {...roundHead('pct')}>%</th><th {...roundHead('H')}>Balance</th><th {...roundHead('I')}>Retainage</th>
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
                    <td className="mono pay-703-item">{l.item_no ?? ''}</td>
                    <td className="pay-703-name">
                      {l.description}
                      {l.change_order_id && <ApprovedOn line={l} onChanged={onChanged} onTrouble={onTrouble} />}
                    </td>
                    <td className="right mono" data-label="Scheduled value"><Money n={l.scheduled_value} /></td>
                    <td className="right mono" data-label="From previous" data-nothing={f.previous ? undefined : ''}><Money n={f.previous} /></td>
                    <td className="right" data-label="This period" data-nothing={editable || f.thisPeriod ? undefined : ''}>
                      {editable
                        ? <MoneyInput className="cell mono right" value={v.this_period || ''}
                            onChange={(raw) => setEdits((x) => ({ ...x, [l.id]: { ...v, this_period: Number(raw) || 0 } }))}
                            onBlur={() => void save(l.id, valueOf(l.id))} aria-label={`This period for ${l.description}`} />
                        : <span className="mono"><Money n={f.thisPeriod} /></span>}
                    </td>
                    <td className="right pay-703-stored"
                      data-label="Stored"
                      data-nothing={editable || f.stored || f.storedBefore ? undefined : ''}>
                      {editable
                        ? <MoneyInput className="cell mono right" value={v.stored || ''}
                            onChange={(raw) => setEdits((x) => ({ ...x, [l.id]: { ...v, stored: Number(raw) || 0 } }))}
                            onBlur={() => void save(l.id, valueOf(l.id))} aria-label={`Stored for ${l.description}`} />
                        : <span className="mono"><Money n={f.stored} /></span>}
                      {f.storedBefore > 0 && (
                        <span className={`pay-703-was${f.storedUnaccounted ? ' pay-703-ask' : ''}`}
                          title={f.storedUnaccounted
                            ? `${money(f.released)} left storage this period but only ${money(f.thisPeriod)} of work was billed on this line.`
                            : `${money(f.storedBefore)} was stored on the previous application.`}>
                          {f.released > 0
                            ? <>{money(f.released)} out of storage</>
                            : <>was {money(f.storedBefore)}</>}
                        </span>
                      )}
                    </td>
                    <td {...roundCell(f.exact?.toDate)} data-label="Completed and stored" data-nothing={f.toDate ? undefined : ''}><Money n={f.toDate} /></td>
                    <td {...roundCell(f.exact?.percent, true)} data-label="Complete">{percent(f.percent)}</td>
                    <td {...roundCell(f.exact?.balance)} data-label="Balance"><Money n={f.balance} /></td>
                    <td {...roundCell(f.exact?.retainage)} data-label="Retainage" data-nothing={f.retainage ? undefined : ''}><Money n={f.retainage} /></td>
                  </tr>
                )
              })}
              <tr className="pay-703-total">
                <td className="pay-703-item" /><td className="pay-703-name"><strong>Total</strong></td>
                <td className="right mono" data-label="Scheduled value"><Money n={figures.totals.scheduled} strong /></td>
                <td className="right mono" data-label="From previous"><Money n={figures.totals.previous} strong /></td>
                <td className="right mono" data-label="This period"><Money n={figures.totals.thisPeriod} strong /></td>
                <td className="right mono" data-label="Stored"><Money n={figures.totals.stored} strong /></td>
                <td {...roundCell(figures.totals.exact?.toDate)} data-label="Completed and stored"><Money n={figures.totals.toDate} strong /></td>
                <td {...roundCell(figures.totals.exact?.percent, true)} data-label="Complete"><strong>{percent(figures.totals.percent)}</strong></td>
                <td {...roundCell(figures.totals.exact?.balance)} data-label="Balance"><Money n={figures.totals.balance} strong /></td>
                <td {...roundCell(figures.totals.exact?.retainage)} data-label="Retainage"><Money n={figures.totals.retainage} strong /></td>
              </tr>
            </tbody>
          </table>
        </div>
        {roundMenu && (
          <RoundMenu at={roundMenu} way={rounding[roundMenu.col]} onClose={() => setRoundMenu(null)}
            onPick={async (w) => {
              setRoundMenu(null)
              const next = { ...rounding }
              if (w) next[roundMenu.col] = w; else delete next[roundMenu.col]
              try { await setContract(data.contract.id, { rounding: next }); onChanged() } catch (e) { onTrouble(message(e)) }
            }} />
        )}
        {editable && <AddLine contractId={data.contract.id} projectId={(data.contract as unknown as { project_id: string }).project_id} lines={data.lines} nextSort={nextSort} onAdded={onChanged} onTrouble={onTrouble} />}
      </div>
    </>
  )
}

const ROUND_SAYS: Record<RoundWay | 'exact', string> = {
  exact: 'Exact, to the cent', nearest: 'Rounded to the nearest whole dollar', up: 'Rounded up to a whole dollar', down: 'Rounded down to a whole dollar',
}
const ROUND_MARK: Record<RoundWay, string> = { nearest: '≈', up: '↑', down: '↓' }

/** Right-click on a column heading: how the contractor rounds that column. */
function RoundMenu({ at, way, onPick, onClose }: {
  at: { col: RoundColumn; x: number; y: number }
  way: RoundWay | undefined
  onPick: (w: RoundWay | null) => void
  onClose: () => void
}) {
  useEffect(() => {
    const off = (e: Event) => { if (!(e.target as Element)?.closest?.('.pay-round-menu')) onClose() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('pointerdown', off); window.addEventListener('keydown', key)
    return () => { window.removeEventListener('pointerdown', off); window.removeEventListener('keydown', key) }
  }, [onClose])
  const unit = at.col === 'pct' ? 'percent' : 'dollar'
  const name = at.col === 'pct' ? '%' : `Column ${at.col}`
  const items: [RoundWay | null, string][] = [
    [null, at.col === 'pct' ? 'Exact, to two places' : 'Exact, to the cent'],
    ['nearest', `Round to the nearest whole ${unit}`],
    ['up', `Round up`],
    ['down', `Round down`],
  ]
  return (
    <div className="pay-round-menu" role="menu" style={{ left: Math.min(at.x, window.innerWidth - 240), top: at.y + 4 }}>
      <div className="muted small pay-round-title">{name} — as the contractor rounds it</div>
      {items.map(([w, label]) => (
        <button key={label} role="menuitemradio" aria-checked={(way ?? null) === w} className={(way ?? null) === w ? 'on' : ''} onClick={() => onPick(w)}>{label}</button>
      ))}
    </div>
  )
}

/**
 * When the owner approved a change order.
 *
 * It sits on the schedule of values rather than on any one application, because it is what
 * decides which application's change order summary the change order lands in — so it can be
 * set from any of them, certified or not.
 */
function ApprovedOn({ line, onChanged, onTrouble }: {
  line: SovLine
  onChanged: () => void
  onTrouble: (m: string) => void
}) {
  const [editing, setEditing] = useState(false)

  async function set(value: string) {
    try {
      await setSovLine(line.id, { approved_on: value || null })
      setEditing(false)
      onChanged()
    } catch (e) { onTrouble(message(e)) }
  }

  if (editing) {
    return (
      <input type="date" className="pay-co-date" autoFocus defaultValue={line.approved_on ?? ''}
        aria-label={`Date ${line.description} was approved`}
        onBlur={(e) => void set(e.target.value)} />
    )
  }
  return (
    <button className="link pay-co-when" onClick={() => setEditing(true)}>
      {line.approved_on ? `approved ${usDate(line.approved_on)}` : 'set approval date'}
    </button>
  )
}

/**
 * A line added to the schedule of values part-way through the job.
 *
 * Mostly this is a change order, which is why the approval date is asked for: the change order
 * summary on the G702 turns on whether the owner approved it this period or an earlier one. A
 * title line costs nothing and is how a change order's own breakdown gets a heading over it.
 */
function AddLine({ contractId, projectId, lines, nextSort, onAdded, onTrouble }: {
  contractId: string
  projectId: string
  lines: SovLine[]
  nextSort: number
  onAdded: () => void
  onTrouble: (m: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<'line' | 'heading' | 'change_order'>('line')
  const [itemNo, setItemNo] = useState('')
  const [description, setDescription] = useState('')
  const [value, setValue] = useState('')
  const [approvedOn, setApprovedOn] = useState(today())
  const [busy, setBusy] = useState(false)
  // The change register's change orders that are not on this schedule yet. A change order
  // issued in the register and its line here are the same thing, so one is offered as the other.
  const [register, setRegister] = useState<RegisterRow[]>([])
  const [from, setFrom] = useState<RegisterRow | null>(null)
  useEffect(() => {
    let live = true
    listRegister(projectId, ['change_order', 'pr']).then((r) => { if (live) setRegister(r.filter((x) => x.kind === 'change_order')) }).catch(() => {})
    return () => { live = false }
  }, [projectId, lines.length])
  const waiting = register.filter((r) => !lines.some((l) => l.change_order_id === r.id))
  const take = (r: RegisterRow) => {
    const cost = changeCost(r)
    setKind('change_order'); setFrom(r); setOpen(true)
    setItemNo(r.number ?? ''); setDescription([r.number, r.title].filter(Boolean).join(' — '))
    setValue(cost == null ? '' : String(cost)); setApprovedOn((r.issued_at ?? today()).slice(0, 10))
  }

  async function add() {
    if (!description.trim() || busy) return
    setBusy(true)
    try {
      await addSovLine(contractId, {
        item_no: kind === 'heading' ? null : (itemNo.trim() || null),
        description: description.trim(),
        scheduled_value: kind === 'heading' ? 0 : Number(value) || 0,
        sort: nextSort,
        is_heading: kind === 'heading',
        is_change_order: kind === 'change_order',
        approved_on: kind === 'change_order' ? approvedOn : null,
        ...(kind === 'change_order' && from ? { change_order_id: from.id } : {}),
      })
      setItemNo(''); setDescription(''); setValue(''); setFrom(null)
      setOpen(false)
      onAdded()
    } catch (e) { onTrouble(message(e)) } finally { setBusy(false) }
  }

  const offer = waiting.length > 0 && (
    <div className="pay-from-register">
      <span className="muted small">{waiting.length === 1 ? 'A change order in the register is' : `${waiting.length} change orders in the register are`} not on this schedule:</span>
      {waiting.map((r) => {
        const cost = changeCost(r)
        return (
          <button key={r.id} className={`pay-from-chip${from?.id === r.id ? ' on' : ''}`} onClick={() => take(r)}>
            <strong>{r.number ?? 'Change order'}</strong>{r.title ? ` — ${r.title}` : ''} · {cost == null ? 'no figure yet' : money(cost)}
          </button>
        )
      })}
    </div>
  )
  if (!open) {
    return <>{offer}<button className="link pay-add-line" onClick={() => setOpen(true)}>Add a line</button></>
  }

  return (
    <div className="pay-add">
      {offer}
      <div className="tabs">
        {([['line', 'Line'], ['heading', 'Title line'], ['change_order', 'Change order']] as const).map(([k, label]) => (
          <button key={k} className={kind === k ? 'on' : ''} onClick={() => { setKind(k); if (k !== 'change_order') setFrom(null) }}>{label}</button>
        ))}
      </div>
      <div className="pay-add-fields">
        {kind !== 'heading' && (
          <label className="stack">Item
            <input value={itemNo} onChange={(e) => setItemNo(e.target.value)} placeholder="69" />
          </label>
        )}
        <label className="stack pay-add-wide">
          {kind === 'heading' ? 'Title' : 'Description of work'}
          <input value={description} onChange={(e) => setDescription(e.target.value)} autoFocus
            placeholder={kind === 'heading' ? 'Change Order 002' : kind === 'change_order' ? 'CO 002 — storm drainage revision' : 'Painting'} />
        </label>
        {kind !== 'heading' && (
          <label className="stack">Scheduled value
            <MoneyInput className="mono" value={value}
              onChange={setValue} placeholder="$0.00" />
          </label>
        )}
        {kind === 'change_order' && (
          <label className="stack">Approved
            <input type="date" value={approvedOn} onChange={(e) => setApprovedOn(e.target.value)} />
          </label>
        )}
      </div>
      <div className="folder-actions">
        <button className="primary-lite" disabled={!description.trim() || busy} onClick={() => void add()}>
          {busy ? 'Adding…' : 'Add to the schedule'}
        </button>
        <button className="link" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {kind === 'change_order' && from && (
        <p className="muted small">
          Taken from {from.number ?? 'the change order'} in the register{changeCost(from) == null ? ', which has no figure yet — enter one here' : (from.values?.['chg.cost'] ?? '') === '' ? ': the sum of the proposal requests it covers' : ''}. The line is tied to it.
        </p>
      )}
      {kind === 'change_order' && (
        <p className="muted small">
          A deduction is entered as a negative scheduled value. The approval date decides whether it
          counts as approved this month or in a previous one.
        </p>
      )}
    </div>
  )
}

/**
 * One numbered line of a G702.
 *
 * The form puts its main figures in one column and its workings — the two halves of the
 * retainage, the balance to finish — in a column inset from it, so the eye can run down the
 * amounts that add up without the intermediate ones getting in the way. `sub` is what puts a
 * figure in the inner column.
 */
function Line({ n, label, note, value, rate, rateOf, strong, boxed, sub }: {
  n: string
  label?: string
  note?: string
  value: number
  rate?: number
  rateOf?: string
  strong?: boolean
  boxed?: boolean
  sub?: boolean
}) {
  const amount = (
    <span className={boxed ? 'g702-boxed' : undefined}><Money n={value} strong={strong || boxed} /></span>
  )
  return (
    <>
      <div className={`g702-n${sub ? ' g702-n-sub' : ''}`}>{n}</div>
      <div className={`g702-label${strong || boxed ? ' g702-label-strong' : ''}`}>
        <span className="g702-words">
          {rate != null ? <><u className="g702-rate">{percent(rate)}</u> {rateOf}</> : label}
          {note && <span className="g702-note"> ({note})</span>}
        </span>
      </div>
      <div className="g702-inner right mono">{sub ? amount : null}</div>
      <div className="g702-outer right mono">{sub ? null : amount}</div>
    </>
  )
}
