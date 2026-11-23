/** Which notebook: field notes or meeting notes (as in visits.ts, repeated so this file needs nothing). */
export type VisitKind = 'visit' | 'meeting'
import type { Agenda } from './agenda'

/**
 * How a notebook page is laid out, chosen by the person writing in it.
 *
 * A page is a set of blocks — the head, attendees, notes, sketch, photographs, observations, and
 * any text boxes or checklists the person has added — placed on a grid. Each person keeps their
 * own arrangement for each book, and one for each kind of screen: what suits a desk does not
 * suit a phone held in one hand on a ladder, and a tablet sits between.
 *
 * At a desk or on a tablet the blocks snap to the grid's cells and never overlap: a block moved
 * onto others pushes them down, and everything then slides up to close any gap. On a phone the
 * page is one column; the arrangement there is only the order and which blocks are shown.
 *
 * What is written in a text box or a checklist belongs to the page (`site_visits.widgets`),
 * keyed by the block's id. The layout only says where that block sits.
 */

export type Screen = 'desktop' | 'tablet' | 'phone'
export type BlockKind = 'head' | 'names' | 'notes' | 'sketch' | 'photos' | 'seen' | 'text' | 'check' | 'agenda'

export interface Block {
  /** The kind's own name for a built-in block; "text-…" / "check-…" for an added one. */
  id: string
  kind: BlockKind
  /** Column, row, width and height in grid cells. Ignored on a phone except for order. */
  x: number
  y: number
  w: number
  h: number
  /** An added block's heading. */
  title?: string
}

export interface Layout {
  v: 1
  blocks: Block[]
  /** Added blocks this person took off their layout, so a page holding writing in one does not put it back for them. */
  gone?: string[]
}

export const COLS: Record<Screen, number> = { desktop: 12, tablet: 8, phone: 1 }
/** The page is this many rows tall on screen; a taller arrangement scrolls. */
export const ROWS = 12

export const BUILT_IN: Record<VisitKind, BlockKind[]> = {
  visit: ['head', 'names', 'notes', 'sketch', 'photos', 'seen'],
  meeting: ['head', 'names', 'notes', 'sketch'],
}
/** Kinds the writer adds, any number of each; what they hold belongs to the page. */
export const ADDED: BlockKind[] = ['text', 'check', 'agenda']
/** The head carries the day, the report and Tear out: it can be moved and sized, not hidden. */
export const KEPT: BlockKind[] = ['head']

export const LABEL: Record<BlockKind, string> = {
  head: 'Day and weather', names: 'Attendees', notes: 'Notes', sketch: 'Sketch',
  photos: 'Documentation photos', seen: 'Observations', text: 'Text box', check: 'Checklist', agenda: 'Agenda',
}
/** Smallest a block may be made, in cells: enough for its heading and something under it. */
export const LEAST: Record<BlockKind, { w: number; h: number }> = {
  head: { w: 3, h: 3 }, names: { w: 2, h: 2 }, notes: { w: 3, h: 3 }, sketch: { w: 2, h: 2 },
  photos: { w: 2, h: 2 }, seen: { w: 2, h: 2 }, text: { w: 2, h: 2 }, check: { w: 2, h: 2 }, agenda: { w: 3, h: 4 },
}

const b = (kind: BlockKind, x: number, y: number, w: number, h: number): Block => ({ id: kind, kind, x, y, w, h })

/** The page as it was drawn before it could be rearranged, so nobody's page changes until they change it. */
export function defaultLayout(kind: VisitKind, screen: Screen): Layout {
  if (screen === 'phone') return { v: 1, blocks: BUILT_IN[kind].map((k, i) => b(k, 0, i, 1, 1)) }
  if (kind === 'visit') {
    return screen === 'desktop'
      ? { v: 1, blocks: [b('head', 0, 0, 8, 3), b('names', 8, 0, 4, 3), b('notes', 0, 3, 4, 9), b('sketch', 4, 3, 4, 9), b('photos', 8, 3, 4, 5), b('seen', 8, 8, 4, 4)] }
      : { v: 1, blocks: [b('head', 0, 0, 5, 3), b('names', 5, 0, 3, 3), b('notes', 0, 3, 4, 5), b('sketch', 4, 3, 4, 5), b('photos', 0, 8, 4, 4), b('seen', 4, 8, 4, 4)] }
  }
  return screen === 'desktop'
    ? { v: 1, blocks: [b('head', 0, 0, 7, 3), b('names', 7, 0, 5, 3), b('notes', 0, 3, 7, 9), b('sketch', 7, 3, 5, 9)] }
    : { v: 1, blocks: [b('head', 0, 0, 5, 3), b('names', 5, 0, 3, 3), b('notes', 0, 3, 4, 9), b('sketch', 4, 3, 4, 9)] }
}

