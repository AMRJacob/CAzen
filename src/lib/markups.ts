import { db } from './supabase'

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

export type MarkupKind = 'ink' | 'arrow' | 'rect' | 'cloud' | 'text' | 'dimension'

export interface Point { x: number; y: number }

export type Geometry =
  | { points: [number, number][] }          // ink
  | { from: Point; to: Point }              // arrow, dimension
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

export async function listMarkups(sheetId: string): Promise<Markup[]> {
  const { data, error } = await db()
    .from('sheet_markups')
    .select('id, sheet_id, project_id, revision_id, kind, geometry, style, body, created_by, created_at')
    .eq('sheet_id', sheetId)
    .order('created_at')
  if (error) throw error
  return (data ?? []) as Markup[]
}

export async function addMarkup(m: {
  sheetId: string
  projectId: string
  revisionId: string
  kind: MarkupKind
  geometry: Geometry
  style: { colour?: string; width?: number }
  body?: string | null
}): Promise<Markup> {
  const { data: u } = await db().auth.getUser()
  const { data, error } = await db()
    .from('sheet_markups')
    .insert({
      sheet_id: m.sheetId, project_id: m.projectId, revision_id: m.revisionId,
      kind: m.kind, geometry: m.geometry, style: m.style, body: m.body ?? null,
      created_by: u.user?.id,
    })
    .select('id, sheet_id, project_id, revision_id, kind, geometry, style, body, created_by, created_at')
    .single()
  if (error) throw error
  return data as Markup
}

export async function editMarkup(id: string, patch: { body?: string | null; geometry?: Geometry; style?: Markup['style'] }) {
  const { error } = await db()
    .from('sheet_markups')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function removeMarkup(id: string) {
  const { error } = await db().from('sheet_markups').delete().eq('id', id)
  if (error) throw error
}

/**
 * Say that the markups drawn on earlier revisions of this sheet still apply to the one on screen.
 * They were already showing — they belong to the sheet — but this is the difference between a note
 * nobody has looked at since the sheet changed and one somebody has.
 */
export async function bringForward(sheetId: string, revisionId: string): Promise<number> {
  const { data, error } = await db()
    .from('sheet_markups')
    .update({ revision_id: revisionId, updated_at: new Date().toISOString() })
    .eq('sheet_id', sheetId)
    .neq('revision_id', revisionId)
    .select('id')
  if (error) throw error
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
