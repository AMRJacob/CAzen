import { db } from './supabase'

/**
 * Issue tags: the things that are seen over and over, by the trade that owns them.
 *
 * A tag is a trade and a few words. Picking one names the observation and says whose it is, and
 * the trade's colour is what its pin wears on the drawing — so a sheet covered in pins reads at
 * a glance as mostly glazing, or mostly drywall. The colours are fixed per trade so the same
 * trade is the same colour on every job.
 */
export type Shape = 'circle' | 'square' | 'diamond' | 'triangle' | 'hexagon' | 'flag'
export const SHAPES: Shape[] = ['circle', 'square', 'diamond', 'triangle', 'hexagon', 'flag']
/** A mark drawn by hand: strokes, each a run of points, as fractions of the mark's own box. */
export type Glyph = [number, number][][]

/**
 * What a tag wears on a drawing. Colour says whose it is, shape says what family of work, and
 * the letters — or a mark somebody drew — say which, so a sheet can be read without a legend
 * and still be told apart in a black-and-white print.
 */
export interface Mark { shape: Shape; colour: string; text: string; glyph?: Glyph | null }

export interface Tag { trade: string; label: string; colour: string; own?: string; shape?: Shape | null; text?: string | null; glyph?: Glyph | null }

/** The label of the row that carries a trade's own mark rather than a tag. */
export const WHOLE_TRADE = '*'

/* Shape by family of work: structure and site square, envelope and openings diamond, finishes
   round, the engineered systems hexagonal, everything general a triangle. */
const BUILT_IN: { trade: string; shape: Shape; text: string; colour: string; tags: string[] }[] = [
  { trade: 'Sitework', shape: 'square', text: 'Si', colour: '#8a6d3b', tags: ['Erosion control', 'Grading / drainage', 'Paving defect', 'Landscape incomplete'] },
  { trade: 'Concrete', shape: 'square', text: 'Co', colour: '#6f757b', tags: ['Cracking', 'Honeycombing', 'Finish defect', 'Joint / sealant'] },
  { trade: 'Masonry', shape: 'square', text: 'Ma', colour: '#a0522d', tags: ['Mortar joints', 'Flashing / weeps', 'Cleaning needed'] },
  { trade: 'Steel', shape: 'square', text: 'St', colour: '#4a5a6a', tags: ['Connection incomplete', 'Fireproofing missing', 'Touch-up paint'] },
  { trade: 'Carpentry', shape: 'diamond', text: 'Ca', colour: '#9a6b2f', tags: ['Blocking missing', 'Framing layout', 'Casework install'] },
  { trade: 'Roofing', shape: 'diamond', text: 'Ro', colour: '#2f6f6f', tags: ['Flashing incomplete', 'Membrane damage', 'Ponding'] },
  { trade: 'Glazing', shape: 'diamond', text: 'Gl', colour: '#1f6fa8', tags: ['Sealant missing', 'Glass damaged', 'Hardware adjust'] },
  { trade: 'Doors / Hardware', shape: 'diamond', text: 'Dr', colour: '#5b6b2f', tags: ['Adjust / latch', 'Hardware missing', 'Door damaged'] },
  { trade: 'Drywall', shape: 'circle', text: 'Dw', colour: '#b07a00', tags: ['Finish level', 'Damage', 'Joint cracking'] },
  { trade: 'Paint', shape: 'circle', text: 'Pa', colour: '#7b4fa3', tags: ['Touch-up', 'Coverage', 'Wrong colour / sheen'] },
  { trade: 'Flooring', shape: 'circle', text: 'Fl', colour: '#a83a5b', tags: ['Damage', 'Transition', 'Base missing'] },
  { trade: 'Ceilings', shape: 'circle', text: 'Ce', colour: '#3f7f9f', tags: ['Tile damaged / stained', 'Grid out of level'] },
  { trade: 'Mechanical', shape: 'hexagon', text: 'Me', colour: '#c0392b', tags: ['Insulation missing', 'Access blocked', 'Not per drawings'] },
  { trade: 'Plumbing', shape: 'hexagon', text: 'Pl', colour: '#1f4e79', tags: ['Leak', 'Fixture missing', 'Not secured'] },
  { trade: 'Electrical', shape: 'hexagon', text: 'El', colour: '#d98200', tags: ['Device missing', 'Cover plate missing', 'Not labelled'] },
  { trade: 'Fire protection', shape: 'hexagon', text: 'Fp', colour: '#b3261e', tags: ['Head obstructed', 'Escutcheon missing'] },
  { trade: 'General', shape: 'triangle', text: 'Ge', colour: '#555b57', tags: ['Cleaning', 'Protection of work', 'Safety'] },
]

