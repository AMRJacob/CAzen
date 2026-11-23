import assert from 'node:assert/strict'
import { numbersIn, readPayLines, solve } from '../src/lib/payRead.ts'
assert.deepEqual(numbersIn('$12,500.00 (1,200.00) 45% 0.00 -300'), [12500, -1200, 0, -300])
// C D E F G % H I
assert.deepEqual(solve([400000, 200000, 100000, 0, 300000, 75, 100000, 30000], 400000, 200000), { e: 100000, f: 0 })
assert.deepEqual(solve([400000, 200000, 100000, 300000, 100000], 400000, 200000), { e: 100000, f: 0 }, 'blank cells left out')
assert.deepEqual(solve([600000, 150000, 25000, 175000, 29.17, 425000, 17500], 600000, 0), { e: 150000, f: 25000 }, 'this period and stored, nothing before')
assert.deepEqual(solve([50000, 50000, 50000, 100, 0, 5000], 50000, 0), { e: 50000, f: 0 }, 'billed in full in one period')
assert.deepEqual(solve([80000, 40000, 40000, 50, 40000, 4000], 80000, 40000), { e: 0, f: 0 }, 'nothing this period')
let s = solve([80000, 40000, 12345, 99999], 80000, 40000); assert.equal(s.e, 12345); assert.ok(s.unsure, 'does not add up → unsure')
s = solve([90000, 10000, 20000, 30000, 60000], 80000, 10000); assert.ok(s.unsure?.includes('scheduled value'))
const known = [
  { id: 'a', item_no: '1', description: 'Sitework', scheduled: 400000, previous: 200000 },
  { id: 'b', item_no: '2', description: 'Building concrete', scheduled: 600000, previous: 0 },
  { id: 'c', item_no: '3', description: 'Roofing', scheduled: 90000, previous: 0 },
  { id: 'd', item_no: '4', description: 'Landscaping', scheduled: 30000, previous: 0 },
]
const r = readPayLines([
  'CONTINUATION SHEET  AIA DOCUMENT G703  APPLICATION NO: 3', 'A B C D E F G H I',
  '1 Sitework 400,000.00 200,000.00 100,000.00 0.00 300,000.00 75% 100,000.00 30,000.00',
  '2 Bldg Concrete 600,000.00 150,000.00 25,000.00 175,000.00 29.17% 425,000.00 17,500.00',
  '3 Roofing 90,000.00 90,000.00',
  'TOTAL 1,120,000.00 200,000.00 250,000.00 25,000.00 475,000.00',
], known)
assert.deepEqual(r.rows.map((x) => [x.id, x.found, x.this_period, x.stored, !!x.unsure]), [['a', true, 100000, 0, false], ['b', true, 150000, 25000, false], ['c', true, 0, 0, false], ['d', false, 0, 0, false]])
assert.equal(r.found, 3)
console.log('payread: 12 checks pass')
{ // A wrapped name joins the row whose words run on ("Payment &" + "Performance Bond"), with nothing on record to judge by; a figure-less row is still offered.
  const { matchTable } = await import('../src/lib/payRead.ts')
  const row = (item: string, name: string, C: number, y: number) => ({ page: 1, item, name, kind: 'line' as const, read: { C, D: 0, E: 0, F: 0, G: 0, H: C }, value: { C, D: 0, E: 0, F: 0, G: 0, H: C }, mended: [], text: name, y })
  const t = { rows: [row('44', 'Contingency', 100, 10), row('45', 'Plant Payment &', 200, 20), row('46', 'General Liability', 300, 40), row('50', 'CO 1', 0, 50)], pages: 1, missing: [], totals: [],
    wraps: [{ text: 'Performance Bond', above: 1, below: 2 }, { text: 'Co', above: 0, below: 1 }] }
  const m = matchTable(t as any, [])
  const names = m.extra.map((x) => `${x.item} ${x.name}`)
  console.log(JSON.stringify(names) === JSON.stringify(['44 Contingency', '45 Plant Payment & Performance Bond', '46 General Liability', '50 CO 1']) ? 'ok   wrap joins the row that runs on; figure-less row offered' : 'FAIL wrap ' + JSON.stringify(names))
}
