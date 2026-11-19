import { enter, shift, renumber, markerFor } from '../src/lib/outline.ts'
let bad = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`)
}
const at = (s: string) => ({ value: s.replace('|', ''), pos: s.indexOf('|') })
const show = (r: { value: string; start: number } | null) => r ? r.value.slice(0, r.start) + '|' + r.value.slice(r.start) : null
const E = (s: string) => { const a = at(s); return show(enter(a.value, a.pos)) }
const S = (s: string, d: 1 | -1) => { const a = at(s); return show(shift(a.value, a.pos, a.pos, d)) }

eq('markers by level', [0, 1, 2, 3].map((l) => markerFor(l, 4)), ['4.', 'd.', 'iv.', '4)'])
eq('enter keeps the level: sub-item', E('1. Site\n  a. Grading done|'), '1. Site\n  a. Grading done\n  b. |')
eq('enter keeps the level: top', E('1. Site|\n2. Structure'), '1. Site\n2. |\n3. Structure')
eq('enter in the middle carries the rest down', E('  a. Slab |poured'), '  a. Slab \n  b. |poured')
eq('enter at third level', E('    i. Rebar|'), '    i. Rebar\n    ii. |')
eq('enter on a bullet', E('  - one|'), '  - one\n  - |')
eq('enter on an empty sub-item steps out', E('1. Site\n  a. x\n  b. |'), '1. Site\n  a. x\n2. |')
eq('enter on an empty top item ends the list', E('1. Site\n2. |'), '1. Site\n|')
eq('enter on a plain line is left alone', E('Hello|'), null)
eq('enter on an indented plain line keeps the indent', E('  plain|'), '  plain\n  |')
eq('demote gives the next level its marker', S('1. Site\n2. Gra|ding', 1), '1. Site\n  a. Gra|ding')
eq('demote again goes to roman', S('1. Site\n  a. x\n  b. Gra|ding', 1), '1. Site\n  a. x\n    i. Gra|ding')
eq('demote joins the list below its parent', S('1. Site\n  a. x\n2. y|\n3. z', 1), '1. Site\n  a. x\n  b. y|\n2. z')
eq('promote takes the upper level marker and renumbers', S('1. Site\n  a. x\n  b. y|\n2. z', -1), '1. Site\n  a. x\n2. y|\n3. z')
eq('promote at the top does nothing', S('1. Si|te', -1), '1. Si|te')
eq('demote a plain line adds a marker', S('1. Site\nnote|', 1), '1. Site\n  a. note|')
eq('bullets stay bullets', S('- one|', 1), '  - one|')
eq('renumber leaves bullets and headings', renumber(['CIVIL', '  b. x', '  b. y', 'LANDSCAPE', '  c. z', '- loose']), ['CIVIL', '  a. x', '  b. y', 'LANDSCAPE', '  a. z', '- loose'])
eq('a word followed by a full stop is words, not a marker', E('Done.|'), null)
{
  const v = '1. a\n2. b\n3. c'
  const r = shift(v, 5, v.length, 1)
  eq('several lines demoted together', r.value, '1. a\n  a. b\n  b. c')
}
if (bad) { console.log(`${bad} failed`); process.exit(1) }
