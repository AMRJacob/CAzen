import { db } from './supabase'
import { all as localAll, get as localGet, put as localPut, remove as localRemove } from './offline/store'
import { queue, unsentIds } from './offline/outbox'

/**
 * Markups: what someone drew on a sheet.
 *
 * They belong to the sheet rather than to the revision they were drawn on, because a note about a
 * detail is about that detail — reissuing the sheet doesn't make the note untrue. The revision is
 * kept alongside so the viewer can say when a markup predates what is on screen, and so markups
 * that have been checked against a new revision can be brought forward deliberately.
 *
 * Every coordinate is a fraction of the page (0–1 from the top left), as everywhere else in CAzen.
 * That survives zooming, and it survives a sheet being reissued at another paper size.
 */

export type MarkupKind = 'ink' | 'line' | 'arrow' | 'rect' | 'cloud' | 'text' | 'dimension' | 'area'

export interface Point { x: number; y: number }

export type Geometry =
  | { points: [number, number][] }          // ink
  | { from: Point; to: Point }              // line, arrow, dimension
  | { x: number; y: number; w: number; h: number }   // rect, cloud, text

export interface Markup {
  id: string
  sheet_id: string
  project_id: string
  revision_id: string | null
  kind: MarkupKind
  geometry: Geometry
  style: { colour?: string; width?: number }
  body: string | null
  created_by: string | null
  created_at: string
}

export const MARKUP_COLOURS = ['#c0392b', '#1f6f3f', '#1f4e79', '#b06a00', '#5b2d8e'] as const

const COLUMNS = 'id, sheet_id, project_id, revision_id, kind, geometry, style, body, created_by, created_at'

const byTime = (a: Markup, b: Markup) => (a.created_at ?? '').localeCompare(b.created_at ?? '')

/** Markups held on this device for a sheet. */
const localFor = async (sheetId: string) =>
  (await localAll<Markup>('markups')).filter((m) => m.sheet_id === sheetId).sort(byTime)

/**
 * What is on this sheet.
 *
 * The local copy answers first and the server refreshes it, so a sheet opens at the same speed
 * with no signal as with a good one, and anything drawn in the field is there before the network
 * has been asked. When the server does answer, what it says replaces the copy — except for
 * markups still waiting in the outbox, which it hasn't been told about yet.
 */
export async function listMarkups(sheetId: string): Promise<Markup[]> {
  // A sheet is "held" when this device has taken its project to the field — which is exactly
  // when the local copy is worth answering from. The sheets store says so without being told.
  const held = !!(await localGet('sheets', sheetId).catch(() => undefined))
  const here = await localFor(sheetId).catch(() => [] as Markup[])
  // What this device has drawn and the server hasn't been told about yet. These are not rows
  // somebody else deleted — they are rows nobody else has seen — so a refresh must keep them
  // whether or not the project was taken to the field.
  const unsent = await unsentIds().catch(() => new Set<string>())
  const mine = here.filter((m) => unsent.has(m.id))

  if (held && !navigator.onLine) return here

  try {
    const { data, error } = await db()
      .from('sheet_markups').select(COLUMNS).eq('sheet_id', sheetId).order('created_at')
    if (error) throw error
    const theirs = (data ?? []) as Markup[]
    const known = new Set(theirs.map((m) => m.id))
    const stillMine = mine.filter((m) => !known.has(m.id))

    if (held) {
      await localPut('markups', theirs)
      // Drop only what the server doesn't have AND this device isn't still trying to send.
      for (const m of here) if (!known.has(m.id) && !unsent.has(m.id)) await localRemove('markups', m.id)
    }
    return [...theirs, ...stillMine].sort(byTime)
  } catch (e) {
    if (here.length || !navigator.onLine) return here
    throw e
  }
}

/**
 * The row for a markup, made here rather than by the server.
 *
 * Pure and synchronous on purpose: the shape goes on screen from this, before anything is
 * written anywhere. A device that won't keep it and a server that won't take it are both things
 * to report, never reasons for the line you just drew to vanish.
 */
export function buildMarkup(m: {
  sheetId: string; projectId: string; revisionId: string
  kind: MarkupKind; geometry: Geometry; style: Markup['style']; body?: string | null
  by?: string | null
}): Markup {
  return {
    id: crypto.randomUUID(),
    sheet_id: m.sheetId, project_id: m.projectId, revision_id: m.revisionId,
    kind: m.kind, geometry: m.geometry, style: m.style, body: m.body ?? null,
    created_by: m.by ?? null, created_at: new Date().toISOString(),
  } as Markup
}

/** Keep a markup: on this device, and in the queue for the server. */
export async function saveMarkup(row: Markup): Promise<void> {
  const { data: u } = await db().auth.getUser().catch(() => ({ data: { user: null } }))
  const withAuthor = { ...row, created_by: row.created_by ?? u.user?.id ?? null }
  await localPut('markups', withAuthor).catch(() => { /* a device that won't keep it can still send it */ })
  await queue(row.project_id, { kind: 'markup.add', row: withAuthor as unknown as Record<string, unknown> })
}

