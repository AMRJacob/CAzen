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

/** Across the glass, in CSS pixels, past which a contact is a hand and not a fingertip. */
export const PALM_ACROSS = 45
/** Past this it is a hand whatever else is going on: no fingertip, however flat, is this wide. */
export const PALM_SURE = 100
/** How long after the pen was last busy a wide contact is still taken for the hand that holds it. */
export const PEN_NEAR = 1500
/** Two contacts landing within this of each other are two fingers arriving to pinch. */
export const PINCH_TOGETHER = 400
/** How long after the pen was last busy a new contact is still taken for the hand holding it. */
export const PEN_TAIL = 300

/**
 * Hand, or meant?
 *
 * The one question the pad asks of every contact, kept here so it can be tested rather than
 * guessed at — it has been got wrong more than once, and the cost each time was writing that
 * would not write or a page that would not move.
 *
 * A contact is hand if it is palm-sized, or if it lands while the pen is writing or has only
 * just stopped. A small contact joining a gesture already under way is a second finger,
 * whatever the pen was doing. The question is asked when the contact lands and the answer is
 * kept for as long as it is down, so a palm settled on the page stays ignored after the pen
 * lifts instead of turning into a finger and dragging the page about.
 */
export function isHandContact(e: {
  pointerType: string
  pointerId: number
  type: string
  width?: number
  height?: number
}, world: {
  /** Contacts already judged hand and still down. */
  hands: Set<number>
  /** How many fingers are already working the canvas. */
  fingers: number
  /** When the pen was last doing anything. */
  penAt: number
  now: number
  /**
   * Whether size is to be believed. It is only when a pen is how this person writes and the
   * contact is on the page: a fingertip pressed flat reports wider than a palm's edge, so
   * where the finger is the pen, or the contact is on a button, a wide touch is still meant.
   */
  sized?: boolean
}): boolean {
  if (e.pointerType !== 'touch') return false
  if (world.hands.has(e.pointerId)) return true
  if (e.type !== 'pointerdown') return false
  const across = Math.max(e.width || 0, e.height || 0)
  // A wide contact is a hand — unless fingers are already working the page and it is no wider
  // than a finger pressed flat, in which case it is the other finger of a pinch.
  if (world.sized !== false && across > PALM_ACROSS) {
    // Too wide for any fingertip: a hand, whatever else is going on.
    if (across > PALM_SURE) return true
    // Finger-sized. It is the hand only while the pen is about — writing, or just lifted. With
    // the pen away it is a finger come to move the paper: a fingertip pressed flat reports
    // wider than the old limit, and treating every such touch as a palm left the paper unable
    // to be moved or pinched by anyone who writes with a pen.
    if (world.fingers === 0 && world.now - world.penAt < PEN_NEAR) return true
  }
  if (world.fingers > 0) return false
  return world.now - world.penAt < PEN_TAIL
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
 * each piece drawn at its own width. Widths are rounded so that a steady press makes one path
 * rather than two hundred, and each piece starts on the point the last one ended on so the
 * pieces meet without a gap.
 *
 * The rounding is to a fraction of the base width, not to a fixed amount. A sheet markup is
 * two pixels wide and a pad stroke is three thousandths of a canvas unit; rounding both to a
 * quarter — as this did — leaves the first alone and flattens the second to nothing, which
 * draws a stroke that is saved, correct, and invisible.
 */
export function inkRuns(points: InkPoint[], base: number): { width: number; d: string }[] {
  if (points.length < 2) return []
  const step = base / 8
  const widthAt = (p: InkPoint) => {
    const f = p.length > 2 ? (p[2] as number) : null
    if (f == null) return base
    return Math.round((base * (0.4 + 1.3 * f)) / step) * step
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
