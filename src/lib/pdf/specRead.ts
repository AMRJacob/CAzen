import { textInRegion, wordsInRegion, type PageText, type Region } from './pageText.ts'

/**
 * Cutting a project manual into its sections.
 *
 * A manual arrives as one PDF of several hundred pages and is used one section at a time: it is
 * issued section by section, superseded section by section, and referred to by section number in
 * every submittal, RFI and ASI on the job. So it is stored the way it is used, and the cutting
 * is done here.
 *
 * The signal is the section number printed on every page of a section. CSI's own page-format
 * guidance puts the section number in the header or footer of each page, which is why it can be
 * relied on: a run of pages carrying "09 91 00" is section 09 91 00, and the run ends where the
 * number changes. Where a page carries no number at all it continues the section before it —
 * a table or a schedule that ran past the footer — and pages before the first numbered one are
 * the front matter, kept together rather than thrown away.
 *
 * Nothing here is taken on trust: every boundary is offered for review before anything is saved,
 * because a manual cut in the wrong place is worse than one not cut at all.
 */
/** Divisions that exist, so a stray "20 25 00" in a table of numbers isn't read as a section. */
const DIVISIONS = new Set([
  '00', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14',
  '21', '22', '23', '25', '26', '27', '28', '31', '32', '33', '34', '35',
  '40', '41', '42', '43', '44', '45', '46', '48',
])

const SECTION = /\b(\d{2})[\s.]?(\d{2})[\s.]?(\d{2}(?:\.\d{1,2})?)\b/g

export interface ManualPage {
  index: number
  text: PageText
  /** The section number this page belongs to, as read; null when the page carries none. */
  found: string | null
  /** True when the page says "SECTION <number>" outright, which starts a section for certain. */
  declares: boolean
  /** Which page of its own section this is, as printed in the footer: "09 91 00 - 3" is 3. */
  at: number | null
  /** How many pages the section runs to, where the footer says so: "Page 3 of 7" is 7. */
  of: number | null
  /** This page carries END OF SECTION, so whatever section it belongs to stops here. */
  ends: boolean
}

export interface ManualSection {
  number: string
  title: string
  /** 0-based page indices in the uploaded PDF, in order. */
  pages: number[]
  /** Nothing on these pages said which section they are; they followed the one before. */
  guessed: boolean
  /** What the footers say is wrong with this run of pages. Empty when it reads straight through. */
  trouble: SectionTrouble[]
}

export type SectionTrouble =
  | { kind: 'missing'; pages: number[] }        // page numbers the footers skip
  | { kind: 'repeated'; pages: number[] }       // the same footer page number twice
  | { kind: 'short'; have: number; says: number } // the footer says "of N" and there aren't N
  | { kind: 'late-start'; at: number }          // the section begins at page 3, not page 1
  | { kind: 'split'; alsoAt: string }           // this section number heads another run of pages too
  | { kind: 'no-heading' }                      // no "SECTION NN NN NN" anywhere in the run
  | { kind: 'no-end' }                          // the rest of the book ends its sections; this one doesn't

/** "099100" → "09 91 00", the way it is written everywhere else. */
const tidy = (a: string, b: string, c: string) => `${a} ${b} ${c}`

/**
 * What a running footer says: which section, which page of it, and how many there are.
 *
 * A spec footer carries the section number and the page within that section — "09 91 00 - 3",
 * "PAINTING 09 91 00 Page 3 of 7". The page number is the part worth having: it is the only
 * thing in the file that says whether a section arrived whole, because a page dropped out of the
 * middle leaves no other trace.
 */
