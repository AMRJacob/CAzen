// node --experimental-strip-types dropempty.test.ts — empty categories left out of the report, and named.
import { dropEmpty } from '../src/lib/noteBoard.ts'
const r = dropEmpty('1. Site / Parking\n2. Structure\n  a. Anchor bolts\n3. Envelope\n4. Interior\n  a. Drywall')
const ok = r.notes === '1. Structure\n  a. Anchor bolts\n2. Interior\n  a. Drywall' && JSON.stringify(r.empty) === JSON.stringify(['Site / Parking', 'Envelope'])
console.log(ok ? 'all passed' : `FAIL ${JSON.stringify(r)}`); process.exit(ok ? 0 : 1)
