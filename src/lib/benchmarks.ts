import type { Activity } from './schedule'

// ---------- Dates the architect is on the hook for ----------

/**
 * Activities whose names say the architect has a part in them: punch lists, substantial and final
 * completion, dry-in, commissioning, inspections, occupancy, closeout. Deliveries and procurement
 * are the contractor's milestones and stay out unless the schedule files them as milestones.
 */
const ARCHITECT = /\bpunch|\bsubstantial|\bfinal (completion|inspection|walk)|\bcomplet(e|ed|ion)\b|\bdri?(ed|y)[ -]?in\b|\bcommission|\binspection|\boccupan|\bcertificate of|\bc\.?\s?o\.?\b|\bmove[ -]?in\b|\bturn ?over\b|\bnotice to proceed\b|\bntp\b|\bclose ?out\b|\bwalk ?(through|thru)\b|\bmock ?-?ups?\b|\bowner training\b|\btest(ing)? (and|&) balanc|\btab\b|\bribbon/i
const MILESTONES = /\bmilestones?\b|\bbenchmarks?\b|\bkey dates?\b/i

export interface Benchmark {
  activity: Activity
  /** The day it is due: the start of a punch list or an inspection, the finish of anything else. */
  day: string
  /** The span it runs, when it is more than one day. */
  to: string | null
}

/** The schedule's benchmarks, in date order. Summary rows are left out; their children speak for them. */
export function benchmarks(activities: Activity[]): Benchmark[] {
  const rows = activities.slice().sort((a, b) => a.sort - b.sort)
  const outlined = rows.some((a) => (a.level ?? 0) > 0)
  const out: Benchmark[] = []
  let under: number | null = null // the level of a "Milestones" heading the row sits under
  for (const a of rows) {
    const level = a.level ?? 0
    if (a.is_heading) {
      if (under != null && (outlined ? level <= under : true)) under = null
      if (MILESTONES.test(a.name)) under = outlined ? level : 0
      continue
    }
    if (under != null && outlined && level <= under) under = null
    if (under == null && !ARCHITECT.test(a.name)) continue
    const from = a.starts_on ?? a.ends_on
    const end = a.ends_on ?? a.starts_on
    if (!from || !end) continue
    const opens = /\bpunch|\binspection|\bwalk ?(through|thru)|\bcommission|\bclose ?out|\btest(ing)? (and|&) balanc|\btab\b/i.test(a.name)
    out.push({ activity: a, day: opens ? from : end, to: from !== end ? (opens ? end : null) : null })
  }
  return out.sort((x, y) => x.day.localeCompare(y.day))
}
