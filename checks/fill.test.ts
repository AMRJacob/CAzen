import { defaultLayout, fill } from '../src/lib/pageLayout.ts'
let bad = 0
const eq = (a: unknown, b: unknown, what: string) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { bad++; console.log('FAIL', what, JSON.stringify(a), '≠', JSON.stringify(b)) } else console.log('ok  ', what) }
const d = defaultLayout('visit', 'desktop').blocks
const r = (ids: string[]) => Object.fromEntries(fill(d.filter((b) => ids.includes(b.id)), 12).map((b) => [b.id, [b.x, b.y, b.w, b.h]]))
eq(r(['head', 'notes', 'sketch', 'photos', 'seen']).head, [0, 0, 12, 3], 'attendees hidden: the head takes the width')
eq(r(['head', 'names', 'notes', 'photos', 'seen']).notes, [0, 3, 8, 9], 'sketch hidden: notes widen into it')
eq(r(['head', 'names', 'notes', 'sketch', 'seen']).seen, [8, 3, 4, 9], 'photos hidden: observations move up and run to the foot')
eq(r(['head', 'notes']), { head: [0, 0, 12, 3], notes: [0, 3, 12, 9] }, 'head and notes only: both full width')
if (bad) process.exit(1)
