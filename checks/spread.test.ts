import { combine, readBoard, spreadKeys, writeBoard, move, LOOSE, looseAt } from '../src/lib/noteBoard.ts'
let bad = 0
const eq = (a: unknown, b: unknown, what: string) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { bad++; console.log('FAIL', what, '\n  got ', JSON.stringify(a), '\n  want', JSON.stringify(b)) } else console.log('ok  ', what) }

const b = readBoard('1. Structure\n  a. anchor\n2. Unsorted\n  a. sealant\n  b. drywall\n  c. sealant')
eq([...spreadKeys(b).entries()], [['0', 'c:Structure#0'], ['1.0', 'n:sealant#0'], ['1.1', 'n:drywall#0'], ['1.2', 'n:sealant#1']], 'keys by words, repeats counted')
const c = combine(b, [1, 1], [1, 0])
eq(writeBoard(c.board), '1. Structure\n  a. anchor\n2. Unsorted\n  a. sealant\n3. New category\n  a. sealant\n  b. drywall', 'two loose notes make a category, the one dropped on first')
eq(c.at, 2, 'where the new category is')
const d = combine(b, [0, 0], [1, 2], 'Envelope')
eq(writeBoard(d.board), '1. Structure\n2. Unsorted\n  a. sealant\n  b. drywall\n3. Envelope\n  a. sealant\n  b. anchor', 'a filed note onto a loose one, named')
eq(combine(b, [0], [0, 0]).at, -1, 'not into itself')
// A subcategory taken out to the spread is a category of its own.
const e = move(readBoard('1. Site\n  a. Paving\n    i. cracks'), [0, 0], [])
eq(writeBoard(e), '1. Site\n2. Paving\n  a. cracks', 'a subcategory to the top')
eq(looseAt(readBoard('1. ' + LOOSE + '\n  a. x')), 0, 'loose found')
if (bad) { console.log(bad, 'failed'); process.exit(1) }