/**
 * Where each built-in trade falls in CSI MasterFormat, by division and, within a division, by
 * section: 01 general, 03 concrete, 04 masonry, 05 metals, 06 wood, 07 roofing, 08 openings
 * (doors and hardware before glazing), 09 finishes (gypsum board, ceilings, flooring, paint),
 * 21 fire suppression, 22 plumbing, 23 mechanical, 26 electrical, 31–32 sitework.
 */
const CSI: Record<string, string> = {
  General: '01 00', Concrete: '03 00', Masonry: '04 00', Steel: '05 00', Carpentry: '06 00', Roofing: '07 50',
  'Doors / Hardware': '08 10', Glazing: '08 80', Drywall: '09 20', Ceilings: '09 50', Flooring: '09 60', Paint: '09 90',
  'Fire protection': '21 00', Plumbing: '22 00', Mechanical: '23 00', Electrical: '26 00', Sitework: '31 00',
}
/** A trade's CSI division, as two digits, where it is one of the built-in trades. */
export const divisionOf = (trade: string): string | null => CSI[trade]?.slice(0, 2) ?? null
/** Trades in CSI order; a firm's own trades, which have no division, follow in name order. */
export function inCsiOrder<T extends { trade: string }>(groups: T[]): T[] {
  return [...groups].sort((a, b) => {
    const x = CSI[a.trade], y = CSI[b.trade]
    if (x && y) return x.localeCompare(y)
    if (x || y) return x ? -1 : 1
    return a.trade.localeCompare(b.trade)
  })
}

export const BUILT_IN_TAGS: Tag[] = BUILT_IN.flatMap((t) => t.tags.map((label) => ({ trade: t.trade, label, colour: t.colour })))
const TRADE_COLOUR = new Map(BUILT_IN.map((t) => [t.trade.toLowerCase(), t.colour]))
const SPARE = ['#6a4c93', '#2a7f62', '#b5651d', '#3a6ea5', '#8f3f71', '#4f6d7a']

/** A trade's colour: its own if it has one, a steady one of the spares if it is new. */
export function colourOf(trade: string | null | undefined, custom: Tag[] = []): string | null {
  const t = (trade ?? '').trim().toLowerCase()
  if (!t) return null
  const mine = custom.find((c) => c.trade.toLowerCase() === t)
  if (mine?.colour) return mine.colour
  const known = TRADE_COLOUR.get(t) ?? [...TRADE_COLOUR].find(([k]) => k.includes(t) || t.includes(k.split(' ')[0]))?.[1]
  if (known) return known
  let h = 0
  for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return SPARE[h % SPARE.length]
}

/** Built-in and the firm's own, grouped by trade in the order trades arrive on a job. */
export function byTrade(custom: Tag[]): { trade: string; colour: string; mark: Mark; tags: Tag[] }[] {
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
  const groups = BUILT_IN.map((t) => ({
    trade: t.trade, colour: t.colour, mark: { shape: t.shape, colour: t.colour, text: t.text } as Mark,
    tags: BUILT_IN_TAGS.filter((x) => x.trade === t.trade).map((x) => ({ ...x })),
  }))
  // The trade's own mark first, so the tags under it inherit what the firm chose.
  for (const c of custom.filter((x) => x.label === WHOLE_TRADE)) {
    let g = groups.find((x) => same(x.trade, c.trade))
    if (!g) { g = { trade: c.trade, colour: c.colour || colourOf(c.trade)!, mark: { shape: 'circle', colour: c.colour || colourOf(c.trade)!, text: c.trade.slice(0, 2) }, tags: [] }; groups.push(g) }
    g.mark = { shape: c.shape ?? g.mark.shape, colour: c.colour || g.mark.colour, text: c.text ?? g.mark.text, glyph: c.glyph ?? null }
    g.colour = g.mark.colour
  }
  for (const c of custom.filter((x) => x.label !== WHOLE_TRADE)) {
    let g = groups.find((x) => same(x.trade, c.trade))
    if (!g) {
      const colour = colourOf(c.trade, custom)!
      g = { trade: c.trade, colour, mark: { shape: 'circle', colour, text: c.trade.slice(0, 2) }, tags: [] }
      groups.push(g)
    }
    const at = g.tags.findIndex((x) => same(x.label, c.label))
    // The firm's row for a built-in tag restyles it; otherwise it is a tag of the firm's own.
    if (at >= 0) g.tags[at] = { ...g.tags[at], ...c, colour: c.colour || g.tags[at].colour }
    else g.tags.push({ ...c, colour: c.colour || g.colour })
  }
  return inCsiOrder(groups)
}

