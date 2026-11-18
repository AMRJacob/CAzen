import type { PDFPageProxy } from 'pdfjs-dist'

/**
 * The lines on a sheet, read from the PDF itself.
 *
 * A drawing exported from Revit or AutoCAD is vector: every wall, grid and dimension line is a
 * path with real coordinates, not a picture of one. A viewer that only rasterises throws all of
 * that away, which is why measuring on screen has meant squinting at a cursor and hoping. The
 * geometry is still in the file, so it is read out once when a sheet opens and used to snap to
 * what is actually drawn — the end of a wall, the corner of a room, a point on a grid line.
 *
 * Everything is kept in fractions of the page, as everywhere else in CAzen, so it survives zoom
 * and a sheet reissued at another paper size.
 *
 * Scanned sheets have no geometry and get none. There is nothing to recover: a scan is a
 * photograph of a drawing, and guessing at lines in it would be worse than the honest cursor.
 */

export interface Point { x: number; y: number }
export type SnapKind = 'end' | 'mid' | 'line'
export interface Snap extends Point { kind: SnapKind }

// pdf.js operator numbers. Taken from its OPS table rather than imported, because the module
// exports the enum only through paths that pull the whole viewer in.
const OP_SAVE = 10
const OP_RESTORE = 11
const OP_TRANSFORM = 12
const OP_RECTANGLE = 19
const OP_FORM_BEGIN = 74
const OP_FORM_END = 75
const OP_CONSTRUCT_PATH = 91

// pdf.js DrawOPS, the compact encoding a path arrives in.
const D_MOVE = 0
const D_LINE = 1
const D_CURVE = 2
const D_QUAD = 3
const D_CLOSE = 4

type Matrix = [number, number, number, number, number, number]

const apply = (m: Matrix, x: number, y: number): [number, number] =>
  [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

const multiply = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
]

/** How many segments are worth keeping. A dense sheet has tens of thousands; a hundred thousand
 *  is a sheet whose hatching would swamp the snap anyway, and the memory isn't worth it. */
const MAX_SEGMENTS = 120_000

/** A curve becomes this many straight pieces. Enough to snap along an arc without storing one. */
const CURVE_STEPS = 6

export interface Geometry {
  /** x1,y1,x2,y2 per segment, in page fractions. */
  segments: Float32Array
  count: number
  /** True when the sheet had more geometry than was kept. */
  truncated: boolean
}

/** Read every straight piece of linework on a page. */
export async function readGeometry(page: PDFPageProxy): Promise<Geometry> {
  const vp = page.getViewport({ scale: 1 })
  const list = await page.getOperatorList()
  const W = vp.width || 1
  const H = vp.height || 1

  // Start from the viewport's own transform, so PDF user space lands where the page is drawn,
  // then divide through by the page size at the end to get fractions.
  const base = (vp.transform as number[]).slice(0, 6) as Matrix
  let ctm: Matrix = base
  const stack: Matrix[] = []

  const out = new Float32Array(MAX_SEGMENTS * 4)
  let n = 0
  let truncated = false

  const push = (x1: number, y1: number, x2: number, y2: number) => {
    if (n >= MAX_SEGMENTS) { truncated = true; return }
    const [ax, ay] = apply(ctm, x1, y1)
    const [bx, by] = apply(ctm, x2, y2)
    // Zero-length pieces are dots, and a dot snaps to nothing useful.
    if (Math.abs(ax - bx) < 0.01 && Math.abs(ay - by) < 0.01) return
    const at = n * 4
    out[at] = ax / W
    out[at + 1] = ay / H
    out[at + 2] = bx / W
    out[at + 3] = by / H
    n++
  }

  const bezier = (
    x0: number, y0: number, c1x: number, c1y: number, c2x: number, c2y: number, x1: number, y1: number,
  ) => {
    let px = x0, py = y0
    for (let i = 1; i <= CURVE_STEPS; i++) {
      const t = i / CURVE_STEPS
      const u = 1 - t
      const x = u * u * u * x0 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x1
      const y = u * u * u * y0 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y1
      push(px, py, x, y)
      px = x; py = y
    }
  }

  for (let i = 0; i < list.fnArray.length; i++) {
    const fn = list.fnArray[i]
    const args = list.argsArray[i] as unknown[]

    if (fn === OP_SAVE) { stack.push(ctm); continue }
    if (fn === OP_RESTORE) { ctm = stack.pop() ?? base; continue }
    if (fn === OP_TRANSFORM) { ctm = multiply(ctm, (args as number[]).slice(0, 6) as Matrix); continue }
    if (fn === OP_FORM_BEGIN) {
      // A form XObject draws in its own space; its matrix stacks on top until the form ends.
      stack.push(ctm)
      const m = args[0] as number[] | undefined
      if (m?.length === 6) ctm = multiply(ctm, m.slice(0, 6) as Matrix)
      continue
    }
    if (fn === OP_FORM_END) { ctm = stack.pop() ?? base; continue }

    if (fn === OP_RECTANGLE) {
      const [x, y, w, h] = args as number[]
      push(x, y, x + w, y)
      push(x + w, y, x + w, y + h)
      push(x + w, y + h, x, y + h)
      push(x, y + h, x, y)
      continue
    }

    if (fn !== OP_CONSTRUCT_PATH) continue
    // [op, data, minMax] — data[0] holds the path, as a flat run of draw operators.
    const data = (args[1] as unknown[] | undefined)?.[0]
    if (!data || typeof (data as ArrayLike<number>).length !== 'number') continue
    const d = data as ArrayLike<number>

    let cx = 0, cy = 0, sx = 0, sy = 0
    for (let k = 0; k < d.length;) {
      switch (d[k++]) {
        case D_MOVE: cx = d[k++]; cy = d[k++]; sx = cx; sy = cy; break
        case D_LINE: { const x = d[k++], y = d[k++]; push(cx, cy, x, y); cx = x; cy = y; break }
        case D_CURVE: {
          const a = d[k++], b = d[k++], c = d[k++], e = d[k++], f = d[k++], g = d[k++]
          bezier(cx, cy, a, b, c, e, f, g); cx = f; cy = g; break
        }
        case D_QUAD: {
          const a = d[k++], b = d[k++], c = d[k++], e = d[k++]
          // A quadratic is a cubic with its controls two thirds of the way out.
          bezier(cx, cy, cx + (2 / 3) * (a - cx), cy + (2 / 3) * (b - cy), c + (2 / 3) * (a - c), e + (2 / 3) * (b - e), c, e)
          cx = c; cy = e; break
        }
        case D_CLOSE: push(cx, cy, sx, sy); cx = sx; cy = sy; break
        default: k = d.length; break   // an operator we don't know; stop rather than misread
      }
    }
    if (n >= MAX_SEGMENTS) truncated = true
  }

  return { segments: out.subarray(0, n * 4), count: n, truncated }
}

