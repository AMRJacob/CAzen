// node --experimental-strip-types agenda.test.ts — the agenda's carry-forward and its printed outline.
import { notesToItems, pickUp, agendaOutline, emptyAgenda } from '../src/lib/agenda.ts'
let bad = 0
const eq = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`) }
const notes = '1. Structure\n  a. Anchor bolts checked\n  b. Shoring at grid C\n2. Schedule\n3. Unsorted\n  a. Call the roofer\n'
eq('notes to items', notesToItems(notes), ['Structure — Anchor bolts checked', 'Structure — Shoring at grid C', 'Schedule', 'Call the roofer'])
const before = { from: null, old: [{ text: 'Shoring at grid C', done: true }, { text: 'Submit door hardware', done: false }], obs: ['o1'], fresh: [{ text: 'Owner furniture date', done: false }, { text: 'Done thing', done: true }] }
const a = pickUp(emptyAgenda(), { id: 'P', notes, agendas: [before], openObs: ['o2', 'o1'] })
eq('old business: unresolved agenda items, then notes', a.old.map((i) => i.text), ['Submit door hardware', 'Owner furniture date', 'Structure — Anchor bolts checked', 'Structure — Shoring at grid C', 'Schedule', 'Call the roofer'])
eq('observations: from the agenda and the page, once each', a.obs, ['o1', 'o2'])
eq('picking up twice adds nothing', pickUp(a, { id: 'P', notes, agendas: [before], openObs: ['o2'] }).old.length, a.old.length)
const out = agendaOutline({ ...a, old: a.old.slice(0, 2).map((i, k) => ({ ...i, done: k === 1 })), fresh: [{ text: 'Punch walk date', done: false }] },
  (id) => (id === 'o1' ? { name: 'Gl · 3', title: 'Sealant missing', open: true } : id === 'o2' ? { name: 'Dw · 4', title: 'Patch', open: false } : null))
eq('printed outline', out, '1. Old business\n  a. Submit door hardware\n  b. Owner furniture date — resolved\n2. Observations to review\n  a. Gl · 3 Sealant missing\n  b. Dw · 4 Patch — resolved\n3. New business\n  a. Punch walk date')
console.log(bad ? `${bad} failed` : 'all passed'); process.exit(bad ? 1 : 0)
