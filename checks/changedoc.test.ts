import { classifyPages, readCover, dateIn, kindOnPage, suggestAction, splicePages, countOf } from '../src/lib/pdf/changeDoc.ts'
import { readPlace } from '../src/lib/pdf/specRead.ts'
import type { PageText } from '../src/lib/pdf/pageText.ts'
let bad = 0
const eq = (n: string, g: unknown, w: unknown) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${ok ? '' : ` got ${JSON.stringify(g)} want ${JSON.stringify(w)}`}`) }

// A letter page from lines: [text, y (0–1), height (0–1), x].
const letter = (...lines: [string, number, number?, number?][]): PageText => ({ width: 612, height: 792,
  words: lines.map(([str, y, h = 0.014, x = 0.12]) => ({ str, x, y, w: Math.min(0.8, str.length * h * 0.45), h, vertical: false })) })
const dsize: PageText = { width: 2592, height: 1728, words: [{ str: 'A-201', x: 0.95, y: 0.96, w: 0.03, h: 0.01, vertical: false }] }

const asiCover = letter(
  ['AMR ARCHITECTS', 0.05, 0.016],
  ["ARCHITECT'S SUPPLEMENTAL INSTRUCTIONS", 0.12, 0.028],
  ['PROJECT: CAW Westrock Landing Watershed Office', 0.22],
  ['ASI No.: 003', 0.25],
  ['Date: November 20, 2026', 0.28],
  ['Subject: Revised storefront head detail', 0.31],
  ['Item 1: SECTION 08 43 13 - replace paragraph 2.3.A.', 0.40],
  ['Item 2: Section 09 91 00 - see attached pages.', 0.43],
)
const narrative = letter(['Item 3: Sheet A-501, detail 5 revised.', 0.1], ['Page 2 of 2', 0.95])
const spec = (num: string, k: number, opts: { head?: string; end?: boolean; label?: string } = {}) => letter(
  ...(opts.head ? [[`SECTION ${num}`, 0.08, 0.018], [opts.head, 0.1, 0.018]] as [string, number, number][] : []),
  ['PART 2 - PRODUCTS', 0.2], ['2.1 MANUFACTURERS', 0.23],
  ...(opts.end ? [[`END OF SECTION ${num}`, 0.7]] as [string, number][] : []),
  [`PAINTING ${num} - ${opts.label ?? k}`, 0.95, 0.011],
)

eq('cover kind: AIA-style title', kindOnPage(asiCover), 'asi')
eq('addendum title', kindOnPage(letter(['ADDENDUM NO. 2', 0.1, 0.03])), 'addendum')
eq('"…a Change Order" low on an ASI does not make it one', kindOnPage(letter(['ASI-004', 0.08, 0.03], ['This will be issued as a Change Order.', 0.3])), 'asi')

eq('roles of a mixed ASI', classifyPages([
  { text: asiCover, readByTemplate: false },
  { text: narrative, readByTemplate: false },
  { text: spec('09 91 00', 3), readByTemplate: false },
  { text: letter(['SCHEDULE OF COLORS', 0.1], ['P-1 SW 7036', 0.2]), readByTemplate: false },
  { text: spec('09 91 00', 5, { end: true }), readByTemplate: false },
  { text: dsize, readByTemplate: true },
  { text: dsize, readByTemplate: false },
]), ['cover', 'cover', 'spec', 'spec', 'spec', 'sheet', 'sheet'])

eq('a small page a title block read is a drawing', classifyPages([{ text: spec('09 91 00', 1), readByTemplate: true }]), ['sheet'])
eq('spec-only addendum with a cover', classifyPages([
  { text: letter(['ADDENDUM NO. 2', 0.1, 0.03], ['Date: 11/20/2026', 0.2]), readByTemplate: false },
  { text: spec('01 10 00', 1, { head: 'SUMMARY' }), readByTemplate: false },
]), ['cover', 'spec'])

eq('cover reading (ASI)', readCover([asiCover, narrative]), { kind: 'asi', number: '003', date: '2026-11-20', subject: 'Revised storefront head detail' })
eq('cover reading (addendum, letter number, numeric date)', readCover([letter(['ADDENDUM B', 0.1, 0.03], ['DATE: 11/3/26', 0.2], ['TO: All plan holders', 0.24])]),
  { kind: 'addendum', number: 'B', date: '2026-11-03', subject: null })
eq('cover reading (PR, label on its own line)', readCover([letter(['PROPOSAL REQUEST', 0.08, 0.03], ['PROPOSAL REQUEST NUMBER: 4', 0.2], ['RE:', 0.25], ['Add card reader at Vestibule 101', 0.27], ['Issued 2026-10-02', 0.3])]),
  { kind: 'pr', number: '4', date: '2026-10-02', subject: 'Add card reader at Vestibule 101' })
eq('ASI-005 format', readCover([letter(['ASI-005', 0.08, 0.03])]).number, '005')
eq('a job number is not a date', dateIn('Project No. 24-118'), null)
eq('dates', ['Nov. 3, 2026', '3 November 2026', '11.03.2026'].map(dateIn), ['2026-11-03', '2026-11-03', '2026-11-03'])
eq('countOf', ['003', 'B', null].map(countOf), [3, 2, null])

eq('places', ['PAINTING 09 91 00 - 3', '09 91 00 - 3A', '09 91 00 Page 4 of 7', 'nothing'].map(readPlace),
  [{ n: 3, suffix: '' }, { n: 3, suffix: 'A' }, { n: 4, suffix: '' }, null])

const P = (s: string) => ({ n: Number(/\d+/.exec(s)![0]), suffix: /[A-Z]*$/.exec(s)![0] })
eq('action: no such section yet', suggestAction({ places: [P('1')], ends: true, of: null }, false), 'new')
eq('action: whole section', suggestAction({ places: [P('1'), P('2')], ends: true, of: null }, true), 'whole')
eq('action: starts at page 3', suggestAction({ places: [P('3'), P('4')], ends: false, of: null }, true), 'pages')
eq('action: lettered page', suggestAction({ places: [P('1'), P('1A')], ends: false, of: null }, true), 'pages')
eq('action: "of 7" with two pages', suggestAction({ places: [P('1'), P('2')], ends: false, of: 7 }, true), 'pages')

const old = ['1', '2', '3', '4', '5'].map(P)
const sp = splicePages(old, ['3', '3A', '3B', '6'].map(P))!
eq('splice order', sp.order.map((o) => `${o.from}${o.i}`), ['old0', 'old1', 'new0', 'new1', 'new2', 'old3', 'old4', 'new3'])
eq('splice says what it did', [sp.replaced, sp.inserted], [['3'], ['3A', '3B', '6']])
eq('a page with no number: no splice', splicePages(old, [P('3'), null]), null)
eq('replacing a page already lettered', splicePages(['1', '1A', '2'].map(P), ['1A'].map(P))!.order.map((o) => `${o.from}${o.i}`), ['old0', 'new0', 'old2'])
if (bad) { console.log(`${bad} failed`); process.exit(1) }