/** Build and keep in one step, for callers that don't need them apart. */
export async function addMarkup(m: Parameters<typeof buildMarkup>[0]): Promise<Markup> {
  const row = buildMarkup(m)
  await saveMarkup(row)
  return row
}

export async function editMarkup(id: string, patch: { body?: string | null; geometry?: Geometry; style?: Markup['style'] }) {
  const had = await localGet<Markup>('markups', id).catch(() => undefined)
  if (had) await localPut('markups', { ...had, ...patch })
  await queue(had?.project_id ?? '', { kind: 'markup.edit', id, patch: { ...patch, updated_at: new Date().toISOString() } })
}

export async function removeMarkup(id: string) {
  const had = await localGet<Markup>('markups', id).catch(() => undefined)
  await localRemove('markups', id).catch(() => { /* it may never have been held */ })
  await queue(had?.project_id ?? '', { kind: 'markup.remove', id })
}

/**
 * Say that the markups drawn on earlier revisions of this sheet still apply to the one on screen.
 * They were already showing — they belong to the sheet — but this is the difference between a note
 * nobody has looked at since the sheet changed and one somebody has.
 */
export async function bringForward(sheetId: string, revisionId: string): Promise<number> {
  const stale = (await localFor(sheetId).catch(() => [] as Markup[])).filter((m) => m.revision_id !== revisionId)
  if (stale.length && !navigator.onLine) {
    for (const m of stale) {
      await localPut('markups', { ...m, revision_id: revisionId })
      await queue(m.project_id, { kind: 'markup.edit', id: m.id, patch: { revision_id: revisionId, updated_at: new Date().toISOString() } })
    }
    return stale.length
  }
  const { data, error } = await db()
    .from('sheet_markups')
    .update({ revision_id: revisionId, updated_at: new Date().toISOString() })
    .eq('sheet_id', sheetId)
    .neq('revision_id', revisionId)
    .select('id')
  if (error) throw error
  for (const m of stale) await localPut('markups', { ...m, revision_id: revisionId }).catch(() => {})
  return (data ?? []).length
}

/** A revision cloud: bumps around the edge of a rectangle, the way one is drawn by hand. */
export function cloudPath(x: number, y: number, w: number, h: number, bump = 0.012): string {
  const perSide = (length: number) => Math.max(1, Math.round(length / bump))
  const arc = (to: [number, number]) => `A ${bump} ${bump} 0 0 1 ${to[0]} ${to[1]}`
  const parts: string[] = [`M ${x} ${y}`]
  const run = (fromX: number, fromY: number, toX: number, toY: number) => {
    const steps = perSide(Math.hypot(toX - fromX, toY - fromY))
    for (let i = 1; i <= steps; i++) {
      parts.push(arc([fromX + ((toX - fromX) * i) / steps, fromY + ((toY - fromY) * i) / steps]))
    }
  }
  run(x, y, x + w, y)
  run(x + w, y, x + w, y + h)
  run(x + w, y + h, x, y + h)
  run(x, y + h, x, y)
  return parts.join(' ')
}

/** "12' 6"" from a length in inches. */
export function feetAndInches(totalInches: number): string {
  const whole = Math.round(totalInches * 4) / 4
  const feet = Math.floor(whole / 12)
  const inches = whole - feet * 12
  const shown = Number.isInteger(inches) ? String(inches) : inches.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
  return feet ? `${feet}'${inches ? ` ${shown}"` : ''}` : `${shown}"`
}

/**
 * How long a line on the sheet really is, given a scale set by picking two points and saying what
 * the distance between them is. Both are in page fractions, so the aspect of the page has to come
 * back in or a vertical inch and a horizontal inch would measure differently.
 */
export function measure(
  from: Point, to: Point,
  scale: { from: Point; to: Point; inches: number } | null,
  aspect: number,
): string | null {
  if (!scale) return null
  const span = (a: Point, b: Point) => Math.hypot((b.x - a.x) * aspect, b.y - a.y)
  const reference = span(scale.from, scale.to)
  if (!reference) return null
  return feetAndInches((span(from, to) / reference) * scale.inches)
}


/**
 * The area inside a closed polyline, in square feet.
 *
 * The shoelace formula on the points, then out of page fractions into feet using the same scale
 * the dimension tool uses. The page is wider than it is tall in fractions, so x is weighted by
 * the aspect before the arithmetic, exactly as a length is.
 */
export function areaOf(
  points: [number, number][],
  scale: { from: Point; to: Point; inches: number } | null,
  aspect: number,
): number | null {
  if (!scale || points.length < 3) return null
  const span = (a: Point, b: Point) => Math.hypot((b.x - a.x) * aspect, b.y - a.y)
  const reference = span(scale.from, scale.to)
  if (!reference) return null
  // Inches of real drawing per unit of page fraction, which squares for an area.
  const perFraction = scale.inches / reference / 12
  let twice = 0
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[(i + 1) % points.length]
    twice += (x1 * aspect) * y2 - (x2 * aspect) * y1
  }
  const inFractions = Math.abs(twice) / 2
  return inFractions * perFraction * perFraction
}

/** Square feet, as a drawing would write them. */
export function squareFeet(sqft: number): string {
  return `${sqft < 100 ? sqft.toFixed(1) : Math.round(sqft).toLocaleString()} SF`
}
