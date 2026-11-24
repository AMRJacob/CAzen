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
  | { kind: 'same'; old: Line }
  | { kind: 'change'; old: Line; new: Line }
  | { kind: 'add'; new: Line }
  | { kind: 'remove'; old: Line }

/** The differences, line by line, in reading order: a removed line and an added one side by side become one change. */
export function compare(before: Line[], after: Line[]): Change[] {
  const same = (a: Line, b: Line) => a.level === b.level && a.text === b.text
  const n = before.length, m = after.length
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    L[i][j] = same(before[i], after[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
  const out: Change[] = []
  let i = 0, j = 0, dels: Line[] = [], adds: Line[] = []
  const flush = () => {
    const k = Math.min(dels.length, adds.length)
    for (let x = 0; x < k; x++) out.push({ kind: 'change', old: dels[x], new: adds[x] })
    for (const d of dels.slice(k)) out.push({ kind: 'remove', old: d })
    for (const a of adds.slice(k)) out.push({ kind: 'add', new: a })
    dels = []; adds = []
  }
  while (i < n || j < m) {
    if (i < n && j < m && same(before[i], after[j])) { flush(); out.push({ kind: 'same', old: before[i] }); i++; j++ }
    else if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) adds.push(after[j++])
    else dels.push(before[i++])
  }
  flush()
  return out
}

export interface Decision { take: boolean; text?: string }
/** The notes after the changes chosen: a change taken is its new line (as edited), one left is the old. */
export function apply(changes: Change[], decide: (i: number) => Decision): string {
  const lines: Line[] = []
  changes.forEach((c, i) => {
    const d = c.kind === 'same' ? { take: false } : decide(i)
    if (c.kind === 'same') lines.push(c.old)
    else if (c.kind === 'change') lines.push(d.take ? { ...c.new, text: d.text ?? c.new.text } : c.old)
    else if (c.kind === 'add') { if (d.take) lines.push({ ...c.new, text: d.text ?? c.new.text }) }
    else if (!d.take) lines.push(c.old)
  })
  return writeOutline(lines)
}

/** The words of two versions of a line, marked kept, out or in — for showing a change at a glance. */
export function wordDiff(a: string, b: string): { t: string; k: 'keep' | 'out' | 'in' }[] {
  const A = a.split(/(\s+)/), B = b.split(/(\s+)/)
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