// ---------- The grid ----------

const overlaps = (a: Block, c: Block) => a.id !== c.id && a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h

/** A block kept inside the grid's columns and no smaller than its least. */
export function fit(block: Block, cols: number): Block {
  const least = LEAST[block.kind]
  const w = Math.max(Math.min(least.w, cols), Math.min(cols, Math.round(block.w)))
  const h = Math.max(least.h, Math.round(block.h))
  const x = Math.max(0, Math.min(cols - w, Math.round(block.x)))
  const y = Math.max(0, Math.round(block.y))
  return { ...block, x, y, w, h }
}

/**
 * The blocks with nothing overlapping and no gaps above anything. The block being moved keeps
 * its place; a block it lands on takes the place it left when it fits there, and is otherwise
 * pushed down below it; then every block slides up as far as it can, top to bottom. This is how a dashboard behaves, and it means a page can never be left
 * with a block hidden under another or stranded far down the page.
 */
export function settle(blocks: Block[], cols: number, moved?: string, vacated?: Block): Block[] {
  const all = blocks.map((x) => fit(x, cols))
  const first = all.find((x) => x.id === moved)
  const rest = all.filter((x) => x.id !== moved).sort((a, c) => a.y - c.y || a.x - c.x)
  const placed: Block[] = first ? [first] : []
  for (const blk of rest) {
    let at = { ...blk }
    // Landed on by the moved block: it takes the place the moved block left, if it fits there —
    // two blocks trade places — rather than being sent down the page.
    if (first && vacated && overlaps(at, first)) {
      const swap = fit({ ...at, x: vacated.x, y: vacated.y }, cols)
      if (!placed.some((p) => overlaps(swap, p))) at = swap
    }
    while (placed.some((p) => overlaps(at, p))) at = { ...at, y: at.y + 1 }
    placed.push(at)
  }
  // Slide up, in reading order, so the moved block's neighbours close in behind it.
  const out: Block[] = []
  for (const blk of [...placed].sort((a, c) => a.y - c.y || a.x - c.x)) {
    let at = { ...blk }
    while (at.y > 0 && !out.some((p) => overlaps({ ...at, y: at.y - 1 }, p))) at = { ...at, y: at.y - 1 }
    out.push(at)
  }
  return blocks.map((orig) => out.find((x) => x.id === orig.id)!)
}

/** How many rows the arrangement takes. */
export const depth = (blocks: Block[]) => blocks.reduce((m, x) => Math.max(m, x.y + x.h), 0)

/** A new block's place: across the full width under everything else. */
export function addBlock(layout: Layout, kind: BlockKind, cols: number, title?: string): Layout {
  const id = ADDED.includes(kind) ? `${kind}-${crypto.randomUUID().slice(0, 8)}` : kind
  const h = kind === 'agenda' ? 8 : kind === 'check' || kind === 'text' ? 4 : LEAST[kind].h + 2
  const blk: Block = { id, kind, x: 0, y: depth(layout.blocks), w: cols === 1 ? 1 : Math.min(cols, Math.max(LEAST[kind].w, Math.round(cols / 2))), h: cols === 1 ? 1 : h, ...(title ? { title } : {}) }
  return { ...layout, blocks: cols === 1 ? [...layout.blocks, blk] : settle([...layout.blocks, blk], cols) }
}

/**
 * A layout read back from storage, made safe: unknown kinds dropped, the head put back if it
 * went missing, a built-in that does not belong in this book left out, every block on the grid.
 */
