import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ownArithmetic, whyTheyDiffer } from '../src/lib/payCompare.ts'
// UCA CW Loop application 6 as read: line 1 came in as $8.
const g = { due: 795102, contractSum: 9682671, originalSum: 8, changeOrders: 1682671, retainageTotal: 80688, balanceToFinish: 8149657, coThisAdditions: 0, coThisDeductions: 0, completedAndStored: 1613702, coPreviousAdditions: 1682671, earnedLessRetainage: 1533014, coPreviousDeductions: 0, previousCertificates: 737912 }
const total = { C: 9682671, D: 776753, E: 836949, F: 0, G: 1613702, H: 8068969, I: 80688, pct: 16.67 }
const pdf = (x = {}) => ({ read_at: '', lines: {}, g702: { ...g, ...x }, total }) as any
test('a cover sheet that adds up has nothing to say', () => assert.deepEqual(ownArithmetic(pdf({ originalSum: 8000000 })), []))
test('one figure its own sums contradict is named, with what they give', () => {
  const [s] = ownArithmetic(pdf())
  assert.equal(s.key, 'originalSum'); assert.equal(s.works, 8000000)
  const why = whyTheyDiffer([{ where: 'g702', label: '1', col: 'originalSum', pdf: 8, app: 8000000 }] as any, { coHere: 0, periodTo: '2026-07-31', coDates: [], own: [s] })
  assert.equal(why[0].key, 'misread'); assert.equal(why[0].whose, 'reading')
})
test('when it can’t be told which figure is wrong, the sum is the contractor’s', () => {
  const s = ownArithmetic(pdf({ originalSum: 8000000, due: 795200 }))
  assert.equal(s.length, 1); assert.equal(s[0].key, undefined); assert.equal(s[0].works, 795102)
})
