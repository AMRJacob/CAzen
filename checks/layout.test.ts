// node --experimental-strip-types layout.test.ts
// The notebook page grid: snapping, no overlaps, no gaps, defaults, and what a stored layout is cleaned to.
import { settle, defaultLayout, clean, addBlock, depth, widgetsForReport, type Block } from '../src/lib/pageLayout.ts'
let bad = 0
const eq = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`) }
const overlap = (bs: Block[]) => bs.some((a) => bs.some((c) => a.id !== c.id && a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h))
const pos = (bs: Block[]) => Object.fromEntries(bs.map((x) => [x.id, [x.x, x.y, x.w, x.h]]))

for (const kind of ['visit', 'meeting'] as const) for (const s of ['desktop', 'tablet'] as const) {
  const d = defaultLayout(kind, s).blocks
  eq(`${kind}/${s} default has no overlaps and is 12 rows`, [overlap(d), depth(d)], [false, 12])
  eq(`${kind}/${s} default settles to itself`, pos(settle(d, s === 'desktop' ? 12 : 8)), pos(d))
}
const d = defaultLayout('visit', 'desktop').blocks
// Sketch dragged onto the notes: the notes go below it, and the gap closes.
const sk = d.find((x) => x.id === 'sketch')!
const moved = settle(d.map((x) => (x.id === 'sketch' ? { ...x, x: 0, y: 3 } : x)), 12, 'sketch', sk)
eq('dropped on another: no overlap', overlap(moved), false)
eq('dropped block keeps its place', pos(moved).sketch, [0, 3, 4, 9])
eq('the one it landed on takes the place it left', pos(moved).notes, [4, 3, 4, 9])
const notVacated = settle(d.map((x) => (x.id === 'sketch' ? { ...x, x: 0, y: 3 } : x)), 12, 'sketch')
eq('with no place left behind it goes under', pos(notVacated).notes, [0, 12, 4, 9])
const big = settle(d.map((x) => (x.id === 'head' ? { ...x, y: 3 } : x)), 12, 'head', d[0])
eq('too big for the spot left: no overlap', overlap(big), false)
// Moved far down into empty space: it slides up to close the gap.
const far = settle(d.map((x) => (x.id === 'seen' ? { ...x, y: 30 } : x)), 12, 'seen')
eq('a block left far down slides up', pos(far).seen, [8, 8, 4, 4])
// Too big, off the edge, too small.
eq('kept inside the columns', pos(settle([{ id: 'head', kind: 'head', x: 10, y: 0, w: 6, h: 3 }], 12)).head, [6, 0, 6, 3])
eq('no smaller than its least', pos(settle([{ id: 'notes', kind: 'notes', x: 0, y: 0, w: 1, h: 1 }], 12)).notes, [0, 0, 3, 3])
// Adding a block goes under everything at half width.
const added = addBlock({ v: 1, blocks: d }, 'check', 12, 'Punch walk')
const c = added.blocks.at(-1)!
eq('added checklist', [c.kind, c.x, c.y, c.w, c.h, c.title, c.id.startsWith('check-')], ['check', 0, 12, 6, 4, 'Punch walk', true])
// Cleaning what came back from storage.
eq('nonsense gives the default', clean({ nope: 1 }, 'visit', 'desktop'), defaultLayout('visit', 'desktop'))
const noHead = clean({ v: 1, blocks: [{ id: 'notes', kind: 'notes', x: 0, y: 0, w: 12, h: 6 }] }, 'visit', 'desktop')
eq('the head comes back if it went missing', noHead.blocks.map((x) => x.id), ['head', 'notes'])
eq('and nothing overlaps after', overlap(noHead.blocks), false)
const meet = clean({ v: 1, blocks: [{ id: 'head', kind: 'head', x: 0, y: 0, w: 8, h: 3 }, { id: 'photos', kind: 'photos', x: 0, y: 3, w: 4, h: 4 }] }, 'meeting', 'desktop')
eq('a meeting page drops photographs', meet.blocks.map((x) => x.id), ['head'])
eq('phone order kept, positions flattened', clean({ v: 1, blocks: [{ id: 'sketch', kind: 'sketch', x: 4, y: 9, w: 3, h: 3 }, { id: 'head', kind: 'head', x: 0, y: 0, w: 1, h: 1 }] }, 'visit', 'phone').blocks.map((x) => [x.id, x.y]), [['sketch', 0], ['head', 1]])
// In the report.
const blocks: Block[] = [{ id: 'text-a', kind: 'text', x: 0, y: 0, w: 4, h: 4, title: 'Weather delays' }, { id: 'check-b', kind: 'check', x: 0, y: 0, w: 4, h: 4 }]
eq('report lines', widgetsForReport(blocks, { 'text-a': { text: 'Rain Tuesday\n\nNo work Wed' }, 'check-b': { items: [{ text: 'Roof drains', done: true }, { text: '', done: false }, { text: 'Flashing', done: false }] } }, 3),
  '\n4. Weather delays\n  a. Rain Tuesday\n  b. No work Wed\n5. Checklist\n  a. Roof drains — done\n  b. Flashing — open')
eq('empty blocks add nothing', widgetsForReport(blocks, {}, 3), '')
console.log(bad ? `${bad} failed` : 'all passed')
process.exit(bad ? 1 : 0)
