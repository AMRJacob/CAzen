// node --experimental-strip-types airevise.test.ts — notes out to an AI and back, every change offered.
import { readOutline, writeOutline, compare, apply, forAi } from '../src/lib/aiRevise.ts'
let bad = 0
const eq = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`) }
const notes = '1. Schedule\n  a. roof dryin by 12/5\n  b. Owner wants furnature date\n2. Submittals\n  a. door hardware resubmital\n3. Unsorted\n  a. Call roofer about flashing'
eq('ours reads back as it was', writeOutline(readOutline(notes)), notes)
const reply = 'Here are the revised notes:\n\n```\n1. Schedule\n   a. Roof dry-in by 12/5.\n   b. Owner requested the furniture delivery date.\n2. Submittals\n   a. Door hardware resubmittal.\n3. Roofing\n   a. Call the roofer about flashing.\n```'
const after = readOutline(reply)
eq('a reply with preamble, fences and 3-space indents', after.map((l) => `${l.level}:${l.text}`), ['0:Schedule', '1:Roof dry-in by 12/5.', '1:Owner requested the furniture delivery date.', '0:Submittals', '1:Door hardware resubmittal.', '0:Roofing', '1:Call the roofer about flashing.'])
eq('markdown headings and bullets', readOutline('## Schedule\n- Roof dry-in\n  - by 12/5\n## Submittals\n- **Doors**').map((l) => `${l.level}:${l.text}`), ['0:Schedule', '1:Roof dry-in', '2:by 12/5', '0:Submittals', '1:Doors'])
const ch = compare(readOutline(notes), after)
eq('the changes shown', ch.filter((c) => c.kind !== 'was').map((c) => c.kind).filter((k) => k !== 'same').length > 0, true)
eq('take everything', apply(ch, () => ({ take: true })), writeOutline(after))
eq('leave everything', apply(ch, () => ({ take: false })), notes)
const txt = (c: (typeof ch)[number]) => ('new' in c ? c.new.text : c.old.text)
const decideBy = (i: number) => {
  const t = txt(ch[i])
  if (t.startsWith('Roof dry')) return { take: true, text: 'Roof dry-in by Dec 5.' }
  if (t.startsWith('Owner')) return { take: false }
  if (t === 'Roofing' || t === 'Unsorted') return { take: false }
  return { take: true }
}
eq('take some, edit one', apply(ch, decideBy).split('\n'),
  ['1. Schedule', '  a. Roof dry-in by Dec 5.', '  b. Owner wants furnature date', '2. Submittals', '  a. Door hardware resubmittal.', '3. Unsorted', '  a. Call the roofer about flashing.'])
const moved = compare(readOutline('1. A\n  a. x\n2. B'), readOutline('1. A\n2. B\n  a. x'))
eq('a line moved: one change; taken, the new order; left, the old', [moved.filter((c) => c.kind === 'change').length, apply(moved, () => ({ take: true })), apply(moved, () => ({ take: false }))], [1, '1. A\n2. B\n  a. x', '1. A\n  a. x\n2. B'])
eq('the request carries the notes', forAi(notes, 'meeting').endsWith(notes), true)
// From Jacob's screenshot: reordered, one added, unrelated lines side by side must not be paired.
const was = readOutline('1. Structure\n  a. Colling tower beams erected\n  b. Duct hanger brackets welded to the structure are mostly complete\n2. Envelope\n  a. Kinco will tape top of mockup flashing to zip sheathing\n  b. Metal building panels on site')
const now = readOutline('1. Structure\n  a. Cooling tower beams are erected.\n2. Envelope\n  a. Metal building panels are on site.\n  b. Kinco will tape the top of the mockup flashing to the ZIP sheathing.\n3. MEP\n  a. Duct hanger brackets welded to the structure are mostly complete.')
const cs = compare(was, now)
const pick = (t: string) => cs.find((c) => c.kind !== 'same' && c.kind !== 'remove' && c.new.text.startsWith(t))
eq('reworded line paired with its own old self', [pick('Metal')?.kind, pick('Metal')?.kind === 'change' && (pick('Metal') as { old: { text: string } }).old.text], ['change', 'Metal building panels on site'])
eq('Kinco line paired with the Kinco line', (pick('Kinco') as { old: { text: string } }).old.text, 'Kinco will tape top of mockup flashing to zip sheathing')
eq('a line moved under a new heading is a change, not out-and-in', [pick('Duct')?.kind, cs.filter((c) => c.kind === 'remove').length], ['change', 0])
eq('a new heading is added', cs.filter((c) => c.kind === 'add').map((c) => (c as { new: { text: string } }).new.text), ['MEP'])
eq('applied, all taken, is the new notes', apply(cs, () => ({ take: true })), writeOutline(now))
eq('applied, none taken, is the old notes', apply(cs, () => ({ take: false })), writeOutline(was))
console.log(bad ? `${bad} failed` : 'all passed'); process.exit(bad ? 1 : 0)
