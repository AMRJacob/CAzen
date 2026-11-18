import { db } from './supabase'
import { textInRegion, wordsInRegion, type PageText, type Region } from './pdf/pageText'

/**
 * A title block template: boxes drawn over one sheet saying where its sheet number, title
 * and revision mark sit. Firms keep several (their own, each consultant's), and each page of
 * an upload uses whichever template reads a valid sheet number there.
 */
export type RegionKey = 'number' | 'title' | 'revision' | 'date'

export const REGION_LABELS: Record<RegionKey, string> = {
  number: 'Sheet number',
  title: 'Sheet title',
  revision: 'Revision mark',
  date: 'Issue date',
}

export interface TitleblockTemplate {
  id: string
  firm_id: string
  name: string
  regions: Partial<Record<RegionKey, Region>>
  /** Size in points of the sheet the template was drawn on; sheets of the same size fit best. */
  page_size?: { w: number; h: number } | null
  /** Fixed words printed around the boxes on its sample sheet (firm names, labels). */
  anchors?: string[] | null
  updated_at?: string
}

// A-201, A201, A2.01, S-101A, FP-1, M1.1, G0.00, AD-101 — common US sheet numbering.
// Strict on purpose: this is what gets believed when nobody has said where the number sits, and
// a loose pattern turned loose on a whole sheet finds a number in every schedule on it.
export const SHEET_NUMBER = /^[A-Z]{1,3}[-.]?\d{1,4}(\.\d{1,3})?[A-Z]?$/

/**
 * What counts as a sheet number inside a box somebody drew around the sheet number.
 *
 * The strict pattern above is a description of a set's own sheets, and sheets issued with a
 * change document aren't numbered that way: ASI#10-A1, PR#3-S2, CCD-2.1, SK-14. Those are real
 * numbers, printed on real sheets, and refusing them meant the template simply would not read
 * the page. Inside a drawn box the risk is small — the box is small, and how much else it holds
 * is already scored — so this takes segments of letters and digits joined by - . # or /, as long
 * as there is a digit somewhere and the whole thing isn't a date.
 */
