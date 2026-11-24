// Column rounding on a pay application, against Kinco's UCA CW Loop Application 1 figures (5% held).
import { figure, roundAs } from '../src/lib/payapps.ts'
let bad = 0, n = 0
const eq = (a: unknown, b: unknown, name: string) => { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { bad++; console.log('FAIL', name, JSON.stringify(a), '!=', JSON.stringify(b)) } }
const C = [0, 198475, 32471, 5000, 5410, 3500, 4000, 225517, 11234, 4493, 7577, 23637, 7478686]
const E = [0, 29771, 0, 0, 1894, 0, 0, 180414, 0, 4493, 7577, 0, 0]
const lines = C.map((v, i) => ({ id: 'l' + i, contract_id: 'c', sort: i, item_no: String(i + 1), description: 'Line ' + (i + 1), scheduled_value: v, retainage_rate: null, change_order_id: null, is_heading: false } as any))
const billed = new Map(E.map((e, i) => ['l' + i, { this_period: e, stored: 0 }]))
const app = { id: 'a', contract_id: 'c', number: 1, period_to: '2026-01-31', applied_on: '2026-02-18', retainage_work: null, retainage_stored: null, status: 'draft', certified_sum: null } as any
const base = { id: 'c', form: 'g702_g703', original_sum: 8000000, retainage_work: 5, retainage_stored: 0 } as any

