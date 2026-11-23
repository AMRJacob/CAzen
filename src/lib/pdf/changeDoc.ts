import type { PageText, PageWord } from './pageText'
import { endsSection, footerOn, numbersOn, sectionOnPage, type PagePlace } from './specRead.ts'
import type { IssuanceKind } from '../types'

/**
 * Reading a change document that arrives as one PDF.
 *
 * An ASI, an addendum or a bulletin is usually bound as one file: a cover page or two that says
 * what it is and what changed, then the reissued project manual pages, then the drawings. Each
 * part goes somewhere different in CAzen — the cover to the change register, the manual pages to
 * their sections, the drawings to their sheets — so the pages are sorted first, and nothing here
 * writes anything: every call is a reading offered for review.
 *
 * Pure: no pdf.js, no network, so it can be checked in Node (`checks/changedoc.test.ts`).
 */

export type PageRole = 'cover' | 'spec' | 'sheet'

export interface PageFacts {
  text: PageText
  /** A title block template read this page, so it is a drawing whatever else is on it. */
  readByTemplate: boolean
}

/** Letter, legal: anything up to 14½ inches on its long side. An 11 × 17 drawing is not small. */
export const smallPage = (t: PageText) => Math.max(t.width, t.height) <= 14.5 * 72

// ---------- What kind of document a cover says it is ----------

/**
 * The words each kind of change document calls itself, as AIA's forms and most offices' own
 * covers print them. Order matters only for ties: a cover is judged by its largest, highest line.
 */
