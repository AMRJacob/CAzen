/**
 * Ink: how a stroke is sampled, how hard it was pressed, and how it is drawn.
 *
 * Used by the markups on a sheet and by the notes pad, which want the same hand. Everything
 * here works in whatever coordinate space the caller maps into — fractions of a sheet, or
 * fractions of a pad page — and knows nothing about either.
 */

/**
 * A point in a freehand stroke: x, y, and — from a stylus that reports it — how hard it was
 * pressed, 0 to 1. Strokes drawn with a finger or a mouse have two numbers and are drawn at one
 * width, which is also what every stroke drawn before pressure was captured has.
 */
export type InkPoint = [number, number] | [number, number, number]

export interface Point { x: number; y: number }

/**
 * How hard a stylus was pressed, or nothing for anything that can't say.
 *
 * A mouse reports a flat 0.5 while a button is down and a finger usually reports 0 or 0.5, so
 * a width taken from those would be noise dressed as expression. Only a pen is believed.
 */
export function forceOf(e: PointerEvent): number | null {
  if (e.pointerType !== 'pen') return null
  const p = e.pressure
  return typeof p === 'number' && p > 0 && p < 1 ? p : p === 1 ? 1 : null
}

/**
 * Every position the pen passed through since the last event, not just where it ended up.
 *
 * A pointermove arrives once a frame; a pencil samples several times faster than that, and the
 * browser hands over what it held back. Taking only the event's own position throws away most
 * of a fast stroke and turns a curve into a chain of straight lines.
 *
 * iOS reports the wrong pointerId on coalesced samples, so samples whose id disagrees are kept
 * rather than dropped — only a second pointer's samples, which carry an id of their own, go.
 */
export function samplesFrom(
  native: PointerEvent,
  at: (e: PointerEvent) => Point,
): InkPoint[] {
  let raw: PointerEvent[] = []
  try {
    raw = typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : []
  } catch { raw = [] }
  const mine = raw.filter((s) => !s.pointerId || s.pointerId === native.pointerId)
  const list = mine.length ? mine : [native]
  return list.map((s) => {
    const p = at(s)
    const f = forceOf(s)
    return (f == null ? [p.x, p.y] : [p.x, p.y, f]) as InkPoint
  })
}

/**
 * A stroke as a handful of constant-width paths.
 *
 * SVG has no variable-width stroke, so a pressure stroke is cut where its width changes and
 * each piece drawn at its own width. Widths are rounded to a quarter so a steady press makes
 * one path rather than two hundred, and each piece starts on the point the last one ended on
 * so the pieces meet without a gap.
 */
export function inkRuns(points: InkPoint[], base: number): { width: number; d: string }[] {
  if (points.length < 2) return []
  const widthAt = (p: InkPoint) => {
    const f = p.length > 2 ? (p[2] as number) : null
    if (f == null) return base
    return Math.round(base * (0.4 + 1.3 * f) * 4) / 4
  }
  const runs: { width: number; d: string }[] = []
  let width = widthAt(points[0])
  let run: InkPoint[] = [points[0]]
  for (let i = 1; i < points.length; i++) {
    const w = widthAt(points[i])
    if (w !== width) {
      run.push(points[i])
      runs.push({ width, d: pathOf(run) })
      run = [points[i]]
      width = w
    } else {
      run.push(points[i])
    }
  }
  if (run.length > 1) runs.push({ width, d: pathOf(run) })
  return runs
}

export const pathOf = (points: InkPoint[]) =>
  points.map((p, i) => `${i ? 'L' : 'M'} ${p[0]} ${p[1]}`).join(' ')

/**
 * The pen's own hand, and keeping the hand it rests on out of the way.
 *
 * iOS already drops touches while a pen is in use, but not every device does and the drop is
 * not instant, so a touch arriving within a couple of seconds of a pen sample is taken for a
 * palm and ignored.
 */
export function palmGuard(onPen?: (e: PointerEvent) => void) {
  let penAt = 0
  return {
    /** True when this event is a palm resting on the screen and should be ignored. */
    isPalm(e: { pointerType: string; nativeEvent?: Event }): boolean {
      if (e.pointerType === 'pen') {
        penAt = Date.now()
        if (onPen && e.nativeEvent) onPen(e.nativeEvent as PointerEvent)
        return false
      }
      return e.pointerType === 'touch' && Date.now() - penAt < 2000
    },
  }
}

/** How thick a pen draws, as a fraction of the shorter side of the page. */
export const PEN_WIDTHS = { fine: 0.0016, medium: 0.0026, broad: 0.0042 } as const
export type PenWidth = keyof typeof PEN_WIDTHS
