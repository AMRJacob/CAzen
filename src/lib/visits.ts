import { db } from './supabase'
import { today } from './dates'
import { fieldDef } from './templates/fields'

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
let locationKnown: boolean | null = null
export const canHoldLocation = () => locationKnown === true
async function lookForLocation(): Promise<void> {
  if (locationKnown !== null) return
  const { error } = await db().from('site_visits').select('location').limit(1)
  locationKnown = !error
}

export async function listVisits(projectId: string, kind: VisitKind): Promise<SiteVisit[]> {
  await lookForLocation().catch(() => { locationKnown = false })
  const { data, error } = await db().from('site_visits').select(COLUMNS + (locationKnown ? ', location' : ''))
    .eq('project_id', projectId).eq('kind', kind)
    .order('visited_on', { ascending: false }).order('visited_at', { ascending: false, nullsFirst: false })
  if (error) { if (notThere(error)) throw new VisitsNotSetUp(); throw error }
  return (data ?? []) as unknown as SiteVisit[]
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
  const { error } = await db().from('site_visits').upsert(v, { onConflict: 'id' })
  if (error) { if (notThere(error)) throw new VisitsNotSetUp(); throw error }
}

export async function setVisit(id: string, patch: Partial<Omit<SiteVisit, 'id' | 'project_id' | 'created_at'>>): Promise<void> {
  const { error } = await db().from('site_visits').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function removeVisit(id: string): Promise<void> {
  const { error } = await db().from('site_visits').delete().eq('id', id)
  if (error) throw error
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

