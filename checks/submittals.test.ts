import assert from 'node:assert/strict'
import { isoDay, register, resubmittalNumber, splitNumber, totals } from '../src/lib/submittalLog.ts'
const E = (id: string, number: string, values: Record<string, string>, file: string | null = null) =>
  ({ id, number, title: values['sub.title'] ?? null, values, file_path: file, issued_at: '2026-11-01T12:00:00Z' })
assert.equal(isoDay('02/04/2026'), '2026-02-04'); assert.equal(isoDay('2026-02-04'), '2026-02-04'); assert.equal(isoDay('soon'), null)
assert.deepEqual(splitNumber('09 30 00 - 001 R2'), { base: '09 30 00 - 001', round: 2 })
assert.deepEqual(splitNumber('09 30 00 - 001'), { base: '09 30 00 - 001', round: 0 })
const rows = register([
  E('d', '09 30 00 - 001 R1', { 'sub.received': '11/15/2026' }),
  E('a', '09 30 00 - 001', { 'sub.received': '10/01/2026', 'sub.returned': '10/09/2026', 'sub.action': 'revise_resubmit' }, 'x.pdf'),
  E('b', '08 41 13 - 001', { 'sub.received': '11/01/2026', 'sub.to_consultant': '11/02/2026', 'sub.consultant': 'Structural' }),
  E('c', '08 41 13 - 002', { 'sub.received': '11/10/2026', 'sub.to_consultant': '11/11/2026', 'sub.from_consultant': '11/17/2026' }),
  E('e', '05 12 00 - 001', { 'sub.received': '10/01/2026', 'sub.returned': '10/05/2026', 'sub.action': 'rejected' }, 'y.pdf'),
], '2026-11-19')
assert.deepEqual(rows.map((r) => r.id), ['e', 'b', 'c', 'a', 'd'], 'by number, resubmittal after its original')
const by = Object.fromEntries(rows.map((r) => [r.id, r]))
assert.equal(by.a.standing, 'returned'); assert.equal(by.a.days, 8); assert.equal(by.a.awaitingResubmittal, false, 'R1 has come in')
assert.equal(by.e.awaitingResubmittal, true)
assert.equal(by.b.standing, 'with_consultant'); assert.equal(by.b.days, 18); assert.equal(by.b.late, true)
assert.equal(by.c.standing, 'back_from_consultant'); assert.equal(by.c.late, false)
assert.equal(by.d.standing, 'received'); assert.equal(by.d.round, 1); assert.equal(by.d.section, '09 30 00')
assert.deepEqual(totals(rows), { all: 5, open: 3, withConsultant: 1, late: 1, awaitingResubmittal: 1 })
assert.equal(resubmittalNumber(by.a, rows), '09 30 00 - 001 R2'); assert.equal(resubmittalNumber(by.e, rows), '05 12 00 - 001 R1')
console.log('submittals: 17 checks pass')
