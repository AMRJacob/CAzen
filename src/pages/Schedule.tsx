import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageTitle } from '../components/PageTitle'
import { Gantt } from '../components/Gantt'
import { useProject } from '../lib/project'
import { message } from '../lib/errors'
import { today } from '../lib/dates'
import { money, percent } from '../lib/money'
import { Money } from '../components/Money'
import {
  addActivities, addActivity, compare, listActivities, removeActivity, ScheduleNotSetUp, setActivity, setCovered,
  type Activity,
} from '../lib/schedule'
import { listContracts, loadContract, type LoadedContract } from '../lib/payappsDb'
import { figure } from '../lib/payapps'
import { ScheduleImport, type ImportResult } from '../components/ScheduleImport'
import { afterIssue, diffSchedule, finishSlip, summary, type Change, type Line } from '../lib/scheduleDiff'
import { keepVersion, listVersions, VersionsNotSetUp, type ScheduleVersion } from '../lib/scheduleVersions'
import { usDate } from '../lib/dates'
import { suggestLines } from '../lib/scheduleRead'

/**
 * The construction schedule.
 *
 * It earns its place by being comparable to the pay applications: every activity says which
 * schedule-of-values lines it covers, so what the schedule claims is done can be set beside
 * what the contractor has asked to be paid for. The gap is the thing worth looking at before
 * certifying anything.
 */
