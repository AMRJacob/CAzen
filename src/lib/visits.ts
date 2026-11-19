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
export interface SiteVisit {
  id: string
  project_id: string
  visited_on: string
  /** "14:05:00", or null for a visit with a day and no time. */
  visited_at: string | null
  title: string | null
  weather: string | null
  notes: string | null
  photos: string[]
  cover_photo: string | null
  pad_id: string | null
  issued_id: string | null
  created_at: string
}

const COLUMNS = 'id, project_id, visited_on, visited_at, title, weather, notes, photos, cover_photo, pad_id, issued_id, created_at'

/** The table arrives with migration 0033; until it has been run the page shows what it did before. */
export class VisitsNotSetUp extends Error {
  constructor() { super('Site visits are not in the database yet.') }
}
const notThere = (e: unknown): boolean => {
  const m = e as { message?: string; code?: string } | null
  return m?.code === '42P01' || m?.code === 'PGRST205' || /site_visits.*(does not exist|schema cache)|Could not find the table/i.test(m?.message ?? '')
}

export async function listVisits(projectId: string): Promise<SiteVisit[]> {
  const { data, error } = await db().from('site_visits').select(COLUMNS)
    .eq('project_id', projectId)
    .order('visited_on', { ascending: false }).order('visited_at', { ascending: false, nullsFirst: false })
  if (error) { if (notThere(error)) throw new VisitsNotSetUp(); throw error }
  return (data ?? []) as SiteVisit[]
}

const clock = () => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`
}

/** The visit as it starts: now, with the notes already carrying the template's headings. */
export function buildVisit(projectId: string): SiteVisit {
  return {
    id: crypto.randomUUID(),
    project_id: projectId,
    visited_on: today(),
    visited_at: clock(),
    title: null,
    weather: null,
    notes: fieldDef('field_report', 'fr.notes')?.starter ?? '',
    photos: [],
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
export async function startVisit(projectId: string): Promise<SiteVisit> {
  const v = buildVisit(projectId)
  await saveVisit(v)
  return v
}
