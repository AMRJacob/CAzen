import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageTitle } from '../components/PageTitle'
import { Gantt } from '../components/Gantt'
import { useProject } from '../lib/project'
import { message } from '../lib/errors'
import { today } from '../lib/dates'
import { money, percent } from '../lib/money'
import { Money } from '../components/Money'
import {
  addActivity, compare, listActivities, removeActivity, ScheduleNotSetUp, setActivity, setCovered,
  type Activity,
} from '../lib/schedule'
import { listContracts, loadContract, type LoadedContract } from '../lib/payappsDb'
import { figure } from '../lib/payapps'

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

  const projectId = current?.id
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
      .map((a) => ({ billed: data.billed.get(a.id) ?? new Map(), period_to: a.period_to }))
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
            <button onClick={() => void add(false)} disabled={!projectId}>Add activity</button>
            <button onClick={() => void add(true)} disabled={!projectId}>Add heading</button>
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

      {!activities ? <p className="muted">Loading…</p> : (
        <>
          <div className="card">
            <h3>The schedule</h3>
            <Gantt activities={activities} today={today()} />
          </div>

          <div className="card">
            <h3>Activities</h3>
            <p className="muted small">
              What each activity covers is how the schedule and the applications for payment are
              compared: an activity with no lines against it is drawn, but not compared.
            </p>
            {!activities.length ? <p className="muted small">Nothing in the schedule yet.</p> : (
              <table className="sched-table">
                <thead>
                  <tr>
                    <th>Activity</th><th>Starts</th><th>Ends</th>
                    <th className="right">Done</th><th>Covers</th><th />
                  </tr>
                </thead>
                <tbody>
                  {activities.map((a) => (
                    <tr key={a.id} className={a.is_heading ? 'sched-heading' : undefined}>
                      <td>
                        <input value={a.name} aria-label="Activity name"
                          onChange={(e) => setActivities((all) => (all ?? []).map((x) => (x.id === a.id ? { ...x, name: e.target.value } : x)))}
                          onBlur={(e) => change(a.id, { name: e.target.value })} />
                      </td>
                      {a.is_heading ? <td colSpan={4} /> : (
                        <>
                          <td>
                            <input type="date" value={a.starts_on ?? ''} aria-label="Starts"
                              onChange={(e) => change(a.id, { starts_on: e.target.value || null })} />
                          </td>
                          <td>
                            <input type="date" value={a.ends_on ?? ''} aria-label="Ends"
                              onChange={(e) => change(a.id, { ends_on: e.target.value || null })} />
                          </td>
                          <td className="right">
                            <input className="mono sched-pc" inputMode="decimal" value={a.percent}
                              aria-label="Percent complete"
                              onChange={(e) => setActivities((all) => (all ?? []).map((x) => (x.id === a.id ? { ...x, percent: Number(e.target.value) || 0 } : x)))}
                              onBlur={(e) => change(a.id, { percent: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} />
                          </td>
                          <td>
                            <button className="link" onClick={() => setPicking(picking === a.id ? null : a.id)}>
                              {a.lines.length ? `${a.lines.length} ${a.lines.length === 1 ? 'line' : 'lines'}` : 'nothing yet'}
                            </button>
                          </td>
                        </>
                      )}
                      <td className="right">
                        <button className="link danger-link" onClick={() => {
                          setActivities((all) => (all ?? []).filter((x) => x.id !== a.id))
                          removeActivity(a.id).catch((e) => setError(message(e)))
                        }}>Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
