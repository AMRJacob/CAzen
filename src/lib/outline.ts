/**
 * An outline as it is typed: 1. then a. then i., two spaces a level.
 *
 * The notes boxes are plain text — what is in the box is what prints — so "keeping the bullet
 * going" is done here, on the text itself. Three things, and they are the three a word
 * processor does without being asked:
 *
 *  - Enter starts the next item at the same level, with the next number or letter.
 *  - Enter on an item with nothing in it steps back out a level, and at the top level ends the list.
 *  - Moving a line in or out gives it the marker of the level it lands on.
 *
 * After any of them the numbering is put right, so an item added in the middle of a list does
 * not leave two 3s.
 *
 * Dependency-free on purpose: it is checked with node, not in a browser.
 */

const LINE = /^( *)((?:\d+|[ivxlcIVXLC]{1,6}|[a-zA-Z])[.)]|[-•*])?( *)(.*)$/

interface Parsed { indent: number; level: number; marker: string | null; ordinal: boolean; body: string }

function parse(line: string): Parsed {
  const m = line.match(LINE)!
  // "A word." is words, not a marker: a marker is followed by a space or is the whole line.
  const isMarker = !!m[2] && (m[3].length > 0 || m[4] === '')
  const indent = m[1].length
  if (!isMarker) return { indent, level: Math.floor(indent / 2), marker: null, ordinal: false, body: line.slice(indent) }
  return { indent, level: Math.floor(indent / 2), marker: m[2]!, ordinal: !/^[-•*]$/.test(m[2]!), body: m[4] }
}

const ROMAN: [number, string][] = [[100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]
function roman(n: number): string {
  let out = ''
  for (const [v, s] of ROMAN) while (n >= v) { out += s; n -= v }
  return out
}
const letter = (n: number) => String.fromCharCode(96 + ((n - 1) % 26) + 1)

/** The marker the nth item at a level carries: 1. a. i. and then the same again with brackets. */
export function markerFor(level: number, n: number): string {
  const close = level >= 3 ? ')' : '.'
  const kind = level % 3
  return (kind === 0 ? String(n) : kind === 1 ? letter(n) : roman(n)) + close
}

const build = (level: number, marker: string | null, body: string) =>
  `${'  '.repeat(level)}${marker ? `${marker} ` : ''}${body}`

/**
 * Put every numbered line's number right for where it sits. Bullets and plain lines are left
 * exactly as they are; a plain line still ends the count of anything deeper than itself.
 */
export function renumber(lines: string[]): string[] {
  const count: number[] = []
  return lines.map((raw) => {
    const p = parse(raw)
    if (!raw.trim()) return raw
    count.length = Math.min(count.length, p.level + 1)
    if (!p.ordinal) return raw
    while (count.length <= p.level) count.push(0)
    count[p.level]++
    return build(p.level, markerFor(p.level, count[p.level]), p.body)
  })
}

export interface Edited { value: string; start: number; end: number }

const offsetOf = (lines: string[], line: number) => lines.slice(0, line).reduce((n, l) => n + l.length + 1, 0)
const lineAt = (value: string, pos: number) => value.slice(0, pos).split('\n').length - 1
const headOf = (line: string) => { const p = parse(line); return p.indent + (p.marker ? p.marker.length + 1 : 0) }

/** Enter. Null when there is nothing special to do and the box can be left to itself. */
export function enter(value: string, start: number, end = start): Edited | null {
  const lines = value.split('\n')
  const at = lineAt(value, start)
  const col = start - offsetOf(lines, at)
  const p = parse(lines[at])
  if (!p.marker && p.indent === 0) return null

  // An item with nothing in it: Enter is how a list is stepped back out of, and then left.
  if (p.marker && !p.body.trim()) {
    lines[at] = p.level > 0 ? build(p.level - 1, p.ordinal ? markerFor(p.level - 1, 1) : p.marker, '') : ''
    const out = renumber(lines)
    const caret = offsetOf(out, at) + out[at].length
    return { value: out.join('\n'), start: caret, end: caret }
  }

  const head = headOf(lines[at])
  const cut = Math.max(col, head)
  const tail = lines[at].slice(cut + (end - start))
  lines[at] = lines[at].slice(0, cut)
  // The same level and the same kind of marker; its number is settled by the renumbering.
  lines.splice(at + 1, 0, build(p.level, p.marker ? (p.ordinal ? markerFor(p.level, 1) : p.marker) : null, tail))
  const out = renumber(lines)
  const caret = offsetOf(out, at + 1) + headOf(out[at + 1])
  return { value: out.join('\n'), start: caret, end: caret }
}

/**
 * Move the selected lines in (dir 1) or out (dir -1) a level. A numbered line takes the
 * marker of the level it lands on; a plain line moved in under a list joins it; a bullet
 * stays a bullet.
 */
export function shift(value: string, start: number, end: number, dir: 1 | -1): Edited {
  const lines = value.split('\n')
  const from = lineAt(value, start)
  const to = Math.max(from, lineAt(value, end > start && value[end - 1] === '\n' ? end - 1 : end))
  const one = from === to
  const col = start - offsetOf(lines, from)
  const before = headOf(lines[from])
  for (let i = from; i <= to; i++) {
    const p = parse(lines[i])
    if (!lines[i].trim() && !one) continue
    const level = p.level + dir
    if (level < 0) continue
    if (level > 5) continue
    // A plain line moved in becomes an item of the list it is moved into.
    const marker = p.marker ? (p.ordinal ? markerFor(level, 1) : p.marker) : dir === 1 ? markerFor(level, 1) : null
    lines[i] = build(level, marker, p.body)
  }
  const out = renumber(lines)
  if (one) {
    const caret = offsetOf(out, from) + Math.max(headOf(out[from]), headOf(out[from]) + (col - before))
    const c = Math.min(caret, offsetOf(out, from) + out[from].length)
    return { value: out.join('\n'), start: c, end: c }
  }
  return { value: out.join('\n'), start: offsetOf(out, from), end: offsetOf(out, to) + out[to].length }
}

/** The keys an outline box answers to. True when the key was dealt with. */
export function outlineKey(
  e: { key: string; shiftKey: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; isComposing?: boolean; preventDefault: () => void },
  box: { value: string; selectionStart: number; selectionEnd: number },
  apply: (next: Edited) => void,
): boolean {
  if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return false
  if (e.key === 'Tab') {
    e.preventDefault()
    apply(shift(box.value, box.selectionStart, box.selectionEnd, e.shiftKey ? -1 : 1))
    return true
  }
  if (e.key === 'Enter' && !e.shiftKey) {
    const next = enter(box.value, box.selectionStart, box.selectionEnd)
    if (!next) return false
    e.preventDefault()
    apply(next)
    return true
  }
  return false
}
