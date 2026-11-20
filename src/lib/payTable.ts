/**
 * A contractor's continuation sheet (the AIA G703, or a contractor's own form laid out like it),
 * read as a table from the words on its pages and where they sit.
 *
 * No template. Three things every such sheet has are found instead:
 *
 * - **Its columns of figures.** Money is printed right-aligned, so the right ends of the figures
 *   on the page stack up in a few tight columns, and the percent column is the one whose figures
 *   end in %. Which column is which (scheduled value, from previous, this period, stored, total,
 *   balance) is settled by the sheet's own arithmetic: the choice under which the most rows come
 *   out G = D + E + F and H = C − G.
 * - **Its line numbers.** Every row of figures has its item number at the left. They should run
 *   in order, so a number misread between two good ones is put right by them, and a number that
 *   should be there and isn't is said to be missing — nothing is let go quietly.
 * - **Its grand total.** Each column's figures are added up and compared with the total the sheet
 *   prints. Where they agree, every figure in that column is borne out at once.
 *
 * Within a row, a figure the reader got wrong breaks the row's arithmetic, and the other figures
 * say what it must have been. Such a figure is mended, and said to be mended.
 *
 * Nothing here knows about PDFs or pictures (`checks/paytable.test.ts`).
 */

export interface PlacedWord { text: string; x: number; y: number; w: number; h: number; conf?: number }

export type Col = 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'pct'
export const FIGURES = ['C', 'D', 'E', 'F', 'G', 'H'] as const
export type Fig = (typeof FIGURES)[number]
export const COLUMN_NAME: Record<Fig, string> = {
  C: 'scheduled value', D: 'from previous', E: 'this period', F: 'stored', G: 'completed and stored', H: 'balance to finish',
}

export interface TableRow {
  page: number
  /** As printed (after a scan's O for 0 and the like); null where the row has none. */
  item: string | null
  /** The number was not read, or read wrong, and was put right from the numbers either side. */
  itemFixed?: boolean
  name: string
  kind: 'line' | 'total'
  /** The figures as read; null where a column had nothing in it. */
  read: Partial<Record<Col, number | null>>
  /** The figures once the row's arithmetic has been made to hold. */
  value: Record<Fig, number>
  /** Columns whose figure was worked out from the others rather than taken as read. */
  mended: Fig[]
  /** The arithmetic could not be made to hold, or could be made to hold more than one way. */
  doubt?: string
  /** The row as it appeared, for showing beside a doubtful figure. */
  text: string
  y: number
}

export interface TableRead {
  rows: TableRow[]
  /** Pages on which a table of figures was found. */
  pages: number
  /** Item numbers that should have been there, by the run of the others, and were not read. */
  missing: string[]
  /** Each column's figures added up, against the grand total the sheet prints, where it prints one. */
  totals: { col: Fig; printed: number; added: number; agree: boolean }[]
  /** "Application No." as printed, where it could be read. */
  application?: string
  /** Lines of a description with no figures on them — a name run onto a second line — with the rows above and below. */
  wraps: { text: string; above: number | null; below: number | null }[]
}

// ── words to figures ────────────────────────────────────────────────────────────────────────────