export function readFooter(line: string): { number: string | null; at: number | null; of: number | null; title: string | null } {
  const text = line.toUpperCase().replace(/\s+/g, ' ').trim()
  SECTION.lastIndex = 0
  let m: RegExpExecArray | null
  let found: { value: string; end: number } | null = null
  while ((m = SECTION.exec(text))) {
    if (!DIVISIONS.has(m[1])) continue
    found = { value: tidy(m[1], m[2], m[3]), end: m.index + m[0].length }
    break
  }
  if (!found) return { number: null, at: null, of: null, title: null }

  // Most offices print the section's name beside its number in the footer. It is worth having
  // twice: as a title when the heading page gives none, and as a check that a run of pages
  // really is one section rather than two that happen to be numbered alike.
  const head = text.slice(0, found.end - found.value.length)
  const title = clean(head.replace(/[\s\-–—:.]+$/, '')) || null

  /**
   * The page number, wherever the office put it.
   *
   * Every firm lays its footer out differently and most put the section's name between the
   * number and the page — "09 91 00 PAINTING    Page 1 of 7" — so looking only immediately
   * after the section number finds the page on some books and nothing on others. The forms
   * are tried in order of how certain they are: a number touching the section number, then
   * "N of M" which the "of" makes unambiguous, then "Page N", and only last a bare number
   * set off at the end of the line.
   */
  const after = text.slice(found.end)
  const found_at = pageNumberIn(after, true) ?? pageNumberIn(head, false)
  return { number: found.value, at: found_at?.at ?? null, of: found_at?.of ?? null, title }
}

/**
 * Numbers in a footer that are certainly not page numbers.
 *
 * A footer is a row of columns — firm, project, project number, date, section, page — and the
 * text comes out of the PDF with the spacing between them collapsed, so "09 91 00    24-118"
 * reads as though the project number sat right against the section number. Taking those out
 * first is what stops a job number being read as page 24 and a date as page 11 of 18.
 */
const scrub = (text: string): string => text
  // Dates: 11/18/2026, 11-18-26, 2026.11.18.
  .replace(/\b\d{1,4}\s*[/.-]\s*\d{1,2}\s*[/.-]\s*\d{2,4}\b/g, ' ')
  // Compound identifiers: a job number like 24-118, a drawing like A-101.
  .replace(/\b\d{2,4}\s*-\s*\d{2,4}\b/g, ' ')
  .replace(/\b[A-Z]{1,2}\s*-\s*\d{2,4}\b/g, ' ')

/** A page number and, where the footer says it, how many pages the section runs to. */
function pageNumberIn(raw: string, touching: boolean): { at: number; of: number | null } | null {
  const text = scrub(raw)
  // Touching the section number: "09 91 00 - 3", "09 91 00 Page 3 of 7".
  if (touching) {
    const m = /^[\s\-–—:.]*(?:PAGE\s*)?(\d{1,3})\b(?:\s*(?:OF|\/)\s*(\d{1,3}))?/.exec(text)
    if (m) return { at: Number(m[1]), of: m[2] ? Number(m[2]) : null }
  }
  // "3 of 7", "3/7" — the "of" says what the numbers are, wherever they sit.
  const of = /(?:PAGE\s*)?\b(\d{1,3})\s*(?:OF|\/)\s*(\d{1,3})\b/.exec(text)
  if (of) return { at: Number(of[1]), of: Number(of[2]) }
  // "Page 3", said in as many words.
  const page = /\bPAGE\s*(\d{1,3})\b/.exec(text)
  if (page) return { at: Number(page[1]), of: null }
  // Last resort: a short number set off at the end by a dash or a space. Two digits at most
  // and never part of a longer run, so a project number like 24-118 or a year is not read as
  // page 18 or page 26.
  const bare = /(?:^|[-–—\s])\s*(\d{1,2})\s*$/.exec(text)
  if (bare) return { at: Number(bare[1]), of: null }
  return null
}

/**
 * END OF SECTION, which is how a spec section says it is over.
 *
 * CSI's page format puts it at the foot of the last page of every section, and most offices
 * follow it. It is the strongest boundary in the whole document — far better than inferring one
 * from a number changing — so where it is present it decides, and where it has been left off
 * (which happens most with front-end documents) nothing is lost by its absence.
 */
