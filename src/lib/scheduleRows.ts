/**
 * A schedule's rows, found by their line numbers.
 *
 * Read a line at a time, a scanned schedule goes wrong where the reader loses its place: a row
 * of bars is taken for words, two rows run together, a name is split from its dates. But the
 * table has a column that says where every row is — the line numbers down its left edge. So
 * that column is found first, and then each number is given the words that sit on its line.
 * What sits on no number's line is a heading, or nothing.
 *
 * Nothing here knows about a PDF or a picture: it is given words and where they are.
 */

export interface PlacedWord { text: string; x: number; y: number; w: number; h: number; /** How sure the reader was, 0–100, where it says. */ conf?: number }

export interface NumberedLine {
  /** The line number printed on the schedule; none for a heading or a row whose number was not read. */
  no: string | null
  text: string
  /** What the bar chart prints beside this row's bar — usually the activity's name again. */
  label?: string
  /** The reader's lowest confidence in this row's dates, where it gives one. */
  dateConf?: number
  /** True where the number was not read and the row was placed by the pitch of the others. */
  guessedNo?: boolean
  /** Top and bottom of the row, in the units the words came in. */
  y0: number
  y1: number
  /**
   * How far the name stands in from the line-number column, in text heights. A scheduling
   * program indents each level of its outline, so this is the row's place in the outline once
   * the indents of the whole schedule are compared (`outlineLevels` in scheduleRead).
   */
  indent?: number
}

/**
 * A line number as printed — "14", or an activity ID such as "A1010" — allowing for what a scan
 * does to digits. What is shown is what was printed; what rows are ordered by is its number.
 */
function asNumber(text: string): { n: number; shown: string } | null {
  const t = text.trim().replace(/[.,:;|°]+$/, '')
  const m = t.match(/^([A-Z]{0,3})([\dOoIl]{1,5})$/)
  if (!m || !/\d/.test(m[2])) return null
  const digits = m[2].replace(/[Oo]/g, '0').replace(/[Il]/g, '1')
  const n = Number(digits)
  return n > 0 ? { n, shown: m[1] + digits } : null
}

const median = (list: number[]) => { const s = [...list].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0 }

/**
 * Written on the sheet by hand — a note made in a meeting — rather than printed. Handwriting is
 * taller than a schedule's type and the reader is unsure of it; print is neither. Such words are
 * left out of the rows, so a note beside a date does not become part of the row.
 */
export function written(w: PlacedWord, high: number): boolean {
  // Bold type with a descender stands well above the median word; a pen's stroke stands higher.
  if (w.h > high * (DATE.test(w.text) ? 3 : 2.2)) return true
  return w.conf != null && w.conf < 20 && !DATE.test(w.text)
}

/**
 * The words of a page as numbered lines, or null when the page has no column of line numbers
 * to go by — a schedule that numbers nothing is read the old way, line by line.
 */
const DATE = /\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}/

