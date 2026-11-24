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
eq('the changes', ch.map((c) => c.kind), ['same', 'change', 'change', 'same', 'change', 'change', 'change'])
eq('take everything', apply(ch, () => ({ take: true })), writeOutline(after))
eq('leave everything', apply(ch, () => ({ take: false })), notes)
eq('take some, edit one', apply(ch, (i) => (i === 1 ? { take: true, text: 'Roof dry-in by Dec 5.' } : i === 5 ? { take: false } : { take: i !== 2 })).split('\n'),
  ['1. Schedule', '  a. Roof dry-in by Dec 5.', '  b. Owner wants furnature date', '2. Submittals', '  a. Door hardware resubmittal.', '3. Unsorted', '  a. Call the roofer about flashing.'])
const moved = compare(readOutline('1. A\n  a. x\n2. B'), readOutline('1. A\n2. B\n  a. x'))
eq('a line moved: one out, one in, applied gives the new order', [moved.filter((c) => c.kind === 'remove').length, moved.filter((c) => c.kind === 'add').length, apply(moved, () => ({ take: true }))], [1, 1, '1. A\n2. B\n  a. x'])
eq('the request carries the notes', forAi(notes, 'meeting').endsWith(notes), true)
console.log(bad ? `${bad} failed` : 'all passed'); process.exit(bad ? 1 : 0)