const END_OF_SECTION = /\bEND\s+OF\s+(?:THIS\s+)?SECTION\b/i

export const endsSection = (text: PageText): boolean =>
  END_OF_SECTION.test(textInRegion(text, { x: 0, y: 0.45, w: 1, h: 0.55 }))

export const TOP: Region = { x: 0, y: 0, w: 1, h: 0.14 }
export const BOTTOM: Region = { x: 0, y: 0.86, w: 1, h: 0.14 }

/** The running footer of a page, or its header where the office puts it there instead. */
export function footerOn(text: PageText): { number: string | null; at: number | null; of: number | null } {
  const bottom = readFooter(textInRegion(text, BOTTOM))
  if (bottom.number) return bottom
  return readFooter(textInRegion(text, TOP))
}

/**
 * Every section number printed on a page, with where it sat and how big it was.
 *
 * A number in the header or footer is the page's own; a number in the middle of a paragraph is a
 * cross-reference to another section ("comply with Section 07 92 00") and says nothing about
 * which section the page belongs to. The two are told apart by where they are on the page.
 */
export function numbersOn(text: PageText): { value: string; edge: boolean; declared: boolean; size: number }[] {
  const out: { value: string; edge: boolean; declared: boolean; size: number }[] = []
  for (const w of text.words) {
    SECTION.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = SECTION.exec(w.str))) {
      if (!DIVISIONS.has(m[1])) continue
      // Word boxes are already fractions of the page, as everywhere else in CAzen.
      const y = w.y + w.h / 2
      const before = w.str.slice(0, m.index)
      out.push({
        value: tidy(m[1], m[2], m[3]),
        // The top eighth and bottom eighth of the page: where a running header or footer lives.
        edge: y < 0.125 || y > 0.875,
        // "SECTION 09 91 00" at the head of its own line is a section declaring itself. The same
        // words inside a sentence — "comply with Section 07 92 00" — are a cross-reference to
        // another section, and say nothing about which section this page belongs to.
        declared: /^\s*SECTION[\s:.-]*$/i.test(before) && y < 0.4,
        size: w.vertical ? w.w : w.h,
      })
    }
  }
  return out
}

/** Which section a page belongs to: its header or footer number, else the one it declares. */
export function sectionOnPage(text: PageText): { found: string | null; declares: boolean } {
  const all = numbersOn(text)
  if (!all.length) return { found: null, declares: false }

  const score = new Map<string, number>()
  let declared: string | null = null
  for (const n of all) {
    // A number in a running header or footer is worth far more than one in the body, and one
    // written out as "SECTION 09 91 00" settles it.
    score.set(n.value, (score.get(n.value) ?? 0) + (n.edge ? 4 : 1) + (n.declared ? 6 : 0))
    if (n.declared && !declared) declared = n.value
  }
  let best: string | null = null
  let most = 0
  for (const [value, points] of score) if (points > most) { most = points; best = value }
  // A single mention in the middle of the page is a cross-reference, not this page's number.
  if (most < 4) return { found: null, declares: false }
  return { found: best, declares: declared === best }
}

/**
 * The title of a section, from its first page.
 *
 * Specs print it directly after the number — "SECTION 09 91 00 - PAINTING" or the number on one
 * line and PAINTING on the next. Both are tried, and a section whose title can't be found keeps
 * its number alone rather than being given a wrong one.
 */
export function titleOnPage(text: PageText, number: string): string {
  // The number as printed: the digits with whatever sits between them.
  const digits = number.replace(/\D/g, '')
  if (digits.length < 6) return ''
  const loose = new RegExp(
    digits.slice(0, 2) + '[\\s.]?' + digits.slice(2, 4) + '[\\s.]?' + digits.slice(4),
  )
  const words = [...text.words].sort((a, b) => a.y - b.y || a.x - b.x)
  for (let i = 0; i < words.length; i++) {
    const m = loose.exec(words[i].str)
    if (!m) continue
    // Same line, after the number: "SECTION 09 91 00 - PAINTING".
    const here = clean(words[i].str.slice(m.index + m[0].length))
    if (here) return here
    // Next line down, which is how a good many offices set it.
    for (let j = i + 1; j < Math.min(i + 4, words.length); j++) {
      const next = clean(words[j].str)
      if (next) return next
    }
  }
  return ''
}