const KIND_WORDS: [IssuanceKind, RegExp][] = [
  ['asi', /\bSUPPLEMENTAL\s+INSTRUCTIONS?\b|\bA\.?S\.?I\.?(?=[\s#:.\-\d]|$)/],
  ['ccd', /\bCONSTRUCTION\s+CHANGE\s+DIRECTIVE\b|\bCHANGE\s+DIRECTIVE\b|\bCCD\b/],
  ['pr', /\bPROPOSAL\s+REQUEST\b|\bREQUEST\s+FOR\s+PROPOSAL\b|\bPR\s*(?:NO\.?|#|-)\s*\d/],
  ['change_order', /\bCHANGE\s+ORDER\b/],
  ['addendum', /\bADDEND(?:UM|A)\b/],
  ['bulletin', /\bBULLETIN\b/],
]

/** The same words, as they lead into a number: "ADDENDUM NO. 2", "ASI-003", "PROPOSAL REQUEST NUMBER: 4". */
const NUMBER_AFTER: Record<string, string> = {
  asi: String.raw`(?:SUPPLEMENTAL\s+INSTRUCTIONS?|A\.?S\.?I\.?)`,
  ccd: String.raw`(?:CONSTRUCTION\s+CHANGE\s+DIRECTIVE|CHANGE\s+DIRECTIVE|DIRECTIVE|CCD)`,
  pr: String.raw`(?:PROPOSAL\s+REQUEST|REQUEST\s+FOR\s+PROPOSAL|PR)`,
  change_order: String.raw`(?:CHANGE\s+ORDER|CO)`,
  addendum: String.raw`ADDENDUM`,
  bulletin: String.raw`BULLETIN`,
}

interface Line { str: string; up: string; y: number; size: number }

/** The page's text as lines, top to bottom, with each line's height for telling a title from body text. */
export function linesOf(text: PageText): Line[] {
  const words = text.words.filter((w) => !w.vertical && w.str.trim())
  const sorted = [...words].sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2) || a.x - b.x)
  const groups: PageWord[][] = []
  for (const w of sorted) {
    const g = groups[groups.length - 1]
    const ref = g?.[0]
    if (ref && Math.abs((w.y + w.h / 2) - (ref.y + ref.h / 2)) < Math.max(ref.h, w.h) * 0.6) g.push(w)
    else groups.push([w])
  }
  return groups.map((g) => {
    g.sort((a, b) => a.x - b.x)
    const str = g.map((w) => w.str.trim()).join(' ').replace(/\s+/g, ' ').trim()
    return { str, up: str.toUpperCase().replace(/[’‘]/g, "'"), y: Math.min(...g.map((w) => w.y)), size: Math.max(...g.map((w) => w.h)) }
  }).filter((l) => l.str)
}

/**
 * Which kind of change document a page announces itself as, from its upper part.
 *
 * Covers name themselves in their largest type near the top; the same words lower down are
 * usually a reference ("…will be issued as a Change Order"), so the largest, highest mention wins.
 */
export function kindOnPage(text: PageText): IssuanceKind | null {
  let best: { kind: IssuanceKind; score: number } | null = null
  for (const line of linesOf(text)) {
    if (line.y > 0.45) continue
    for (const [kind, re] of KIND_WORDS) {
      if (!re.test(line.up)) continue
      const score = line.size * 20 + (1 - line.y)
      if (!best || score > best.score) best = { kind, score }
    }
  }
  return best?.kind ?? null
}

// ---------- Sorting the pages ----------

/**
 * Whether a page is project manual: a section number in its running header or footer, a section
 * heading that is the only section on the page, or END OF SECTION — on a letter- or legal-size page
 * no title block has claimed. The narrative of an addendum names many sections in its body
 * ("Section 09 91 00: replace paragraph 2.3.A…"); a manual page carries one, at its edge.
 */
function specLike(p: PageFacts): boolean {
  if (p.readByTemplate || !smallPage(p.text)) return false
  if (footerOn(p.text).number) return true
  const distinct = new Set(numbersOn(p.text).map((n) => n.value))
  const s = sectionOnPage(p.text)
  if (s.declares && distinct.size === 1) return true
  return false
}

/**
 * Sort the pages of a change document into cover, manual and drawings.
 *
 * - A small page that names itself as a change document is a cover; so is a small, unclaimed page
 *   following one (the narrative running on).
 * - A small page that reads as manual is manual; so is an unclaimed small page between manual
 *   pages, or one ending a section (a full-page table with no footer).
 * - Everything else is a drawing, and the title block templates take it from there.
 */
export function classifyPages(pages: PageFacts[]): PageRole[] {
  const roles: (PageRole | null)[] = pages.map((p) => {
    if (p.readByTemplate || !smallPage(p.text)) return 'sheet'
    // The cover is judged before the manual: its narrative can open with "SECTION 09 91 00".
    // An addendum is often bound as a section of the manual itself — 00 91 13 Addenda, or the
    // office's own 00 91 xx — with that number in its running footer on every page, and is
    // still the cover. Any other section number at the edge means a reissued manual page, even
    // one whose footer says "Addendum 1", which is common.
    const edge = footerOn(p.text).number
    if (edge?.startsWith('00 91')) return 'cover'
    if (kindOnPage(p.text) && !edge) return 'cover'
    if (specLike(p)) return 'spec'
    return null
  })
  for (let i = 0; i < pages.length; i++) {
    if (roles[i] !== null) continue
    if (roles[i - 1] === 'cover') roles[i] = 'cover'
    else if (roles[i - 1] === 'spec' && (endsSection(pages[i].text) || nextKnown(roles, i) === 'spec')) roles[i] = 'spec'
  }
  return roles.map((r) => r ?? 'sheet')
}

const nextKnown = (roles: (PageRole | null)[], i: number) => roles.slice(i + 1).find((r) => r !== null) ?? null

// ---------- What the cover says ----------

export interface CoverReading {
  kind: IssuanceKind | null
  /** The document's own number as printed: "3", "003", "B". */
  number: string | null
  /** YYYY-MM-DD. */
  date: string | null
  subject: string | null
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

const iso = (y: number, m: number, d: number): string | null => {
  if (y < 100) y += 2000
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** The first date in a piece of text, in any of the ways a cover writes one. */
export function dateIn(raw: string): string | null {
  const s = raw.toUpperCase()
  let m = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(s)
  if (m) return iso(+m[1], +m[2], +m[3])
  m = /\b(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4}|\d{2})\b/.exec(s)
  if (m) return iso(+m[3], +m[1], +m[2])
  m = /\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)[A-Z]*\.?\s+(\d{1,2})(?:ST|ND|RD|TH)?,?\s+(\d{4})\b/.exec(s)
  if (m) return iso(+m[3], MONTHS.indexOf(m[1].slice(0, 3)) + 1, +m[2])
  m = /\b(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\.?,?\s+(\d{4})\b/.exec(s)
  if (m) return iso(+m[3], MONTHS.indexOf(m[2]) + 1, +m[1])
  return null
}

/** What follows a label on its line, or the next line when the label stands alone. */
function afterLabel(lines: Line[], label: RegExp): { value: string; line: number } | null {
  for (let i = 0; i < lines.length; i++) {
    const m = label.exec(lines[i].up)
    if (!m) continue
    const rest = lines[i].str.slice(m.index + m[0].length).replace(/^[\s:.\-–—]+/, '').trim()
    if (rest) return { value: rest, line: i }
    const next = lines[i + 1]
    if (next) return { value: next.str.trim(), line: i + 1 }
  }
  return null
}

/**
 * The document's number, date and subject, read from its cover pages.
 *
 * Read by the labels a cover prints — "ADDENDUM NO. 2", "ASI Number: 003", "Date:", "Subject:" —
 * rather than by where they sit, because covers come from every office's own letterhead and from
 * AIA's forms alike. Anything not found stays null and is left for typing in.
 */
export function readCover(pages: PageText[]): CoverReading {
  const out: CoverReading = { kind: null, number: null, date: null, subject: null }
  if (!pages.length) return out
  out.kind = kindOnPage(pages[0]) ?? pages.slice(1).map(kindOnPage).find(Boolean) ?? null
  const all = pages.flatMap((p) => linesOf(p))
  const first = linesOf(pages[0])

  if (out.kind) {
    const word = NUMBER_AFTER[out.kind]
    const re = new RegExp(String.raw`\b${word}(?![A-Z])\s*(?:NO\.?|NUMBER|NUM\.?)?\s*#?\s*[:.\-]?\s*(\d{1,4}[A-Z]?|[A-Z](?![A-Z']))`)
    for (const l of all) {
      const m = re.exec(l.up)
      if (m) { out.number = m[1]; break }
    }
  }

  const dated = afterLabel(first, /\b(?:DATE(?:\s+OF\s+ISSUE)?|ISSUE\s+DATE|DATED|ISSUED)\b\s*[:.]?/)
  out.date = (dated && (dateIn(dated.value) ?? dateIn(first[dated.line + 1]?.str ?? '')))
    ?? first.filter((l) => l.y < 0.5).map((l) => dateIn(l.str)).find(Boolean) ?? null

  const subject = afterLabel(all, /^(?:SUBJECT|RE|REGARDING|DESCRIPTION|TITLE)\s*[:.]/)
    ?? afterLabel(all, /\b(?:SUBJECT|REGARDING)\s*:/)
  if (subject) {
    const v = subject.value.replace(/\s+/g, ' ').trim()
    // A label followed by another label is no subject.
    if (v && !/^[A-Z ]{2,20}:/.test(v.toUpperCase())) out.subject = v.length > 140 ? `${v.slice(0, 137)}…` : v
  }
  return out
}

/** The printed number as a count, for following the project's own way of writing it: "003" is 3, "B" is 2. */
export function countOf(printed: string | null): number | null {
  if (!printed) return null
  const d = /^(\d+)/.exec(printed)
  if (d) return Number(d[1])
  if (/^[A-Z]$/.test(printed)) return printed.charCodeAt(0) - 64
  return null
}

// ---------- Reissued manual pages ----------

/**
 * What a run of reissued manual pages does to the section already in the project.
 *
 * - `new`: the project has no such section yet.
 * - `whole`: the run is the whole section — starts at page 1 and ends it — and takes its place.
 * - `pages`: the run is some of its pages, put into the current section in place of the pages
 *   with the same numbers, and lettered pages (3A) inserted after the page they follow.
 */
export type SpecAction = 'new' | 'whole' | 'pages'

export function suggestAction(run: { places: (PagePlace | null)[]; ends: boolean; of: number | null }, exists: boolean): SpecAction {
  if (!exists) return 'new'
  const places = run.places
  if (places.some((p) => p?.suffix)) return 'pages'
  const first = places[0]
  if (first && first.n > 1) return 'pages'
  if (!run.ends && run.of != null && run.of > places.length) return 'pages'
  return 'whole'
}

const rank = (p: PagePlace) => p.n * 1000 + (p.suffix ? [...p.suffix].reduce((a, c) => a * 27 + c.charCodeAt(0) - 64, 0) : 0)
const keyOf = (p: PagePlace) => `${p.n}${p.suffix}`

export interface Splice {
  /** The pages of the section as it will stand, in order. */
  order: { from: 'old' | 'new'; i: number }[]
  replaced: string[]
  inserted: string[]
}

/**
 * Put reissued pages into a section by their page numbers.
 *
 * Null when any page — old or new — has no readable page number: a splice guessed at is a section
 * bound wrong, and taking the whole run as the section is the safer thing to offer.
 */
export function splicePages(old: (PagePlace | null)[], incoming: (PagePlace | null)[]): Splice | null {
  if (!old.length || !incoming.length) return null
  if (old.some((p) => !p) || incoming.some((p) => !p)) return null
  const olds = old as PagePlace[], news = incoming as PagePlace[]
  const byKey = new Map(news.map((p, i) => [keyOf(p), i]))
  const oldKeys = new Set(olds.map(keyOf))
  const used = new Set<number>()
  const order: Splice['order'] = []
  const replaced: string[] = [], inserted: string[] = []
  const insertBetween = (lo: number, hi: number) => {
    const between = news.map((p, i) => ({ p, i }))
      .filter(({ p, i }) => !used.has(i) && !oldKeys.has(keyOf(p)) && rank(p) > lo && rank(p) < hi)
      .sort((a, b) => rank(a.p) - rank(b.p))
    for (const { p, i } of between) { order.push({ from: 'new', i }); used.add(i); inserted.push(keyOf(p)) }
  }
  insertBetween(-Infinity, rank(olds[0]))
  olds.forEach((p, j) => {
    const k = byKey.get(keyOf(p))
    if (k !== undefined && !used.has(k)) { order.push({ from: 'new', i: k }); used.add(k); replaced.push(keyOf(p)) }
    else order.push({ from: 'old', i: j })
    insertBetween(rank(p), j + 1 < olds.length ? rank(olds[j + 1]) : Infinity)
  })
  return { order, replaced, inserted }
}

/** "3, 4, 3A" for a line on screen. */
export const placeText = (p: PagePlace | null) => (p ? `${p.n}${p.suffix}` : '?')
