/**
 * Bullets and levels for the plain text typed on a pad.
 *
 * A pad's text box holds plain words, so a list is kept the plain way: a line that starts
 * with "• " is a bullet, and four spaces in front of it put it a level in. These work on the
 * lines the cursor or the selection touches and say where the cursor belongs afterwards.
 * Dependency-free (`checks/padtext.test.ts`).
 */
export const BULLET = '• '
export const STEP = '    '
export interface Edit { text: string; start: number; end: number }

/** The whole lines a selection touches: where they begin and end in the text. */
function span(text: string, start: number, end: number): { from: number; to: number } {
  const from = text.lastIndexOf('\n', start - 1) + 1
  // A selection ending just after a line break does not reach into the next line.
  const last = end > start && text[end - 1] === '\n' ? end - 1 : end
  const nl = text.indexOf('\n', last)
  return { from, to: nl < 0 ? text.length : nl }
}

function each(text: string, start: number, end: number, change: (line: string) => string): Edit {
  const { from, to } = span(text, start, end)
  const before = text.slice(from, to).split('\n')
  const after = before.map(change)
  const out = text.slice(0, from) + after.join('\n') + text.slice(to)
  // The cursor keeps its place in its own line; a selection covers the lines it covered.
  const first = after[0].length - before[0].length
  const all = after.join('\n').length - before.join('\n').length
  const s = Math.max(from, start + first)
  return { text: out, start: s, end: start === end ? s : Math.max(s, end + all) }
}

const parts = (line: string) => { const m = line.match(/^(\s*)(• ?)?(.*)$/s)!; return { lead: m[1], bullet: !!m[2], rest: m[3] } }

/** Bullets on if any touched line lacks one; off if they all have one. */
export function toggleBullets(text: string, start: number, end: number): Edit {
  const { from, to } = span(text, start, end)
  const lines = text.slice(from, to).split('\n')
  const on = lines.some((l) => !parts(l).bullet)
  return each(text, start, end, (l) => { const p = parts(l); return p.lead + (on ? BULLET : '') + p.rest })
}
export const indent = (text: string, start: number, end: number): Edit => each(text, start, end, (l) => STEP + l)
export const outdent = (text: string, start: number, end: number): Edit =>
  each(text, start, end, (l) => l.replace(/^( {1,4}|\t)/, ''))

/**
 * Enter in a list: the next line starts at the same level with its own bullet. On a bullet
 * with nothing after it, Enter steps back out a level, and at the outer level ends the list.
 * Null when the line is not a bullet — the box then does what Enter always does.
 */
export function enterInList(text: string, at: number): Edit | null {
  const from = text.lastIndexOf('\n', at - 1) + 1
  const nl = text.indexOf('\n', at)
  const line = text.slice(from, nl < 0 ? text.length : nl)
  const p = parts(line)
  if (!p.bullet) return null
  if (!p.rest.trim()) {
    const next = p.lead.length >= STEP.length ? p.lead.slice(STEP.length) + BULLET : ''
    const out = text.slice(0, from) + next + text.slice(from + line.length)
    return { text: out, start: from + next.length, end: from + next.length }
  }
  const add = '\n' + p.lead + BULLET
  return { text: text.slice(0, at) + add + text.slice(at), start: at + add.length, end: at + add.length }
}
