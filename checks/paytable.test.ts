// node --experimental-strip-types paytable.test.ts — the continuation sheet read as a table.
import assert from 'node:assert/strict'
import { figure, readTable, settle, type PlacedWord } from '../src/lib/payTable.ts'
import { matchTable } from '../src/lib/payRead.ts'

let n = 0
const ok = (what: string, f: () => void) => { f(); n++; void what }

// figures as a scan leaves them
ok('figures', () => {
  assert.equal(figure('1,500.00')!.n, 1500)
  assert.equal(figure('0.00]')!.n, 0)
  assert.equal(figure('$ !00, 127.75')!.n, 100127.75)
  assert.equal(figure('1861800]')!.n, 18618)         // point lost: the column prints cents
  assert.equal(figure('1861800]')!.dotless, true)
  assert.equal(figure('(2,000.00)')!.n, -2000)
  assert.equal(figure('49.66%')!.pct, true)
  assert.equal(figure('ooo')!.n, 0)
  assert.equal(figure('Roofing'), null)
})

// a row's arithmetic mends one bad figure, and says which
ok('settle', () => {
  const s = settle({ C: 1783, D: 0, E: 0, F: 0, G: 0, H: 1793 }, { C: 1793 })
  assert.deepEqual(s.mended, ['C']); assert.equal(s.value.C, 1793)
  // Three single mendings would each make it add up; what the app holds for "from previous" decides.
  const t = settle({ C: 60000, D: 0, E: 850, F: 42607.43, G: 51107.43, H: 8892.57 }, { D: 0 })
  assert.deepEqual(t.mended, ['E']); assert.equal(t.value.E, 8500)
  assert.match(settle({ C: 60000, D: 0, E: 850, F: 42607.43, G: 51107.43, H: 8892.57 }).doubt ?? '', /more than one way/)
  const u = settle({ C: 100, D: 0, E: 0, F: 0, G: 0, H: 100 })
  assert.deepEqual(u.mended, [])
})

// A made-up sheet, laid out as words with positions the way a reader returns them.
const H = 10
const COLS = { C: 300, D: 380, E: 460, F: 540, G: 620, pct: 680, H: 760, I: 840 }
function row(y: number, item: string | null, name: string, f: (string | null)[]): PlacedWord[] {
  const out: PlacedWord[] = []
  if (item) out.push({ text: item, x: 20, y, w: item.length * 6, h: H })
  let x = 60
  for (const w of name.split(' ').filter(Boolean)) { out.push({ text: w, x, y, w: w.length * 6, h: H }); x += w.length * 6 + 5 }
  Object.values(COLS).forEach((r, i) => {
    const t = f[i]
    if (t == null) return
    out.push({ text: t, x: r - t.length * 6, y, w: t.length * 6, h: H })
  })
  return out
}
const header = [
  { text: 'APPLICATION', x: 600, y: 10, w: 60, h: H }, { text: 'NO:', x: 665, y: 10, w: 18, h: H }, { text: '8', x: 700, y: 10, w: 6, h: H },
  { text: 'ITEM', x: 20, y: 40, w: 24, h: H }, { text: 'DESCRIPTION', x: 60, y: 40, w: 66, h: H }, { text: 'SCHEDULED', x: 250, y: 40, w: 54, h: H },
]
const page1: PlacedWord[] = [
  ...header,
  // the total misread; the row's other figures put it right
  ...row(70, '1', 'General Conditions', ['124,000.00', '96,000.00', '12,000.00', '0.00', '108,600.00', '87.10%', '16,000.00', '5,400.00']),
  { text: 'Performance/Payment', x: 60, y: 84, w: 110, h: H },
  ...row(98, '2', 'Bond', ['47,000.00', '47,000.00', '0.00', '0.00', '47,000.00', '100.00%', '0.00', '2,350.00']),
  // the point lost from this period, and the item number read as "3I"
  ...row(112, '3I', 'Roofing', ['148,385.00', '0.00', '11128800', '0.00', '111,288.00', '75.00%', '37,097.00', '5,564.40']),
  ...row(126, '4', 'Hardware', ['36,665.00', '0.00', '0.00', '30,313.00', '30,313.00', '82.68%', '6,352.00', '0.00']),
  // 5 not on the sheet at all; 6 follows
  ...row(140, '6', 'Toilet Accessories', ['6,138.00', '0.00', '0.00', '0.00', '0.00', '0.00%', '6,138.00', '0.00']),
  ...row(154, null, 'Change Order 002', ['12,500.00', '0.00', '2,500.00', '0.00', '2,500.00', '20.00%', '10,000.00', '125.00']),
  ...row(168, null, 'GRAND TOTAL', ['$374,688.00', '$143,000.00', '$125,788.00', '$30,313.00', '$299,101.00', '79.83%', '$75,587.00', '$13,439.40']),
  { text: 'AIA', x: 20, y: 200, w: 18, h: H }, { text: 'Document', x: 42, y: 200, w: 48, h: H }, { text: '1963,', x: 300, y: 200, w: 30, h: H }, { text: '1965,', x: 335, y: 200, w: 30, h: H }, { text: '1970', x: 370, y: 200, w: 24, h: H },
]

