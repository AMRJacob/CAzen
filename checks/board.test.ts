import { readBoard, writeBoard, addLoose, move, remove, rename, addBox, LOOSE } from '../src/lib/noteBoard.ts'
let bad = 0
const eq = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`) }
const start = '1. Site / Parking\n  a. \n2. Structure\n  a. Anchor bolts out of plumb\n3. Envelope\n  a. '
const b = readBoard(start)
eq('reads headings, drops empty markers', b.map((n) => [n.text, n.kids.map((k) => k.text)]), [['Site / Parking', []], ['Structure', ['Anchor bolts out of plumb']], ['Envelope', []]])
const typed = addLoose(b, 'Sealant missing at storefront')
eq('typed goes in the tray', typed[3], { text: LOOSE, kids: [{ text: 'Sealant missing at storefront', kids: [] }] })
const filed = move(typed, [3, 0], [2])
eq('dragged into Envelope', writeBoard(filed), '1. Site / Parking\n2. Structure\n  a. Anchor bolts out of plumb\n3. Envelope\n  a. Sealant missing at storefront')
eq('the empty tray is not written', writeBoard(filed).includes(LOOSE), false)
const sub = move(addBox(filed, [2], 'Storefront'), [2, 0], [2, 1])
eq('a subcategory, and a card moved into it', writeBoard(sub).split('\n').slice(3), ['3. Envelope', '  a. Storefront', '    i. Sealant missing at storefront'])
eq('a box moves with what is in it', writeBoard(move(sub, [2, 0], [0])).split('\n').slice(0, 3), ['1. Site / Parking', '  a. Storefront', '    i. Sealant missing at storefront'])
eq('nothing goes inside itself', move(sub, [2], [2, 0]) === sub, true)
eq('dropping a card on its own box leaves it', move(sub, [1, 0], [1]) === sub, true)
eq('a card dropped on a card makes that card a box', writeBoard(move(typed, [3, 0], [1, 0])).split('\n').slice(1, 4), ['2. Structure', '  a. Anchor bolts out of plumb', '    i. Sealant missing at storefront'])
eq('rename and remove', writeBoard(remove(rename(b, [0], 'Site'), [2])), '1. Site\n2. Structure\n  a. Anchor bolts out of plumb')
eq('round trip', writeBoard(readBoard(writeBoard(sub))), writeBoard(sub))
if (bad) { console.log(`${bad} failed`); process.exit(1) }