/**
 * Finding the nearest thing worth snapping to.
 *
 * Segments go into a coarse grid so a snap looks at a few dozen rather than a hundred thousand.
 * Ends beat middles and middles beat anywhere-along-the-line, because that is the order of how
 * much somebody means it: a corner is a decision, a point on a wall is a convenience.
 */
export class Snapper {
  private cells = new Map<number, number[]>()
  private readonly across: number
  readonly count: number
  readonly truncated: boolean

  private readonly geometry: Geometry
  private readonly aspect: number

  constructor(geometry: Geometry, aspect: number) {
    this.geometry = geometry
    this.aspect = aspect
    this.count = geometry.count
    this.truncated = geometry.truncated
    // Enough cells that a dense sheet averages a handful of segments each.
    this.across = Math.max(16, Math.min(256, Math.round(Math.sqrt(Math.max(geometry.count, 1) / 4))))
    const s = geometry.segments
    for (let i = 0; i < geometry.count; i++) {
      const at = i * 4
      this.put(s[at], s[at + 1], i)
      this.put(s[at + 2], s[at + 3], i)
      this.put((s[at] + s[at + 2]) / 2, (s[at + 1] + s[at + 3]) / 2, i)
    }
  }

  private key(x: number, y: number) {
    const cx = Math.max(0, Math.min(this.across - 1, Math.floor(x * this.across)))
    const cy = Math.max(0, Math.min(this.across - 1, Math.floor(y * this.across)))
    return cy * this.across + cx
  }

  private put(x: number, y: number, i: number) {
    const k = this.key(x, y)
    const had = this.cells.get(k)
    if (had) { if (had[had.length - 1] !== i) had.push(i) }
    else this.cells.set(k, [i])
  }

  /** Segment indices worth looking at near a point. */
  private around(p: Point, tol: number): number[] {
    const reach = Math.max(1, Math.ceil(tol * this.across) + 1)
    const cx = Math.floor(p.x * this.across)
    const cy = Math.floor(p.y * this.across)
    const out: number[] = []
    const seen = new Set<number>()
    for (let y = cy - reach; y <= cy + reach; y++) {
      if (y < 0 || y >= this.across) continue
      for (let x = cx - reach; x <= cx + reach; x++) {
        if (x < 0 || x >= this.across) continue
        for (const i of this.cells.get(y * this.across + x) ?? []) {
          if (!seen.has(i)) { seen.add(i); out.push(i) }
        }
      }
    }
    return out
  }

  /**
   * The point to use instead of where the pointer is, or null to leave it alone.
   * `tol` is a distance in fractions of the page height; x is weighted by the aspect so a
   * tolerance means the same number of screen pixels in both directions.
   */
  near(p: Point, tol: number): Snap | null {
    const s = this.geometry.segments
    const dist = (ax: number, ay: number) => Math.hypot((ax - p.x) * this.aspect, ay - p.y)
    let best: Snap | null = null
    let bestScore = Infinity

    // Ends and middles first: a hit on one of those wins however close a line is.
    for (const i of this.around(p, tol)) {
      const at = i * 4
      const ends: [number, number, SnapKind][] = [
        [s[at], s[at + 1], 'end'],
        [s[at + 2], s[at + 3], 'end'],
        [(s[at] + s[at + 2]) / 2, (s[at + 1] + s[at + 3]) / 2, 'mid'],
      ]
      for (const [x, y, kind] of ends) {
        const d = dist(x, y)
        if (d > tol) continue
        // A midpoint has to be clearly nearer than an end to win.
        const score = kind === 'end' ? d : d * 1.6
        if (score < bestScore) { bestScore = score; best = { x, y, kind } }
      }
    }
    if (best) return best

    // Nothing to land on, so the nearest point along a line.
    for (const i of this.around(p, tol)) {
      const at = i * 4
      const ax = s[at], ay = s[at + 1], bx = s[at + 2], by = s[at + 3]
      const vx = (bx - ax) * this.aspect, vy = by - ay
      const wx = (p.x - ax) * this.aspect, wy = p.y - ay
      const len = vx * vx + vy * vy
      if (len <= 0) continue
      const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / len))
      const x = ax + (bx - ax) * t
      const y = ay + (by - ay) * t
      const d = dist(x, y)
      if (d <= tol && d < bestScore) { bestScore = d; best = { x, y, kind: 'line' } }
    }
    return best
  }
}