const JUNK = /^[|[\]{}_~—–\-=.,:;'"`‘’“”!()]+$/

/** A figure as the reader left it: grid rules stuck to its ends, O for 0, and so on. Null if not a figure. */
export function figure(raw: string, cents = true): { n: number; pct: boolean; dotless: boolean } | null {
  let t = raw.trim().replace(/^[[|{]+(?=[\d$OoIl!(-])/, '').replace(/[\]|}f']+$/, '')
  const pct = /%\)?$/.test(t)
  t = t.replace(/%/g, '')
  const neg = /^\(.*\)$/.test(t) || /^-/.test(t) || /^\$-/.test(t)
  t = t.replace(/[()$\s-]/g, '')
  if (!t) return null
  // Letters a scan makes of digits, only where the token is otherwise digits.
  t = t.replace(/!/g, '1')
  const digitsish = t.replace(/[^0-9OoIl|SsB]/g, '')
  if (digitsish.length < t.replace(/[.,]/g, '').length) return null
  if (!/\d/.test(t)) {
    if (!/^[Oo0.,]+$/.test(t) || t.replace(/[.,]/g, '').length < 2) return null
  }
  t = t.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1').replace(/[Ss]/g, '5').replace(/B/g, '8')
  // The decimal point is the last separator with exactly two digits after it.
  const m = t.match(/^([\d.,]*?)[.,](\d{1,2})$/)
  let n: number, dotless = false
  if (m && (m[2].length === 2 || pct)) n = Number(m[1].replace(/[.,]/g, '') + '.' + m[2])
  else {
    const whole = t.replace(/[.,]/g, '')
    if (!/^\d+$/.test(whole)) return null
    // A figure with its point lost: the column prints cents, so the last two digits are cents.
    if (cents && !pct && whole.length >= 3) { n = Number(whole) / 100; dotless = true }
    else n = Number(whole)
  }
  if (!Number.isFinite(n)) return null
  return { n: neg ? -n : n, pct, dotless }
}

const isMoney = (t: string) => {
  const s = t.replace(/\s+/g, '').replace(/[\]|}[{f]+$/g, '').replace(/^[[|{]+/, '')
  return /^\(?-?\$?\s?-?[\dOo][\dOoIl,.]*[.,]\d\d\)?$/.test(s) || /^\(?-?\d[\d,.]*%\)?$/.test(s) || /^[Oo0]{2,4}%?$/.test(s)
}

const ITEM = /^([A-Za-z]{0,4}[-.]?)([\dOoIlSs]{1,4})([a-z]?|\.\d{1,2})[.)\]|:]*$/

function itemOf(text: string, inColumn = false): { shown: string; n: number | null } | null {
  const t = text.replace(/\s+/g, '').replace(/^[[|{]+/, '').replace(/!/g, '1')
  const m = t.match(ITEM)
  if (!m) return null
  // A word that happens to be letters a scan reads as digits ("Is", "So") is not a number —
  // unless it stands alone in the item column, where only numbers are printed.
  if (!inColumn && /^[A-Za-z]+$/.test(m[1] + m[2])) return null
  if (inColumn && m[1] && /^[A-Za-z]+$/.test(m[1] + m[2])) return null
  const digits = m[2].replace(/[Oo]/g, '0').replace(/[Il]/g, '1').replace(/[Ss]/g, '5')
  return { shown: m[1].toUpperCase() + String(Number(digits)) + m[3], n: m[1] || m[3] ? null : Number(digits) }
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0 }
const near = (a: number, b: number) => Math.abs(a - b) < 0.015

interface Line { words: PlacedWord[]; y: number; h: number }

/** Words into lines, by where their middles sit. A scan's slight tilt is allowed for by chaining. */
function linesOf(words: PlacedWord[]): Line[] {
  const h = median(words.map((w) => w.h)) || 1
  const sorted = [...words].sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2))
  const lines: Line[] = []
  for (const w of sorted) {
    const cy = w.y + w.h / 2
    const last = lines[lines.length - 1]
    if (last && Math.abs(cy - last.y) < h * 0.55) { last.words.push(w); last.y = (last.y * (last.words.length - 1) + cy) / last.words.length }
    else lines.push({ words: [w], y: cy, h })
  }
  for (const l of lines) l.words.sort((a, b) => a.x - b.x)
  return lines
}

interface Column { r: number; maxW: number; pct: boolean; count: number }

/** The columns of figures on a page, by where their right ends stack up. */
function columnsOf(lines: Line[], h: number): Column[] {
  const ends: { r: number; w: number; pct: boolean }[] = []
  let figureLines = 0
  for (const l of lines) {
    const money = l.words.filter((w) => isMoney(w.text))
    if (money.length < 3) continue
    figureLines++
    for (const w of money) ends.push({ r: w.x + w.w - trailingJunk(w), w: w.w, pct: /%/.test(w.text) })
  }
  if (figureLines < 2) return []
  ends.sort((a, b) => a.r - b.r)
  const groups: (typeof ends)[] = []
  for (const e of ends) {
    const g = groups[groups.length - 1]
    if (g && e.r - g[g.length - 1].r < h * 1.6) g.push(e)
    else groups.push([e])
  }
  return groups
    .filter((g) => g.length >= Math.max(2, figureLines * 0.25))
    .map((g) => ({ r: median(g.map((e) => e.r)), maxW: Math.max(...g.map((e) => e.w)), pct: g.filter((e) => e.pct).length > g.length / 2, count: g.length }))
}

/** Width of grid-rule leftovers stuck on the end of a word ("0.00]"), so its true right end is used. */
function trailingJunk(w: PlacedWord): number {
  const m = w.text.match(/[\]|}[{f]+$/)
  return m && w.text.length > m[0].length ? (w.w * m[0].length) / w.text.length : 0
}

// ── a row's arithmetic ──────────────────────────────────────────────────────────────────────────

type Vals = Record<Fig, number | null>
const EQ: Record<Fig, [number, number]> = {
  // Coefficients in the two equations: G − D − E − F = 0 and H − C + G = 0.
  C: [0, -1], D: [-1, 0], E: [-1, 0], F: [-1, 0], G: [1, 1], H: [0, 1],
}
function residual(v: Record<Fig, number>): [number, number] {
  return [v.G - v.D - v.E - v.F, v.H - v.C + v.G]
}
const r2 = (n: number) => Math.round(n * 100) / 100

/** Every way of making the row add up by working out at most `most` of its figures from the rest. */
function solutions(v: Vals, most: number): { value: Record<Fig, number>; mended: Fig[] }[] {
  const out: { value: Record<Fig, number>; mended: Fig[] }[] = []
  const base = (u: Fig[]) => {
    const x = {} as Record<Fig, number>
    for (const k of FIGURES) x[k] = u.includes(k) ? 0 : (v[k] ?? ((k === 'E' || k === 'F') ? 0 : NaN))
    return x
  }
  const sets: Fig[][] = [[]]
  for (const a of FIGURES) sets.push([a])
  if (most >= 2) for (let i = 0; i < FIGURES.length; i++) for (let j = i + 1; j < FIGURES.length; j++) sets.push([FIGURES[i], FIGURES[j]])
  for (const u of sets) {
    if (u.length > most) continue
    // A figure that was not read at all must be among those worked out (blank E and F are nothing).
    if (FIGURES.some((k) => v[k] == null && k !== 'E' && k !== 'F' && !u.includes(k))) continue
    const x = base(u)
    const [p, q] = residual(x)
    if (u.length === 0) { if (near(p, 0) && near(q, 0)) out.push({ value: x, mended: [] }); continue }
    if (u.length === 1) {
      const [a, b] = EQ[u[0]]
      let val: number
      if (a && b) { val = -p / a; if (!near(-q / b, val)) continue }
      else if (a) { if (!near(q, 0)) continue; val = -p / a }
      else { if (!near(p, 0)) continue; val = -q / b }
      out.push({ value: { ...x, [u[0]]: r2(val) }, mended: u })
      continue
    }
    const [a1, b1] = EQ[u[0]], [a2, b2] = EQ[u[1]]
    const det = a1 * b2 - a2 * b1
    if (!det) continue
    const s = (-p * b2 + q * a2) / det, t = (-q * a1 + p * b1) / det
    out.push({ value: { ...x, [u[0]]: r2(s), [u[1]]: r2(t) }, mended: u })
  }
  return out
}

export interface Hint { C?: number; D?: number }

/**
 * The row's figures made to add up, mending as few as it can. Where the percent column was read
 * it chooses between equally small mendings; so does what the app already knows of the line.
 */
export function settle(read: Partial<Record<Col, number | null>>, hint: Hint = {}, dotless: Set<Fig> = new Set()): { value: Record<Fig, number>; mended: Fig[]; doubt?: string } {
  const v: Vals = { C: read.C ?? null, D: read.D ?? null, E: read.E ?? null, F: read.F ?? null, G: read.G ?? null, H: read.H ?? null }
  for (const most of [0, 1, 2]) {
    let found = solutions(v, most)
    if (!found.length) continue
    if (found.length > 1) {
      const score = (s: (typeof found)[number]) =>
        (read.pct != null && s.value.C ? (Math.abs(s.value.G / s.value.C * 100 - read.pct) < 0.02 ? 2 : 0) : 0)
        + (hint.C != null && near(s.value.C, hint.C) ? 2 : 0)
        + (hint.D != null && near(s.value.D, hint.D) ? 2 : 0)
        + s.mended.filter((k) => dotless.has(k) || v[k] == null).length
      const top = Math.max(...found.map(score))
      found = found.filter((s) => score(s) === top)
    }
    const ef = new Set(found.map((s) => `${s.value.E}|${s.value.F}`))
    const best = found[0]
    if (ef.size > 1) return { ...best, doubt: 'the figures on this row can be made to add up more than one way' }
    return best
  }
  const x = {} as Record<Fig, number>
  for (const k of FIGURES) x[k] = v[k] ?? (hint[k as 'C' | 'D'] ?? 0)
  return { value: x, mended: [], doubt: 'the figures on this row do not add up and could not be mended' }
}

// ── the table ───────────────────────────────────────────────────────────────────────────────────

type Roles = Partial<Record<Col, number>>

/** Which column is which: the reading of the columns under which the most rows add up. */
function rolesOf(cols: Column[], rows: (number | null)[][]): Roles | null {
  const money = cols.map((c, i) => ({ c, i })).filter((x) => !x.c.pct)
  const pct = cols.findIndex((c) => c.pct)
  if (money.length < 4) return null
  let best: { roles: Roles; score: number } | null = null
  const n = money.length
  const idx = money.map((m) => m.i)
  const pick = (k: number[]) => k.map((j) => idx[j])
  // C < D < E < (F) < G < H in reading order; F may be missing from a contractor's own form.
  for (let c = 0; c < n; c++) for (let d = c + 1; d < n; d++) for (let e = d + 1; e < n; e++)
    for (let f = e; f < n; f++) for (let g = f + 1; g < n; g++) for (let hh = g + 1; hh < n; hh++) {
      const hasF = f !== e
      const [C, D, E, F, G, H] = pick([c, d, e, f, g, hh])
      let score = 0
      for (const r of rows) {
        const v = (i: number) => r[i] ?? 0
        const ff = hasF ? v(F) : 0
        if (r[C] == null && r[G] == null) continue
        if (near(v(G), v(D) + v(E) + ff) && near(v(H), v(C) - v(G))) score += 1
      }
      // Tie-breaks: the AIA order, and the percent column between G and H.
      const between = pct < 0 || (cols[G].r < cols[pct].r && cols[pct].r < cols[H].r)
      const tight = (hasF ? 1 : 0) + (between ? 1 : 0) + (d === c + 1 ? 0.5 : 0) + (g === f + 1 ? 0.5 : 0) + (hh === g + 1 ? 0.5 : 0)
      const total = score * 10 + tight
      if (!best || total > best.score) {
        const roles: Roles = { C, D, E, G, H }
        if (hasF) roles.F = F
        if (pct >= 0) roles.pct = pct
        const after = idx.filter((i) => cols[i].r > cols[H].r)
        if (after.length) roles.I = after[0]
        best = { roles, score: total }
      }
    }
  return best?.roles ?? null
}

/** Read every page's table into rows. Pages with no table (the G702, insurance certificates) give none. */
export function readTable(pages: PlacedWord[][]): TableRead {
  const rows: TableRow[] = []
  const wraps: TableRead['wraps'] = []
  let tablePages = 0, application: string | undefined
  pages.forEach((all, pi) => {
    const words = all.filter((w) => w.text.trim() && !JUNK.test(w.text.trim()))
    if (!words.length) return
    const h = median(words.map((w) => w.h)) || 1
    const lines = linesOf(words)
    if (!application) {
      for (const l of lines) {
        const s = l.words.map((w) => w.text).join(' ')
        const m = s.match(/APPLICATION\s*(?:NO|NUMBER|#)\.?\s*:?\s*([\dOoIl]{1,3})\b/i)
        if (m) { application = String(Number(m[1].replace(/[Oo]/g, '0').replace(/[Il]/g, '1'))); break }
      }
    }
    const cols = columnsOf(lines, h)
    if (cols.length < 5) return
    // Each column takes the words whose right end is at its edge, and no word that starts well
    // before its widest figure would — that is the description's text, digits and all.
    const tol = h * 0.9
    const widest = Math.max(...cols.map((c) => c.maxW))
    const textEdge = cols[0].r - widest * 1.25 - h
    const cellOf = (w: PlacedWord): number => {
      const r = w.x + w.w - trailingJunk(w)
      for (let k = 0; k < cols.length; k++) {
        const prev = k ? cols[k - 1].r + tol * 0.5 : -Infinity
        if (r > prev && r <= cols[k].r + tol) {
          // Only the first column has words (the description) to its left that are not figures.
          if (k === 0 && w.x < textEdge) return -1
          return k
        }
      }
      return -1
    }

    interface Raw { line: Line; cells: string[][]; rest: PlacedWord[] }
    const raws: Raw[] = []
    const orphans: { y: number; text: string }[] = []
    for (const l of lines) {
      const cells: string[][] = cols.map(() => [])
      const rest: PlacedWord[] = []
      for (const w of l.words) { const k = cellOf(w); if (k < 0) rest.push(w); else cells[k].push(w.text) }
      // A row of figures has at least three that are plainly money; a footer's years are not.
      const filled = cells.filter((c) => c.length && isMoney(c.join(''))).length
      if (filled >= 3) raws.push({ line: l, cells, rest })
      else {
        const text = rest.filter((w) => w.x + w.w <= textEdge + h).map((w) => w.text).join(' ').trim()
        if (text) orphans.push({ y: l.y, text })
      }
    }
    if (raws.length < 2) return
    const cents = true
    const values = raws.map((r) => r.cells.map((c) => {
      if (!c.length) return null
      const f = figure(c.map((t) => t.replace(/^[[|{]+/, '').replace(/[\]|}f!]+$/, '')).join(''), cents)
      return f ? f.n : null
    }))
    const roles = rolesOf(cols, values)
    if (!roles) return
    tablePages++

    // The left edge of the item numbers: where the first word of most figure rows starts.
    const firstX = median(raws.map((r) => r.rest[0]?.x ?? Infinity).filter(Number.isFinite))
    // And its right edge: where clearly read item numbers end.
    const ends = raws.map((r) => r.rest[0]).filter((w) => w && w.x < firstX + h * 2.5 && itemOf(w.text)?.n != null).map((w) => w.x + w.w)
    const itemRight = ends.length ? median(ends) : firstX + h * 2
    const top = raws[0].line.y, bottom = raws[raws.length - 1].line.y
    raws.forEach((r, ri) => {
      const read: Partial<Record<Col, number | null>> = {}
      const dotless = new Set<Fig>()
      for (const [role, k] of Object.entries(roles) as [Col, number][]) {
        read[role] = values[ri][k]
        const joined = r.cells[k].join('')
        if (role !== 'pct' && role !== 'I' && joined && !/[.,]\d\d\b/.test(joined.replace(/[\]|}f!]+$/, ''))) dotless.add(role as Fig)
      }
      const text = r.rest.filter((w) => w.x + w.w <= textEdge + h)
      let item: string | null = null
      // The item number is whatever stands in the item column — a scan may break it in two ("7 1").
      const inCol: PlacedWord[] = []
      while (text.length && text[0].x < firstX + h * 2.5 && text[0].x + text[0].w <= itemRight + h * 0.6) inCol.push(text.shift()!)
      if (inCol.length) {
        const it = itemOf(inCol.map((w) => w.text).join(''), true)
        if (it) item = it.shown
        else text.unshift(...inCol)
      }
      const name = text.map((w) => w.text).join(' ').replace(/^[[|{]+/, '').replace(/\s+/g, ' ').trim()
      const s = settle(read, {}, dotless)
      rows.push({
        page: pi + 1, item, name, kind: /\btotals?\b/i.test(name) && !item ? 'total' : 'line',
        read, value: s.value, mended: s.mended, ...(s.doubt ? { doubt: s.doubt } : {}),
        text: [item, name, ...r.cells.map((c) => c.join(''))].filter(Boolean).join(' '), y: r.line.y,
      })
    })
    // Lines of description with no figures: a name that runs onto two lines. Which row each
    // belongs to depends on which way the sheet wraps, decided against the schedule of values.
    const first = rows.length - raws.length
    for (const o of orphans) {
      if (o.y < top - h * 3 || o.y > bottom + h * 3) continue
      if (o.y < top && /\b(item|description|scheduled|application|previous|period|stored|completed|balance|retainage|value|work)\b/i.test(o.text)) continue
      let above: number | null = null, below: number | null = null
      for (let k = first; k < rows.length; k++) {
        if (rows[k].kind !== 'line') continue
        if (rows[k].y < o.y) above = k
        else if (below == null) below = k
      }
      // Across a page break the row above is the last line of the page before.
      if (above == null) for (let k = first - 1; k >= 0; k--) if (rows[k].kind === 'line') { above = k; break }
      wraps.push({ text: o.text, above, below })
    }
  })

  // Line numbers in order: a number that breaks the run, between two that leave room for exactly
  // one, is that one.
  const numbered = rows.filter((r) => r.kind === 'line')
  const num = (r: TableRow | undefined) => (r?.item && /^\d+$/.test(r.item) ? Number(r.item) : null)
  for (let i = 0; i < numbered.length; i++) {
    const r = numbered[i]
    const prev = num(numbered[i - 1]), next = num(numbered[i + 1]), mine = num(r)
    if (prev != null && next === prev + 2 && mine !== prev + 1 && (r.item != null || itemlessLooksNumbered(r))) {
      r.item = String(prev + 1); r.itemFixed = true
    }
  }
  // What should be there and is not.
  const missing: string[] = []
  const seq = numbered.map(num).filter((n): n is number => n != null)
  for (let i = 1; i < seq.length; i++) {
    if (seq[i] > seq[i - 1] + 1 && seq[i] - seq[i - 1] < 25) for (let n = seq[i - 1] + 1; n < seq[i]; n++) missing.push(String(n))
  }

  // Grand totals: the last total row's figures against the lines' figures added up.
  const total = [...rows].reverse().find((r) => r.kind === 'total')
  const totals: TableRead['totals'] = []
  if (total) {
    for (const col of FIGURES) {
      const printed = total.read[col]
      if (printed == null) continue
      const added = r2(numbered.reduce((s, r) => s + r.value[col], 0))
      totals.push({ col, printed, added, agree: near(printed, added) })
    }
  }
  return { rows, pages: tablePages, missing, totals, wraps, ...(application ? { application } : {}) }
}

/** A row with no number whose first word is junk the reader made of one. */
function itemlessLooksNumbered(r: TableRow): boolean {
  return !r.name || /^[^A-Za-z]{1,4}\s/.test(r.name)
}
