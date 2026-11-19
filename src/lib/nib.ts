import { getStroke } from 'perfect-freehand'
import type { InkPoint } from './ink'

/**
 * What a nib leaves on paper.
 *
 * A stroked line is the same width end to end, which is what a marker does and no pen or
 * pencil ever has. So a stroke is built as an outline and filled: perfect-freehand walks the
 * centreline tracking a radius from the pressure at each point, and hands back the polygon
 * around it. That gives a line that swells where it was pressed and tapers where it was
 * lifted, which is most of what makes ink look like ink.
 *
 * The rest is imperfection. Real ink does not have a mathematically smooth edge — it creeps
 * into the tooth of the paper — and graphite does not cover at all; it sits on the high points
 * of the sheet and leaves the low ones bare. Both are done here, and both are deterministic:
 * the same stroke must look identical every time it is drawn, or it shimmers whenever the
 * canvas is panned.
 */

export type Nib = 'pen' | 'pencil' | 'highlight'

/** A point as perfect-freehand wants it: x, y, pressure. */
type Sample = [number, number, number]

/**
 * How each nib behaves.
 *
 * `thinning` is how much pressure moves the width; `taper` how far the ends come to a point;
 * `streamline` how much the shake of a hand is smoothed away. A pen is firm and tapers a
 * little, a pencil barely varies but is rough, a highlighter is a flat chisel that does not
 * care how hard you press.
 */
const HAND: Record<Nib, {
  thinning: number; smoothing: number; streamline: number
  taperIn: number; taperOut: number
  /** How far the edge wanders, in device pixels at the drawn size. */
  rough: number
  /** How unevenly the nib lays down — ink flow, graphite catching and letting go. */
  flow: number
  /** How much of the paper shows through. */
  alpha: number
}> = {
  pen:       { thinning: 0.42, smoothing: 0.55, streamline: 0.42, taperIn: 0.6, taperOut: 2.2, rough: 0.30, flow: 0.14, alpha: 1 },
  pencil:    { thinning: 0.30, smoothing: 0.50, streamline: 0.38, taperIn: 0.4, taperOut: 1.2, rough: 0.85, flow: 0.26, alpha: 0.78 },
  highlight: { thinning: 0.02, smoothing: 0.62, streamline: 0.50, taperIn: 0,   taperOut: 0,   rough: 0.20, flow: 0.05, alpha: 0.42 },
}

export const handOf = (nib: Nib) => HAND[nib]

/**
 * A small, fast, repeatable random source.
 *
 * Seeded from the stroke itself, so a stroke's imperfections are its own and never change —
 * panning the canvas redraws every stroke, and anything random would crawl.
 */
function seeded(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13; s >>>= 0
    s ^= s >> 17
    s ^= s << 5; s >>>= 0
    return s / 4294967296
  }
}

