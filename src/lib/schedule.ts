import { db } from './supabase'

/**
 * The construction schedule, and what it says about a pay application.
 *
 * A schedule on its own is a picture. Its use here is as a second opinion: the contractor
 * says the masonry is 62% done and wants paying for it, and the schedule — which the same
 * contractor wrote — says it should be 40% done by now. Neither number settles anything, but
 * the gap between them is the question worth asking before certifying.
 *
 * An activity covers whichever schedule-of-values lines it covers, many to many, because the
 * two lists are drawn up by different people for different purposes and rarely line up.
 */

export interface Activity {
  id: string
  project_id: string
  contract_id: string | null
  name: string
  is_heading: boolean
  starts_on: string | null
  ends_on: string | null
  /** What the contractor says is done on this activity. */
  percent: number
  sort: number
  /** The schedule-of-values lines this activity covers. */
  lines: string[]
}

const COLUMNS = 'id, project_id, contract_id, name, is_heading, starts_on, ends_on, percent, sort'

/** Thrown when the schedule tables are not in the database yet. */
export class ScheduleNotSetUp extends Error {
  constructor() { super('The construction schedule tables are not in the database yet.') }
}

const notThere = (e: unknown): boolean => {
  const m = (e as { message?: string; code?: string } | null)
  return m?.code === '42P01' || /schedule_activit|does not exist|schema cache/i.test(m?.message ?? '')
}

export async function listActivities(projectId: string): Promise<Activity[]> {
  try {
    const client = db()
    const [acts, links] = await Promise.all([
      client.from('schedule_activities').select(COLUMNS).eq('project_id', projectId).order('sort'),
      client.from('schedule_activity_lines').select('activity_id, sov_line_id').eq('project_id', projectId),
    ])
    if (acts.error) throw acts.error
    if (links.error) throw links.error
    const covered = new Map<string, string[]>()
    for (const l of (links.data ?? []) as { activity_id: string; sov_line_id: string }[]) {
      covered.set(l.activity_id, [...(covered.get(l.activity_id) ?? []), l.sov_line_id])
    }
    return ((acts.data ?? []) as unknown as Omit<Activity, 'lines'>[])
      .map((a) => ({ ...a, percent: Number(a.percent), lines: covered.get(a.id) ?? [] }))
  } catch (e) {
    if (notThere(e)) throw new ScheduleNotSetUp()
    throw e
  }
}

export async function addActivity(a: {
  project_id: string
  contract_id: string | null
  name: string
  is_heading?: boolean
  starts_on?: string | null
  ends_on?: string | null
  sort: number
}): Promise<Activity> {
  try {
    const { data, error } = await db().from('schedule_activities').insert(a).select(COLUMNS).single()
    if (error) throw error
    return { ...(data as unknown as Omit<Activity, 'lines'>), percent: 0, lines: [] }
  } catch (e) {
    if (notThere(e)) throw new ScheduleNotSetUp()
    throw e
  }
}

export async function setActivity(
  id: string,
  patch: Partial<Pick<Activity, 'name' | 'starts_on' | 'ends_on' | 'percent' | 'sort' | 'is_heading'>>,
): Promise<void> {
  const { error } = await db().from('schedule_activities').update(patch).eq('id', id)
  if (error) throw error
}

export async function removeActivity(id: string): Promise<void> {
  const { error } = await db().from('schedule_activities').delete().eq('id', id)
  if (error) throw error
}

/** Which schedule-of-values lines an activity covers, set as a whole. */
export async function setCovered(projectId: string, activityId: string, lineIds: string[]): Promise<void> {
  const client = db()
  const { error: wipe } = await client.from('schedule_activity_lines').delete().eq('activity_id', activityId)
  if (wipe) throw wipe
  if (!lineIds.length) return
  const { error } = await client.from('schedule_activity_lines')
    .insert(lineIds.map((sov_line_id) => ({ activity_id: activityId, sov_line_id, project_id: projectId })))
  if (error) throw error
}

// ---------- The comparison ----------

export interface Comparison {
  activity: Activity
  /** The scheduled value of everything this activity covers. */
  value: number
  /** What the contractor has billed against those lines, as a percentage of their value. */
  billed: number
  /** What the schedule says is done. */
  planned: number
  /** Billed less planned: positive means paid ahead of the schedule. */
  gap: number
}

/**
 * The schedule against the application, activity by activity.
 *
 * Both sides are expressed as a percentage of the same money — the scheduled value of the
 * lines the activity covers — so the two are comparable at all. An activity covering no lines
 * is left out: there is nothing to compare it against, and showing it as 0% billed would read
 * as a contractor behind on work nobody is paying for.
 */
export function compare(
  activities: Activity[],
  valueOf: (lineId: string) => number,
  billedOf: (lineId: string) => number,
): Comparison[] {
  const out: Comparison[] = []
  for (const a of activities) {
    if (a.is_heading || !a.lines.length) continue
    const value = a.lines.reduce((t, id) => t + valueOf(id), 0)
    if (value <= 0) continue
    const billed = (a.lines.reduce((t, id) => t + billedOf(id), 0) / value) * 100
    out.push({
      activity: a,
      value,
      billed,
      planned: a.percent,
      gap: Math.round((billed - a.percent) * 100) / 100,
    })
  }
  return out
}

/** The earliest start and latest end across the schedule, for drawing it. */
export function span(activities: Activity[]): { from: string; to: string } | null {
  const starts = activities.map((a) => a.starts_on).filter((d): d is string => !!d)
  const ends = activities.map((a) => a.ends_on ?? a.starts_on).filter((d): d is string => !!d)
  if (!starts.length || !ends.length) return null
  return { from: starts.sort()[0], to: ends.sort()[ends.length - 1] }
}

/** Where a date sits between two others, 0 to 1. Used to place a bar on the chart. */
export function along(day: string, from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00`)
  const b = Date.parse(`${to}T00:00:00`)
  const d = Date.parse(`${day}T00:00:00`)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0
  return Math.max(0, Math.min(1, (d - a) / (b - a)))
}

/** The months a span covers, for the chart's scale. */
export function monthsIn(from: string, to: string): { label: string; at: number }[] {
  const start = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T00:00:00`)
  const out: { label: string; at: number }[] = []
  const d = new Date(start.getFullYear(), start.getMonth(), 1)
  if (d < start) d.setMonth(d.getMonth() + 1)
  while (d <= end && out.length < 60) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    out.push({
      label: d.toLocaleDateString('en-US', { month: 'short' }) + (d.getMonth() === 0 ? ` ${d.getFullYear()}` : ''),
      at: along(iso, from, to),
    })
    d.setMonth(d.getMonth() + 1)
  }
  return out
}
