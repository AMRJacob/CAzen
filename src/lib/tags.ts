import { db } from './supabase'

/**
 * Issue tags: the things that are seen over and over, by the trade that owns them.
 *
 * A tag is a trade and a few words. Picking one names the observation and says whose it is, and
 * the trade's colour is what its pin wears on the drawing — so a sheet covered in pins reads at
 * a glance as mostly glazing, or mostly drywall. The colours are fixed per trade so the same
 * trade is the same colour on every job.
 */
export interface Tag { trade: string; label: string; colour: string; own?: string }

const BUILT_IN: { trade: string; colour: string; tags: string[] }[] = [
  { trade: 'Sitework', colour: '#8a6d3b', tags: ['Erosion control', 'Grading / drainage', 'Paving defect', 'Landscape incomplete'] },
  { trade: 'Concrete', colour: '#6f757b', tags: ['Cracking', 'Honeycombing', 'Finish defect', 'Joint / sealant'] },
  { trade: 'Masonry', colour: '#a0522d', tags: ['Mortar joints', 'Flashing / weeps', 'Cleaning needed'] },
  { trade: 'Steel', colour: '#4a5a6a', tags: ['Connection incomplete', 'Fireproofing missing', 'Touch-up paint'] },
  { trade: 'Carpentry', colour: '#9a6b2f', tags: ['Blocking missing', 'Framing layout', 'Casework install'] },
  { trade: 'Roofing', colour: '#2f6f6f', tags: ['Flashing incomplete', 'Membrane damage', 'Ponding'] },
  { trade: 'Glazing', colour: '#1f6fa8', tags: ['Sealant missing', 'Glass damaged', 'Hardware adjust'] },
  { trade: 'Doors / Hardware', colour: '#5b6b2f', tags: ['Adjust / latch', 'Hardware missing', 'Door damaged'] },
  { trade: 'Drywall', colour: '#b07a00', tags: ['Finish level', 'Damage', 'Joint cracking'] },
  { trade: 'Paint', colour: '#7b4fa3', tags: ['Touch-up', 'Coverage', 'Wrong colour / sheen'] },
  { trade: 'Flooring', colour: '#a83a5b', tags: ['Damage', 'Transition', 'Base missing'] },
  { trade: 'Ceilings', colour: '#3f7f9f', tags: ['Tile damaged / stained', 'Grid out of level'] },
  { trade: 'Mechanical', colour: '#c0392b', tags: ['Insulation missing', 'Access blocked', 'Not per drawings'] },
  { trade: 'Plumbing', colour: '#1f4e79', tags: ['Leak', 'Fixture missing', 'Not secured'] },
  { trade: 'Electrical', colour: '#d98200', tags: ['Device missing', 'Cover plate missing', 'Not labelled'] },
  { trade: 'Fire protection', colour: '#b3261e', tags: ['Head obstructed', 'Escutcheon missing'] },
  { trade: 'General', colour: '#555b57', tags: ['Cleaning', 'Protection of work', 'Safety'] },
]

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
export function byTrade(custom: Tag[]): { trade: string; colour: string; tags: Tag[] }[] {
  const groups = BUILT_IN.map((t) => ({ trade: t.trade, colour: t.colour, tags: BUILT_IN_TAGS.filter((x) => x.trade === t.trade) }))
  for (const c of custom) {
    const g = groups.find((x) => x.trade.toLowerCase() === c.trade.toLowerCase())
    if (g) { if (!g.tags.some((x) => x.label.toLowerCase() === c.label.toLowerCase())) g.tags.push({ ...c, colour: c.colour || g.colour }) }
    else groups.push({ trade: c.trade, colour: colourOf(c.trade, custom)!, tags: [{ ...c, colour: colourOf(c.trade, custom)! }] })
  }
  return groups
}

/** Thrown when the firm's own tags have nowhere to be kept yet (migration 0036). */
export class TagsNotSetUp extends Error { constructor() { super('Custom tags need migration 0036.') } }
const notThere = (e: { code?: string; message?: string } | null) =>
  e?.code === '42P01' || e?.code === 'PGRST205' || /observation_tags|schema cache/i.test(e?.message ?? '')

export async function listCustomTags(firmId: string): Promise<Tag[]> {
  const { data, error } = await db().from('observation_tags').select('id, trade, label, colour').eq('firm_id', firmId).order('trade').order('label')
  if (error) { if (notThere(error)) throw new TagsNotSetUp(); throw error }
  return ((data ?? []) as { id: string; trade: string; label: string; colour: string | null }[])
    .map((r) => ({ own: r.id, trade: r.trade, label: r.label, colour: r.colour ?? '' }))
}

export async function addCustomTag(firmId: string, tag: { trade: string; label: string; colour?: string | null }): Promise<void> {
  const { error } = await db().from('observation_tags').insert({ firm_id: firmId, trade: tag.trade.trim(), label: tag.label.trim(), colour: tag.colour || null })
  if (error) { if (notThere(error)) throw new TagsNotSetUp(); throw error }
}

export async function removeCustomTag(id: string): Promise<void> {
  const { error } = await db().from('observation_tags').delete().eq('id', id)
  if (error) throw error
}
