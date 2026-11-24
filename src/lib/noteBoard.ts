import { markerFor } from './outline.ts'

/**
 * A page's notes as boxes and cards.
 *
 * The notes are still kept as the outline the report prints — "1. Site" with its lines beneath —
 * so nothing about exporting changes. This reads that outline as a tree and writes a tree back
 * as an outline. On the page a line with lines under it is a box, and a line with none is a
 * card; dropping a card into a box is moving a line under another, and that is all it is.
 *
 * What has been typed and not yet put anywhere sits under one heading of its own, `LOOSE`, which
 * the page shows as a tray rather than a box. It is written out only while it has something in it.
 */
export interface Note { text: string; kids: Note[] }
export type Path = number[]

export const LOOSE = 'Unsorted'

const MARK = /^(?:(?:\d+|[ivxlcIVXLC]{1,6}|[a-zA-Z])[.)]|[-•*])(?:\s+|$)/

export function readBoard(notes: string | null): Note[] {
  const root: Note = { text: '', kids: [] }
  const stack: { level: number; node: Note }[] = [{ level: -1, node: root }]
  for (const raw of (notes ?? '').split(/\r?\n/)) {
    const indent = raw.match(/^ */)![0].length
    const text = raw.trim().replace(MARK, '').trim()
    // A marker with nothing after it is a line waiting to be written, not a note.
    if (!text) continue
    const level = Math.floor(indent / 2)
    while (stack.length > 1 && stack[stack.length - 1].level >= level) stack.pop()
    const node: Note = { text, kids: [] }
    stack[stack.length - 1].node.kids.push(node)
    stack.push({ level, node })
  }
  return root.kids
}

export function writeBoard(board: Note[]): string {
  const out: string[] = []
  const walk = (nodes: Note[], level: number) => nodes.forEach((n, i) => {
    out.push(`${'  '.repeat(level)}${markerFor(level, i + 1)} ${n.text}`)
    walk(n.kids, level + 1)
  })
  walk(board.filter((n) => !(n.text === LOOSE && !n.kids.length)), 0)
  return out.join('\n')
}

const copy = (nodes: Note[]): Note[] => nodes.map((n) => ({ text: n.text, kids: copy(n.kids) }))
const at = (board: Note[], path: Path): Note | undefined => path.reduce<Note | undefined>((n, i, d) => (d === 0 ? board[i] : n?.kids[i]), undefined)
const kidsAt = (board: Note[], parent: Path): Note[] | undefined => (parent.length ? at(board, parent)?.kids : board)
const within = (a: Path, b: Path) => a.length <= b.length && a.every((v, i) => v === b[i])

/** The tray of things not yet put anywhere, made if the board has none. Returns its place. */
export function looseAt(board: Note[]): number {
  return board.findIndex((n) => n.text === LOOSE)
}

/** Something typed: it goes in the tray until it is dragged somewhere. */
export function addLoose(board: Note[], text: string): Note[] {
  const next = copy(board)
  let i = looseAt(next)
  if (i < 0) { next.push({ text: LOOSE, kids: [] }); i = next.length - 1 }
  next[i].kids.push({ text: text.trim(), kids: [] })
  return next
}

export function addBox(board: Note[], parent: Path, text: string): Note[] {
  const next = copy(board)
  kidsAt(next, parent)?.push({ text: text.trim() || 'New category', kids: [] })
  return next
}

export function rename(board: Note[], path: Path, text: string): Note[] {
  const next = copy(board)
  const n = at(next, path)
  if (n && text.trim()) n.text = text.trim()
  return next
}

/** Take a line out. What was under it goes with it. */
export function remove(board: Note[], path: Path): Note[] {
  const next = copy(board)
  kidsAt(next, path.slice(0, -1))?.splice(path[path.length - 1], 1)
  return next
}

/**
 * Move a line, and everything under it, to the end of another line's own.
 * `into` is the box it is dropped in: [] is the board itself. A line cannot go inside itself.
 */
export function move(board: Note[], from: Path, into: Path): Note[] {
  if (within(from, into)) return board
  const next = copy(board)
  const home = kidsAt(next, from.slice(0, -1))
  const target = into.length ? at(next, into) : null
  if (!home || (into.length && !target)) return board
  // Already there: dropping a card back on its own box leaves it where it is.
  if (from.length === into.length + 1 && within(into, from)) return board
  const [node] = home.splice(from[from.length - 1], 1)
  if (!node) return board
  // `target` was found before the splice and is the same object after it.
  ;(target ? target.kids : next).push(node)
  return next
}

/** The note at a path, if there is one. */
export function nodeAt(board: Note[], path: Path): Note | null {
  let list = board, node: Note | null = null
  for (const i of path) { node = list[i] ?? null; if (!node) return null; list = node.kids }
  return node
}
