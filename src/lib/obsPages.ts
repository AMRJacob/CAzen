/**
 * Which field-notes page an observation belongs to, if any.
 *
 * Since migration 0045 an observation made on a notebook page carries that page's id
 * (`visit_id`), and one made anywhere else — the Observations book, a sheet — carries none and
 * is "General". Observations from before the link existed have no id either way; for those the
 * old rule still answers: the page that was the one being written when it was made (from the
 * page's start until the next page's start).
 *
 * No imports, so it can be checked on its own (checks/obspages.test.ts).
 */

export interface PageTimes { id: string; visited_on: string; visited_at: string | null }
export interface Placed { visit_id?: string | null; created_at: string; observed_on: string }

/** From this moment, an observation with no page id was made outside the notebooks. */
export const LINKED_SINCE = Date.parse('2026-11-23T20:00:00Z')

export const startOf = (p: PageTimes): number => {
  const t = Date.parse(`${p.visited_on}T${p.visited_at ?? '00:00:00'}`)
  return Number.isNaN(t) ? 0 : t
}
export const madeAt = (o: Placed): number => {
  const t = Date.parse(o.created_at)
  return Number.isNaN(t) ? Date.parse(`${o.observed_on}T12:00:00`) : t
}

/**
 * The page's id, or null for General. `linked` is whether the database keeps the link; until
 * it does, every observation is placed by time, as before.
 */
export function pageOf(o: Placed, pages: PageTimes[], linked: boolean): string | null {
  if (o.visit_id) return pages.some((p) => p.id === o.visit_id) ? o.visit_id : null
  const t = madeAt(o)
  if (linked && t >= LINKED_SINCE) return null
  let best: PageTimes | null = null
  for (const p of pages) if (startOf(p) <= t && (!best || startOf(p) > startOf(best))) best = p
  return best?.id ?? null
}
