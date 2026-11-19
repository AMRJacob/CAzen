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
  const words = all.filter((w) => w.x < edge && !(w.conf != null && w.conf < 35 && w.text.length <= 2 && !/\d/.test(w.text)))
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
  const pitch = median(anchors.slice(1).map((a, i) => mid(a.w) - mid(anchors[i].w))) || high * 1.5
  const near = Math.max(high * 0.6, Math.min(pitch * 0.45, high * 1.2))
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
      if (w.x < edge) continue
      const y = mid(w)
      if (y < top || y > bottom) continue
      let at = 0, d = Infinity
      for (let k = 0; k < rows.length; k++) { const dd = Math.abs(rows[k].y - y); if (dd < d) { d = dd; at = k } }
      beside[at].push(w)
    }
    const said = (list: PlacedWord[]) => list.sort((a, b) => a.x - b.x).map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim()
    const doubt = (list: PlacedWord[]) => { const c = list.filter((w) => DATE.test(w.text) && w.conf != null).map((w) => w.conf!); return c.length ? Math.min(...c) : undefined }
    return rows.map((r, i) => ({ no: r.no, y0: r.y0, y1: r.y1, text: said(r.words), label: said(beside[i]) || undefined, dateConf: doubt(r.words), guessedNo: r.guessed || undefined })).filter((r) => r.text)
  }

  const loose: PlacedWord[] = []
  words.forEach((w, i) => {
    if (taken.has(i)) return
    let at = -1, d = Infinity
    for (let k = 0; k < rows.length; k++) { const dd = Math.abs(rows[k].y - mid(w)); if (dd < d) { d = dd; at = k } }
    if (at >= 0 && d <= near) { rows[at].words.push(w); rows[at].y0 = Math.min(rows[at].y0, w.y); rows[at].y1 = Math.max(rows[at].y1, w.y + w.h) }
    else loose.push(w)
  })

  // What is on no number's line, gathered into lines of its own.
  loose.sort((a, b) => mid(a) - mid(b))
  for (const w of loose) {
    const last = rows[rows.length - 1]
    if (last && last.no === null && Math.abs(last.y - mid(w)) <= high * 0.6) { last.words.push(w); last.y1 = Math.max(last.y1, w.y + w.h) }
    else rows.push({ no: null, y: mid(w), y0: w.y, y1: w.y + w.h, words: [w], guessed: false })
  }

  rows.sort((a, b) => a.y - b.y)
  // A row whose number was not read, alone between two that differ by two, is the one between.
  for (let i = 1; i < rows.length - 1; i++) {
    const a = rows[i - 1].no, b = rows[i + 1].no
    if (rows[i].no === null && a && b && /^\d+$/.test(a) && Number(b) - Number(a) === 2 && /\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}|\d{1,2}[-\s]?[A-Za-z]{3}/.test(rows[i].words.map((w) => w.text).join(' '))) {
      rows[i].no = String(Number(a) + 1)
    }
  }
  return rows.map((r) => ({
    no: r.no, y0: r.y0, y1: r.y1,
    text: r.words.sort((a, b) => a.x - b.x).map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim(),
  })).filter((r) => r.no !== null || r.text)
}