const t = readTable([[], page1])
ok('table', () => {
  assert.equal(t.pages, 1)
  assert.equal(t.application, '8')
  const lines = t.rows.filter((r) => r.kind === 'line')
  assert.deepEqual(lines.map((r) => r.item), ['1', '2', '3', '4', '6', null])
  assert.equal(lines[2].value.E, 111288)                 // point put back
  assert.deepEqual(t.missing, ['5'])                     // the run of numbers says 5 is missing
  assert.ok(t.totals.length === 6 && t.totals.every((x) => x.agree), JSON.stringify(t.totals))
  assert.ok(t.wraps.some((w) => w.text === 'Performance/Payment'))
  assert.ok(!t.rows.some((r) => /AIA/.test(r.name)))    // a footer's years are not a row
})

const known = [
  { id: 'a', item_no: '1', description: 'General Conditions', scheduled: 124000, previous: 96000 },
  { id: 'b', item_no: '2', description: 'Performance and Payment Bond', scheduled: 47000, previous: 47000 },
  { id: 'c', item_no: '3', description: 'Roofing', scheduled: 148385, previous: 0 },
  { id: 'd', item_no: '4', description: 'Hardware', scheduled: 36665, previous: 0 },
  { id: 'e', item_no: '5', description: 'Hollow Metal', scheduled: 9000, previous: 0 },
  { id: 'f', item_no: '6', description: 'Toilet Accessories', scheduled: 6138, previous: 1000 },
]
const m = matchTable(t, known)
ok('match', () => {
  const by = Object.fromEntries(m.rows.map((r) => [r.id, r]))
  assert.equal(by.a.this_period, 12000)
  assert.equal(by.c.this_period, 111288)
  assert.equal(by.c.unsure, undefined)
  assert.match(by.c.note ?? '', /item number was read wrong/)
  assert.equal(by.a.unsure, undefined)
  assert.match(by.a.note ?? '', /completed and stored was read as 108,600.00; .* make it 108,000.00/)
  assert.equal(by.d.stored, 30313)
  assert.equal(by.e.found, false)
  assert.match(by.f.unsure ?? '', /from previous/)       // the PDF and the record disagree
  assert.deepEqual(m.missing, ['5'])
  assert.equal(m.extra.length, 1); assert.equal(m.extra[0].name, 'Change Order 002')
})

// A total that counts a row's figure in a different column than the row does.
ok('totals', () => {
  const p = [
    ...header,
    ...row(70, '1', 'Controls', ['500.00', '0.00', '0.00', '100.00', '100.00', '20.00%', '400.00', '0.00']),
    ...row(84, '2', 'Electrical', ['300.00', '0.00', '50.00', '0.00', '50.00', '16.67%', '250.00', '0.00']),
    ...row(98, null, 'Grand Totals', ['800.00', '0.00', '150.00', '0.00', '150.00', '18.75%', '650.00', '0.00']),
  ]
  const r = matchTable(readTable([p]), [
    { id: 'x', item_no: '1', description: 'Controls', scheduled: 500, previous: 0 },
    { id: 'y', item_no: '2', description: 'Electrical', scheduled: 300, previous: 0 },
  ])
  assert.equal(r.totalNotes.length, 1)
  assert.match(r.totalNotes[0], /Line 1 accounts for it/)
})

console.log(`paytable: ${n} checks pass`)