function clean(s: string): string {
  const t = s.replace(/^[\s\-–—:.]+/, '').replace(/[\s\-–—:.]+$/, '').trim()
  if (t.length < 3 || t.length > 90) return ''
  if (/^(page|section|part)\b/i.test(t)) return ''
  if (/^\d/.test(t)) return ''
  return t
}

/**
 * The section number inside a box somebody drew around it.
 *
 * Automatic detection reads the whole page and weighs what it finds, which is right for a manual
 * set the way CSI describes and wrong for one that isn't — a footer in the middle of the page, a
 * number printed beside a page count, a division cover with four numbers on it. Pointing at the
 * box ends the argument: whatever section-shaped number sits there is this page's number, and
 * nothing else on the page is consulted.
 */
export function sectionInRegion(text: PageText, box: Region): string | null {
  let best: { value: string; size: number } | null = null
  for (const w of wordsInRegion(text, box)) {
    SECTION.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = SECTION.exec(w.str))) {
      if (!DIVISIONS.has(m[1])) continue
      const size = w.vertical ? w.w : w.h
      if (!best || size > best.size) best = { value: tidy(m[1], m[2], m[3]), size }
    }
  }
  return best?.value ?? null
}

/**
 * Work out which section each page belongs to, and group them.
 *
 * Separate from reading the file so that pointing at the number's box re-cuts the manual at
 * once, without opening it again — which is what makes correcting the cut feel like a setting
 * rather than a re-upload.
 */
export function detectSections(pages: ManualPage[], box?: Region | null): { pages: ManualPage[]; sections: ManualSection[] } {
  const read: ManualPage[] = pages.map((p) => {
    // The footer is read either way: it carries the page number, which is the only thing in the
    // file that says whether a section arrived whole.
    const footer = box ? readFooter(textInRegion(p.text, box)) : footerOn(p.text)
    const heading = sectionOnPage(p.text)
    const found = box
      ? footer.number ?? sectionInRegion(p.text, box)
      // A heading declares a section outright; otherwise the running footer, then the weighing.
      : heading.declares ? heading.found : footer.number ?? heading.found
    return { ...p, found, declares: !box && heading.declares, at: footer.at, of: footer.of, ends: endsSection(p.text) }
  })
  const sections = sectionsFrom(read)
  return { pages: read, sections: check(sections, read) }
}

/**
 * What the footers say about each run of pages.
 *
 * A manual is printed section by section and then bound, which is where pages go missing and
 * sections end up out of order. The footers are the record of what should be there: numbered
 * from 1 within each section, often with "of N" on the end, usually beside the section's own
 * name. Reading them back is the only way to know a section arrived whole, so it is done here
 * rather than left for somebody to notice on site.
 */
