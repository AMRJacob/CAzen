import { db, whoAmI } from './supabase'
import { all as localAll, get as localGet, put as localPut, remove as localRemove } from './offline/store'
import { queue, unsentIds } from './offline/outbox'
import { today } from './dates'

/**
 * Observations: one thing seen on one visit.
 *
 * A non-conforming detail, a question, a bit of progress worth a photograph, a punch item —
 * all the same object. What makes them different is the type they were raised under and where
 * they end up being read: a field report is the observations of a day, a punch list is the
 * open ones of punch types. Nothing is copied between the two, so nothing drifts.
 *
 * They are made in the field, which means they are made offline. Everything here writes to
 * this device first and queues for the server, exactly as markups do, because an observation
 * that waits for a bar of signal is an observation that gets written on the back of a hand
 * instead.
 */

export interface ObservationType {
  id: string
  firm_id: string
  code: string
  name: string
  position: number
  is_punch: boolean
}

export type ObservationStatus = 'open' | 'in_progress' | 'closed'

export interface Observation {
  id: string
  project_id: string
  set_id: string | null
  /** Allocated by the server once, from the type it was raised under: "N-7". Never reissued. */
  number: number | null
  type_id: string | null
  /** Where on a sheet it was seen, when it was pinned to one. */
  sheet_id: string | null
  revision_id: string | null
  region: Region | null
  title: string
  detail: string | null
  status: ObservationStatus
  trade: string | null
  area: string | null
  observed_on: string
  due_on: string | null
  /** Stored file paths, in the order they were taken. */
  photos: string[]
  created_by: string | null
  created_at: string
  updated_at: string
  /** The field-notes page it was made on (migration 0045); absent or null for one made elsewhere. */
  visit_id?: string | null
}

/**
 * Whether observations can carry the page they were made on. The column arrives with migration
 * 0045; until then it is neither asked for nor sent, and pages are matched by time.
 */
const LINK_KEY = 'cazen.observations.visitLink'
let linkKnown: boolean | null = (() => {
  try { const v = localStorage.getItem(LINK_KEY); return v === null ? null : v === '1' } catch { return null }
})()
let linkAsked = false
export const canLinkPages = () => linkKnown === true
async function lookForLink(): Promise<void> {
  if (linkAsked || !navigator.onLine) return
  const { error } = await db().from('observations').select('visit_id').limit(1)
  if (error && !(error as { code?: string }).code) return
  linkAsked = true
  linkKnown = !error
  try { localStorage.setItem(LINK_KEY, linkKnown ? '1' : '0') } catch { /* private mode */ }
}

const COLUMNS =
  'id, project_id, set_id, number, type_id, sheet_id, revision_id, region, title, detail, ' +
  'status, trade, area, observed_on, due_on, photos, created_by, created_at, updated_at'

export const STATUS_LABELS: Record<ObservationStatus, string> = {
  open: 'Open',
  in_progress: 'Being dealt with',
  closed: 'Closed',
}

const byDate = (a: Observation, b: Observation) =>
  (b.observed_on ?? '').localeCompare(a.observed_on ?? '') ||
  (b.created_at ?? '').localeCompare(a.created_at ?? '')

/** What a type's observations are called: the code and the number, "N-7". */
export function nameOf(o: Observation, types: ObservationType[]): string {
  const t = types.find((x) => x.id === o.type_id)
  if (!t || o.number == null) return o.number == null ? '—' : String(o.number)
  return `${t.code}-${o.number}`
}

export async function listTypes(): Promise<ObservationType[]> {
  const here = await localAll<ObservationType>('observationTypes').catch(() => [])
  try {
    const { data, error } = await db().from('observation_types').select('*').order('position')
    if (error) throw error
    return (data ?? []) as ObservationType[]
  } catch {
    return here.sort((a, b) => a.position - b.position)
  }
}

