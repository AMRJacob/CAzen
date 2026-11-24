// node --experimental-strip-types groups.test.ts — one report from a group of notebook pages.
import { groupsOf, groupNotes, groupNames, groupPlaces, defaultName } from '../src/lib/pageGroups.ts'
let bad = 0
const eq = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`) }
const P = (id: string, at: string, title: string | null, location: string | null, notes: string, names = '', g: string | null = 'G') =>
  ({ id, visited_on: '2026-11-24', visited_at: at, title, location, names, notes, group_id: g, group_name: null })
const pages = [P('b', '11:00:00', 'Maintenance building', 'Job site\nUCA campus', '1. Roof\n  a. Flashing loose\n2. Unsorted\n  a. ', 'Ann | UCA | a@x\nBo | GC | b@x'),
  P('a', '09:00:00', 'North chiller plant', null, '1. Structure\n  a. Anchor bolts\n    i. Grid C', 'Ann | UCA | a@x'),
  P('c', '13:00:00', null, 'Bear Hall', '1. Progress\n  a. Drywall at L2'), P('x', '08:00:00', 'Alone', null, '1. Z', '', null)]
const g = groupsOf(pages)
eq('one group, pages in written order', g.map((x) => [x.id, x.pages.map((p) => p.id)]), [['G', ['a', 'b', 'c']]])
eq('name until renamed', [defaultName(g[0].pages), defaultName([pages[0], { ...pages[0], id: 'z' }])], ['3 pages', 'Maintenance building'])
eq('notes: a section per page, its outline set in and renumbered', groupNotes(g[0].pages).split('\n'), [
  '1. North chiller plant', '  a. Structure', '    i. Anchor bolts', '      1) Grid C',
  '2. Maintenance building — UCA campus', '  a. Roof', '    i. Flashing loose', '  b. Unsorted',
  '3. Bear Hall', '  a. Progress', '    i. Drywall at L2'])
eq('attendees once each', groupNames(g[0].pages).split('\n'), ['Ann | UCA | a@x', 'Bo | GC | b@x'])
eq('places', groupPlaces(g[0].pages).split('\n'), ['North chiller plant', 'Maintenance building — UCA campus', 'Bear Hall'])
console.log(bad ? `${bad} failed` : 'all passed'); process.exit(bad ? 1 : 0)
