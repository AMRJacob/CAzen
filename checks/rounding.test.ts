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
eq([roundAs(2.5, 'nearest'), roundAs(2.0000001, 'up'), roundAs(-1.5, 'down')], [3, 2, -2], 'roundAs edges')
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
