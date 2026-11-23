// node --experimental-strip-types obspages.test.ts — which field-notes page an observation is on.
import { pageOf, LINKED_SINCE } from '../src/lib/obsPages.ts'
let bad = 0
const eq = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`) }
const pages = [{ id: 'A', visited_on: '2026-11-18', visited_at: '09:00:00' }, { id: 'B', visited_on: '2026-11-20', visited_at: '14:00:00' }]
const at = (iso: string, visit_id?: string | null) => ({ created_at: iso, observed_on: iso.slice(0, 10), visit_id })
const after = new Date(LINKED_SINCE + 3600_000).toISOString()
eq('linked to a page: that page', pageOf(at(after, 'A'), pages, true), 'A')
eq('linked to a page torn out: General', pageOf(at(after, 'Z'), pages, true), null)
eq('new, made outside the notebooks: General', pageOf(at(after), pages, true), null)
eq('new, but the database has no link yet: by time', pageOf(at(after), pages, false), 'B')
eq('old, in A’s time: A', pageOf(at('2026-11-18T15:30:00'), pages, true), 'A')
eq('old, after B started: B', pageOf(at('2026-11-21T10:00:00'), pages, true), 'B')
eq('old, before any page: General', pageOf(at('2026-11-10T10:00:00'), pages, true), null)
console.log(bad ? `${bad} failed` : 'all passed'); process.exit(bad ? 1 : 0)