export function check<T extends ManualSection>(sections: T[], pages: ManualPage[]): T[] {
  // Whether this book bothers with END OF SECTION at all. Where most sections have one, the
  // handful that don't are worth pointing at — that is usually a front-end document where it was
  // left off. Where hardly any do, saying so on every section would be noise.
  const real = sections.filter((x) => x.number !== FRONT)
  const ending = real.filter((x) => x.pages.some((i) => pages[i]?.ends)).length
  const bookEndsSections = real.length >= 3 && ending >= real.length * 0.6

  return sections.map((s) => {
    const trouble: SectionTrouble[] = []
    if (s.number === FRONT) return { ...s, trouble }

    /**
     * Nothing is claimed from evidence that isn't there.
     *
     * Not every page carries a readable footer — a full-page schedule, a scanned sheet, a
     * cover with the number set differently. A gap in the numbers then means either a page is
     * missing or a footer could not be read, and the two look identical. Saying "page 2 is
     * missing" when page 2 is sitting right there is worse than saying nothing, so a gap is
     * only called a gap when every page in the run was read.
     */
    const read = s.pages.map((i) => pages[i]?.at ?? null)
    const numbered = read.filter((n): n is number => typeof n === 'number')
    const unread = read.length - numbered.length
    if (numbered.length) {
      const seen = new Set<number>()
      const repeated: number[] = []
      for (const n of numbered) {
        if (seen.has(n)) repeated.push(n)
        seen.add(n)
      }
      const first = Math.min(...numbered)
      const last = Math.max(...numbered)
      const missing: number[] = []
      for (let n = first; n <= last; n++) if (!seen.has(n)) missing.push(n)

      if (missing.length && !unread) trouble.push({ kind: 'missing', pages: missing })
      if (repeated.length) trouble.push({ kind: 'repeated', pages: [...new Set(repeated)] })
      // Likewise: the run starts late only if its own first page says so.
      if (read[0] != null && read[0] > 1) trouble.push({ kind: 'late-start', at: read[0] })

      // This one holds whatever was read, because a footer saying "of 7" over a run of five
      // pages is two pages short however many other footers were legible.
      const says = s.pages.map((i) => pages[i]?.of).find((n): n is number => typeof n === 'number')
      if (says && says > s.pages.length) trouble.push({ kind: 'short', have: s.pages.length, says })
    }

    // Only worth saying when the other run is a real one: a single stray page carrying this
    // number is a cross-reference, and calling that a split cried wolf on sections that were fine.
    const others = sections.filter((x) => x !== s && x.number === s.number
      && (x.pages.length > 1 || x.pages.some((i) => pages[i]?.declares)))
    if (others.length && (s.pages.length > 1 || s.pages.some((i) => pages[i]?.declares))) {
      trouble.push({ kind: 'split', alsoAt: others.map((x) => span(x.pages)).join(', ') })
    }
    if (!s.pages.some((i) => pages[i]?.declares)) trouble.push({ kind: 'no-heading' })
    if (bookEndsSections && !s.pages.some((i) => pages[i]?.ends)) trouble.push({ kind: 'no-end' })
    return { ...s, trouble }
  })
}

/** "13–21", or "13" for one page. */
const span = (pages: number[]) =>
  pages.length === 1 ? `page ${pages[0] + 1}` : `pages ${pages[0] + 1}–${pages[pages.length - 1] + 1}`

/** What a run of pages reads like when something is wrong with it, in a line. */
export function troubleText(t: SectionTrouble): string {
  switch (t.kind) {
    case 'missing':
      return `${t.pages.length === 1 ? 'page' : 'pages'} ${t.pages.join(', ')} missing`
    case 'repeated':
      return `${t.pages.length === 1 ? 'page' : 'pages'} ${t.pages.join(', ')} twice`
    case 'short':
      return `footer says ${t.says} pages, ${t.have} here`
    case 'late-start':
      return `starts at page ${t.at}`
    case 'split':
      return `also at ${t.alsoAt}`
    case 'no-heading':
      return 'no section heading'
    case 'no-end':
      return 'no END OF SECTION'
  }
}

/**
 * The sections in the order their numbers put them, where that isn't the order they arrived in.
 *
 * A manual is assembled from sections printed separately, so one landing out of order is normal
 * and is nobody's fault. Returns null when the book is already in order, so the offer only
 * appears when there is something to accept.
 */
export function inSectionOrder<T extends { number: string }>(sections: T[]): T[] | null {
  const key = (s: T) => sortKeyOf(s.number)
  const sorted = [...sections].sort((a, b) => key(a).localeCompare(key(b), undefined, { numeric: true }))
  const same = sorted.every((s, i) => s === sections[i])
  return same ? null : sorted
}