/**
 * Every observation on a project.
 *
 * Local first, server second, and anything this device has made that the server has not been
 * told about is kept through the refresh — the same rule markups follow, for the same reason.
 */
export async function listObservations(projectId: string): Promise<Observation[]> {
  const held = !!(await localGet('projects', projectId).catch(() => undefined))
  const here = (await localAll<Observation>('observations').catch(() => []))
    .filter((o) => o.project_id === projectId)
  const unsent = await unsentIds().catch(() => new Set<string>())
  const mine = here.filter((o) => unsent.has(o.id))

  if (held && !navigator.onLine) return here.sort(byDate)

  try {
    await lookForLink().catch(() => {})
    const { data, error } = await db()
      .from('observations').select(COLUMNS + (linkKnown ? ', visit_id' : '')).eq('project_id', projectId)
      .order('observed_on', { ascending: false })
    if (error) throw error
    const theirs = (data ?? []) as unknown as Observation[]
    const known = new Set(theirs.map((o) => o.id))
    const stillMine = mine.filter((o) => !known.has(o.id))
    if (held) {
      await localPut('observations', theirs)
      for (const o of here) if (!known.has(o.id) && !unsent.has(o.id)) await localRemove('observations', o.id)
    }
    return [...theirs, ...stillMine].sort(byDate)
  } catch (e) {
    if (here.length || !navigator.onLine) return here.sort(byDate)
    throw e
  }
}

/**
 * The row, built here rather than by the server.
 *
 * Pure and synchronous, so the observation is on screen before anything is written anywhere:
 * a device that won't keep it and a server that won't take it are both worth reporting, and
 * neither is a reason for what somebody just wrote standing in a building to disappear.
 */
export function buildObservation(o: {
  projectId: string
  typeId: string | null
  title: string
  detail?: string | null
  trade?: string | null
  area?: string | null
  observedOn?: string
  dueOn?: string | null
  status?: ObservationStatus
  sheetId?: string | null
  revisionId?: string | null
  region?: Region | null
  photos?: string[]
  by?: string | null
  /** The notebook page it is being made on. */
  visitId?: string | null
}): Observation {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    project_id: o.projectId,
    set_id: null,
    number: null,
    type_id: o.typeId,
    sheet_id: o.sheetId ?? null,
    revision_id: o.revisionId ?? null,
    region: o.region ?? null,
    title: o.title,
    detail: o.detail ?? null,
    status: o.status ?? 'open',
    trade: o.trade ?? null,
    area: o.area ?? null,
    observed_on: o.observedOn ?? today(),
    due_on: o.dueOn ?? null,
    photos: o.photos ?? [],
    created_by: o.by ?? null,
    created_at: now,
    updated_at: now,
    // Sent only to a database that has the column, or the whole row would be refused.
    ...(linkKnown && o.visitId ? { visit_id: o.visitId } : {}),
  }
}

/** Keep an observation: on this device, and in the queue for the server. */
export async function saveObservation(row: Observation): Promise<void> {
  const withAuthor = { ...row, created_by: row.created_by ?? await whoAmI() }
  await localPut('observations', withAuthor).catch(() => { /* it can still be sent */ })
  await queue(row.project_id, { kind: 'observation.add', row: withAuthor as unknown as Record<string, unknown> })
}

export async function editObservation(
  o: Observation,
  patch: Partial<Pick<Observation, 'title' | 'detail' | 'status' | 'trade' | 'area' | 'observed_on' | 'due_on' | 'type_id' | 'photos' | 'region' | 'sheet_id' | 'revision_id'>>,
): Promise<Observation> {
  const next = { ...o, ...patch, updated_at: new Date().toISOString() }
  await localPut('observations', next).catch(() => { /* it can still be sent */ })
  await queue(o.project_id, { kind: 'observation.edit', id: o.id, patch: { ...patch, updated_at: next.updated_at } })
  return next
}

