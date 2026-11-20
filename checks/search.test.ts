import assert from 'node:assert/strict'
import { searchText } from '../src/lib/sheetSearch.ts'
const rows = [
  { id: 'a', body: 'DOOR SCHEDULE  See hardware sets. Doors 101 and 102 are hollow metal. Door frames welded.' },
  { id: 'b', body: 'ROOF PLAN  Roof drains with overflow. No doors here? Only one door.' },
  { id: 'c', body: 'SITE PLAN  Bollards at the outdoor patio.' },
]
let r = searchText(rows, 'door')
assert.deepEqual(r.map((x) => x.revision_id), ['a', 'b'], 'word start, most matches first; "outdoor" is not a hit')
assert.ok(r[0].snippet.includes('«DOOR»'), r[0].snippet)
r = searchText(rows, 'door hardware'); assert.deepEqual(r.map((x) => x.revision_id), ['a'], 'every word must appear')
assert.deepEqual(searchText(rows, '   '), [])
assert.deepEqual(searchText(rows, 'a.b(').length, 0, 'punctuation typed is not a pattern')
r = searchText(rows, 'bollards'); assert.ok(r[0].snippet.includes('«Bollards»'))
console.log('search: 6 cases pass')