/** Group pages into sections: a run of pages carrying one number, plus whatever follows it. */
export function sectionsFrom(pages: ManualPage[]): ManualSection[] {
  const out: ManualSection[] = []
  let current: ManualSection | null = null
  let closed = false   // the page before this one said END OF SECTION

  /**
   * Whether this page begins a section, in order of how much the page is actually claiming.
   *
   * A heading says so outright. A page after an END OF SECTION is the first page of whatever
   * comes next. Otherwise a number that differs from the current section only starts one if it
   * is still there on the next page — a single page carrying a different number in the middle of
   * a run is a cross-reference the footer reader picked up, not the start of anything, and
   * treating it as a section is what made the same section appear twice in the book.
   */
  const begins = (i: number): boolean => {
    const p = pages[i]
    if (!current) return !!p.found
    if (p.declares) return true
    if (closed) return !!p.found
    if (!p.found || p.found === current.number) return false
    const next = pages[i + 1]
    return !next || next.found === p.found || next.declares
  }

  for (let i = 0; i < pages.length; i++) {
    const p = pages[i]
    if (begins(i)) {
      current = {
        number: p.found!,
        // The heading page names it; failing that, the name printed beside the number in the footer.
        title: titleOnPage(p.text, p.found!) || readFooter(textInRegion(p.text, BOTTOM)).title || '',
        pages: [p.index], guessed: false, trouble: [],
      }
      out.push(current)
      closed = p.ends
      continue
    }
    if (!current) {
      // Pages before the first section number: the cover, the table of contents, the bid forms.
      const front = out.find((s) => s.number === FRONT)
      if (front) front.pages.push(p.index)
      else out.unshift({ number: FRONT, title: 'Front matter', pages: [p.index], guessed: true, trouble: [] })
      closed = p.ends
      continue
    }
    current.pages.push(p.index)
    // A page that said nothing is a page we are assuming about, and the review says so — unless
    // the section ended on the page before, in which case nobody is assuming anything.
    if (!p.found && !closed) current.guessed = true
    closed = p.ends
  }
  return out
}

/** The one section that isn't a section: everything before the first numbered page. */
export const FRONT = 'Front matter'

/** What a section is filed under, so front matter sorts before 00 11 13. */
export const sortKeyOf = (number: string) => (number === FRONT ? '!' : number)

/**
 * Where a page sits in its section, letters included: "09 91 00 - 3A" is page 3A.
 *
 * An addendum that reissues part of a section numbers the pages it adds by the page they follow —
 * 3A, 3B after page 3 — so that the book can be put back together without renumbering what is
 * already printed. The letter is what says "insert" rather than "replace", which makes it the one
 * thing worth reading that readFooter leaves alone.
 */
export interface PagePlace { n: number; suffix: string }

export function readPlace(line: string): PagePlace | null {
  const text = line.toUpperCase().replace(/\s+/g, ' ').trim()
  SECTION.lastIndex = 0
  let m: RegExpExecArray | null
  let end = -1
  while ((m = SECTION.exec(text))) {
    if (!DIVISIONS.has(m[1])) continue
    end = m.index + m[0].length
    break
  }
  if (end < 0) return null
  const lettered = /^[\s\-–—:.]*(?:PAGE\s*)?(\d{1,3})([A-Z]{1,2})(?![\dA-Z])/.exec(text.slice(end))
    ?? /\bPAGE\s*(\d{1,3})([A-Z]{1,2})(?![\dA-Z])/.exec(text)
  if (lettered) return { n: Number(lettered[1]), suffix: lettered[2] }
  const at = readFooter(line).at
  return at == null ? null : { n: at, suffix: '' }
}

/** A page's place in its section, from its running footer or, failing that, its header. */
export function placeOnPage(text: PageText): PagePlace | null {
  return readPlace(textInRegion(text, BOTTOM)) ?? readPlace(textInRegion(text, TOP))
}
