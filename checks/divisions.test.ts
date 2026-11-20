// node --experimental-strip-types divisions.test.ts — the first guess at a line's CSI division.
import assert from 'node:assert/strict'
import { guessDivision, guessDivisions, guessActivity } from '../src/lib/divisions.ts'

const cases: [string, string | null][] = [
  ['General Conditions', '01'], ['Performance and Payment Bond', '01'], ["Builder's Risk", '01'], ['Traffic Control & Street Protection', '01'],
  ['Site Demo - Conc, Metal Building, etc', '02'], ['Concrete Footings / Pads', '03'], ['Masonry - Brick', '04'], ['Structural Steel', '05'],
  ['Rough Carpentry', '06'], ['TPO Roofing', '07'], ['Overhead Doors', '08'], ['Metal Framing & Drywall', '09'], ['Acoustical Ceilings', '09'],
  ['Toilet Accessories', '10'], ['Appliances', '11'], ['Blinds', '12'], ['PEMB Erection', '13'], ['Fire Sprinklers', '21'],
  ['Plumbing - Underslab Rough-In', '22'], ['HVAC - Ductwork', '23'], ['Controls Allowance', '23'], ['Erosion Control', '31'],
  ['Electrical Trimout', '26'], ['Site Data Conduit Allowance', '27'], ['Earthwork (Tree Removal, Grading)', '31'],
  ['Curb and Gutter', '32'], ['Heavy Concrete Pavement', '32'], ['Storm Drainage', '33'], ['Change Order 001', null],
]
for (const [t, d] of cases) assert.equal(guessDivision(t), d, t)
assert.deepEqual(guessDivisions('Rough-In Plbg, Elec, HVAC'), ['22', '23', '26'])
assert.deepEqual(guessDivisions('Concrete Footings / Pads at Building'), ['03'])
assert.deepEqual(guessActivity('Rough-in', 'PLUMBING'), ['22'])
assert.deepEqual(guessActivity('Punchlist, Inspection', 'METAL BUILDING'), ['01'])
console.log(`divisions: ${cases.length + 4} checks pass`)
