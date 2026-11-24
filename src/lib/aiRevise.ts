import { renumber } from './outline.ts'

/**
 * Notes checked by an AI and brought back (Jacob, 11/24): the notes go out as their outline with
 * a short request, the reply is pasted back, and every difference is offered to accept, change
 * or reject — wording, a line moved in or out a level, a line taken out or added.
 *
 * The reply is read loosely, because an AI will not always keep to 1. / a. / i.: Markdown
 * headings and bullets, any indentation and any markers are read as an outline by how far each
 * line is set in. Code fences and a line of preamble before the outline are dropped.
 *
 * No imports that need a browser, so it can be checked on its own (checks/airevise.test.ts).
 */

export interface Line { level: number; text: string }

/** What goes on the clipboard: the request, then the notes. */
export function forAi(notes: string, kind: 'meeting' | 'visit'): string {
  return [
    `Please check these ${kind === 'meeting' ? 'meeting notes' : 'site visit notes'} for organization, grammar and spelling.`,
    'Keep the same facts; move items under better headings where that helps.',
    'Reply with only the revised notes, as a numbered outline: 1. for headings, a. under them, i. under those, two spaces per level.',
    '',
    notes.trim(),
  ].join('\n')
}

const MARKER = /^(?:(?:\d+|[a-zA-Z]|[ivxlcIVXLC]{1,6})[.)]|[-*•–])\s+/
/** Any outline-ish text as levelled lines. */
export function readOutline(text: string): Line[] {
  const rows = text.replace(/\r/g, '').split('\n')
    .filter((l) => !/^\s*```/.test(l))
    .map((l) => l.replace(/\t/g, '    '))
    .filter((l) => l.trim())
  // Preamble ("Here are the revised notes:") before the first line that looks like an item.
  const first = rows.findIndex((l) => MARKER.test(l.trim()) || /^#{1,6}\s/.test(l.trim()))
  const body = first > 0 ? rows.slice(first) : rows
  // Indent widths as levels, in the order of how far in they are; a Markdown heading is the top.
  const widths = [...new Set(body.map((l) => (/^#{1,6}\s/.test(l.trim()) ? -1 : l.length - l.trimStart().length)))].sort((a, b) => a - b)
  const hasHeads = widths[0] === -1
  return body.map((l) => {
    const t = l.trim()
    const head = /^#{1,6}\s/.test(t)
    const w = head ? -1 : l.length - l.trimStart().length
    let level = widths.indexOf(w)
    // With Markdown headings above them, unindented bullets sit under the heading, not beside it.
    if (hasHeads && !head && w === 0 && MARKER.test(t) && /^[-*•–]\s/.test(t)) level = Math.max(level, 1)
    const text = t.replace(/^#{1,6}\s+/, '').replace(MARKER, '').replace(/^\*\*(.*)\*\*:?$/, '$1').replace(/\*\*(.+?)\*\*/g, '$1').trim()
    return { level: Math.max(0, level), text }
  }).filter((x) => x.text)
}

/** Levelled lines as the notes' own outline (1. a. i.), each level no more than one in from the last. */
export function writeOutline(lines: Line[]): string {
  let prev = -1
  return renumber(lines.map((l) => {
    const level = Math.min(l.level, prev + 1)
    prev = level
    return `${'  '.repeat(level)}1. ${l.text}`
  })).join('\n')
}

export type Change =
  | { kind: 'same'; old: Line; oldAt?: number }
  | { kind: 'change'; old: Line; new: Line }
  | { kind: 'add'; new: Line }
  | { kind: 'remove'; old: Line; oldAt?: number }


/** How alike two lines' wording is, 0 to 1: the share of their words they have in common. */
export function likeness(a: string, b: string): number {
  const words = (t: string) => t.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
  const A = words(a), B = words(b)
  if (!A.length || !B.length) return 0
  const pool = [...B]
  let common = 0
  for (const w of A) { const k = pool.indexOf(w); if (k >= 0) { common++; pool.splice(k, 1) } }
  return (2 * common) / (A.length + B.length)
}
/** Lines at least this alike are one line changed (reworded or moved); less alike, one out and one in. */
export const ALIKE = 0.5

/**
 * The differences in reading order. Lines kept exactly are matched first (longest common run).
 * Of what is left, a removed line and an added line are one change only when their wording is
 * alike — wherever each is, so a line the AI moved under another heading reads as moved, not as a
 * removal here and an addition there; and two unrelated lines that happen to sit side by side are
 * never shown as a rewording of each other (Jacob, 11/24, with a screenshot of exactly that).
 */
export function compare(before: Line[], after: Line[]): Change[] {
  const same = (a: Line, b: Line) => a.level === b.level && a.text === b.text
  const n = before.length, m = after.length
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    L[i][j] = same(before[i], after[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
  // The alignment: each step a kept line, a removed one (old index) or an added one (new index).
  const steps: ({ k: 'same'; i: number } | { k: 'del'; i: number } | { k: 'add'; j: number })[] = []
  let i = 0, j = 0
  while (i < n || j < m) {
    if (i < n && j < m && same(before[i], after[j])) { steps.push({ k: 'same', i }); i++; j++ }
    // Where either would do, the old line goes first: a heading turned down then keeps the lines that follow it.
    else if (j < m && (i >= n || L[i][j + 1] > L[i + 1][j])) steps.push({ k: 'add', j: j++ })
    else steps.push({ k: 'del', i: i++ })
  }
  // Pair removed with added lines by likeness, most alike first.
  const dels = steps.filter((s): s is { k: 'del'; i: number } => s.k === 'del').map((s) => s.i)
  const adds = steps.filter((s): s is { k: 'add'; j: number } => s.k === 'add').map((s) => s.j)
  const pairs: { i: number; j: number; score: number }[] = []
  for (const di of dels) for (const aj of adds) {
    const score = likeness(before[di].text, after[aj].text)
    if (score >= ALIKE) pairs.push({ i: di, j: aj, score })
  }
  pairs.sort((x, y) => y.score - x.score)
  const delTo = new Map<number, number>(), addFrom = new Map<number, number>()
  for (const p of pairs) if (!delTo.has(p.i) && !addFrom.has(p.j)) { delTo.set(p.i, p.j); addFrom.set(p.j, p.i) }
  // Shown in reading order of the new notes: a paired change where the line now is.
  const out: Change[] = []
  const changeOfAdd = new Map<number, number>(), changeOfDel = new Map<number, number>()
  for (const st of steps) {
    if (st.k === 'same') out.push({ kind: 'same', old: before[st.i], oldAt: st.i })
    else if (st.k === 'del') { if (!delTo.has(st.i)) { changeOfDel.set(st.i, out.length); out.push({ kind: 'remove', old: before[st.i], oldAt: st.i }) } }
    else {
      const from = addFrom.get(st.j)
      changeOfAdd.set(st.j, out.length)
      if (from !== undefined) changeOfDel.set(from, out.length)
      out.push(from === undefined ? { kind: 'add', new: after[st.j] } : { kind: 'change', old: before[from], new: after[st.j] })
    }
  }

  /*
   * How apply() builds the result. Between two lines left exactly as they were, the old lines in
   * their order and the new lines in theirs are lined up by which of them are the same line
   * reworded. A reworded line keeps its place, taken or not. A line that went (or came from
   * another stretch) is kept in its old place if its change is turned down; one that arrived is put
   * in its new place if taken. So everything turned down is the notes as they were, everything
   * taken is the AI's, and a heading turned down still has the lines under it that were.
   */
  const plan: Op[] = []
  let oi: number[] = [], nj: number[] = []
  const flushRegion = () => {
    const inside = (i: number) => delTo.has(i) && nj.includes(delTo.get(i)!)
    const A = oi, B = nj
    const M: number[][] = Array.from({ length: A.length + 1 }, () => new Array(B.length + 1).fill(0))
    for (let x = A.length - 1; x >= 0; x--) for (let y = B.length - 1; y >= 0; y--)
      M[x][y] = inside(A[x]) && delTo.get(A[x]) === B[y] ? M[x + 1][y + 1] + 1 : Math.max(M[x + 1][y], M[x][y + 1])
    let x = 0, y = 0
    while (x < A.length || y < B.length) {
      if (x < A.length && y < B.length && inside(A[x]) && delTo.get(A[x]) === B[y]) { plan.push({ op: 'pair', old: before[A[x]], new: after[B[y]], change: changeOfAdd.get(B[y])! }); x++; y++ }
      else if (x < A.length && (y >= B.length || M[x + 1][y] >= M[x][y + 1])) { plan.push({ op: 'old', old: before[A[x]], change: changeOfDel.get(A[x])! }); x++ }
      else { plan.push({ op: 'new', new: after[B[y]], change: changeOfAdd.get(B[y])! }); y++ }
    }
    oi = []; nj = []
  }
  for (const st of steps) {
    if (st.k === 'same') { flushRegion(); plan.push({ op: 'same', old: before[st.i] }) }
    else if (st.k === 'del') oi.push(st.i)
    else nj.push(st.j)
  }
  flushRegion()
  plans.set(out, plan)
  return out
}

type Op =
  | { op: 'same'; old: Line }
  | { op: 'pair'; old: Line; new: Line; change: number }
  | { op: 'old'; old: Line; change: number }
  | { op: 'new'; new: Line; change: number }
const plans = new WeakMap<Change[], Op[]>()

export interface Decision { take: boolean; text?: string }
/**
 * The notes after the changes chosen. Taken: a change's new line, where the AI put it; an added
 * line; a removed line gone. Turned down (or undecided): the old line, where it was; nothing added;
 * the removed line kept. All taken gives the AI's notes; none taken gives the notes as they were.
 */
export function apply(changes: Change[], decide: (i: number) => Decision): string {
  const plan = plans.get(changes)
  if (!plan) throw new Error('apply() takes the list compare() gave')
  const lines: Line[] = []
  for (const p of plan) {
    if (p.op === 'same') { lines.push(p.old); continue }
    const d = decide(p.change)
    const fresh = (l: Line) => ({ ...l, text: d.text ?? l.text })
    if (p.op === 'pair') lines.push(d.take ? fresh(p.new) : p.old)
    else if (p.op === 'old') { if (!d.take) lines.push(p.old) }
    else if (d.take) lines.push(fresh(p.new))
  }
  return writeOutline(lines)
}

/** The words of two versions of a line, marked kept, out or in — for showing a change at a glance. */
export function wordDiff(a: string, b: string): { t: string; k: 'keep' | 'out' | 'in' }[] {
  // Words, spaces and punctuation each their own piece, so "erected" → "erected." marks only the full stop.
  const cut = (t: string) => t.split(/(\s+|[.,;:!?()"])/).filter((x) => x !== '')
  const A = cut(a), B = cut(b)
  const L: number[][] = Array.from({ length: A.length + 1 }, () => new Array(B.length + 1).fill(0))
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--)
    L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
  const out: { t: string; k: 'keep' | 'out' | 'in' }[] = []
  let i = 0, j = 0
  while (i < A.length || j < B.length) {
    if (i < A.length && j < B.length && A[i] === B[j]) { out.push({ t: A[i++], k: 'keep' }); j++ }
    else if (j < B.length && (i >= A.length || L[i][j + 1] >= L[i + 1][j])) out.push({ t: B[j++], k: 'in' })
    else out.push({ t: A[i++], k: 'out' })
  }
  return out
}
