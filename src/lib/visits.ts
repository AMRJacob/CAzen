import { db } from './supabase'
import { today } from './dates'
import { fieldDef } from './templates/fields'
import { all as localAll, get as localGet, put as localPut, remove as localRemove } from './offline/store'
import { queue } from './offline/outbox'
import { localFirst } from './offline/mirror'

/**
 * A site visit: one trip to the job and everything that came back from it — a pad written on by
 * hand, typed notes, photographs, and the observations made that day. The field report is
 * written from it afterwards.
 *
 * A visit's observations are the ones seen on its day. They are not copied here or pointed at,
 * so an observation added from the Observations page on the same day belongs to the visit too.
 */
export type VisitKind = 'visit' | 'meeting'

export interface SiteVisit {
  id: string
  project_id: string
  /** Which notebook the page is in. */
  kind: VisitKind
  visited_on: string
  /** "14:05:00", or null for a visit with a day and no time. */
  visited_at: string | null
  title: string | null
  weather: string | null
  /** Where it was, as the report should say it. Absent on a database without the column yet. */
  location?: string | null
  notes: string | null
  /** Who was there, one to a line: Name | Company | Email. */
  names: string | null
  photos: string[]
  /** What each photograph shows, keyed by its path. */
  photo_labels: Record<string, string>
  cover_photo: string | null
  pad_id: string | null
  /** What the page's added text boxes and checklists hold, keyed by block id (src/lib/pageLayout.ts). */
  widgets?: import('./pageLayout').Widgets
  issued_id: string | null
  created_at: string
}

const COLUMNS = 'id, project_id, kind, visited_on, visited_at, title, weather, notes, names, photos, photo_labels, cover_photo, pad_id, issued_id, created_at'

/** The table arrives with migration 0033; until it has been run the page shows what it did before. */
export class VisitsNotSetUp extends Error {
  constructor() { super('Site visits are not in the database yet.') }
}
const notThere = (e: unknown): boolean => {
  const m = e as { message?: string; code?: string } | null
  return m?.code === '42P01' || m?.code === 'PGRST205' || /site_visits.*(does not exist|schema cache)|Could not find the table/i.test(m?.message ?? '')
}

/**
 * Whether pages can carry a location. The column arrives with migration 0036; until it has been
 * run, asking for it by name would fail the whole list — so it is asked about once, on its own,
 * and the rest of the app goes by the answer.
 */
const LOCATION_KEY = 'cazen.visits.location'
let locationKnown: boolean | null = (() => {
  // Remembered from the last time there was signal, so a page started with none still carries one.
  try { const v = localStorage.getItem(LOCATION_KEY); return v === null ? null : v === '1' } catch { return null }
})()
let locationAsked = false
export const canHoldLocation = () => locationKnown === true
async function lookForLocation(): Promise<void> {
  if (locationAsked || !navigator.onLine) return
  const { error } = await db().from('site_visits').select('location').limit(1)
  // No answer is not an answer: only a reply from the database settles it.
  if (error && !(error as { code?: string }).code) return
  locationAsked = true
  locationKnown = !error
  try { localStorage.setItem(LOCATION_KEY, locationKnown ? '1' : '0') } catch { /* private mode */ }
}

/**
 * Whether pages can hold what text boxes and checklists carry. The column arrives with migration
 * 0044; until then those blocks are not offered, and the rest of the notebook works as before.
 */
const WIDGETS_KEY = 'cazen.visits.widgets'
let widgetsKnown: boolean | null = (() => {
  try { const v = localStorage.getItem(WIDGETS_KEY); return v === null ? null : v === '1' } catch { return null }
})()
let widgetsAsked = false
export const canHoldWidgets = () => widgetsKnown === true
async function lookForWidgets(): Promise<void> {
  if (widgetsAsked || !navigator.onLine) return
  const { error } = await db().from('site_visits').select('widgets').limit(1)
  if (error && !(error as { code?: string }).code) return
  widgetsAsked = true
  widgetsKnown = !error
  try { localStorage.setItem(WIDGETS_KEY, widgetsKnown ? '1' : '0') } catch { /* private mode */ }
}

const newestFirst = (a: SiteVisit, b: SiteVisit) =>
  b.visited_on.localeCompare(a.visited_on) || (b.visited_at ?? '').localeCompare(a.visited_at ?? '')

/**
 * The pages of one notebook.
 *
 * They are written on site, which means they are written with no signal: every page is kept on
 * this device as well as on the server, and every change goes into the outbox on its way there.
 */