export const SHEET_NUMBER_WIDE = /^(?=.{1,20}$)(?=.*\d)[A-Z\d]+([-.#/][A-Z\d]+)*$/
const LOOKS_LIKE_A_DATE = /^(\d{1,2}[-./]\d{1,2}[-./]\d{2,4}|\d{4}[-./]\d{1,2}[-./]\d{1,2})$/

/** A sheet number as printed on a sheet, wherever it came from. */
export const isSheetNumber = (v: string) => SHEET_NUMBER_WIDE.test(v) && !LOOKS_LIKE_A_DATE.test(v)

/** Sheet number as stored: upper case, spaces removed. */
export function cleanNumber(s: string): string {
  return s.toUpperCase().replace(/\s+/g, '').replace(/^SHEET(NO\.?|NUMBER)?:?/, '')
}

export interface Reading {
  number: string
  title: string
  revision: string
  /** The date printed on the sheet, as YYYY-MM-DD, where the box held one. */
  date: string
  /** Which template read it; null = the automatic guess. */
  templateId: string | null
  /** Best fit only: another template came close, so the row is worth a look. */
  unsure?: boolean
}

/** Read one page with one template. */
export function readWith(text: PageText, t: TitleblockTemplate): Reading {
  const get = (k: RegionKey) => (t.regions[k] ? textInRegion(text, t.regions[k]!) : '')
  return {
    number: t.regions.number ? numberIn(text, t.regions.number) : '',
    title: tidyTitle(get('title')),
    revision: get('revision').replace(/^REV(ISION)?S?\.?\s*(NO\.?|MARK)?:?\s*/i, '').trim(),
    date: t.regions.date ? dateIn(get('date')) : '',
    templateId: t.id,
  }
}

/** Words printed as labels inside number boxes; they don't count against a box being "just the number". */
const LABEL_WORDS = /^(SHEET|SHT|NO\.?|NUMBER|NUM|DWG|DRAWING|#|:|PAGE)$/i

interface NumberFind { value: string; fill: number; purity: number }

/**
 * The sheet number inside a box. A box often catches its label too ("SHEET NO.", "DWG NO."),
 * so take the sheet-number-shaped piece, preferring the largest text. Also reports how well it
 * fits: fill = the number's text height against the box height (a title block number is the big
 * text in its box), purity = how much of the box's other text is just the number.
 */
function findNumber(text: PageText, r: Region): NumberFind {
  let best: { value: string; size: number } | null = null
  let otherChars = 0

  // Pieces in reading order, each carrying where it came from. A sheet number is often split
  // across text runs — "ASI #10-A1" arrives as three — so neighbouring pieces are tried joined
  // as well as alone. Neighbouring means it: pieces of one run, or runs on the same line close
  // enough to be touching. Without that, a project number on the line above would be welded to
  // the sheet number below it.
  interface Piece { text: string; size: number; word: number; x: number; y: number; w: number; h: number }
  const pieces: Piece[] = []
  const words = wordsInRegion(text, r)
  words.forEach((w, i) => {
    for (const piece of w.str.split(/[\s:]+/)) {
      if (piece) pieces.push({ text: piece, size: w.vertical ? w.w : w.h, word: i, x: w.x, y: w.y, w: w.w, h: w.h })
    }
  })

  const touching = (a: Piece, b: Piece) => {
    if (a.word === b.word) return true
    const line = Math.abs((a.y + a.h / 2) - (b.y + b.h / 2)) < Math.max(a.h, b.h) / 2
    const gap = b.x - (a.x + a.w)
    return line && gap >= -Math.max(a.h, b.h) && gap < Math.max(a.h, b.h) * 0.6
  }

  const matched = new Set<number>()
  for (let i = 0; i < pieces.length; i++) {
    if (LABEL_WORDS.test(pieces[i].text)) continue
    let reach = 1
    while (reach < 3 && i + reach < pieces.length && touching(pieces[i + reach - 1], pieces[i + reach])) reach++
    for (let n = reach; n >= 1; n--) {
      const run = pieces.slice(i, i + n)
      if (run.some((x) => LABEL_WORDS.test(x.text))) continue
      const value = cleanNumber(run.map((x) => x.text).join(''))
      if (!isSheetNumber(value)) continue
      const size = Math.max(...run.map((x) => x.size))
      if (!best || size > best.size || (size === best.size && value.length > best.value.length)) {
        best = { value, size }
      }
      for (let k = i; k < i + n; k++) matched.add(k)
      break
    }
  }
  for (let i = 0; i < pieces.length; i++) {
    if (matched.has(i) || LABEL_WORDS.test(pieces[i].text)) continue
    otherChars += pieces[i].text.length
  }
  if (!best) return { value: cleanNumber(textInRegion(text, r)), fill: 0, purity: 0 }
  const boxSize = r.h > r.w * (text.width / text.height) ? r.w : r.h
  return {
    value: best.value,
    fill: Math.min(1, best.size / Math.max(boxSize, 1e-6)),
    purity: best.value.length / (best.value.length + otherChars),
  }
}

function numberIn(text: PageText, r: Region): string {
  return findNumber(text, r).value
}

/**
 * The date in a box, as YYYY-MM-DD.
 *
 * Title blocks print dates every way there is — 11/18/26, 11-18-2026, 18 NOV 2026,
 * NOVEMBER 18, 2026 — and the box usually catches its label with it. Two-digit years are read
 * as this century, which is wrong for a drawing from 1974 and right for everything CAzen will
 * ever be handed. A box that holds something else comes back empty rather than guessing.
 */
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

export function dateIn(raw: string): string {
  const text = raw.toUpperCase().replace(/^.*?(DATE|ISSUED|ISSUE)\s*:?\s*/s, '').trim()
  const iso = (y: number, m: number, d: number) => {
    if (m < 1 || m > 12 || d < 1 || d > 31) return ''
    const year = y < 100 ? 2000 + y : y
    if (year < 1900 || year > 2200) return ''
    return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  // 2026-11-18
  let m = /(\d{4})[-./](\d{1,2})[-./](\d{1,2})/.exec(text)
  if (m) return iso(+m[1], +m[2], +m[3])
  // 11/18/26 and 11-18-2026, month first as every US title block prints it
  m = /(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})/.exec(text)
  if (m) return iso(+m[3], +m[1], +m[2])
  // 18 NOV 2026
  m = /(\d{1,2})\s*[-.]?\s*([A-Z]{3,9})\.?\s*[-.,]?\s*(\d{2,4})/.exec(text)
  if (m && MONTHS.indexOf(m[2].slice(0, 3)) >= 0) return iso(+m[3], MONTHS.indexOf(m[2].slice(0, 3)) + 1, +m[1])
  // NOVEMBER 18, 2026
  m = /([A-Z]{3,9})\.?\s*(\d{1,2})(?:ST|ND|RD|TH)?\s*[-.,]?\s*(\d{2,4})/.exec(text)
  if (m && MONTHS.indexOf(m[1].slice(0, 3)) >= 0) return iso(+m[3], MONTHS.indexOf(m[1].slice(0, 3)) + 1, +m[2])
  return ''
}

/** Labels printed inside the box ("SHEET TITLE:") are dropped; the rest is kept as written. */
function tidyTitle(s: string): string {
  const t = s.replace(/^(SHEET\s+)?(TITLE|NAME)\s*:?\s*/i, '').trim()
  // A box that only caught a label ("SHEET NO.", "PROJECT NO.", "DATE") read no title at all.
  return /^((SHEET|SHT|DWG|DRAWING|PROJECT|PROJ|JOB|COMM|CONTRACT|REV|REVISION|ISSUE|DATE|SCALE|DRAWN|CHECKED|BY)\.?\s*)+(NO\.?|NUMBER|#|TITLE|NAME)?\.?\s*:?$/i.test(t) ? '' : t
}

/**
 * How well a template fits a page, from what it reads there. It must find a sheet number; then:
 *  - sheet size: the page is the same size as the sheet the template was drawn on (strongest),
 *  - purity: the number box holds little besides the number and its label,
 *  - fill: the number is the big text in its box,
 *  - a sensible title, and a revision mark if it has a box for one.
 * A template whose number box merely overlaps some tag on another layout scores low on purity
 * and fill, so it no longer wins just by finding something number-shaped.
 */
/** The title block area: all the template's boxes together, widened a little. */
function zoneOf(t: TitleblockTemplate): Region | null {
  const rs = Object.values(t.regions).filter(Boolean) as Region[]
  if (!rs.length) return null
  const x0 = Math.max(0, Math.min(...rs.map((r) => r.x)) - 0.06), y0 = Math.max(0, Math.min(...rs.map((r) => r.y)) - 0.06)
  const x1 = Math.min(1, Math.max(...rs.map((r) => r.x + r.w)) + 0.06), y1 = Math.min(1, Math.max(...rs.map((r) => r.y + r.h)) + 0.06)
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/** Words of four or more letters in the title block area, outside the boxes themselves (whose contents change). */
function zoneWords(text: PageText, t: TitleblockTemplate): Set<string> {
  const zone = zoneOf(t)
  const out = new Set<string>()
  if (!zone) return out
  const boxes = Object.values(t.regions).filter(Boolean) as Region[]
  const inside = (r: Region, cx: number, cy: number) => cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h
  for (const w of wordsInRegion(text, zone)) {
    const cx = w.x + w.w / 2, cy = w.y + w.h / 2
    if (boxes.some((b) => inside(b, cx, cy))) continue
    for (const tok of w.str.toUpperCase().split(/[^A-Z&']+/)) if (tok.length >= 4) out.add(tok)
  }
  return out
}

/** Learn a template's fixed wording from a sheet it fits (its sample sheet, or one you confirmed). */
export function anchorsFrom(text: PageText, t: TitleblockTemplate): string[] {
  return [...zoneWords(text, t)].slice(0, 40)
}

export function fitScore(text: PageText, t: TitleblockTemplate, r: Reading = readWith(text, t), all: TitleblockTemplate[] = [t]): number | null {
  if (!t.regions.number || !isSheetNumber(r.number)) return null
  const n = findNumber(text, t.regions.number)
  const ps = t.page_size
  const sizeMatch = !ps ? 0.5
    : Math.abs(ps.w - text.width) / ps.w < 0.02 && Math.abs(ps.h - text.height) / ps.h < 0.02 ? 1 : 0
  const titleOk = !t.regions.title ? 0.5 : r.title.length >= 3 && r.title.length <= 120 && !SHEET_NUMBER.test(cleanNumber(r.title)) ? 1 : 0
  const revOk = !t.regions.revision ? 0.5 : r.revision ? 1 : 0.3
  // Fixed wording: words this template learned that other templates don't share, found again here.
  // Three or more matching is full marks; templates that haven't learned any stay neutral.
  let wording = 0.5
  if (t.anchors?.length) {
    const others = new Set(all.filter((o) => o.id !== t.id).flatMap((o) => o.anchors ?? []))
    const own = t.anchors.filter((a) => !others.has(a))
    if (own.length) {
      const here = zoneWords(text, t)
      wording = Math.min(1, own.filter((a) => here.has(a)).length / Math.min(3, own.length))
    }
  }
  return 3 * wording + 2 * sizeMatch + 1.5 * n.purity + 1 * n.fill + 0.6 * titleOk + 0.2 * revOk
}

/**
 * Read a page with whichever template fits it best (see fitScore); ties go to the preferred one.
 * When the runner-up comes close the reading is marked unsure, so the row gets a second look.
 * No fit: a sheet index means the cover; otherwise a guess from the lower right of the sheet.
 */
export function readPage(text: PageText, templates: TitleblockTemplate[], preferred?: string | null): Reading {
  const scored = templates
    .map((t) => { const r = readWith(text, t); return { r, score: fitScore(text, t, r, templates) } })
    .filter((x): x is { r: Reading; score: number } => x.score != null)
    .map((x) => ({ ...x, score: x.score + (x.r.templateId === preferred ? 0.05 : 0) }))
    .sort((a, b) => b.score - a.score)
  if (scored.length) {
    const [first, second] = scored
    // A close runner-up that reads a different number is worth a look.
    const unsure = !!second && first.score - second.score < 0.35 && second.r.number !== first.r.number
    return { ...first.r, unsure }
  }
  // No title block number, but the page carries a sheet index: it's the cover.
  if (hasSheetIndex(text)) {
    const fromTemplate = templates.map((t) => readWith(text, t)).find((r) => r.title || r.revision)
    return { number: COVER, title: fromTemplate?.title || 'Cover Sheet', revision: fromTemplate?.revision ?? '', date: fromTemplate?.date ?? '', templateId: null }
  }
  return { number: guessNumber(text) ?? '', title: '', revision: '', date: '', templateId: null }
}

/** The sheet number given to a cover sheet that has none of its own; it sorts first. */
export const COVER = 'COVER'

/**
 * A sheet index: at least four different sheet numbers that each start a line, stacked in one
 * column (left edges within a few points). Plan sheets have plenty of tags and references, but
 * scattered, not lined up like this.
 */
export function hasSheetIndex(text: PageText): boolean {
  const W = text.width, H = text.height
  const starts = text.words
    .filter((w) => !w.vertical)
    .map((w) => ({ n: cleanNumber(w.str.trim().split(/\s+/)[0] ?? ''), x: w.x * W, y: w.y * H, h: w.h * H }))
    .filter((c) => SHEET_NUMBER.test(c.n))
  starts.sort((a, b) => a.x - b.x)
  for (let i = 0; i < starts.length; i++) {
    const col = starts.filter((c) => Math.abs(c.x - starts[i].x) <= 4).sort((a, b) => a.y - b.y)
    if (new Set(col.map((c) => c.n)).size < 4) continue
    // Rows close together, like a table: each gap under four line heights.
    let run = 1
    for (let j = 1; j < col.length; j++) {
      run = col[j].y - col[j - 1].y <= Math.max(col[j].h, 6) * 4 ? run + 1 : 1
      if (run >= 4) return true
    }
  }
  return false
}

/** Without a template: the sheet-number-shaped word furthest to the lower right, larger text preferred. */
export function guessNumber(text: PageText): string | null {
  let best: { value: string; score: number } | null = null
  for (const w of text.words) {
    const value = cleanNumber(w.str)
    if (!SHEET_NUMBER.test(value)) continue
    const score = w.x + w.y + w.h * 8
    if (!best || score > best.score) best = { value, score }
  }
  return best?.value ?? null
}

export async function listTemplates(firmId: string): Promise<TitleblockTemplate[]> {
  const { data, error } = await db().from('titleblock_templates').select('id, firm_id, name, regions, page_size, anchors, updated_at').eq('firm_id', firmId).order('name')
  if (error) throw error
  return (data ?? []) as TitleblockTemplate[]
}

export async function saveTemplate(t: Omit<TitleblockTemplate, 'id'> & { id?: string }): Promise<TitleblockTemplate> {
  const row = { firm_id: t.firm_id, name: t.name.trim() || 'Title block', regions: t.regions, page_size: t.page_size ?? null, anchors: t.anchors ?? null, updated_at: new Date().toISOString() }
  const q = t.id
    ? db().from('titleblock_templates').update(row).eq('id', t.id).select('id, firm_id, name, regions, page_size, anchors, updated_at').single()
    : db().from('titleblock_templates').insert(row).select('id, firm_id, name, regions, page_size, anchors, updated_at').single()
  const { data, error } = await q
  if (error) throw error
  return data as TitleblockTemplate
}

export async function deleteTemplate(id: string) {
  const { error } = await db().from('titleblock_templates').delete().eq('id', id)
  if (error) throw error
}