export default function Schedule() {
  const { current } = useProject()
  const [activities, setActivities] = useState<Activity[] | null>(null)
  const [data, setData] = useState<LoadedContract | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [needsSetUp, setNeedsSetUp] = useState(false)
  const [picking, setPicking] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [said, setSaid] = useState<string | null>(null)

  const projectId = current?.id
  /** Earlier issues of the schedule; null until read, false where there is nowhere to keep them. */
  const [versions, setVersions] = useState<ScheduleVersion[] | null | false>(null)
  useEffect(() => {
    if (!projectId) return
    listVersions(projectId).then(setVersions).catch(() => setVersions(false))
  }, [projectId])
  const load = useCallback(() => {
    if (!projectId) return
    listActivities(projectId)
      .then((a) => { setActivities(a); setNeedsSetUp(false) })
      .catch((e) => {
        if (e instanceof ScheduleNotSetUp) { setNeedsSetUp(true); setActivities([]) }
        else setError(message(e))
      })
    listContracts(projectId)
      .then((cs) => (cs[0] ? loadContract(cs[0].id) : null))
      .then(setData)
      .catch(() => setData(null))
  }, [projectId])
  useEffect(() => { load() }, [load])

  /** The latest application, which is what "billed so far" means. */
  const billedByLine = useMemo(() => {
    const out = new Map<string, number>()
    if (!data || !data.applications.length) return out
    const last = data.applications[data.applications.length - 1]
    const earlier = data.applications.slice(0, -1)
      .map((a) => ({ billed: data.billed.get(a.id) ?? new Map(), period_to: a.period_to, rounding: a.rounding, moves: a.moves }))
    const f = figure(data.contract, data.lines, last, data.billed.get(last.id) ?? new Map(), earlier, data.steps)
    for (const line of f.lines) out.set(line.line.id, line.toDate)
    return out
  }, [data])

  const valueOf = useCallback(
    (id: string) => data?.lines.find((l) => l.id === id)?.scheduled_value ?? 0, [data])
  const billedOf = useCallback((id: string) => billedByLine.get(id) ?? 0, [billedByLine])

  const rows = useMemo(
    () => (activities ? compare(activities, valueOf, billedOf) : []),
    [activities, valueOf, billedOf])

  async function add(heading: boolean) {
    if (!projectId) return
    const sort = (activities ?? []).reduce((m, a) => Math.max(m, a.sort), 0) + 1
    try {
      const made = await addActivity({
        project_id: projectId,
        contract_id: data?.contract.id ?? null,
        name: heading ? 'New heading' : 'New activity',
        is_heading: heading,
        starts_on: heading ? null : today(),
        ends_on: heading ? null : today(),
        sort,
      })
      setActivities((all) => [...(all ?? []), made])
    } catch (e) {
      if (e instanceof ScheduleNotSetUp) setNeedsSetUp(true)
      else setError(message(e))
    }
  }

  /** What was read from the contractor's schedule: new rows in one request, known ones updated. */
  async function keepImport(r: ImportResult) {
    if (!projectId) return
    // What this issue changes, worked out against the schedule as it stands before any of it is applied.
    const before: Line[] = (activities ?? []).map((a) => ({ name: a.name, is_heading: a.is_heading, starts_on: a.starts_on, ends_on: a.ends_on, percent: a.percent }))
    const changes = diffSchedule(before, r.issue.rows)
    const snapshot = afterIssue(before, r.issue.rows)
    // The schedule takes the order this issue prints its rows in — an outline means nothing out
    // of order. Rows already there that this issue does not have keep their order, after it.
    const at = new Map<string, number>(), addAt = new Map<number, number>()
    r.order.forEach((o, i) => { if ('id' in o) at.set(o.id, (i + 1) * 10); else addAt.set(o.add, (i + 1) * 10) })
    const after = (r.order.length + 1) * 10
    const rest = (activities ?? []).filter((a) => !at.has(a.id)).sort((a, b) => a.sort - b.sort)
    rest.forEach((a, k) => at.set(a.id, after + k * 10))
    const made = await addActivities(r.add.map((a, i) => ({
      project_id: projectId, contract_id: data?.contract.id ?? null,
      name: a.name, is_heading: a.is_heading, starts_on: a.starts_on, ends_on: a.ends_on,
      percent: a.percent, sort: addAt.get(i) ?? after + rest.length * 10 + i, lines: a.lines,
      level: a.level ?? 0, ref: a.no ?? null,
    })))
    const patched = new Map(r.update.map((u) => [u.id, { ...u.patch, sort: at.get(u.id)! }]))
    for (const [id, patch] of patched) await setActivity(id, patch)
    // Only rows whose place moved are touched.
    for (const a of rest) if (a.sort !== at.get(a.id)) await setActivity(a.id, { sort: at.get(a.id)! })
    setActivities((all) => [...(all ?? []).map((a) => ({ ...a, ...(patched.get(a.id) ?? {}), sort: at.get(a.id) ?? a.sort })), ...made].sort((a, b) => a.sort - b.sort))
    const tied = made.filter((a) => a.lines.length).length
    let recorded = ''
    try {
      const v = await keepVersion({ project_id: projectId, label: r.issue.label, issued_on: r.issue.issued_on, snapshot, changes })
      setVersions((all) => [v, ...(all || [])])
      recorded = before.length ? `Kept as an issue in the history: ${summary(changes)}` : 'Kept as the first issue in the history'
    } catch (e) {
      // The schedule itself is updated either way; only the record of the issue is missing.
      recorded = e instanceof VersionsNotSetUp ? 'The history of issues is not being kept yet (migration 0039)' : `The issue could not be added to the history: ${message(e)}`
    }
    setSaid([
      made.length ? `${made.length} added` : '', r.update.length ? `${r.update.length} updated` : '',
      tied ? `${tied} tied to the schedule of values` : '',
    ].filter(Boolean).join(', ') + '. ' + recorded + '.')
  }

  /** Offer a tie for every activity that has none, from its name. Ones already tied are left alone. */
  function suggestTies() {
    if (!data || !projectId || !activities) return
    let n = 0
    const next = activities.map((a) => {
      if (a.is_heading || a.lines.length) return a
      const ids = suggestLines(a.name, data.lines)
      if (!ids.length) return a
      n++
      setCovered(projectId, a.id, ids).catch((e) => setError(message(e)))
      return { ...a, lines: ids }
    })
    setActivities(next)
    const left = next.filter((a) => !a.is_heading && !a.lines.length).length
    setSaid(n
      ? `${n} ${n === 1 ? 'activity' : 'activities'} tied by name — each says what it covers, and any of them can be changed.${left ? ` ${left} matched nothing.` : ''}`
      : 'No activity’s name matched a line of the schedule of values.')
  }

  const lineName = (id: string) => {
    const l = data?.lines.find((x) => x.id === id)
    return l ? `${l.item_no ? `${l.item_no} · ` : ''}${l.description}` : 'a line'
  }
  const untied = (activities ?? []).filter((a) => !a.is_heading && !a.lines.length).length

  function change(id: string, patch: Partial<Activity>) {
    setActivities((all) => (all ?? []).map((a) => (a.id === id ? { ...a, ...patch } : a)))
    setActivity(id, patch).catch((e) => setError(message(e)))
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <PageTitle>Construction schedule</PageTitle>
          <p className="lead">
            {current ? <>{current.number} {current.name} · </> : null}
            What is meant to happen when, and whether the applications for payment agree with it.
          </p>
        </div>
        {!needsSetUp && (
          <div className="inline-form">
            <button className="primary" onClick={() => { setImporting(true); setSaid(null) }} disabled={!projectId || importing}>Read from a PDF</button>
            <button onClick={() => void add(false)} disabled={!projectId}>Add activity</button>
            <button onClick={() => void add(true)} disabled={!projectId}>Add heading</button>
            <Link className="trb-open" to="/trades">Sort into trades</Link>
          </div>
        )}
      </div>

      {error && <div className="notice error">{error}</div>}
      {needsSetUp && (
        <div className="notice warn">
          The schedule's two tables are not in this database. The migration is in the repository
          at <code>supabase/migrations/0028_construction_schedule.sql</code>; everything on this page
          works as soon as it has been run.
        </div>
      )}

      {said && <div className="notice">{said}</div>}
      {importing && activities && (
        <ScheduleImport existing={activities} lines={data?.lines ?? null}
          onKeep={keepImport} onDone={() => setImporting(false)} />
      )}

      {!activities ? <p className="muted">Loading…</p> : (
        <>
          <div className="card">
            <h3>The schedule</h3>
            {!activities.length ? <p className="muted small">Nothing in the schedule yet.</p> : (
              <>
                <p className="muted small">
                  Right-click a line to change it.
                  {data && untied > 0 && (
                    <> {untied} {untied === 1 ? 'activity is' : 'activities are'} not yet tied to pay lines and so {untied === 1 ? 'is' : 'are'} not compared below. <button className="link" onClick={suggestTies}>Suggest ties from the names</button></>
                  )}
                </p>
                <Gantt activities={activities} today={today()} foldKey={projectId ? `cazen.schedule.fold.${projectId}` : undefined}
                  linesOf={(a) => (a.lines.length ? `${lineName(a.lines[0])}${a.lines.length > 1 ? ` +${a.lines.length - 1}` : ''}` : 'none')}
                  onChange={change}
                  onCovers={(id) => setPicking(picking === id ? null : id)}
                  onRemove={(id) => {
                    setActivities((all) => (all ?? []).filter((x) => x.id !== id))
                    removeActivity(id).catch((e) => setError(message(e)))
                  }} />
              </>
            )}

            {picking && data && (
              <Covers
                activity={activities.find((a) => a.id === picking)!}
                lines={data.lines}
                onDone={() => setPicking(null)}
                onSave={(ids) => {
                  setActivities((all) => (all ?? []).map((x) => (x.id === picking ? { ...x, lines: ids } : x)))
                  if (projectId) setCovered(projectId, picking, ids).catch((e) => setError(message(e)))
                }} />
            )}
          </div>

          <div className="card">
            <h3>Against the applications for payment</h3>
            {!data ? <p className="muted small">No contract set up for this project yet.</p>
              : !rows.length ? (
                <p className="muted small">
                  Nothing to compare yet — an activity is compared once it says which lines of the
                  schedule of values it covers.
                </p>
              ) : (
                <table className="sched-table sched-compare">
                  <thead>
                    <tr>
                      <th>Activity</th><th className="right">Value</th>
                      <th className="right">Schedule says</th><th className="right">Billed</th>
                      <th className="right">Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.activity.id} className={Math.abs(r.gap) >= 10 ? 'sched-apart' : undefined}>
                        <td>{r.activity.name}</td>
                        <td className="right mono"><Money n={r.value} /></td>
                        <td className="right mono">{percent(r.planned)}</td>
                        <td className="right mono">{percent(r.billed)}</td>
                        <td className="right mono">
                          {r.gap > 0 ? `+${percent(r.gap)} billed` : r.gap < 0 ? `${percent(Math.abs(r.gap))} behind` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            {rows.some((r) => Math.abs(r.gap) >= 10) && (
              <p className="muted small">
                Highlighted rows are ten points or more apart. A contractor billing ahead of their
                own schedule, or a schedule that has not been updated since the last application —
                the figures say which only once somebody asks.
              </p>
            )}
          </div>
        </>
      )}

      {versions && versions.length > 0 && <History versions={versions} />}
    </section>
  )
}

/** Which schedule-of-values lines an activity covers. */
function Covers({ activity, lines, onSave, onDone }: {
  activity: Activity
  lines: { id: string; item_no: string | null; description: string; scheduled_value: number; is_heading: boolean }[]
  onSave: (ids: string[]) => void
  onDone: () => void
}) {
  const [picked, setPicked] = useState<string[]>(activity.lines)
  return (
    <div className="sched-covers">
      <p className="small"><strong>Which lines does “{activity.name}” cover?</strong></p>
      <div className="pr-pick">
        {lines.filter((l) => !l.is_heading).map((l) => (
          <label key={l.id} className="check small">
            <input type="checkbox" checked={picked.includes(l.id)}
              onChange={(e) => setPicked((v) => (e.target.checked ? [...v, l.id] : v.filter((x) => x !== l.id)))} />
            {l.item_no ? `${l.item_no} · ` : ''}{l.description}
            <span className="muted"> {money(l.scheduled_value)}</span>
          </label>
        ))}
      </div>
      <div className="folder-actions">
        <button className="primary-lite" onClick={() => { onSave(picked); onDone() }}>
          Save {picked.length || 'none'}
        </button>
        <button className="link" onClick={onDone}>Cancel</button>
      </div>
    </div>
  )
}

const day = (iso: string | null) => (iso ? usDate(iso) : '—')
const signed = (n: number | null) => (n == null ? '' : n === 0 ? '' : ` (${n > 0 ? '+' : '−'}${Math.abs(n)} ${Math.abs(n) === 1 ? 'day' : 'days'})`)

/** One change, as a sentence somebody could read out in an OAC meeting. */
function said(c: Change): string {
  if (c.kind === 'added') return `${c.name} — added${c.starts_on ? `, ${day(c.starts_on)} to ${day(c.ends_on)}` : ''}`
  if (c.kind === 'missing') return `${c.name} — not in this issue (left in the schedule)`
  if (c.kind === 'progress') return `${c.name} — ${c.from}% to ${c.to}%`
  return `${c.name} — ${[
    c.start ? `start ${day(c.start.from)} → ${day(c.start.to)}${signed(c.start.days)}` : '',
    c.end ? `finish ${day(c.end.from)} → ${day(c.end.to)}${signed(c.end.days)}` : '',
  ].filter(Boolean).join('; ')}`
}

/**
 * The issues of the schedule, newest first: what each changed, and the schedule as it stood.
 * A contractor's schedule is reissued as the job moves; this is where the one before can still
 * be read, and where "when did roofing slip?" has an answer.
 */
function History({ versions }: { versions: ScheduleVersion[] }) {
  const [open, setOpen] = useState<string | null>(null)
  const [whole, setWhole] = useState<string | null>(null)
  return (
    <section className="sched-history">
      <h2>Issues of the schedule</h2>
      <ul>
        {versions.map((v, i) => {
          const older = versions[i + 1]
          const slip = older ? finishSlip(older.snapshot, v.snapshot) : null
          const moves = v.changes.filter((c) => c.kind !== 'progress')
          return (
            <li key={v.id}>
              <button className="sched-issue-row" aria-expanded={open === v.id} onClick={() => { setOpen(open === v.id ? null : v.id); setWhole(null) }}>
                <strong>{day(v.issued_on)}</strong>
                <span>{v.label ?? (older ? 'Update' : 'First issue')}</span>
                <span className="muted">{older ? summary(v.changes) : `${v.snapshot.filter((l) => !l.is_heading).length} activities`}</span>
                {slip ? <span className={slip > 0 ? 'due' : 'ok-text'}>finish {slip > 0 ? 'later' : 'earlier'} by {Math.abs(slip)} {Math.abs(slip) === 1 ? 'day' : 'days'}</span> : null}
              </button>
              {open === v.id && (
                <div className="sched-issue-body">
                  {older && (moves.length ? <ul className="sched-changes">{moves.map((c, n) => <li key={n} className={`chg-${c.kind}`}>{said(c)}</li>)}</ul>
                    : <p className="muted small">No dates changed, nothing added, nothing missing.</p>)}
                  <button className="link" onClick={() => setWhole(whole === v.id ? null : v.id)}>{whole === v.id ? 'Hide the schedule as it stood' : 'Show the schedule as it stood'}</button>
                  {whole === v.id && (
                    <table className="sched-old">
                      <thead><tr><th>Activity</th><th>Starts</th><th>Ends</th><th className="right">Done</th></tr></thead>
                      <tbody>
                        {v.snapshot.map((l, n) => (l.is_heading
                          ? <tr key={n} className="sched-old-head"><td colSpan={4}>{l.name}</td></tr>
                          : <tr key={n}><td>{l.name}</td><td>{day(l.starts_on)}</td><td>{day(l.ends_on)}</td><td className="right">{l.percent ? `${l.percent}%` : '—'}</td></tr>))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