const exact = figure(base, lines, app, billed, [])
eq(exact.g702.retainageTotal, 11207.45, 'exact retainage is the arithmetic')
const r = figure({ ...base, rounding: { I: 'nearest' } }, lines, app, billed, [])
eq(r.lines.filter((f) => f.retainage).map((f) => f.retainage), [1489, 95, 9021, 225, 379], 'column I rounded line by line, as printed')
eq(r.lines[1].exact?.retainage, 1488.55, 'the exact figure is kept')
eq(r.g702.retainageTotal, 11209, 'line 5 is the sum of the rounded lines, as printed')
eq(r.g702.earnedLessRetainage, 212940, 'line 6 as printed')
eq(r.totals.exact?.retainage, 11207.45, 'the exact total is kept')
eq(figure({ ...base, rounding: { I: 'down' } }, lines, app, billed, []).g702.retainageTotal, 11204, 'rounded down')
eq(figure({ ...base, rounding: { I: 'up' } }, lines, app, billed, []).g702.retainageTotal, 11209, 'rounded up')
eq(r.lines[4].exact?.percent, undefined, 'no % rounding unless asked')
const p = figure({ ...base, rounding: { pct: 'nearest' } }, lines, app, billed, [])
eq([p.lines[4].percent, Math.round(p.lines[4].exact!.percent! * 100) / 100], [35, 35.01], '% to a whole percent')
{ // Single cells set apart from their column.
  const o = figure({ ...base, rounding: { I: 'nearest' } }, lines, { ...app, rounding: { l1: { I: 'down' }, l4: { I: 'exact' } } }, billed, [])
  eq(o.lines.filter((f) => f.retainage).map((f) => f.retainage), [1488, 94.7, 9021, 225, 379], 'a cell rounded down and a cell left exact, in a column rounded to nearest')
  eq([o.lines[1].own, o.lines[4].own, o.lines[7].own], [{ I: 'down' }, { I: 'exact' }, undefined], 'which cells have their own way')
  eq(o.g702.retainageTotal, 11207.7, 'the total follows the cells')
  const later = figure({ ...base, rounding: { I: 'nearest' } }, lines, { ...app, id: 'b', number: 2 }, new Map(), [{ billed, rounding: { l1: { I: 'down' }, l4: { I: 'exact' } } }])
  eq(later.g702.previousCertificates, 224149 - 11207.7, 'a later application reads the earlier one with its own cells')
}
eq([roundAs(2.5, 'nearest'), roundAs(2.0000001, 'up'), roundAs(-1.5, 'down')], [3, 2, -1], 'roundAs edges')
eq([1488.01, 1488.5, 1488.99, 0.99, -1.25, -1.99].map((n) => roundAs(n, 'down')), [1488, 1488, 1488, 0, -1, -1], 'down drops the cents, whatever they are')
eq([1488.01, 1488.5, -1.25].map((n) => roundAs(n, 'up')), [1489, 1489, -2], 'up takes the next dollar for any cents')
eq([roundAs(1488.49, 'nearest'), roundAs(1488.4995, 'nearest'), roundAs(1488.5, 'nearest'), roundAs(0.4995, 'nearest'), roundAs(0.1 + 0.2 + 1.2, 'nearest')], [1488, 1488, 1489, 0, 2], 'nearest: under .5 down, .5 and over up')
console.log(bad ? `rounding: ${bad} of ${n} failed` : `rounding: ${n} checks pass`)
{ // The contractor's figures set against CAzen's, and the G702 page read by its labels (made-up lines).
  const { againstPdf } = await import('../src/lib/payCompare.ts')
  const { g702From } = await import('../src/lib/payTable.ts')
  const g = g702From(['1. Original Contract Sum   $1,000,000.00   CONTRACTOR: Builder', '2. NetChange ByChange Order . . .  $0.00', '3. Contract Sum To Date . $1,000,000.00',
    '4. Total Completed and Stored To Date  $20,000.00', '  a. 5.00o/o of Completed Work   $1,001.00', 'Total Retainage   $1,001.00', '6. Total Earned Less Retainage  $18,999.00',
    '7. Less Previous Certificates For Payments   $o.oo   Architect\'s knowledge', '8. Current Payment Due . .  $18,999.00', '9. Balance To Finish, Plus Retainage  $981,001.00'])
  eq(g, { originalSum: 1000000, changeOrders: 0, contractSum: 1000000, completedAndStored: 20000, retainageTotal: 1001, earnedLessRetainage: 18999, previousCertificates: 0, due: 18999, balanceToFinish: 981001 }, 'G702 read by its labels')
  const ls = [{ id: 'a', contract_id: 'c', sort: 1, item_no: '1', description: 'Sitework', scheduled_value: 1000000, retainage_rate: null, change_order_id: null, is_heading: false } as any]
  const b = new Map([['a', { this_period: 20010, stored: 0 }]])
  const f = figure({ ...base, original_sum: 1000000 }, ls, app, b, [])
  const d = againstPdf(f, { read_at: '', g702: g, lines: { a: { C: 1000000, E: 20000, G: 20000, I: 1001 } } })
  eq(d.map((x) => [x.where, x.col, x.pdf, x.app]), [['g702', 'completedAndStored', 20000, 20010], ['g702', 'retainageTotal', 1001, 1000.5], ['g702', 'earnedLessRetainage', 18999, 19009.5], ['g702', 'due', 18999, 19009.5], ['g702', 'balanceToFinish', 981001, 980990.5],
    ['line', 'E', 20000, 20010], ['line', 'G', 20000, 20010], ['line', 'I', 1001, 1000.5]], 'every figure that differs, and only those')
  console.log(bad ? `rounding+compare: ${bad} of ${n} failed` : `rounding+compare: ${n} checks pass`)
}
{ // Retainage rounded application by application (Kinco): UCA CW Loop line 2 through application 3 holds $4,102, not $4,101.
  const l2 = [{ id: 'g', contract_id: 'c', sort: 1, item_no: '2', description: 'General Conditions', scheduled_value: 198475, retainage_rate: null, change_order_id: null, is_heading: false } as any,
    { id: 'e', contract_id: 'c', sort: 2, item_no: '3', description: 'Equipment & Hoisting', scheduled_value: 32471, retainage_rate: null, change_order_id: null, is_heading: false } as any,
    { id: 'z', contract_id: 'c', sort: 3, item_no: '13', description: 'Balance of Work', scheduled_value: 7769054, retainage_rate: null, change_order_id: null, is_heading: false } as any]
  const m = (g: number, e: number) => new Map([['g', { this_period: g, stored: 0 }], ['e', { this_period: e, stored: 0 }]])
  const a3 = { ...app, id: 'a3', number: 3 }
  const near = figure({ ...base, rounding: { I: 'nearest' } }, l2, a3, m(42334, 8187), [{ billed: m(29771, 0) }, { billed: m(9924, 7144) }])
  const per = figure({ ...base, rounding: { I: 'period' } }, l2, a3, m(42334, 8187), [{ billed: m(29771, 0) }, { billed: m(9924, 7144) }])
  eq([near.lines[0].retainage, near.lines[1].retainage], [4101, 767], 'nearest rounds the line total: $4,101 and $767')
  eq([per.lines[0].retainage, per.lines[1].retainage], [4102, 766], 'per application, as Kinco prints: $4,102 and $766')
  eq(per.g702.previousCertificates, (29771 - 1489) + (9924 - 496) + (7144 - 357), 'line 7 from the earlier applications, each rounded when billed')
  console.log(bad ? `rounding+period: ${bad} of ${n} failed` : `rounding+period: ${n} checks pass`)
}
{ // Differences sorted by cause: a change order dated into this period, a missing earlier billing, retainage rounding.
  const { whyTheyDiffer } = await import('../src/lib/payCompare.ts')
  const D = (where: string, col: string, pdf: number, app: number, lineId?: string) => ({ where, col, pdf, app, label: lineId ?? col, ...(lineId ? { lineId } : {}) } as any)
  const g = whyTheyDiffer([
    D('g702', 'changeOrders', 0, 1682671), D('g702', 'contractSum', 8000000, 9682671), D('g702', 'balanceToFinish', 7654208, 9336878), D('total', 'C', 8000000, 9682671),
    D('line', 'D', 1000, 0, 'a'), D('line', 'G', 2000, 1000, 'a'), D('line', 'H', 0, 1000, 'a'),
    D('line', 'I', 4102, 4101, 'b'), D('total', 'I', 18202, 18201), D('g702', 'retainageTotal', 18202, 18201),
  ], { coHere: 1682671, periodTo: '2026-03-31', coDates: [{ date: '2026-11-23', total: 1682671 }], retainageFix: { label: 'Round each application’s retainage' } })
  eq(g.map((x) => [x.key, x.rows.length, x.follow]), [['co', 1, 3], ['previous', 1, 2], ['retainage', 1, 2]], 'grouped by cause, with what follows counted')
  eq(/approved 11\/23\/2026/.test(g[0].detail!), true, 'the change order group says which approval date put it here')
}
