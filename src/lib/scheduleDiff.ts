/**
 * What one issue of a schedule changed from the one before.
 *
 * Contractors reissue the schedule as the job moves, and the question each time is the same:
 * what slipped, what was added, what quietly went away. Activities are matched by name — it is
 * the only thing the two issues have in common — so a renamed activity reads as one gone and
 * one added, which is also how it would read to a person holding the two printouts.
 *
 * No dependencies: this is checked under Node.
 */

export interface Line { name: string; is_heading: boolean; starts_on: string | null; ends_on: string | null; percent: number }

export type Change =
  | { kind: 'added'; name: string; starts_on: string | null; ends_on: string | null }
  /** In the schedule before, and not in this issue. It is left in the schedule, not removed. */
  | { kind: 'missing'; name: string }
  | { kind: 'moved'; name: string; start?: { from: string | null; to: string | null; days: number | null }; end?: { from: string | null; to: string | null; days: number | null } }
  | { kind: 'progress'; name: string; from: number; to: number }

const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
const days = (a: string | null, b: string | null): number | null =>
  a && b ? Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000) : null

/** `issue` is what was read this time; `before` is the schedule as it stood. */
export function diffSchedule(before: Line[], issue: Line[]): Change[] {
  const out: Change[] = []
  const was = new Map(before.filter((l) => !l.is_heading).map((l) => [key(l.name), l]))
  const seen = new Set<string>()
  for (const now of issue) {
    if (now.is_heading) continue
    const k = key(now.name)
    seen.add(k)
    const old = was.get(k)
    if (!old) { out.push({ kind: 'added', name: now.name, starts_on: now.starts_on, ends_on: now.ends_on }); continue }
    const start = old.starts_on !== now.starts_on ? { from: old.starts_on, to: now.starts_on, days: days(old.starts_on, now.starts_on) } : undefined
    const end = old.ends_on !== now.ends_on ? { from: old.ends_on, to: now.ends_on, days: days(old.ends_on, now.ends_on) } : undefined
    if (start || end) out.push({ kind: 'moved', name: now.name, ...(start ? { start } : {}), ...(end ? { end } : {}) })
    if (old.percent !== now.percent) out.push({ kind: 'progress', name: now.name, from: old.percent, to: now.percent })
  }
  // Only worth saying when there was a schedule to be missing from.
  if (before.length) for (const [k, old] of was) if (!seen.has(k)) out.push({ kind: 'missing', name: old.name })
  return out
}

/** The schedule after an issue: what was read laid over what was there. */
export function afterIssue(before: Line[], issue: Line[]): Line[] {
  const now = new Map(issue.map((l) => [`${l.is_heading}|${key(l.name)}`, l]))
  const kept = before.map((l) => { const k = `${l.is_heading}|${key(l.name)}`; const n = now.get(k); now.delete(k); return n && !l.is_heading ? { ...l, starts_on: n.starts_on, ends_on: n.ends_on, percent: n.percent } : l })
  return [...kept, ...now.values()].map((l) => ({ name: l.name, is_heading: l.is_heading, starts_on: l.starts_on, ends_on: l.ends_on, percent: l.percent }))
}

/** "3 moved, 2 added, 1 not in this issue" */
export function summary(changes: Change[]): string {
  const n = (k: Change['kind']) => changes.filter((c) => c.kind === k).length
  const parts = [
    n('moved') ? `${n('moved')} moved` : '', n('added') ? `${n('added')} added` : '',
    n('missing') ? `${n('missing')} not in this issue` : '', n('progress') ? `${n('progress')} with new progress` : '',
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : 'no changes'
}

/** How far the last finish moved between two schedules, in days: the one number an owner asks for. */
export function finishSlip(before: Line[], after: Line[]): number | null {
  const last = (list: Line[]) => list.filter((l) => !l.is_heading && l.ends_on).map((l) => l.ends_on!).sort().pop() ?? null
  return days(last(before), last(after))
}
