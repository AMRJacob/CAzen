import { test } from 'node:test'
import assert from 'node:assert/strict'
import { figure } from '../src/lib/payapps.ts'
const contract = { id: 'c', form: 'g702_g703', original_sum: 1000, retainage_work: 0, retainage_stored: 0 } as any
const line = (id: string, v: number, co = false) => ({ id, item_no: id, description: id, scheduled_value: v, is_heading: false, parent_id: null, change_order_id: co ? 'unlinked' : null, retainage_rate: null, approved_on: null, sort: 0 })
const lines = [line('a', 600), line('b', 400), line('co1', 0, true), line('co2', 0, true)]
const app = (n: number) => ({ id: 'a' + n, number: n, period_to: '2026-01-01', applied_on: '2026-01-01', retainage_work: null, retainage_stored: null, status: 'draft', certified_sum: null }) as any
const M = (o: Record<string, any>) => new Map(Object.entries(o))
// App 2 moves 100 from a to b; app 3 brings in a change order of 300 on two lines.
const b1 = M({}), b2 = M({ a: { this_period: 0, stored: 0, scheduled: 500 }, b: { this_period: 0, stored: 0, scheduled: 500 } })
const b3 = M({ co1: { this_period: 0, stored: 0, scheduled: 200 }, co2: { this_period: 0, stored: 0, scheduled: 100 } })
const at = (n: number) => figure(contract, lines, app(n), [b1, b2, b3][n - 1], [b1, b2, b3].slice(0, n - 1).map((billed) => ({ billed })))
const sv = (f: any, id: string) => f.lines.find((x: any) => x.line.id === id).line.scheduled_value
test('an earlier application keeps its values', () => { const f = at(1); assert.equal(sv(f, 'a'), 600); assert.equal(f.g702.changeOrders, 0) })
test('a change carries on to later applications', () => {
  const f2 = at(2), f3 = at(3)
  assert.equal(sv(f2, 'a'), 500); assert.ok(f2.lines.find((x) => x.line.id === 'a')!.scheduledHere)
  assert.equal(sv(f3, 'a'), 500); assert.equal(f3.lines.find((x) => x.line.id === 'a')!.carried, 500); assert.ok(!f3.lines.find((x) => x.line.id === 'a')!.scheduledHere)
})
test('change orders are the total of the change order lines, split by what is new', () => {
  const f3 = at(3)
  assert.equal(f3.g702.changeOrders, 300); assert.equal(f3.g702.contractSum, 1300)
  assert.equal(f3.changeOrderSummary.thisAdditions, 300); assert.equal(f3.changeOrderSummary.previousAdditions, 0)
})
test('money linked from a contract line into a change order line is not line 2', () => {
  const b4 = M({ a: { this_period: 0, stored: 0, scheduled: 450 }, co1: { this_period: 0, stored: 0, scheduled: 250 } })
  const app4 = { ...app(4), moves: [{ from: 'a', to: 'co1', amount: 50 }] }
  const f4 = figure(contract, lines, app4, b4, [b1, b2, b3].map((billed) => ({ billed })))
  assert.equal(f4.g702.changeOrders, 300); assert.equal(f4.g702.contractSum, 1300)
  assert.equal(f4.changeOrderSummary.thisAdditions, 0)
  // and the application after it still leaves it out
  const f5 = figure(contract, lines, app(5), M({}), [b1, b2, b3, b4].map((billed, i) => ({ billed, moves: i === 3 ? app4.moves : [] })))
  assert.equal(f5.g702.changeOrders, 300)
})