export function linesByNumber(all: PlacedWord[], pageWidth: number): NumberedLine[] | null {
  const high = median(all.map((w) => w.h)) || 1
  // The table ends where its dates end. Past that is the bar chart, whose labels repeat the
  // names and whose bars read as stray letters; none of it belongs to a row's text.
  const dated = all.filter((w) => DATE.test(w.text)).map((w) => w.x + w.w).sort((a, b) => a - b)
  const edge = dated.length >= 6 ? dated[Math.floor(dated.length * 0.97)] + high * 1.5 : Infinity
  // And a short word the reader itself doubted is a ruling or a smudge, not a word.
  const words = all.filter((w) => w.x < edge && !(w.conf != null && w.conf < 35 && w.text.length <= 2 && !/\d/.test(w.text)) && !written(w, high))
  const cands = words
    .map((w, i) => { const a = asNumber(w.text); return { w, i, n: a?.n ?? null, shown: a?.shown ?? '' } })
    .filter((c): c is { w: PlacedWord; i: number; n: number; shown: string } => c.n != null && c.w.x < pageWidth * 0.3)
  if (cands.length < 4) return null

  // The column: the numbers that share a left or a right edge with the most others.
  const tol = high * 1.6
  let band: typeof cands = []
  for (const seed of cands) {
    for (const edge of ['l', 'r'] as const) {
      const at = (c: typeof seed) => (edge === 'l' ? c.w.x : c.w.x + c.w.w)
      const here = cands.filter((c) => Math.abs(at(c) - at(seed)) <= tol)
      if (here.length > band.length || (here.length === band.length && here.length && at(here[0]) < (band[0].w.x))) band = here
    }
  }
  band.sort((a, b) => a.w.y - b.w.y)

  // Line numbers climb down the page. The longest climbing run is the real ones; a stray
  // number in the same column — a misread, a quantity — falls out of it.
  const best = band.map(() => 1), from = band.map(() => -1)
  for (let i = 0; i < band.length; i++) {
    for (let j = 0; j < i; j++) if (band[j].n < band[i].n && best[j] + 1 > best[i]) { best[i] = best[j] + 1; from[i] = j }
  }
  let end = 0
  for (let i = 1; i < band.length; i++) if (best[i] > best[end]) end = i
  const anchors: typeof band = []
  for (let i = end; i >= 0; i = from[i]) anchors.unshift(band[i])
  if (anchors.length < 4) return null

  const mid = (w: PlacedWord) => w.y + w.h / 2
  // The right edge of the number column: numbers are set flush right, and a name's indent is
  // measured from here, so a page scanned a little to one side reads the same as the next.
  const idRight = median(anchors.map((a) => a.w.x + a.w.w))
  /** Where a row's name begins: its first word past the number column that is a word, not a ruling. */
  const indentOf = (list: PlacedWord[]): number | undefined => {
    const first = list.filter((w) => w.x > idRight + high * 0.3 && /[A-Za-z]{2}|^[A-Z]$|^&$/.test(w.text) && !DATE.test(w.text)).sort((a, b) => a.x - b.x)[0]
    return first ? (first.x - idRight) / high : undefined
  }
  const taken = new Set(anchors.map((a) => a.i))

  const rows = anchors.map((a) => ({ no: a.shown as string | null, y: mid(a.w), y0: a.w.y, y1: a.w.y + a.w.h, words: [] as PlacedWord[], guessed: false }))

  // Most schedules set their rows at one pitch. Where they do, the numbers that were read say
  // where every row is — including the ones whose number was not read — and what lies above
  // the first row or below the last is the sheet's heading and legend, not the schedule.
  const plain = anchors.every((a) => /^\d+$/.test(a.shown))
  const steps = anchors.slice(1).map((a, i) => (mid(a.w) - mid(anchors[i].w)) / (a.n - anchors[i].n)).filter((v) => Number.isFinite(v) && v > 0)
  const step = median(steps)
  const zero = median(anchors.map((a) => mid(a.w) - step * a.n))
  const even = plain && step > 0 && anchors.filter((a) => Math.abs(mid(a.w) - (zero + step * a.n)) < step * 0.3).length >= anchors.length * 0.85
  if (even) {
    const last = anchors[anchors.length - 1].n
    const have = new Set(anchors.map((a) => a.n))
    for (let n = 1; n <= last; n++) {
      if (!have.has(n)) { const y = zero + step * n; rows.push({ no: String(n), y, y0: y - high / 2, y1: y + high / 2, words: [], guessed: true }) }
    }
    rows.sort((a, b) => a.y - b.y)
    const top = zero + step * 0.5, bottom = zero + step * (last + 0.5)
    words.forEach((w, i) => {
      if (taken.has(i)) return
      const y = mid(w)
      if (y < top || y > bottom) return
      // A misread number in the number column is not part of the name.
      if (asNumber(w.text) && Math.abs(w.x + w.w - (anchors[0].w.x + anchors[0].w.w)) <= tol) return
      let at = 0, d = Infinity
      for (let k = 0; k < rows.length; k++) { const dd = Math.abs(rows[k].y - y); if (dd < d) { d = dd; at = k } }
      rows[at].words.push(w); rows[at].y0 = Math.min(rows[at].y0, w.y); rows[at].y1 = Math.max(rows[at].y1, w.y + w.h)
    })
    // The chart beside the table says each name a second time, next to its bar. It is no part
    // of the row, but it is a second reading of the name to hold the first against.
    const beside = rows.map(() => [] as PlacedWord[])
    for (const w of all) {
      if (w.x < edge || written(w, high) || (w.conf != null && w.conf < 60) || w.h < high * 0.6) continue
      const y = mid(w)
      if (y < top || y > bottom) continue
      let at = 0, d = Infinity
      for (let k = 0; k < rows.length; k++) { const dd = Math.abs(rows[k].y - y); if (dd < d) { d = dd; at = k } }
      beside[at].push(w)
    }
    const said = (list: PlacedWord[]) => list.sort((a, b) => a.x - b.x).map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim()
    const doubt = (list: PlacedWord[]) => { const c = list.filter((w) => DATE.test(w.text) && w.conf != null).map((w) => w.conf!); return c.length ? Math.min(...c) : undefined }
    return rows.map((r, i) => ({ no: r.no, y0: r.y0, y1: r.y1, text: said(r.words), label: said(beside[i]) || undefined, dateConf: doubt(r.words), guessedNo: r.guessed || undefined, indent: indentOf(r.words) })).filter((r) => r.text)
  }
  return byLines(all, words, anchors.map((a) => a.w), edge, high, idRight, tol, indentOf)
}