export async function removeObservation(o: Observation): Promise<void> {
  await localRemove('observations', o.id).catch(() => { /* nothing to drop */ })
  const { error } = await db().from('observations').delete().eq('id', o.id)
  if (error) throw error
}

/** The observations of one day — which is what a field report is a view of. */
export const onDay = (all: Observation[], day: string) => all.filter((o) => o.observed_on === day)

/** The open ones of punch types — which is what a punch list is a view of. */
export function punchList(all: Observation[], types: ObservationType[]): Observation[] {
  const punch = new Set(types.filter((t) => t.is_punch).map((t) => t.id))
  return all.filter((o) => o.type_id && punch.has(o.type_id) && o.status !== 'closed')
}

/**
 * What other people raise on this project, as they raise it.
 *
 * Worth having on a punch walk above all: two people walking a building with phones, and
 * neither writing down what the other already has.
 */
export function watchObservations(projectId: string, on: {
  added: (o: Observation) => void
  changed: (o: Observation) => void
  removed: (id: string) => void
}): () => void {
  const filter = `project_id=eq.${projectId}`
  const channel = db()
    .channel(`observations:${projectId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'observations', filter },
      (p) => on.added(p.new as Observation))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'observations', filter },
      (p) => on.changed(p.new as Observation))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'observations', filter },
      (p) => on.removed((p.old as { id: string }).id))
    .subscribe()
  return () => { void db().removeChannel(channel) }
}

/**
 * A day's observations, written the way a field report writes them.
 *
 * Grouped under the type they were raised as, numbered the way the template's outline is
 * numbered, so what comes out reads as a field report rather than as a database export.
 * Nothing is invented: it is what was written on site, in the order it was written.
 */
export function asReport(items: Observation[], types: ObservationType[]): string {
  if (!items.length) return ''
  const order = new Map(types.map((t, i) => [t.id, i]))
  const groups = new Map<string, Observation[]>()
  for (const o of items) {
    const key = o.type_id ?? ''
    groups.set(key, [...(groups.get(key) ?? []), o])
  }
  const keys = [...groups.keys()].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99))

  const lines: string[] = []
  keys.forEach((key, i) => {
    const type = types.find((t) => t.id === key)
    lines.push(`${i + 1}. ${type?.name ?? 'Observations'}`)
    groups.get(key)!.forEach((o, j) => {
      const where = [o.area, o.trade].filter(Boolean).join(', ')
      lines.push(`  ${String.fromCharCode(97 + Math.min(j, 25))}. ${o.title}${where ? ` (${where})` : ''}`)
      if (o.detail) {
        for (const line of o.detail.split('\n').filter((x) => x.trim())) {
          lines.push(`    1. ${line.trim()}`)
        }
      }
    })
  })
  return lines.join('\n')
}

/** Every photograph taken on a day, in the order the observations were raised. */
export const photosOf = (items: Observation[]): string[] => items.flatMap((o) => o.photos)

/**
 * Where an observation is on the drawings.
 *
 * The first place is the observation's own sheet and point, as it always was. Further places —
 * the same thing seen somewhere else on that sheet, or on another sheet — ride along inside the
 * same value as `more`. That keeps one observation one row and needed no change to the
 * database or to how observations made with no signal are sent, at the cost that only the
 * first place is a column a query can ask for.
 */
export interface MoreSpot { sheet_id: string; revision_id: string | null; number?: string; x: number; y: number }
export interface Region { x: number; y: number; more?: MoreSpot[] }

/** Every point of an observation that is on one sheet. */
export function spotsOn(o: Pick<Observation, 'sheet_id' | 'region'>, sheetId: string): { x: number; y: number }[] {
  if (!o.region) return []
  const out: { x: number; y: number }[] = []
  if (o.sheet_id === sheetId) out.push({ x: o.region.x, y: o.region.y })
  for (const m of o.region.more ?? []) if (m.sheet_id === sheetId) out.push({ x: m.x, y: m.y })
  return out
}
