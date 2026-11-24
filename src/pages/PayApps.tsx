import { ConfirmDelete } from '../components/ConfirmDelete'
import { ContractSetup } from '../components/ContractSetup'
import { PayRead } from '../components/PayRead'
import { MoneyInput } from '../components/MoneyInput'
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageTitle } from '../components/PageTitle'
import { useProject } from '../lib/project'
import { message } from '../lib/errors'
import { today, usDate } from '../lib/dates'
import { figure, standings, type Billed, type Figures, type RetainageStep, type CellWay, type RoundColumn, type RoundWay, type SovLine } from '../lib/payapps'
import { money, percent, roughPercent } from '../lib/money'
import { Money } from '../components/Money'
import { PdfPreview } from '../components/PdfPreview'
import { putFile, readFile, safeName, SECTIONS } from '../lib/files'
import { againstPdf, COL_SAYS, ownArithmetic, whyTheyDiffer, type Discrepancy, type PdfCol, type WhyContext } from '../lib/payCompare'
import { changeCost, listRegister, type RegisterRow } from '../lib/issued'
import { compare, listActivities, ScheduleNotSetUp, type Comparison } from '../lib/schedule'
import {
  addSovLine, listContracts, loadContract, newApplication, removeApplication, setApplication, setBilled, setContract, setScheduledHere, setScheduledMany,
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
    const history = data.applications.map((a) => ({ billed: data.billed.get(a.id) ?? new Map<string, Billed>(), rounding: a.rounding }))
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
            <Summary data={data} figures={latest} all={figured} onChanged={load} onTrouble={setError} onOpen={setTab} />
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

function Summary({ data, figures, all, onChanged, onTrouble, onOpen }: {
  onOpen: (id: string) => void
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

      {data.applications.some((a) => a.pdf_read) && <PdfChecks data={data} all={all} onOpen={onOpen} onChanged={onChanged} onTrouble={onTrouble} />}
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

/**
 * One application set against the contractor's PDF read for it: the figures that differ, sorted by
 * cause, and a way of rounding retainage that would make it agree, if there is one.
 */
function checkAgainstPdf(data: LoadedContract, index: number, figures: Figures) {
  const app = data.applications[index]
  const pdf = app.pdf_read ?? null
  if (!pdf) return { diffs: [] as Discrepancy[], why: [] as ReturnType<typeof whyTheyDiffer>, retainageFix: null as { way: RoundWay; label: string } | null }
  const diffs = againstPdf(figures, pdf)
  let retainageFix: { way: RoundWay; label: string } | null = null
  const iDiffs = (f: Figures) => againstPdf(f, pdf).filter((d) => d.col === 'I' || d.col === 'retainageTotal').length
  if (iDiffs(figures)) {
    const history = data.applications.map((a) => ({ billed: data.billed.get(a.id) ?? new Map<string, Billed>(), period_to: a.period_to, rounding: a.rounding }))
    for (const way of ['period', 'nearest', 'up', 'down'] as RoundWay[]) {
      if (way === data.contract.rounding?.I) continue
      const f = figure({ ...data.contract, rounding: { ...(data.contract.rounding ?? {}), I: way } }, data.lines, app, history[index].billed, history.slice(0, index), data.steps)
      if (!iDiffs(f)) { retainageFix = { way, label: ROUND_SAYS[way] }; break }
    }
  }
  const dates = new Map<string, number>()
  for (const f of figures.lines) if (f.line.change_order_id) dates.set(f.line.approved_on ?? '', (dates.get(f.line.approved_on ?? '') ?? 0) + f.line.scheduled_value)
  const ctx: WhyContext = {
    coHere: figures.g702.changeOrders, periodTo: app.period_to, pdfPeriodTo: pdf.periodTo,
    coDates: [...dates].map(([date, total]) => ({ date: date || null, total })),
    retainageFix: retainageFix ? { label: retainageFix.label } : null,
    own: ownArithmetic(pdf),
  }
  return { diffs, why: whyTheyDiffer(diffs, ctx), retainageFix }
}

/**
 * Each line's scheduled value as a PDF read for an application has it. A line the PDF doesn't list
 * is $0 there — but only when the lines read add up to the PDF's grand total, so a row the reader
 * missed isn't taken for one the contractor left off; otherwise it is left as it is.
 */
function scheduledFromPdf(lines: SovLine[], pdf: import('../lib/payCompare').PdfRead): { id: string; scheduled: number }[] {
  const read = pdf.lines ?? {}
  if (!Object.keys(read).length) return []
  const sum = Object.values(read).reduce((n, x) => n + (x.C ?? 0), 0)
  const whole = pdf.total?.C != null && Math.abs(sum - pdf.total.C) < 1
  return lines.filter((l) => read[l.id] || (!l.is_heading && whole)).map((l) => ({ id: l.id, scheduled: read[l.id]?.C ?? 0 }))
}

/** A cause in a word or two, for the table of applications. */
const CAUSE_SHORT: Record<string, string> = {
  own: 'PDF doesn’t add up', misread: 'Misread or typo', dates: 'Dates',
  co: 'Change orders', previous: '“From previous”', scheduled: 'Scheduled values', entered: 'This period or stored',
  retainage: 'Retainage', other: 'Completed or balance', cover: 'Cover sheet totals',
}

/**
 * Every application against the contractor's PDF read for it, in one table: what the contractor
 * asked for, what CAzen works out, what was certified, and — where they part — why, in a word.
 */
function PdfChecks({ data, all, onOpen, onChanged, onTrouble }: { data: LoadedContract; all: Figures[]; onOpen: (id: string) => void; onChanged: () => void; onTrouble: (m: string) => void }) {
  const rows = data.applications.map((a, i) => ({ a, f: all[i], c: checkAgainstPdf(data, i, all[i]) }))
  // Applications whose scheduled values aren't yet the ones on the PDF read for them.
  const behind = data.applications.filter((a) => a.pdf_read && scheduledFromPdf(data.lines, a.pdf_read).some((v) => {
    const set = data.billed.get(a.id)?.get(v.id)?.scheduled
    return set == null || Math.abs(set - v.scheduled) >= 0.005
  }))
  const [taking, setTaking] = useState(false)
  async function takeAll() {
    setTaking(true)
    try { for (const a of behind) await setScheduledMany(a.id, scheduledFromPdf(data.lines, a.pdf_read!)); onChanged() }
    catch (e) { onTrouble(message(e)) } finally { setTaking(false) }
  }
  const off = rows.filter((r) => r.a.pdf_read && r.c.why.length).length
  const unread = rows.filter((r) => !r.a.pdf_read).length
  return (
    <div className="card pay-checks">
      <h3>Against the contractor’s PDFs</h3>
      <p className="muted small">
        {off ? <><strong className="pay-read-warn">{off} of {rows.length - unread}</strong> applications read from a PDF {off === 1 ? 'differs' : 'differ'} from CAzen’s arithmetic.</> : rows.length - unread ? 'Every application read from a PDF agrees with CAzen’s arithmetic.' : ''}
        {unread ? ` ${unread} ${unread === 1 ? 'has' : 'have'} no PDF read to check against.` : ''} Click one to open it.
      </p>
      {behind.length > 0 && (
        <div className="notice">
          <span>Application{behind.length === 1 ? '' : 's'} {behind.map((a) => a.number).join(', ')} {behind.length === 1 ? 'has' : 'have'} scheduled values that aren’t the ones on {behind.length === 1 ? 'its' : 'their'} PDF.
            Taking them sets each line’s scheduled value on that application to its PDF’s ($0 for a line the PDF doesn’t list). What was billed and certified isn’t changed.</span>
          <div className="notice-actions"><button className="primary" disabled={taking} onClick={() => void takeAll()}>{taking ? 'Taking them…' : 'Take the scheduled values from the PDFs'}</button></div>
        </div>
      )}
      <table className="pay-checks-table">
        <thead><tr><th>Application</th><th>Period to</th><th className="right">Contractor asked</th><th className="right">CAzen works out</th><th className="right">Certified</th><th>Checked against the PDF</th></tr></thead>
        <tbody>
          {rows.map(({ a, f, c }) => {
            const asked = a.pdf_read?.g702?.due
            const ok = a.pdf_read && !c.why.length
            const certOff = a.certified_sum != null && Math.abs(a.certified_sum - f.g702.due) >= 0.005
            return (
              <tr key={a.id} onClick={() => onOpen(a.id)} className={a.pdf_read ? (ok ? 'ok' : 'off') : 'unread'}>
                <td>{a.number}{a.status === 'draft' && <span className="tag">draft</span>}</td>
                <td>{usDate(a.period_to)}{a.pdf_read?.periodTo && a.pdf_read.periodTo !== a.period_to && <span className="pay-read-warn small"> · PDF: {usDate(a.pdf_read.periodTo)}</span>}</td>
                <td className="right mono">{asked != null ? money(asked) : '—'}</td>
                <td className={`right mono${asked != null && Math.abs(asked - f.g702.due) >= 0.005 ? ' pay-read-warn' : ''}`}>{money(f.g702.due)}</td>
                <td className={`right mono${certOff ? ' pay-read-warn' : ''}`} title={certOff ? `Certified at ${money(a.certified_sum!)}; the figures now work out to ${money(f.g702.due)}` : undefined}>{a.certified_sum != null ? money(a.certified_sum) : '—'}</td>
                <td>
                  {!a.pdf_read ? <span className="muted">No PDF read</span>
                    : ok ? <span className="pay-read-ok">✓ Agrees</span>
                      : <span className="pay-read-warn">✗ {c.why.filter((w) => w.key !== 'cover' || c.why.length === 1).map((w) => CAUSE_SHORT[w.key]).join(' · ')}</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

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
  // Right-click a line's description: a line that is really a heading, or the other way round.
  const [lineMenu, setLineMenu] = useState<{ line: SovLine; x: number; y: number } | null>(null)
  const roundHead = (col: RoundColumn) => ({
    className: `right pay-round-head${rounding[col] ? ' on' : ''}`,
    title: `${ROUND_SAYS[rounding[col] ?? 'exact']} — right-click to change`,
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); setRoundMenu({ col, x: e.clientX, y: e.clientY }) },
  })
  // Where CAzen's arithmetic and the contractor's PDF part company, worked out afresh each time,
  // so a correction or a rounding choice that brings them together clears it.
  const pdf = app.pdf_read ?? null
  const { current: project } = useProject()
  /** Keep the contractor's PDF with the application's files. */
  const keepPdf = (bytes: Uint8Array, file?: string) => putFile(project!, bytes, `${project!.id}/payapps/${app.id}.pdf`, {
    dirs: [SECTIONS.payApps, `Application ${app.number}`],
    name: safeName(`${app.period_to} Application ${app.number} - contractor${file ? ` - ${file.replace(/\.pdf$/i, '')}` : ''}`) + '.pdf',
  })
  // The contractor's PDF docked beside the sheet, for checking one against the other.
  const [beside, setBeside] = useState<Uint8Array | null>(null)
  const [opening, setOpening] = useState(false)
  async function showBeside() {
    if (!pdf?.path || !project) return
    setOpening(true)
    try { setBeside(await readFile(project, pdf.path)) } catch (e) { onTrouble(message(e)) } finally { setOpening(false) }
  }
  useEffect(() => {
    document.documentElement.classList.toggle('pdf-docked', !!beside)
    return () => document.documentElement.classList.remove('pdf-docked')
  }, [beside])
  useEffect(() => { setBeside(null) }, [app.id])
  async function attachPdf(f: File | undefined) {
    if (!f || !pdf || !project) return
    const bytes = new Uint8Array(await f.arrayBuffer())
    // Shown straight away; kept so it is there next time, which is the part that can fail.
    setBeside(bytes.slice())
    try {
      const path = await keepPdf(bytes, f.name)
      await setApplication(app.id, { pdf_read: { ...pdf, path, file: pdf.file ?? f.name } } as never)
      onChanged()
    } catch (e) { onTrouble(`The PDF is open beside the figures but couldn’t be kept for next time: ${message(e)}`) }
  }
  const { diffs, why, retainageFix } = useMemo(() => checkAgainstPdf(data, index, figures), [data, index, figures])
  const diffAt = (lineId: string | null, col: PdfCol) =>
    diffs.find((d) => (lineId ? d.where === 'line' && d.lineId === lineId : d.where === 'total') && d.col === col)
  // The register's change orders, for adding lines to.
  const [changeOrders, setChangeOrders] = useState<RegisterRow[]>([])
  const projectOf = (data.contract as unknown as { project_id: string }).project_id
  useEffect(() => {
    let live = true
    listRegister(projectOf, ['change_order']).then((r) => { if (live) setChangeOrders(r.filter((x) => x.kind === 'change_order')) }).catch(() => {})
    return () => { live = false }
  }, [projectOf])
  // Selecting several lines at once, as in a file list: ctrl- or ⌘-click adds or takes away a line,
  // shift-click takes in everything from the last one clicked, a plain click clears. Right-click acts on them.
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const lastPick = useRef<string | null>(null)
  useEffect(() => { setPicked(new Set()); lastPick.current = null }, [app.id])
  useEffect(() => {
    if (!picked.size) return
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setPicked(new Set()) }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [picked.size])
  const pickCell = (id: string) => ({
    onMouseDown: (e: React.MouseEvent) => { if (e.shiftKey) e.preventDefault() },  // no text selected by the shift-click
    onClick: (e: React.MouseEvent) => {
      if (moving) {
        e.preventDefault()
        if (id === moving.line || (e.target as Element).closest('input, button')) return
        const amount = Math.round((Number(moving.amount) || 0) * 100) / 100
        const ch = changeOf(moving.line)
        setMoving(null)
        if (amount > 0) void saveMoves([...moves, ch < 0 ? { from: moving.line, to: id, amount } : { from: id, to: moving.line, amount }])
        return
      }
      const order = data.lines.map((l) => l.id)
      if (e.shiftKey) {
        const from = lastPick.current ?? id
        const a = order.indexOf(from), b = order.indexOf(id)
        setPicked((cur) => { const n = new Set(e.metaKey || e.ctrlKey ? cur : []); for (let k = Math.min(a, b); k <= Math.max(a, b); k++) n.add(order[k]); return n })
        if (!lastPick.current) lastPick.current = id
      } else if (e.metaKey || e.ctrlKey) {
        setPicked((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n })
        lastPick.current = id
      } else if (picked.size && !(e.target as Element).closest('input, button, select, a')) {
        setPicked(new Set()); lastPick.current = id
      } else lastPick.current = id
    },
  })
  const [cellMenu, setCellMenu] = useState<{ lineId: string; col: RoundColumn; x: number; y: number } | null>(null)
  // Column C on this application: right-click for the PDF's value, a value typed in, or the carried one.
  const [svMenu, setSvMenu] = useState<{ lineId: string; x: number; y: number } | null>(null)
  const [svEdit, setSvEdit] = useState<string | null>(null)

  // Where money went: a line whose scheduled value changed on this application, linked to the line
  // it moved to (or came from). Right-click the one, click the other.
  const moves = app.moves ?? []
  /** What a line's scheduled value changed by on this application: to the PDF's value where it has another. */
  const changeOf = (id: string) => {
    const f = figures.lines.find((x) => x.line.id === id)
    if (!f) return 0
    const d = diffAt(id, 'C')
    return Math.round(((d ? d.pdf : f.line.scheduled_value) - f.carried) * 100) / 100
  }
  /** The part of a line's change no move yet accounts for. */
  const unlinked = (id: string) => Math.max(0, Math.abs(changeOf(id)) - moves.filter((m) => m.from === id || m.to === id).reduce((n, m) => n + m.amount, 0))
  /** A line's value once its moves are counted, set against the PDF's (or its own) value. */
  const standing = (id: string) => {
    const f = figures.lines.find((x) => x.line.id === id)
    if (!f) return null
    const d = diffAt(id, 'C')
    const now = Math.round((f.carried + moves.filter((m) => m.to === id).reduce((n, m) => n + m.amount, 0) - moves.filter((m) => m.from === id).reduce((n, m) => n + m.amount, 0)) * 100) / 100
    return { now, target: d ? d.pdf : f.line.scheduled_value }
  }
  /**
   * Lines tied together by moves: yellow while the moves leave some of a change unaccounted for,
   * green once every line in the group comes to what the PDF has.
   */
  const linkState = useMemo(() => {
    const parent = new Map<string, string>()
    const top = (x: string): string => { const p = parent.get(x) ?? x; return p === x ? x : top(p) }
    for (const m of moves) parent.set(top(m.from), top(m.to))
    const groups = new Map<string, string[]>()
    for (const id of new Set(moves.flatMap((m) => [m.from, m.to]))) groups.set(top(id), [...(groups.get(top(id)) ?? []), id])
    const out = new Map<string, 'linked' | 'settled'>()
    for (const ids of groups.values()) {
      const settled = ids.every((id) => { const st = standing(id); return !!st && Math.abs(st.now - st.target) < 0.005 })
      for (const id of ids) out.set(id, settled ? 'settled' : 'linked')
    }
    return out
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moves, figures, diffs])
  // Linking where money went: right-click a changed value, then click the line it went to (or came
  // from). The amount starts at all of the change not yet linked and can be changed first.
  const [moving, setMoving] = useState<{ line: string; amount: string } | null>(null)
  useEffect(() => {
    if (!moving) return
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoving(null) }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [moving])
  const itemOf = (id: string) => { const l = data.lines.find((x) => x.id === id); return l?.item_no ? `line ${l.item_no}` : (l?.description ?? '') }
  /** Lines that went the other way from this one, with some of their change still unlinked. */
  const opposite = (id: string) => figures.lines.filter((f) => f.line.id !== id && Math.sign(changeOf(f.line.id)) === -Math.sign(changeOf(id)) && unlinked(f.line.id) >= 0.005).map((f) => f.line.id)
  const saveMoves = async (next: typeof moves) => { try { await setApplication(app.id, { moves: next } as never); onChanged() } catch (e) { onTrouble(message(e)) } }
  const roundCell = (exact: number | undefined, pct = false, lineId: string | null = null, col?: PdfCol) => {
    const d = col ? diffAt(lineId, col) : undefined
    const rc = col === 'G' || col === 'pct' || col === 'H' || col === 'I' ? col : null
    const own = lineId && rc ? figures.lines.find((x) => x.line.id === lineId)?.own?.[rc] : undefined
    const say = (n: number) => (pct ? `${n.toFixed(2)}%` : n.toLocaleString('en-US', { style: 'currency', currency: 'USD' }))
    const notes = [
      own ? `${CELL_SAYS[own]} in this cell${rounding[rc!] ? ` (the column: ${ROUND_SAYS[rounding[rc!]!].toLowerCase()})` : ''}.` : '',
      exact != null ? `${own ? '' : 'Rounded. '}Exact: ${say(exact)}` : '',
      d ? `The contractor’s PDF has ${say(d.pdf)}; CAzen works it out as ${say(d.app)}.` : '',
      lineId && rc && editable ? 'Right-click to round this cell its own way.' : '',
    ].filter(Boolean)
    return {
      className: `right mono${own ? ' pay-round-own' : exact != null ? ' pay-rounded' : ''}${d ? ' pay-pdf-diff' : ''}`,
      ...(notes.length ? { title: notes.join('\n') } : {}),
      ...(lineId && rc && editable ? { onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); setCellMenu({ lineId, col: rc, x: e.clientX, y: e.clientY }) } } : {}),
    }
  }

  /** One line of the G703. */
  const row = (l: SovLine) => {
                if (l.is_heading) {
                  return (
                    <tr key={l.id} className={`pay-703-heading${picked.has(l.id) ? ' picked' : ''}`} {...pickCell(l.id)} onContextMenu={(e) => { e.preventDefault(); setLineMenu({ line: l, x: e.clientX, y: e.clientY }) }}
                      title="Right-click to make this a line item">
                      <td className="mono pay-703-item">{l.item_no ?? ''}</td><td colSpan={9}>{l.description}</td>
                    </tr>
                  )
                }
                const f = figures.lines.find((x) => x.line.id === l.id)
                if (!f) return null
                const v = valueOf(l.id)
                return (
                  <tr key={l.id} className={`${l.change_order_id ? 'pay-703-co' : ''}${picked.has(l.id) ? ' picked' : ''}${linkState.get(l.id) ? ` pay-row-${linkState.get(l.id)}` : ''}`} {...pickCell(l.id)}>
                    <td className="mono pay-703-item">{l.item_no ?? ''}</td>
                    <td className="pay-703-name" onContextMenu={(e) => { e.preventDefault(); setLineMenu({ line: l, x: e.clientX, y: e.clientY }) }}>
                      {l.description}
                    </td>
                    <ScheduledCell f={f} diff={diffAt(l.id, 'C')} link={linkState.get(l.id)} editable noPdf={!pdf}
                      change={index ? changeOf(l.id) : 0}
                      links={moves.filter((m) => m.from === l.id || m.to === l.id).map((m) => ({
                        text: `${m.from === l.id ? '→' : '←'} ${data.lines.find((x) => x.id === (m.from === l.id ? m.to : m.from))?.item_no ?? '?'}`,
                        title: `${money(m.amount)} ${m.from === l.id ? `moved to ${itemOf(m.to)}` : `came from ${itemOf(m.from)}`}`,
                      }))} editing={svEdit === l.id} before={data.applications[index - 1]?.number}
                      onMenu={(x, y) => setSvMenu({ lineId: l.id, x, y })}
                      onSet={async (n) => { setSvEdit(null); try { await setScheduledHere(app.id, l.id, n); onChanged() } catch (e) { onTrouble(message(e)) } }}
                      onCancel={() => setSvEdit(null)} />
                    <td {...roundCell(undefined, false, l.id, 'D')} data-label="From previous" data-nothing={f.previous ? undefined : ''}><Money n={f.previous} /></td>
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
                    <td {...roundCell(f.exact?.toDate, false, l.id, 'G')} data-label="Completed and stored" data-nothing={f.toDate ? undefined : ''}><Money n={f.toDate} /></td>
                    <td {...roundCell(f.exact?.percent, true, l.id, 'pct')} data-label="Complete">{percent(f.percent)}</td>
                    <td {...roundCell(f.exact?.balance, false, l.id, 'H')} data-label="Balance"><Money n={f.balance} /></td>
                    <td {...roundCell(f.exact?.retainage, false, l.id, 'I')} data-label="Retainage" data-nothing={f.retainage ? undefined : ''}><Money n={f.retainage} /></td>
                  </tr>
                )
  }

  // Change order lines, grouped: a register change order by its entry, lines marked as change
  // orders without one by their approval date.
  const coKey = (x: SovLine) => (x.change_order_id === 'unlinked' ? `u:${x.approved_on ?? ''}` : x.change_order_id ?? '')
  const coGroupOf = (l: SovLine) => {
    const key = coKey(l)
    const lines = data.lines.filter((x) => !x.is_heading && x.change_order_id && coKey(x) === key)
    return { key, lines, first: lines[0]?.id }
  }

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
        {pdf && (
          // The verdict first, in one line: does this application agree with the contractor's PDF?
          <button className={`pay-verdict ${why.length ? 'off' : 'ok'}`}
            onClick={() => document.querySelector('.pay-against')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            {why.length
              ? <><strong>✗ {diffs.length ? 'Differs from the contractor’s PDF' : 'Something to look at'}</strong> — {why.filter((w) => w.key !== 'cover' || why.length === 1).map((w) => CAUSE_SHORT[w.key]).join(' · ')}</>
              : <><strong>✓ Agrees with the contractor’s PDF</strong>{pdf.g702?.due != null && <> — {money(pdf.g702.due)} due on both</>}</>}
          </button>
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

      {beside && <PdfPreview bytes={beside} title={pdf?.file ?? `Application ${app.number} — contractor’s PDF`} flow docked onClose={() => setBeside(null)} />}
      {pdf && <AgainstPdf pdf={pdf} diffs={diffs} beside={!!beside} opening={opening} coHere={g.changeOrders} why={why}
        onRoundRetainage={retainageFix ? async () => {
          try { await setContract(data.contract.id, { rounding: { ...(data.contract.rounding ?? {}), I: retainageFix.way } }); onChanged() } catch (e) { onTrouble(message(e)) }
        } : undefined}
        onScheduledFromPdf={editable ? async (rows) => {
          try {
            for (const d of rows) if (d.lineId && d.col === 'C') await setScheduledHere(app.id, d.lineId, d.pdf)
            onChanged()
          } catch (e) { onTrouble(message(e)) }
        } : undefined}
        onBeside={() => (beside ? setBeside(null) : void showBeside())} onAttach={(f) => void attachPdf(f)} onForget={async () => {
        try { await setApplication(app.id, { pdf_read: null } as never); onChanged() } catch (e) { onTrouble(message(e)) }
      }} />}

      <div className="card">
        <h3>Continuation sheet</h3>
        {(() => {
          const changed = figures.lines.filter((f) => Math.abs(changeOf(f.line.id)) >= 0.005)
          if (!changed.length) return null
          const net = Math.round(changed.reduce((n, f) => n + changeOf(f.line.id), 0) * 100) / 100
          const side = (sign: number) => changed.filter((f) => Math.sign(changeOf(f.line.id)) === sign).reduce((n, f) => n + unlinked(f.line.id), 0)
          const left = Math.round(Math.max(side(1), side(-1)) * 100) / 100
          return (
            <p className="small pay-sv-summary">
              Scheduled values changed on <strong>{changed.length} {changed.length === 1 ? 'line' : 'lines'}</strong> from {index ? `Application ${data.applications[index - 1].number}` : 'the schedule of values'}
              {' · '}net {Math.abs(net) < 0.005 ? '$0, money moved between lines' : signed(net)}
              {left >= 0.005 ? <> · <span className="pay-read-warn">{money(left)} not yet linked</span> — right-click a changed value to say where it went</> : ' · all linked'}
            </p>
          )
        })()}
        {moving && (() => {
          const ch = changeOf(moving.line), opp = opposite(moving.line)
          return (
            <div className="notice pay-moving">
              <span>
                <MoneyInput className="cell mono right pay-moving-amount" value={moving.amount} autoFocus onFocus={(e) => e.target.select()} aria-label="Amount moved"
                  onChange={(raw) => setMoving((m) => (m ? { ...m, amount: raw } : m))} />
                {' '}{ch < 0 ? 'moved from' : 'came to'} {itemOf(moving.line)} — click the line it {ch < 0 ? 'went to' : 'came from'}
              </span>
              <div className="notice-actions">
                {opp.length > 1 && <button className="primary-lite small" onClick={() => {
                  let pot = Math.round((Number(moving.amount) || 0) * 100) / 100
                  const next = [...moves]
                  for (const id of opp) {
                    if (pot < 0.005) break
                    const amount = Math.round(Math.min(pot, unlinked(id)) * 100) / 100
                    next.push(ch < 0 ? { from: moving.line, to: id, amount } : { from: id, to: moving.line, amount })
                    pot = Math.round((pot - amount) * 100) / 100
                  }
                  setMoving(null); void saveMoves(next)
                }}>Every line that went {ch < 0 ? 'up' : 'down'} ({opp.length})</button>}
                <button className="link" onClick={() => setMoving(null)}>Cancel</button>
              </div>
            </div>
          )
        })()}


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
        {(
          <PayRead
            checkOnly={!editable}
            onHeadingsToLines={async (ids) => { for (const id of ids) await setSovLine(id, { is_heading: false } as never) }}
            known={data.lines.map((l) => ({ id: l.id, item_no: l.item_no, description: l.description,
              scheduled: figures.lines.find((x) => x.line.id === l.id)?.line.scheduled_value ?? l.scheduled_value,
              previous: figures.lines.find((x) => x.line.id === l.id)?.previous ?? 0, heading: l.is_heading }))}
            current={valueOf}
            number={app.number}
            start={start}
            onStarted={onStarted}
            periodTo={app.period_to}
            onAddLines={async (lines) => {
              const ids: string[] = []
              // A line that first shows up on a later application is $0 on the ones before it: its value
              // goes on this application, and carries on from here.
              for (const [k, l] of lines.entries()) {
                const id = await addSovLine(data.contract.id, { ...l, sort: nextSort + k, ...(index ? { scheduled_value: 0 } : {}) })
                if (index && l.scheduled_value) await setScheduledHere(app.id, id, l.scheduled_value)
                ids.push(id)
              }
              return ids
            }}
            onKeep={async (rows, pdf, bytes) => {
              // A certified application keeps what was billed; only its scheduled values and the PDF are taken.
              if (editable) for (const r of rows) await setBilled(app.id, r.id, r.value)
              // This application's scheduled values are the PDF's: a line it doesn't list is $0 here.
              if (pdf) await setScheduledMany(app.id, scheduledFromPdf(data.lines, pdf))
              if (editable && (pdf?.periodTo || pdf?.appliedOn)) {
                const patch: Record<string, string> = {}
                if (pdf.periodTo && pdf.periodTo !== app.period_to) patch.period_to = pdf.periodTo
                if (pdf.appliedOn && pdf.appliedOn !== app.applied_on) patch.applied_on = pdf.appliedOn
                if (Object.keys(patch).length) await setApplication(app.id, patch as never)
              }
              if (pdf) {
                // The PDF itself is kept too, to read beside the figures. Not keeping it costs only that.
                if (bytes && project) {
                  try { pdf.path = await keepPdf(bytes, pdf.file) } catch (e) { onTrouble(`The figures went in, but the PDF itself couldn’t be kept: ${message(e)}`) }
                }
                await setApplication(app.id, { pdf_read: pdf } as never)
              }
              setEdits({}); onChanged()
            }} />
        )}
        {(() => {
          const named = data.lines.filter((l) => !l.is_heading && !l.change_order_id && /^(?:c\.?\s?o\.?|change\s*order)\s*#?\s*\d+\b/i.test(l.description.trim()))
          if (!named.length) return null
          return (
            <div className="notice warn">
              <span>{named.length} {named.length === 1 ? 'line is' : 'lines are'} named like change order lines ({named.slice(0, 3).map((l) => l.item_no ?? l.description).join(', ')}{named.length > 3 ? '…' : ''}) but {named.length === 1 ? 'isn’t' : 'aren’t'} marked as change orders, so line 2 of the cover sheet leaves {named.length === 1 ? 'it' : 'them'} out.</span>
              <div className="notice-actions"><button onClick={() => { setPicked(new Set(named.map((l) => l.id))) }}>Select {named.length === 1 ? 'it' : 'them'}</button></div>
            </div>
          )
        })()}
        {changeOrders.map((co) => {
          // A change order's lines here against its amount in the change register.
          const ls = data.lines.filter((l) => l.change_order_id === co.id && !l.is_heading)
          const cost = changeCost(co)
          if (!ls.length || cost == null) return null
          const total = Math.round(ls.reduce((n, l) => n + l.scheduled_value, 0) * 100) / 100
          if (Math.abs(total - cost) < 0.005) return null
          return (
            <div key={co.id} className="notice warn">
              {co.number ?? 'A change order'}’s {ls.length} {ls.length === 1 ? 'line totals' : 'lines total'} {money(total)}; the change register has it at {money(cost)}.
            </div>
          )
        })}
        <p className="muted small pay-pick-bar">
          {picked.size
            ? <><strong className="pay-pick-count">{picked.size} {picked.size === 1 ? 'line' : 'lines'} selected</strong> — right-click one of them for what to do with them. <button className="link small" onClick={() => setPicked(new Set())}>Clear</button></>
            : 'Shift- or Ctrl-click lines to select several; right-click for what to do with them.'}
        </p>
        <div className={`pay-703-wrap${picked.size ? ' picking' : ''}`}>
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
                // A change order's lines sit together under one heading row that carries its
                // name, its total and when it was approved, at the place of its first line.
                const group = l.change_order_id && !l.is_heading ? coGroupOf(l) : null
                if (group && group.first !== l.id) return null
                if (group) {
                  const co = changeOrders.find((c) => c.id === l.change_order_id)
                  return (
                    <Fragment key={`co:${group.key}`}>
                      <tr className="pay-703-cohead">
                        <td className="mono pay-703-item" />
                        <td className="pay-703-name">
                          <strong>{co ? [co.number ?? 'Change order', co.title].filter(Boolean).join(' — ') : 'Change order lines'}</strong>
                          {!co && <span className="muted small"> not tied to an entry in the change register</span>}
                          <CoApproved lines={group.lines} onChanged={onChanged} onTrouble={onTrouble} />
                        </td>
                        <td className="right mono"><Money n={group.lines.reduce((n, x) => n + x.scheduled_value, 0)} /></td>
                        <td colSpan={7} />
                      </tr>
                      {group.lines.map((x) => row(x))}
                    </Fragment>
                  )
                }
                return row(l)
              })}
              <tr className="pay-703-total">
                <td className="pay-703-item" /><td className="pay-703-name"><strong>Total</strong></td>
                <td className="right mono" data-label="Scheduled value"><Money n={figures.totals.scheduled} strong /></td>
                <td className="right mono" data-label="From previous"><Money n={figures.totals.previous} strong /></td>
                <td className="right mono" data-label="This period"><Money n={figures.totals.thisPeriod} strong /></td>
                <td className="right mono" data-label="Stored"><Money n={figures.totals.stored} strong /></td>
                <td {...roundCell(figures.totals.exact?.toDate, false, null, 'G')} data-label="Completed and stored"><Money n={figures.totals.toDate} strong /></td>
                <td {...roundCell(figures.totals.exact?.percent, true, null, 'pct')} data-label="Complete"><strong>{percent(figures.totals.percent)}</strong></td>
                <td {...roundCell(figures.totals.exact?.balance, false, null, 'H')} data-label="Balance"><Money n={figures.totals.balance} strong /></td>
                <td {...roundCell(figures.totals.exact?.retainage, false, null, 'I')} data-label="Retainage"><Money n={figures.totals.retainage} strong /></td>
              </tr>
            </tbody>
          </table>
        </div>
        {lineMenu && (() => {
          const l = lineMenu.line
          // A right-click on a selected line acts on the whole selection; on any other line, on that line.
          const ids = picked.has(l.id) && picked.size > 1 ? data.lines.filter((x) => picked.has(x.id)).map((x) => x.id) : [l.id]
          const many = ids.length > 1
          const these = many ? `these ${ids.length} lines` : 'this line'
          const billedOn = (id: string) => data.applications.some((a) => (data.billed.get(a.id)?.get(id)?.this_period ?? 0) || (data.billed.get(a.id)?.get(id)?.stored ?? 0))
          const actions: { label: string; note?: string; run: () => Promise<void> }[] = []
          const patchAll = (patch: Record<string, unknown>) => async () => { for (const id of ids) await setSovLine(id, patch as never) }
          // The change orders it could be added to: the register's, and lines marked here without one.
          for (const co of changeOrders) {
            const on = data.lines.filter((x) => x.change_order_id === co.id && !ids.includes(x.id))
            // The change order's own approval date, as set on its heading row; none if it has none.
            const day = on.find((x) => x.approved_on)?.approved_on ?? null
            actions.push({
              label: `Add ${these} to ${co.number ?? 'change order'}${co.title ? ` — ${co.title}` : ''}`,
              note: `From the change register${on.length ? `; ${on.length} ${on.length === 1 ? 'line' : 'lines'} on it already` : ''}${changeCost(co) != null ? `; ${money(changeCost(co)!)}` : ''}.${day ? ` Approved ${usDate(day)}.` : ' Its approval date is set on its heading row.'}`,
              run: patchAll({ change_order_id: co.id, is_change_order: true, approved_on: day }),
            })
          }
          const groups = new Map<string, number>()
          for (const x of data.lines) if (x.change_order_id === 'unlinked' && !ids.includes(x.id)) groups.set(x.approved_on ?? '', (groups.get(x.approved_on ?? '') ?? 0) + 1)
          for (const [day, n] of groups) {
            actions.push({
              label: `Add ${these} to the change order lines approved ${day ? usDate(day) : 'with no date'}`,
              note: `${n} ${n === 1 ? 'line is' : 'lines are'} marked that way already.`,
              run: patchAll({ is_change_order: true, change_order_id: null, approved_on: day || null }),
            })
          }
          actions.push({
            label: `Mark ${these} as ${many ? 'change order lines' : 'a change order line'}`,
            note: 'They go under a change order heading row, where the approval date is set.',
            run: patchAll({ is_change_order: true, change_order_id: null, approved_on: null }),
          })
          if (ids.some((id) => data.lines.find((x) => x.id === id)?.change_order_id)) {
            actions.push({ label: `${many ? 'They are' : 'It is'} not a change order`, run: patchAll({ is_change_order: false, change_order_id: null }) })
          }
          if (many) {
            actions.push({ label: 'Make them headings', note: ids.some(billedOn) ? 'Some have been billed on; as headings that leaves the totals until they are line items again.' : undefined, run: patchAll({ is_heading: true }) })
            actions.push({ label: 'Make them line items', run: patchAll({ is_heading: false }) })
          } else if (l.is_heading) {
            actions.push({ label: 'Make this a line item', note: l.scheduled_value ? `Its ${money(l.scheduled_value)} scheduled value counts again.` : 'It starts with no scheduled value.', run: patchAll({ is_heading: false }) })
          } else {
            const f = figures.lines.find((x) => x.line.id === l.id)
            actions.push({ label: 'Make this a heading', note: billedOn(l.id)
              ? `It has been billed on (${money(f?.toDate ?? 0)} to date on this application); as a heading that leaves the totals. Making it a line item again brings it back.`
              : l.scheduled_value ? `Its ${money(l.scheduled_value)} scheduled value leaves the total until it is a line item again.` : undefined, run: patchAll({ is_heading: true }) })
          }
          return (
            <LineMenu at={lineMenu} onClose={() => setLineMenu(null)}
              title={many ? `${ids.length} selected lines` : [l.item_no, l.description].filter(Boolean).join(' ')}
              items={actions.map(({ label, note }) => ({ label, note }))}
              onPick={async (i) => {
                setLineMenu(null)
                try { await actions[i].run(); onChanged() } catch (e) { onTrouble(message(e)) }
              }} />
          )
        })()}
        {svMenu && (() => {
          const f = figures.lines.find((x) => x.line.id === svMenu.lineId)
          if (!f) return null
          const d = diffAt(svMenu.lineId, 'C')
          const set = async (n: number | null) => { setSvMenu(null); try { await setScheduledHere(app.id, svMenu.lineId, n); onChanged() } catch (e) { onTrouble(message(e)) } }
          const items: { label: string; note?: string; run: () => void }[] = []
          const ch = changeOf(svMenu.lineId)
          if (Math.abs(ch) >= 0.005) items.push({ label: ch < 0 ? 'Moved to a different line…' : 'Came from a different line…', note: `${signed(ch)} from the previous application — then click that line`,
            run: () => { setSvMenu(null); setMoving({ line: svMenu.lineId, amount: String(unlinked(svMenu.lineId) || Math.abs(ch)) }) } })
          moves.forEach((m, k) => {
            if (m.from !== svMenu.lineId && m.to !== svMenu.lineId) return
            items.push({ label: `Undo: ${m.from === svMenu.lineId ? `moved to ${itemOf(m.to)}` : `came from ${itemOf(m.from)}`} ${money(m.amount)}`, run: () => { setSvMenu(null); void saveMoves(moves.filter((_, j) => j !== k)) } })
          })
          if (d) items.push({ label: `Use the PDF’s ${money(d.pdf)}`, note: `${signed(d.pdf - d.app)} on this application and the ones after it`, run: () => void set(d.pdf) })
          items.push({ label: 'Enter a value for this application…', run: () => { setSvMenu(null); setSvEdit(svMenu.lineId) } })
          if (f.scheduledHere) items.push({ label: `Back to ${money(f.carried)}`, note: index ? `carried from Application ${data.applications[index - 1].number}` : 'the schedule of values', run: () => void set(null) })
          if (!items.length) return null
          return <LineMenu at={svMenu} onClose={() => setSvMenu(null)} title={`${[f.line.item_no, f.line.description].filter(Boolean).join(' ')} — scheduled value on Application ${app.number}`}
            items={items} onPick={(i) => items[i].run()} />
        })()}
        {cellMenu && (() => {
          const l = data.lines.find((x) => x.id === cellMenu.lineId)
          const mine = app.rounding?.[cellMenu.lineId]?.[cellMenu.col]
          const colWay = rounding[cellMenu.col]
          const items: [CellWay | null, string][] = [
            [null, `As the column — ${colWay ? ROUND_SAYS[colWay].toLowerCase() : 'exact'}`],
            ['exact', cellMenu.col === 'pct' ? 'Exact, to two places' : 'Exact, to the cent'],
            ['nearest', 'Round to the nearest whole'], ['up', 'Round up'], ['down', 'Round down'],
          ]
          return (
            <LineMenu at={cellMenu} onClose={() => setCellMenu(null)}
              title={`${[l?.item_no, l?.description].filter(Boolean).join(' ')} — ${cellMenu.col === 'pct' ? '%' : `column ${cellMenu.col}`}, this cell only`}
              items={items.map(([w, label]) => ({ label: (mine ?? null) === w ? `✓ ${label}` : label }))}
              onPick={async (i) => {
                const w = items[i][0]
                setCellMenu(null)
                const next = JSON.parse(JSON.stringify(app.rounding ?? {})) as Record<string, Partial<Record<RoundColumn, CellWay>>>
                const cell = { ...(next[cellMenu.lineId] ?? {}) }
                if (w) cell[cellMenu.col] = w; else delete cell[cellMenu.col]
                if (Object.keys(cell).length) next[cellMenu.lineId] = cell; else delete next[cellMenu.lineId]
                try { await setApplication(app.id, { rounding: next } as never); onChanged() } catch (e) { onTrouble(message(e)) }
              }} />
          )
        })()}
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

/**
 * CAzen's arithmetic set against the contractor's own application: every figure the PDF had that
 * CAzen works out differently. It is worked out again on every change, so a figure put right, or
 * a column rounded as the contractor rounds it, drops off the list.
 */
function AgainstPdf({ pdf, diffs, onForget, beside, opening, onBeside, onAttach, why, onRoundRetainage, onScheduledFromPdf }: {
  /** Take the PDF's scheduled values onto this application, for the lines given. */
  onScheduledFromPdf?: (rows: Discrepancy[]) => void
  /** Line 2 as CAzen has it: the change order lines on this application. */
  coHere: number
  /** The differences sorted by what causes them. */
  why: import('../lib/payCompare').DiffGroup[]
  /** Round retainage the way that makes it agree, where there is one. */
  onRoundRetainage?: () => void
  pdf: import('../lib/payCompare').PdfRead
  diffs: Discrepancy[]
  onForget: () => void
  beside: boolean
  opening: boolean
  onBeside: () => void
  onAttach: (f: File | undefined) => void
}) {
  const attach = useRef<HTMLInputElement>(null)
  const say = (d: Discrepancy, n: number) => (d.col === 'pct' ? `${n.toFixed(2)}%` : n.toLocaleString('en-US', { style: 'currency', currency: 'USD' }))
  const read = new Date(pdf.read_at)
  return (
    <div className={`card pay-against${why.length ? ' has-diffs' : ''}`}>
      <div className="pad-head">
        <h3>Against the contractor’s PDF</h3>
        <span className="pay-against-tools">
          {pdf.path
            ? <button className={beside ? 'primary-lite on' : 'primary-lite'} onClick={onBeside} disabled={opening}>{opening ? 'Opening…' : beside ? 'Close the PDF' : 'Show the PDF side by side'}</button>
            : <>
              <button className="primary-lite" onClick={() => attach.current?.click()} title="This PDF was read before PDFs were kept; choose it again to keep it and look at it beside the figures">Add the PDF to see it side by side</button>
              <input ref={attach} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { onAttach(e.target.files?.[0]); e.target.value = '' }} />
            </>}
          <button className="link small" onClick={onForget} title="Stop comparing with this PDF">Forget the PDF</button>
        </span>
      </div>
      <p className="muted small">
        {pdf.file ? <>{pdf.file} · read </> : 'Read '}{read.toLocaleDateString('en-US')} · only this period and stored are taken from the PDF; CAzen works out the rest.
      </p>
      {!why.length
        ? <p className="pay-read-ok">Every figure agrees with the PDF.</p>
        : (
          <>
            <p className="pay-against-lead">
              {diffs.length
                ? <strong className="pay-read-warn">{diffs.length} {diffs.length === 1 ? 'figure differs' : 'figures differ'} from the PDF</strong>
                : <strong className="pay-read-warn">The figures agree; see below</strong>}
            </p>
            <table className="pay-against-table">
              <thead><tr><th>Where</th><th>Column</th><th className="right">PDF</th><th className="right">CAzen</th><th className="right">Difference</th></tr></thead>
              {why.map((grp) => (
                <tbody key={grp.key} className={`pay-why pay-why-${grp.key}`}>
                  <tr className="pay-why-head">
                    <td colSpan={5}>
                      <span className="pay-why-title">{grp.title}</span>
                      {grp.detail && <span className="muted small"> — {grp.detail}</span>}
                      {grp.follow > 0 && <span className="muted small"> (+{grp.follow} {grp.follow === 1 ? 'figure' : 'figures'} carried from {grp.rows.length === 1 ? 'it' : 'these'})</span>}
                      {grp.key === 'retainage' && onRoundRetainage && <button className="primary-lite small" onClick={onRoundRetainage}>Round retainage the PDF’s way</button>}
                      {grp.key === 'scheduled' && onScheduledFromPdf && <button className="primary-lite small" onClick={() => onScheduledFromPdf(grp.rows)}>Use the PDF’s values on this application</button>}
                    </td>
                  </tr>
                  {grp.rows.map((d, i) => (
                    <tr key={i}>
                      <td>{d.where === 'g702' ? 'Cover sheet' : d.label}</td>
                      <td>{d.where === 'g702' ? d.label : COL_SAYS[d.col as PdfCol]}</td>
                      <td className="right mono">{say(d, d.pdf)}</td>
                      <td className="right mono">{say(d, d.app)}</td>
                      <td className="right mono">{d.col === 'pct' ? `${(d.pdf - d.app).toFixed(2)}` : (d.pdf - d.app).toLocaleString('en-US', { style: 'currency', currency: 'USD', signDisplay: 'always' })}</td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </>
        )}
    </div>
  )
}

const ROUND_SAYS: Record<RoundWay | 'exact', string> = {
  exact: 'Exact, to the cent', nearest: 'Rounded to the nearest whole dollar', up: 'Rounded up to a whole dollar', down: 'Rounded down to a whole dollar',
  period: 'Each application’s retainage rounded to the dollar when billed, then added up',
}
const ROUND_MARK: Record<RoundWay, string> = { nearest: '≈', up: '↑', down: '↓', period: 'Σ' }
const CELL_SAYS: Record<CellWay, string> = { exact: 'Left exact', nearest: 'Rounded to the nearest whole', up: 'Rounded up', down: 'Rounded down', period: 'Each application’s retainage rounded, then added up' }

/** Right-click on a line of the schedule of values. */
const signed = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', signDisplay: 'always' })

/**
 * Column C on one application. With a PDF read, it is the PDF's value; without one, it is blank
 * until this application's value is typed in, and the figures use the previous application's.
 */
function ScheduledCell({ f, diff, link, noPdf, editing, before, onMenu, onSet, onCancel, change = 0, links = [] }: {
  /** What this line's value changed by from the previous application. */
  change?: number
  /** Moves linked to this line, as "→ 78" with the detail on hover. */
  links?: { text: string; title: string }[]
  f: import('../lib/payapps').LineFigures
  diff?: Discrepancy
  /** Tied to other lines by moves: some of the change still unaccounted for, or all of it. */
  link?: 'linked' | 'settled'
  editable?: boolean
  /** No PDF has been read for this application. */
  noPdf: boolean
  editing: boolean
  before?: number
  onMenu: (x: number, y: number) => void
  onSet: (n: number) => void
  onCancel: () => void
}) {
  const [typed, setTyped] = useState('')
  const from = before ? `Application ${before}` : 'the schedule of values'
  const blank = noPdf && !f.scheduledHere
  if (editing || blank) {
    return (
      <td className="right pay-sv-blank" data-label="Scheduled value" title={`Not set on this application; the figures use ${money(f.carried)} from ${from}. Type this application’s value.`}>
        <MoneyInput className="cell mono right" value={typed || (editing ? String(f.line.scheduled_value) : '')} autoFocus={editing}
          placeholder={money(f.carried)}
          onChange={(raw) => setTyped(raw)}
          onBlur={() => { if (typed) { onSet(Number(typed) || 0); setTyped('') } else if (editing) onCancel() }}
          onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Escape') { setTyped(''); onCancel() } if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          aria-label={`Scheduled value for ${f.line.description}`} />
      </td>
    )
  }
  const title = [
    f.scheduledHere ? `This application: ${money(f.line.scheduled_value)}. ${from}: ${money(f.carried)}.` : `Same as ${from}.`,
    diff ? (diff.missing ? 'This line isn’t on the PDF.' : `PDF: ${money(diff.pdf)} (${signed(diff.pdf - diff.app)}).`) : '',
    Math.abs(change) >= 0.005 ? `${signed(change)} from ${from}.` : '',
    ...links.map((x) => x.title),
    'Right-click to change it, or to say where the money went.',
  ].filter(Boolean).join('\n')
  return (
    <td className={`right mono${diff && !link ? ' pay-pdf-diff' : ''}${link ? ` pay-sv-${link}` : Math.abs(change) >= 0.005 ? ' pay-sv-changed' : ''}`} data-label="Scheduled value" title={title}
      onContextMenu={(e) => { e.preventDefault(); onMenu(e.clientX, e.clientY) }}>
      <Money n={f.line.scheduled_value} />
      {diff && <div className="pay-sv-diff"><span className="small">{diff.missing ? 'not on PDF' : `PDF ${signed(diff.pdf - diff.app)}`}</span></div>}
      {(Math.abs(change) >= 0.005 || links.length > 0) && (
        <div className="pay-sv-change">{Math.abs(change) >= 0.005 && <span>{signed(change)}</span>}{links.map((x, i) => <span key={i} className="pay-sv-link" title={x.title}>{x.text}</span>)}</div>
      )}
    </td>
  )
}

function LineMenu({ at, title, items, onPick, onClose }: {
  at: { x: number; y: number }
  title: string
  items: { label: string; note?: string }[]
  onPick: (i: number) => void
  onClose: () => void
}) {
  useEffect(() => {
    const off = (e: Event) => { if (!(e.target as Element)?.closest?.('.pay-round-menu')) onClose() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('pointerdown', off); window.addEventListener('keydown', key)
    return () => { window.removeEventListener('pointerdown', off); window.removeEventListener('keydown', key) }
  }, [onClose])
  // Kept inside the window: opened low on the sheet, the menu rises above the pointer instead of
  // running off the bottom, and scrolls inside itself if it is taller than the window.
  const box = useRef<HTMLDivElement>(null)
  const [top, setTop] = useState(at.y + 4)
  useLayoutEffect(() => {
    const h = box.current?.offsetHeight ?? 0
    setTop(Math.max(8, Math.min(at.y + 4, window.innerHeight - h - 8)))
  }, [at.y, items.length])
  return (
    <div ref={box} className="pay-round-menu pay-line-menu" role="menu" style={{ left: Math.min(at.x, window.innerWidth - 300), top, maxHeight: 'calc(100vh - 16px)', overflowY: 'auto' }}>
      <div className="muted small pay-round-title">{title}</div>
      {items.map((it, i) => (
        <button key={it.label} role="menuitem" onClick={() => onPick(i)}>
          {it.label}{it.note && <span className="muted small pay-line-note">{it.note}</span>}
        </button>
      ))}
    </div>
  )
}

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
    ...(at.col === 'I' ? [['period', 'Round each application’s retainage, then add them up'] as [RoundWay, string]] : []),
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
 * When the owner approved a change order — once, on its heading row on the G703.
 *
 * It is kept on each of the change order's lines (the change order summary reads it there), and
 * set for all of them together here, so the lines can never disagree. Nothing is filled in until
 * it is given.
 */
function CoApproved({ lines, onChanged, onTrouble }: {
  lines: SovLine[]
  onChanged: () => void
  onTrouble: (m: string) => void
}) {
  const days = [...new Set(lines.map((l) => l.approved_on ?? ''))]
  const day = days.length === 1 ? days[0] : ''
  async function set(value: string) {
    if (days.length === 1 && value === day) return
    try {
      for (const l of lines) await setSovLine(l.id, { approved_on: value || null })
      onChanged()
    } catch (e) { onTrouble(message(e)) }
  }
  return (
    <label className="pay-co-approved small">Approved{' '}
      <input type="date" className="pay-co-date" key={day} defaultValue={day}
        aria-label="Date the change order was approved"
        onBlur={(e) => void set(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
      {days.length > 1 && <span className="muted"> (its lines have different dates; a date here sets them all)</span>}
    </label>
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
