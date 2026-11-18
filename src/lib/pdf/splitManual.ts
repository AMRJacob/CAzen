import { PDFDocument } from 'pdf-lib'
import { getDocument } from './pdfjs'
import { pageBody, readPageText, wordsInRegion, type PageText, type Region } from './pageText'

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
}

export interface ManualSection {
  number: string
  title: string
  /** 0-based page indices in the uploaded PDF, in order. */
  pages: number[]
  /** Nothing on these pages said which section they are; they followed the one before. */
  guessed: boolean
}

/** "099100" → "09 91 00", the way it is written everywhere else. */
const tidy = (a: string, b: string, c: string) => `${a} ${b} ${c}`

/**
 * Every section number printed on a page, with where it sat and how big it was.
 *
 * A number in the header or footer is the page's own; a number in the middle of a paragraph is a
 * cross-reference to another section ("comply with Section 07 92 00") and says nothing about
 * which section the page belongs to. The two are told apart by where they are on the page.
 */
function numbersOn(text: PageText): { value: string; edge: boolean; declared: boolean; size: number }[] {
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

/** Read every page of a manual. Nothing is decided here and nothing is written. */
export async function readManual(
  file: ArrayBuffer,
  onProgress?: (done: number, total: number) => void,
): Promise<ManualPage[]> {
  const reader = await getDocument({ data: new Uint8Array(file.slice(0)) }).promise
  const pages: ManualPage[] = []
  for (let i = 0; i < reader.numPages; i++) {
    const text = await readPageText(await reader.getPage(i + 1))
    pages.push({ index: i, text, found: null, declares: false })
    onProgress?.(i + 1, reader.numPages)
  }
  await reader.loadingTask.destroy()
  return pages
}

/**
 * Work out which section each page belongs to, and group them.
 *
 * Separate from reading the file so that pointing at the number's box re-cuts the manual at
 * once, without opening it again — which is what makes correcting the cut feel like a setting
 * rather than a re-upload.
 */
export function detectSections(pages: ManualPage[], box?: Region | null): { pages: ManualPage[]; sections: ManualSection[] } {
  const read = pages.map((p) => {
    if (box) {
      const found = sectionInRegion(p.text, box)
      return { ...p, found, declares: false }
    }
    const { found, declares } = sectionOnPage(p.text)
    return { ...p, found, declares }
  })
  return { pages: read, sections: sectionsFrom(read) }
}

/** Group pages into sections: a run of pages carrying one number, plus whatever follows it. */
export function sectionsFrom(pages: ManualPage[]): ManualSection[] {
  const out: ManualSection[] = []
  let current: ManualSection | null = null

  for (const p of pages) {
    const starts = p.found && (!current || p.found !== current.number)
    if (starts) {
      current = { number: p.found!, title: titleOnPage(p.text, p.found!), pages: [p.index], guessed: false }
      out.push(current)
      continue
    }
    if (!current) {
      // Pages before the first section number: the cover, the table of contents, the bid forms.
      const front = out.find((s) => s.number === FRONT)
      if (front) front.pages.push(p.index)
      else out.unshift({ number: FRONT, title: 'Front matter', pages: [p.index], guessed: true })
      continue
    }
    current.pages.push(p.index)
    // A page that said nothing is a page we are assuming about, and the review says so.
    if (!p.found) current.guessed = true
  }
  return out
}

/** The one section that isn't a section: everything before the first numbered page. */
export const FRONT = 'Front matter'

/** What a section is filed under, so front matter sorts before 00 11 13. */
export const sortKeyOf = (number: string) => (number === FRONT ? '!' : number)

/** Cut the pages of one section out of the uploaded PDF. */
export async function cutSection(file: ArrayBuffer, pages: number[]): Promise<Uint8Array> {
  const source = await PDFDocument.load(file, { ignoreEncryption: true })
  const out = await PDFDocument.create()
  const copied = await out.copyPages(source, pages)
  for (const p of copied) out.addPage(p)
  return out.save()
}

/** The words of a section, for searching it. */
export const bodyOf = (pages: ManualPage[]) => pages.map((p) => pageBody(p.text)).join('\n')