/**
 * Rows by the lines of text themselves, for a schedule whose line numbers do not run one after
 * another — a filtered view prints 1, 2, 9, 10, 14… — so the pitch of the numbers says nothing.
 * Every line of the table is a row; its number is whatever stands in the number column on that
 * line, and a number the scan got wrong is put right by the numbers either side ("8" between 17
 * and 19 is 18). What sits above the first numbered line is the sheet's title and the column
 * headings, and is dropped.
 */
function byLines(all: PlacedWord[], words: PlacedWord[], numbers: PlacedWord[], edge: number, high: number, idRight: number, tol: number,
  indentOf: (list: PlacedWord[]) => number | undefined): NumberedLine[] {
  const mid = (w: PlacedWord) => w.y + w.h / 2
  const sorted = [...words].sort((a, b) => mid(a) - mid(b))
  const lines: { y: number; words: PlacedWord[] }[] = []
  for (const w of sorted) {
    const last = lines[lines.length - 1]
    if (last && Math.abs(mid(w) - last.y) < high * 0.55) { last.words.push(w); last.y += (mid(w) - last.y) / last.words.length }
    else lines.push({ y: mid(w), words: [w] })
  }
  const inColumn = (w: PlacedWord) => Math.abs(w.x + w.w - idRight) <= tol && w.x + w.w < idRight + tol && !!asNumber(w.text.replace(/^[|[(]+/, ''))
  // Above the first numbered line: a heading of the first group, or the column headings, sit
  // within a couple of rows of it; the sheet's title stands further off and is dropped.
  const ys = numbers.map(mid).sort((a, b) => a - b)
  const pitch = median(ys.slice(1).map((y, i) => y - ys[i])) || high * 1.6
  const top = ys[0] - Math.max(high * 0.6, pitch * 2.2)
  const rows: { no: string | null; n: number | null; fixed: boolean; y: number; words: PlacedWord[] }[] = []
  for (const l of lines) {
    if (l.y < top) continue
    const num = l.words.filter(inColumn).sort((a, b) => a.x - b.x)[0]
    const rest = l.words.filter((w) => w !== num)
    const a = num ? asNumber(num.text.replace(/^[|[(]+/, '')) : null
    rows.push({ no: a?.shown ?? null, n: a?.n ?? null, fixed: false, y: l.y, words: rest })
  }
  // Numbers climb. One that does not, between two that do, is put right from them where the
  // digits that were read can belong to only one number between ("8" → 18, "11" → 111).
  const plainNo = (r: (typeof rows)[number] | undefined) => (r?.n != null && r.no != null && /^\d+$/.test(r.no) ? r.n : null)
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    let p = i - 1; while (p >= 0 && plainNo(rows[p]) == null) p--
    let q = i + 1; while (q < rows.length && plainNo(rows[q]) == null) q++
    const lo = p >= 0 ? plainNo(rows[p])! : null, hi = q < rows.length ? plainNo(rows[q])! : null
    if (lo == null || hi == null || hi - lo < 2) continue
    const mine = plainNo(r)
    if (mine != null && mine > lo && mine < hi) continue
    const between: number[] = []
    for (let n = lo + 1; n < hi; n++) between.push(n)
    let pick: number | null = null
    if (mine != null) { const fit = between.filter((n) => String(n).endsWith(String(mine)) || String(n).startsWith(String(mine))); if (fit.length === 1) pick = fit[0] }
    // No number read at all, and room for exactly one between its neighbours with no other row unnumbered between them.
    else if (between.length === 1 && rows.slice(p + 1, q).filter((x) => x.n == null).length === 1 && rows.slice(p + 1, q).every((x) => x === r || x.n != null)) pick = between[0]
    if (pick != null) { r.no = String(pick); r.n = pick; r.fixed = true }
    else if (mine != null) { r.no = null; r.n = null }
  }
  // What the chart beside the table says on each row's line — a second reading of the name.
  const beside = rows.map(() => [] as PlacedWord[])
  for (const w of all) {
    if (w.x < edge || written(w, high) || (w.conf != null && w.conf < 60) || w.h < high * 0.6) continue
    let at = -1, d = high * 0.6
    for (let k = 0; k < rows.length; k++) { const dd = Math.abs(rows[k].y - mid(w)); if (dd < d) { d = dd; at = k } }
    if (at >= 0) beside[at].push(w)
  }
  const said = (list: PlacedWord[]) => [...list].sort((a, b) => a.x - b.x).map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim()
  const doubt = (list: PlacedWord[]) => { const c = list.filter((w) => DATE.test(w.text) && w.conf != null).map((w) => w.conf!); return c.length ? Math.min(...c) : undefined }
  return rows.map((r, i) => ({
    no: r.no, y0: Math.min(...r.words.map((w) => w.y), r.y), y1: Math.max(...r.words.map((w) => w.y + w.h), r.y),
    text: said(r.words), label: said(beside[i]) || undefined, dateConf: doubt(r.words), guessedNo: r.fixed || undefined, indent: indentOf(r.words),
  })).filter((r) => r.text)
}