export function listVisits(projectId: string, kind: VisitKind): Promise<SiteVisit[]> {
  return localFirst<SiteVisit>({
    store: 'visits',
    here: async () => (await localAll<SiteVisit>('visits', projectId)).filter((v) => v.kind === kind),
    theirs: async () => {
      await Promise.all([lookForLocation().catch(() => {}), lookForWidgets().catch(() => {})])
      const { data, error } = await db().from('site_visits').select(COLUMNS + (locationKnown ? ', location' : '') + (widgetsKnown ? ', widgets' : ''))
        .eq('project_id', projectId).eq('kind', kind)
        .order('visited_on', { ascending: false }).order('visited_at', { ascending: false, nullsFirst: false })
      if (error) { if (notThere(error)) throw new VisitsNotSetUp(); throw error }
      return (data ?? []) as unknown as SiteVisit[]
    },
    sort: newestFirst,
  })
}

const clock = () => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`
}

/** The visit as it starts: now, with the notes already carrying the template's headings. */
export function buildVisit(projectId: string, kind: VisitKind = 'visit', names: string | null = null, location: string | null = null): SiteVisit {
  return {
    id: crypto.randomUUID(),
    project_id: projectId,
    kind,
    visited_on: today(),
    visited_at: clock(),
    title: null,
    weather: null,
    ...(locationKnown ? { location } : {}),
    notes: starterFor(kind),
    names,
    photos: [],
    photo_labels: {},
    cover_photo: null,
    pad_id: null,
    issued_id: null,
    created_at: new Date().toISOString(),
  }
}

export async function saveVisit(v: SiteVisit): Promise<void> {
  await localPut('visits', v)
  await queue(v.project_id, { kind: 'row.put', table: 'site_visits', row: v as unknown as Record<string, unknown> })
}

export async function setVisit(id: string, patch: Partial<Omit<SiteVisit, 'id' | 'project_id' | 'created_at'>>): Promise<void> {
  const had = await localGet<SiteVisit>('visits', id).catch(() => undefined)
  if (had) await localPut('visits', { ...had, ...patch })
  await queue(had?.project_id ?? '', {
    kind: 'row.patch', table: 'site_visits', id, patch: { ...patch, updated_at: new Date().toISOString() },
  })
}

export async function removeVisit(id: string): Promise<void> {
  const had = await localGet<SiteVisit>('visits', id).catch(() => undefined)
  await localRemove('visits', id).catch(() => {})
  await queue(had?.project_id ?? '', { kind: 'row.remove', table: 'site_visits', ids: [id] })
}

/** "2:05 PM" from "14:05:00". */
export function clockTime(t: string | null): string {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return ''
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

/** "Thursday, November 19" — the year is said only when it isn't this one. */
export function longDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }),
  })
}

/** The photograph that stands for the visit: the one chosen, else the first one taken. */
export const coverOf = (v: SiteVisit, fromObservations: string[] = []): string | null =>
  (v.cover_photo && (v.photos.includes(v.cover_photo) || fromObservations.includes(v.cover_photo)) ? v.cover_photo : null)
  ?? v.photos[0] ?? fromObservations[0] ?? null

/** "Thu, Nov 19" — the day as a visit's card says it. */
export function shortDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }),
  })
}

/** Start a visit now and hand it back. */
/** `names` carries the last page's people forward: it is mostly the same people every time. */
export async function startVisit(projectId: string, kind: VisitKind = 'visit', names: string | null = null, location: string | null = null): Promise<SiteVisit> {
  const v = buildVisit(projectId, kind, names, location)
  await saveVisit(v)
  return v
}

// ---------- The categories a page is organised under ----------

/**
 * A page's typed notes are kept as the outline text the report templates already use —
 * "1. Structure" with its lines indented beneath — so a page exports into a field report or a
 * set of meeting notes without being rewritten. On screen it is a category and the words under
 * it; the numbering and the "a." are put back on the way out.
 */
export { parseSections, writeSections, type Section } from './noteSort'

/** The categories a new page starts with: the firm's own template headings for that kind. */
export function starterFor(kind: VisitKind): string {
  return (kind === 'meeting'
    ? fieldDef('meeting_notes', 'mn.notes')?.starter ?? fieldDef('field_report', 'fr.notes')?.starter
    : fieldDef('field_report', 'fr.observations')?.starter) ?? '1. Notes\n  a. '
}

