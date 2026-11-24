import { db } from './supabase'
import { figure, type Billed } from './payapps'
import { listContracts, loadContract } from './payappsDb'
import { guessActivity, guessDivisions } from './divisions'

/**
 * What the trade board shows: every pay line and every schedule activity on the project, each
 * with the divisions it is filed under (or, if never filed, the guess from its words), and for
 * pay lines what has been billed on the latest application.
 */
export interface Tile {
  kind: 'pay' | 'act'
  id: string
  label: string
  /** Item number for a pay line; nothing for an activity. */
  code: string | null
  /** Scheduled value (pay) — what the line is worth. */
  value: number
  /** Completed and stored to date on the latest application (pay). */
  billed: number
  /** Activity dates and the contractor's percent complete. */
  starts?: string | null
  ends?: string | null
  percent?: number
  /** Filed, by someone: a list (empty = deliberately in no division). Null = never filed. */
  filed: string[] | null
  /** The guess from its words, used while it has never been filed. */
  guess: string[]
}

export interface Board { tiles: Tile[]; asOf: string | null; contracts: number }

export async function loadBoard(projectId: string): Promise<Board> {
  const contracts = await listContracts(projectId)
  const tiles: Tile[] = []
  let asOf: string | null = null
  for (const c of contracts) {
    const data = await loadContract(c.id)
    const history = data.applications.map((a) => ({ billed: data.billed.get(a.id) ?? new Map<string, Billed>(), period_to: a.period_to, rounding: a.rounding, moves: a.moves }))
    const last = data.applications.length - 1
    const fig = last >= 0 ? figure(data.contract, data.lines, data.applications[last], history[last].billed, history.slice(0, last), data.steps) : null
    if (last >= 0) asOf = data.applications[last].period_to
    for (const l of data.lines) {
      if (l.is_heading) continue
      const f = fig?.lines.find((x) => x.line.id === l.id)
      const label = l.description
      tiles.push({
        kind: 'pay', id: l.id, label, code: l.item_no ?? null, value: l.scheduled_value, billed: f?.toDate ?? 0,
        filed: ((l as unknown as { divisions?: string[] | null }).divisions) ?? null, guess: guessDivisions(label),
      })
    }
  }
  const { data: acts, error } = await db().from('schedule_activities')
    .select('id, name, is_heading, starts_on, ends_on, percent, sort, divisions').eq('project_id', projectId).order('sort')
  if (error && !/divisions|schedule_activit|does not exist|schema cache/i.test(error.message)) throw error
  let heading: string | null = null
  for (const a of (acts ?? []) as { id: string; name: string; is_heading: boolean; starts_on: string | null; ends_on: string | null; percent: number; divisions: string[] | null }[]) {
    if (a.is_heading) { heading = a.name; continue }
    tiles.push({
      kind: 'act', id: a.id, label: a.name, code: null, value: 0, billed: 0, starts: a.starts_on, ends: a.ends_on, percent: Number(a.percent ?? 0),
      filed: a.divisions ?? null, guess: guessActivity(a.name, heading),
    })
  }
  return { tiles, asOf, contracts: contracts.length }
}

export async function fileTile(t: Pick<Tile, 'kind' | 'id'>, divisions: string[] | null): Promise<void> {
  const table = t.kind === 'pay' ? 'sov_lines' : 'schedule_activities'
  const { error } = await db().from(table).update({ divisions }).eq('id', t.id)
  if (error) throw error
}

/** Where a tile sits now: what it was filed under, or its guess if it never was. */
export const placed = (t: Tile): string[] => t.filed ?? t.guess

const DAY = 86400000
const days = (a: string, b: string) => Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / DAY) + 1)

export interface Standing {
  /** Pay lines' worth and billing in this division. A line in two divisions is split evenly. */
  value: number
  billed: number
  /** Activities in it, weighted by their length: what the contractor reports done… */
  reported: number | null
  /** …and what their dates say should be done by `on`. */
  planned: number | null
}

/** One division's billing against its schedule. Percentages 0–100; null where there is nothing to say. */
export function standing(tiles: Tile[], division: string, on: string): Standing {
  let value = 0, billed = 0, w = 0, rep = 0, plan = 0
  const at = Date.parse(on)
  for (const t of tiles) {
    const p = placed(t)
    if (!p.includes(division)) continue
    if (t.kind === 'pay') { value += t.value / p.length; billed += t.billed / p.length; continue }
    if (!t.starts || !t.ends) continue
    const len = days(t.starts, t.ends)
    w += len
    rep += len * (t.percent ?? 0)
    const s = Date.parse(t.starts), e = Date.parse(t.ends) + DAY
    plan += len * (at <= s ? 0 : at >= e ? 100 : ((at - s) / (e - s)) * 100)
  }
  return { value, billed, reported: w ? rep / w : null, planned: w ? plan / w : null }
}