/** A number from a string, so a mark's id can seed its own roughness. */
export function seedOf(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * The outline of a stroke, in whatever space the points came in.
 *
 * `size` is the full width of the nib in that same space. Pressure is used where the stylus
 * reported it and simulated from speed where it did not — a mouse reports a flat 0.5, which
 * would draw the dead uniform line this is all meant to avoid.
 */
export function outlineOf(points: InkPoint[], size: number, nib: Nib, seed = 0): number[][] {
  if (!points.length) return []
  const hand = HAND[nib]
  const hasPressure = points.some((p) => p.length > 2)
  const samples: Sample[] = points.map((p) => [p[0], p[1], (p.length > 2 ? p[2] as number : 0.5)])

  /*
   * Nothing lays down evenly. A pen's ink comes and goes a little as the ball turns; a pencil
   * catches and lets go as the graphite meets the tooth. Both show up as the line swelling and
   * thinning over a distance much longer than it is wide — which is a slow wander along the
   * stroke, not noise. It is put into the pressure, so the width carries it the way real
   * pressure would, and it is seeded from the mark, so it never changes once it is drawn.
   */
  if (seed && hand.flow && hasPressure) {
    const wander = seeded(seed ^ 0x5bf03635)
    let v = 0
    for (const s of samples) {
      v = v * 0.88 + (wander() - 0.5) * 0.9
      s[2] = Math.max(0.02, Math.min(1, s[2] * (1 + hand.flow * v)))
    }
  }

  const outline = getStroke(samples, {
    size,
    thinning: hand.thinning,
    smoothing: hand.smoothing,
    streamline: hand.streamline,
    simulatePressure: !hasPressure,
    start: { taper: size * hand.taperIn, cap: true },
    end: { taper: size * hand.taperOut, cap: true },
    last: true,
  })

  if (!hand.rough || !seed) return outline
  // The edge wanders. Scaled to the nib so a broad stroke is not pixel-perfect while a fine
  // one is, and seeded so it wanders the same way every time this stroke is drawn.
  const wobble = seeded(seed)
  const reach = hand.rough * Math.max(0.6, Math.min(2.4, size / 6))
  return outline.map(([x, y]) => [x + (wobble() - 0.5) * reach, y + (wobble() - 0.5) * reach])
}

/**
 * A short guess at where the nib is going next.
 *
 * Between the pen touching a point on the glass and the ink for it reaching the screen sit
 * the browser, the compositor and the display, and nothing in a web page can remove that. It
 * can be covered, though: the stroke is drawn a little past its last known point, along the
 * line it is already travelling, so the ink keeps up with the nib instead of trailing it.
 *
 * It is a guess, so it is a careful one. The reach is cut by how sharply the stroke is
 * turning — straight on, it runs most of a sample ahead; into a corner, it stops guessing
 * altogether — and the guess only ever exists on the stroke being drawn. What is saved is
 * what the pen actually did.
 */
export function reachAhead(points: InkPoint[]): InkPoint | null {
  const n = points.length
  if (n < 7) return null
  // Direction taken over three samples rather than one. Consecutive samples are a hundredth
  // of a second apart, and the line between two of them is mostly noise.
  const at = (i: number) => points[n - 1 - i]
  const dir = (a: InkPoint, b: InkPoint) => {
    const dx = a[0] - b[0], dy = a[1] - b[1]
    const l = Math.hypot(dx, dy)
    return l < 1e-9 ? null : { x: dx / l, y: dy / l, l }
  }
  const now = dir(at(0), at(3))
  const before = dir(at(3), at(6))
  if (!now || !before) return null
  // 1 carrying straight on, 0 turning a corner or doubling back.
  const straight = Math.max(0, now.x * before.x + now.y * before.y)
  const reach = (now.l / 3) * 2.2 * straight * straight
  if (reach < 1e-6) return null
  const last = at(0)
  const f = last.length > 2 ? (last[2] as number) : null
  const x = last[0] + now.x * reach
  const y = last[1] + now.y * reach
  return (f == null ? [x, y] : [x, y, f]) as InkPoint
}

/** The outline as an SVG path — used for the still pictures of a pad. */
export function pathOf(outline: number[][]): string {
  if (outline.length < 3) return ''
  let d = `M ${outline[0][0].toFixed(3)} ${outline[0][1].toFixed(3)}`
  for (let i = 1; i < outline.length; i++) {
    const [x0, y0] = outline[i - 1]
    const [x1, y1] = outline[i]
    d += ` Q ${x0.toFixed(3)} ${y0.toFixed(3)} ${((x0 + x1) / 2).toFixed(3)} ${((y0 + y1) / 2).toFixed(3)}`
  }
  return d + ' Z'
}

/** The same outline, traced into a canvas path. */
export function traceTo(ctx: CanvasRenderingContext2D | Path2D, outline: number[][]): void {
  if (outline.length < 3) return
  ctx.moveTo(outline[0][0], outline[0][1])
  for (let i = 1; i < outline.length; i++) {
    const [x0, y0] = outline[i - 1]
    const [x1, y1] = outline[i]
    ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2)
  }
  ctx.closePath()
}

/**
 * The tooth of the paper, as graphite.
 *
 * A pencil does not cover: it sits on the high points of the sheet and leaves the low ones
 * bare. That is drawn here as a tile of the pencil's own colour with the low points missing,
 * used to fill the stroke — so the paper shows through the gaps and nothing underneath the
 * stroke is touched. Punching the holes out of the drawing instead would bite through the
 * ruling and through every stroke already crossing beneath.
 */
const toothed = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern | null>>()

export function graphiteOf(ctx: CanvasRenderingContext2D, colour: string): CanvasPattern | null {
  let mine = toothed.get(ctx)
  if (!mine) { mine = new Map(); toothed.set(ctx, mine) }
  const had = mine.get(colour)
  if (had !== undefined) return had

  const size = 128
  const tile = document.createElement('canvas')
  tile.width = size
  tile.height = size
  const t = tile.getContext('2d')
  if (!t) return null
  // The colour, whatever form it was written in, read back as pixels.
  t.fillStyle = colour
  t.fillRect(0, 0, size, size)
  const grain = t.getImageData(0, 0, size, size)
  const noise = seeded(0x9e3779b9)
  for (let i = 0; i < grain.data.length; i += 4) {
    // A little clumping, so it reads as tooth rather than as television snow.
    const n = noise() * 0.6 + noise() * 0.4
    const bare = n > 0.62 ? Math.min(1, (n - 0.62) * 2.3) : 0
    grain.data[i + 3] = Math.round(grain.data[i + 3] * (1 - bare))
  }
  t.putImageData(grain, 0, 0)
  const made = ctx.createPattern(tile, 'repeat')
  mine.set(colour, made)
  return made
}