/** A tag's own mark where it has one, laid over its trade's. */
export function markOfTag(group: { mark: Mark }, tag: Tag | null | undefined): Mark {
  if (!tag) return group.mark
  const own = tag.shape || tag.text != null || tag.glyph
  return {
    shape: tag.shape ?? group.mark.shape,
    colour: own && tag.colour ? tag.colour : group.mark.colour,
    text: tag.glyph ? '' : tag.text ?? group.mark.text,
    glyph: tag.glyph ?? (tag.text != null ? null : group.mark.glyph ?? null),
  }
}

/**
 * The mark an observation wears: by its trade, and by the tag its name begins with if it has
 * one. An observation with no trade has no mark and keeps the plain pin.
 */
export function markOf(trade: string | null | undefined, title: string | null | undefined, custom: Tag[] = []): Mark | null {
  const t = (trade ?? '').trim().toLowerCase()
  if (!t) return null
  const groups = byTrade(custom)
  const g = groups.find((x) => x.trade.toLowerCase() === t)
    ?? groups.find((x) => x.trade.toLowerCase().includes(t) || t.includes(x.trade.toLowerCase().split(' ')[0]))
  if (!g) return { shape: 'circle', colour: colourOf(trade, custom)!, text: (trade ?? '').trim().slice(0, 2) }
  const name = (title ?? '').toLowerCase()
  const tag = [...g.tags].sort((a, b) => b.label.length - a.label.length).find((x) => name.includes(x.label.toLowerCase()))
  return markOfTag(g, tag)
}

/** Thrown when the firm's own tags have nowhere to be kept yet (migration 0036). */
export class TagsNotSetUp extends Error { constructor() { super('Custom tags need migration 0036.') } }
const notThere = (e: { code?: string; message?: string } | null) =>
  e?.code === '42P01' || e?.code === 'PGRST205' || /observation_tags|schema cache/i.test(e?.message ?? '')

/** Thrown when a tag can be kept but not its mark (migration 0038). */
export class MarksNotSetUp extends Error { constructor() { super('Tag marks need migration 0038.') } }
const noColumn = (e: { code?: string; message?: string } | null) =>
  e?.code === '42703' || e?.code === 'PGRST204' || /column .*(shape|mark|glyph)/i.test(e?.message ?? '')

type Row = { id: string; trade: string; label: string; colour: string | null; shape?: Shape | null; mark?: string | null; glyph?: Glyph | null }
let marksThere: boolean | null = null
/** Whether marks can be kept here — known after the first time the tags are read. */
export const canHoldMarks = () => marksThere !== false

export async function listCustomTags(firmId: string): Promise<Tag[]> {
  const ask = (cols: string) => db().from('observation_tags').select(cols).eq('firm_id', firmId).order('trade').order('label')
  let { data, error } = marksThere === false ? { data: null, error: { code: '42703' } as { code?: string; message?: string } } : await ask('id, trade, label, colour, shape, mark, glyph')
  if (error && noColumn(error)) { marksThere = false; ({ data, error } = await ask('id, trade, label, colour')) }
  else if (!error) marksThere = true
  if (error) { if (notThere(error)) throw new TagsNotSetUp(); throw error }
  return ((data ?? []) as unknown as Row[])
    .map((r) => ({ own: r.id, trade: r.trade, label: r.label, colour: r.colour ?? '', shape: r.shape ?? null, text: r.mark ?? null, glyph: r.glyph ?? null }))
}

export async function addCustomTag(firmId: string, tag: { trade: string; label: string; colour?: string | null }): Promise<void> {
  const { error } = await db().from('observation_tags').insert({ firm_id: firmId, trade: tag.trade.trim(), label: tag.label.trim(), colour: tag.colour || null })
  if (error) { if (notThere(error)) throw new TagsNotSetUp(); throw error }
}

/** A mark for a trade (label `WHOLE_TRADE`) or for one tag, built-in or the firm's own. */
export async function setTagMark(firmId: string, trade: string, label: string, mark: Mark): Promise<void> {
  const { error } = await db().from('observation_tags').upsert({
    firm_id: firmId, trade: trade.trim(), label: label.trim(),
    colour: mark.colour, shape: mark.shape, mark: mark.glyph?.length ? null : mark.text, glyph: mark.glyph?.length ? mark.glyph : null,
  }, { onConflict: 'firm_id,trade,label' })
  if (error) { if (notThere(error)) throw new TagsNotSetUp(); if (noColumn(error)) { marksThere = false; throw new MarksNotSetUp() } throw error }
}

export async function removeCustomTag(id: string): Promise<void> {
  const { error } = await db().from('observation_tags').delete().eq('id', id)
  if (error) throw error
}
