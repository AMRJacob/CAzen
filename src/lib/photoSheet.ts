/**
 * The photo table behind a field report: which photograph goes where on which page.
 *
 * Nothing here knows about a PDF or a screen. It is given shapes and hands back boxes, so the
 * dialog's small preview and the printed pages are laid out by the same hand and cannot
 * disagree — and so it can be checked without a browser.
 *
 * Two things are wanted of it. Photographs in a row stand at one height, whatever their
 * shapes, so the rows read as rows; and a page is not left half empty because the next row was
 * a little too tall to join it.
 */

/** A part of a photograph, as fractions of it. */
export interface Crop { x: number; y: number; w: number; h: number }

export interface SheetPhoto {
  id: string
  /** Width over height, after any crop. */
  ratio: number
}

export interface SheetBox {
  id: string
  /** Its number in the table, from 1. */
  n: number
  page: number
  /** The cell: photograph and caption together, which is what the table rules are drawn round. */
  x: number; y: number; w: number; h: number
  /** The photograph inside the cell. */
  px: number; py: number; pw: number; ph: number
  /** Where the caption starts, and how much room it has. */
  cy: number; ch: number
}

export interface SheetOptions {
  /** The room on a page for the table. */
  width: number
  height: number
  /** About how many photographs to a row. Shapes decide the rest. */
  perRow: number
  /** Space inside a cell, round the photograph. */
  pad: number
  /** Height of one line of caption. */
  line: number
  /** How many lines a photograph's caption takes at a given width. */
  lines: (id: string, width: number) => number
}

interface Row { items: SheetPhoto[]; high: number; full: boolean }

/** How far a page's rows may be made smaller so that one more row joins them. */
const SQUEEZE = 0.84
/** A row is never taller than this many times the height asked for — one tall portrait alone. */
const TALLEST = 1.45

/**
 * Photographs into rows.
 *
 * A row is as high as it has to be for its photographs to fill the width at one height, so the
 * question is only where each row ends. Every way of ending the rows is weighed, by how far
 * each row lands from the height asked for, and the best whole arrangement is kept — taking
 * rows greedily leaves the awkward one for last, which is how a table ends in one enormous
 * photograph.
 */
function rowsOf(photos: SheetPhoto[], o: SheetOptions): Row[] {
  const want = (o.width - o.perRow * 2 * o.pad) / (o.perRow * (4 / 3))
  const most = Math.min(6, o.perRow + 2)
  const n = photos.length
  const heightOf = (from: number, to: number) => {
    let sum = 0
    for (let i = from; i < to; i++) sum += photos[i].ratio
    return (o.width - (to - from) * 2 * o.pad) / sum
  }
  const best: { cost: number; from: number }[] = [{ cost: 0, from: -1 }]
  for (let end = 1; end <= n; end++) {
    let pick = { cost: Infinity, from: 0 }
    for (let from = Math.max(0, end - most); from < end; from++) {
      const h = heightOf(from, end)
      // The last row need not fill the width, so being too tall costs it nothing.
      const off = end === n && h > want ? 0 : Math.abs(Math.log(h / want))
      const cost = best[from].cost + off * off
      if (cost < pick.cost) pick = { cost, from }
    }
    best.push(pick)
  }
  const rows: Row[] = []
  for (let end = n; end > 0; end = best[end].from) {
    const from = best[end].from
    const natural = heightOf(from, end)
    const cap = end === n ? want : want * TALLEST
    rows.unshift({ items: photos.slice(from, end), high: Math.min(natural, cap), full: natural <= cap })
  }
  return rows
}

/** The boxes of the whole table, page by page. */
export function layOut(photos: SheetPhoto[], o: SheetOptions): { boxes: SheetBox[]; pages: number } {
  if (!photos.length) return { boxes: [], pages: 0 }
  const rows = rowsOf(photos, o)

  /** A row at a scale: how wide each cell is, and how high the row with its captions. */
  const sized = (row: Row, k: number) => {
    const high = row.high * k
    const cells = row.items.map((p) => ({ p, pw: high * p.ratio, w: high * p.ratio + 2 * o.pad }))
    const cap = Math.max(...cells.map((c) => o.lines(c.p.id, c.pw))) * o.line
    return { cells, high, cap, total: high + cap + 3 * o.pad }
  }

  // Rows into pages. A row that does not fit is let in if the page's rows can give a little.
  const pages: { rows: Row[]; k: number }[] = [{ rows: [], k: 1 }]
  for (const row of rows) {
    const page = pages[pages.length - 1]
    const fits = (k: number) => [...page.rows, row].reduce((sum, r) => sum + sized(r, k).total, 0) <= o.height
    if (!page.rows.length || fits(page.k)) { page.rows.push(row); continue }
    let k = page.k
    while (k > SQUEEZE && !fits(k)) k -= 0.02
    if (fits(k)) { page.rows.push(row); page.k = k } else pages.push({ rows: [row], k: 1 })
  }

  const boxes: SheetBox[] = []
  let n = 0
  pages.forEach((page, at) => {
    const made = page.rows.map((r) => {
      let s = sized(r, page.k)
      // One row taller than the page itself: made to fit, which only a lone portrait can need.
      if (s.total > o.height) s = sized(r, page.k * (o.height - s.cap - 3 * o.pad) / s.high)
      return s
    })
    let y = 0
    for (const s of made) {
      const wide = s.cells.reduce((sum, c) => sum + c.w, 0)
      // A row that fills the width is spread to the edges exactly; a short one sits centred.
      let x = (o.width - wide) / 2
      for (const c of s.cells) {
        n += 1
        boxes.push({
          id: c.p.id, n, page: at,
          x, y, w: c.w, h: s.total,
          px: x + o.pad, py: y + o.pad, pw: c.pw, ph: s.high,
          cy: y + o.pad + s.high + o.pad, ch: s.cap,
        })
        x += c.w
      }
      y += s.total
    }
  })
  return { boxes, pages: pages.length }
}

/** A crop that is the whole photograph, near enough. */
export const whole = (c: Crop | undefined | null): boolean =>
  !c || (c.x < 0.005 && c.y < 0.005 && c.w > 0.99 && c.h > 0.99)

/** Width over height once cropped. */
export const ratioOf = (width: number, height: number, c?: Crop | null): number =>
  whole(c) ? width / height : (width * c!.w) / (height * c!.h)

/** "01 – EROSION CONTROL AT HAY BALE", the way the firm's reports number their photographs. */
export const captionOf = (n: number, label: string): string =>
  `${String(n).padStart(2, '0')}${label.trim() ? ` – ${label.trim().toUpperCase()}` : ''}`