export function clean(raw: unknown, kind: VisitKind, screen: Screen): Layout {
  const fallback = defaultLayout(kind, screen)
  const blocks = (raw as Layout | null)?.blocks
  if (!Array.isArray(blocks)) return fallback
  const known = new Set<BlockKind>([...BUILT_IN[kind], ...ADDED])
  const seen = new Set<string>()
  const kept = blocks.filter((x): x is Block => !!x && typeof x.id === 'string' && known.has(x.kind) && !seen.has(x.id) && !!seen.add(x.id))
  for (const must of KEPT) if (!kept.some((x) => x.kind === must)) kept.unshift(fallback.blocks.find((x) => x.kind === must)!)
  const gone = Array.isArray((raw as Layout).gone) ? (raw as Layout).gone!.filter((g) => typeof g === 'string') : []
  const extra = gone.length ? { gone } : {}
  if (screen === 'phone') return { v: 1, blocks: kept.map((x, i) => ({ ...x, x: 0, y: i, w: 1, h: 1 })), ...extra }
  return { v: 1, blocks: settle(kept, COLS[screen]), ...extra }
}

// ---------- Which screen this is ----------

/**
 * A phone is anything under 760 px wide — the width at which the page has always gone to one
 * column. A tablet is wider than that but under 1200 px, or any wider screen worked by touch
 * alone (an iPad held sideways is 1180 px; a large one is more). Everything else is a desk.
 */
export function screenNow(): Screen {
  const w = window.innerWidth
  if (w < 760) return 'phone'
  const touchOnly = window.matchMedia?.('(pointer: coarse)').matches && !window.matchMedia?.('(any-pointer: fine)').matches
  return w < 1200 || touchOnly ? 'tablet' : 'desktop'
}

// ---------- What an added block holds, on a page ----------

export interface CheckItem { text: string; done: boolean }
/** Its heading travels with it, so a page shows it properly to someone whose layout lacks the block. */
export type Widget = { title?: string; text: string } | { title?: string; items: CheckItem[] } | { title?: string; agenda: Agenda }
export type Widgets = Record<string, Widget>

export const textOf = (w: Widget | undefined) => (w && 'text' in w ? w.text : '')
export const itemsOf = (w: Widget | undefined): CheckItem[] => (w && 'items' in w && Array.isArray(w.items) ? w.items : [])

/** Whether a block holds anything on this page — a block with something in it is never silently dropped from view. */
export function holds(w: Widget | undefined): boolean {
  const a = agendaOf(w)
  return !!textOf(w).trim() || itemsOf(w).some((i) => i.text.trim()) || a.old.length + a.obs.length + a.fresh.length > 0
}
// (as emptyAgenda in agenda.ts; repeated so this file imports nothing it runs)
const noAgenda = (): Agenda => ({ from: null, old: [], obs: [], fresh: [] })
export const agendaOf = (w: Widget | undefined): Agenda => (w && 'agenda' in w && w.agenda ? { ...noAgenda(), ...w.agenda } : noAgenda())

/**
 * The added blocks as lines for the report: each a top-level heading with its lines or items
 * under it, numbered on from the notes. Checklist items say whether they were ticked.
 */
export function widgetsForReport(blocks: Block[], widgets: Widgets | undefined, after: number): string {
  let n = after
  const out: string[] = []
  for (const blk of blocks) {
    if (!ADDED.includes(blk.kind)) continue
    const w = widgets?.[blk.id]
    // An agenda's observations are already in the report's own list; its business is what is added here.
    const lines = blk.kind === 'text'
      ? textOf(w).split('\n').map((s) => s.trim()).filter(Boolean)
      : blk.kind === 'agenda'
        ? [...agendaOf(w).old, ...agendaOf(w).fresh].filter((i) => i.text.trim()).map((i) => `${i.text.trim()}${i.done ? ' — resolved' : ' — open'}`)
        : itemsOf(w).filter((i) => i.text.trim()).map((i) => `${i.text.trim()}${i.done ? ' — done' : ' — open'}`)
    if (!lines.length) continue
    n += 1
    out.push(`${n}. ${blk.title || w?.title || LABEL[blk.kind]}`, ...lines.map((l, i) => `  ${String.fromCharCode(97 + (i % 26))}. ${l}`))
  }
  return out.length ? `\n${out.join('\n')}` : ''
}
