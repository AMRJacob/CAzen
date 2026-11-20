import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { graphiteOf, handOf, outlineOf, reachAhead, seedOf, traceTo, type Nib } from '../lib/nib'
import type { InkPoint } from '../lib/ink'
import type { PadMark, PadRule } from '../lib/pads'
import { headOf, leaderFrom, leaderWidth, shaftOf, type Pt } from '../lib/arrows'

/** A text box's type size when none is set — the same as the pad's own TEXT_SIZE. */
const TEXT_SIZE = 0.03

/**
 * Where the ink actually goes.
 *
 * Two canvases. The lower one holds everything that has been written; a finished stroke is
 * painted straight onto it and nothing else is touched, and it is only redrawn in full when
 * the view moves or a mark is taken away. The upper one holds the single stroke under the nib
 * and is cleared each time it is redrawn.
 *
 * This is why the ink stopped blinking. In SVG, adding a path to a drawing that already holds
 * thousands of points makes the browser throw away its picture of the layer and build it
 * again — on a phone that takes long enough to see as a line vanishing and coming back. A
 * bitmap has no such idea: a new stroke is drawn onto what is already there, and what is
 * already there is never reconsidered.
 *
 * The stroke being drawn is handed over imperatively, by the function given to `onReady`,
 * rather than through state. A pen reports well over a hundred points a second, and asking
 * React to re-render the pad that often is the whole of the lag.
 */

export interface View { scale: number; x: number; y: number }
interface Box { x: number; y: number; w: number; h: number }
export interface InkStyle { colour: string; width: number; nib: Nib; arrow?: boolean }
/** What the pad gets back: a way to show the stroke in progress. */
export interface PadInk {
  /** `seed` is the id the stroke will be saved under, so the wet ink and the dry ink are the
   *  same ink: without it the imperfections would reshuffle the instant the pen came up. */
  wet: (points: InkPoint[] | null, style: InkStyle, seed: number) => void
}

const nibOf = (m: PadMark): Nib =>
  m.kind === 'highlight' ? 'highlight' : m.style?.nib === 'pencil' ? 'pencil' : 'pen'

export function PadSurface({ marks, view, rule, ruleInk, onReady, contrast = false }: {
  marks: PadMark[]
  view: View
  rule: PadRule
  ruleInk: number
  onReady?: (ink: PadInk) => void
  /** Every mark drawn with a thin white edge, to read over a photograph. */
  contrast?: boolean
}) {
  const paper = useRef<HTMLCanvasElement | null>(null)
  const live = useRef<HTMLCanvasElement | null>(null)
  /**
   * `desynchronized` asks the browser to put the ink on the screen without waiting for the
   * rest of the page to be composited — the low-latency path browsers keep for drawing. Where
   * it is not offered the flag is ignored, and nothing else changes.
   */
  const inkCtx = (c: HTMLCanvasElement | null): CanvasRenderingContext2D | null =>
    c ? c.getContext('2d', { alpha: true, desynchronized: true }) : null
  const size = useRef({ w: 0, h: 0, dpr: 1 })
  const viewRef = useRef(view)
  // Written in an effect, never during render: everything that reads it runs from an event
  // handler or an effect, both of which come after the render that changed the view.
  useEffect(() => { viewRef.current = view }, [view])

  /** Fit a canvas to its box in real device pixels; true if the size changed. */
  const fitCanvas = useCallback((c: HTMLCanvasElement | null) => {
    if (!c) return false
    const dpr = Math.min(3, window.devicePixelRatio || 1)
    const box = c.getBoundingClientRect()
    const w = Math.round(box.width * dpr)
    const h = Math.round(box.height * dpr)
    size.current = { w: box.width, h: box.height, dpr }
    if (c.width === w && c.height === h) return false
    c.width = w
    c.height = h
    return true
  }, [])

  /**
   * One stroke's outline, as a path in scaled space — scaled for the zoom, but not yet moved
   * to where the paper is. Panning changes only where it goes, so the path is kept and the
   * canvas is moved under it; the outline is rebuilt only when the zoom changes.
   */
  /* `points` and `width` are what the outline was made from: a stroke moved or made broader
     keeps its name, and must not keep its old outline. */
  interface Drawn { scale: number; dpr: number; path: Path2D; box: Box; points: InkPoint[]; width: number }
  const paths = useRef(new Map<string, Drawn>())

  const pathFor = useCallback((
    id: string | null,
    points: InkPoint[],
    style: InkStyle,
    v: View,
    seed: number,
  ): Drawn | null => {
    const { dpr } = size.current
    const had = id ? paths.current.get(id) : undefined
    if (had && had.scale === v.scale && had.dpr === dpr && had.points === points && had.width === style.width) return had
    const here: InkPoint[] = points.map((p) => (
      p.length > 2
        ? [p[0] * v.scale * dpr, p[1] * v.scale * dpr, p[2] as number]
        : [p[0] * v.scale * dpr, p[1] * v.scale * dpr]
    ))
    // Ink thins as you zoom out, and below a pixel it stops being ink.
    const width = Math.max(1.4 * dpr, style.width * v.scale * dpr)
    const outline = outlineOf(here, width, style.nib, seed)
    if (outline.length < 3) return null
    const path = new Path2D()
    traceTo(path, outline)
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const [x, y] of outline) {
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
    const made: Drawn = { scale: v.scale, dpr, path, points, width: style.width, box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } }
    if (id) paths.current.set(id, made)
    return made
  }, [])

  /** A straight arrow or a leader: a line through the points and a head at the last. */
  const arrow = useCallback((ctx: CanvasRenderingContext2D, pts: Pt[], style: InkStyle, v: View): Box | null => {
    const { dpr } = size.current
    const k = v.scale * dpr
    const width = Math.max(1.4 * dpr, style.width * k)
    const at = pts.map(([x, y]) => [x * k + v.x * dpr, y * k + v.y * dpr] as Pt)
    const shaft = shaftOf(at, width), head = headOf(at, width)
    const trace = () => {
      ctx.beginPath()
      shaft.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    }
    const tip = () => { ctx.beginPath(); head.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath() }
    ctx.save()
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    if (contrast) {
      ctx.strokeStyle = '#fff'; ctx.globalAlpha = 0.95
      ctx.lineWidth = width + 3.2 * dpr; trace(); ctx.stroke()
      ctx.lineWidth = 3.2 * dpr; tip(); ctx.stroke()
      ctx.globalAlpha = 1
    }
    ctx.strokeStyle = style.colour; ctx.fillStyle = style.colour; ctx.lineWidth = width
    trace(); ctx.stroke()
    tip(); ctx.fill()
    ctx.restore()
    const xs = [...at, ...head].map((p) => p[0]), ys = [...at, ...head].map((p) => p[1])
    const pad = width * 2 + 4 * dpr
    const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad
    return { x: x0, y: y0, w: Math.max(...xs) + pad - x0, h: Math.max(...ys) + pad - y0 }
  }, [contrast])

  /** One stroke, onto whichever canvas is asked for, at the view it is asked for. */
  const stroke = useCallback((
    ctx: CanvasRenderingContext2D,
    id: string | null,
    points: InkPoint[],
    style: InkStyle,
    v: View,
    seed: number,
  ): Box | null => {
    if (points.length < 2) return null
    if (style.arrow) return arrow(ctx, points.map((p) => [p[0], p[1]] as Pt), style, v)
    const drawn = pathFor(id, points, style, v, seed)
    if (!drawn) return null
    const { dpr } = size.current
    const hand = handOf(style.nib)
    ctx.save()
    ctx.translate(v.x * dpr, v.y * dpr)
    ctx.globalAlpha = hand.alpha
    if (contrast && style.nib !== 'highlight') {
      ctx.save()
      ctx.globalAlpha = 0.95
      ctx.strokeStyle = '#fff'
      ctx.lineJoin = 'round'
      ctx.lineWidth = 3.2 * dpr
      ctx.stroke(drawn.path)
      ctx.restore()
    }
    const grain = style.nib === 'pencil' ? graphiteOf(ctx, style.colour) : null
    ctx.fillStyle = grain ?? style.colour
    ctx.fill(drawn.path)
    ctx.restore()
    const b = drawn.box
    return { x: b.x + v.x * dpr, y: b.y + v.y * dpr, w: b.w, h: b.h }
  }, [pathFor, arrow, contrast])

  /** One saved mark. */
  const drawMark = useCallback((ctx: CanvasRenderingContext2D, m: PadMark, v: View) => {
    const g = m.geometry as { points?: InkPoint[]; x?: number; y?: number; w?: number }
    // A text box's leaders are drawn here, under the box; the words themselves are not.
    if (!g.points) {
      if (m.kind !== 'text' || !m.style?.leaders?.length || g.x == null) return
      const size = m.style.size ?? TEXT_SIZE
      for (const to of m.style.leaders) {
        arrow(ctx, leaderFrom({ x: g.x, y: g.y!, w: g.w! }, size, to), { colour: m.style.colour ?? '#2b2d2c', width: leaderWidth(size), nib: 'pen' }, v)
      }
      return
    }
    stroke(ctx, m.id, g.points, {
      colour: m.style?.colour ?? '#2b2d2c',
      width: m.style?.width ?? 0.005,
      nib: nibOf(m),
      arrow: !!m.style?.arrow,
    }, v, seedOf(m.id))
  }, [stroke, arrow])

  /** The ruling, drawn under the ink on a full redraw. */
  const ground = useCallback((ctx: CanvasRenderingContext2D, v: View) => {
    if (rule === 'blank' || ruleInk <= 0) return
    const { w, h, dpr } = size.current
    let step = 0.042 * v.scale
    while (step < 14) step *= 2
    while (step > 90) step /= 2
    ctx.save()
    ctx.globalAlpha = ruleInk / 100
    const first = (n: number, off: number) => ((off % n) + n) % n
    if (rule === 'dots') {
      ctx.fillStyle = '#4e7da6'
      const r = Math.max(0.7, step * 0.022) * dpr
      for (let y = first(step, v.y); y < h; y += step) {
        for (let x = first(step, v.x); x < w; x += step) {
          ctx.beginPath()
          ctx.arc(x * dpr, y * dpr, r, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    } else {
      ctx.strokeStyle = '#5d89b0'
      ctx.lineWidth = dpr
      ctx.beginPath()
      for (let y = first(step, v.y); y < h; y += step) {
        ctx.moveTo(0, Math.round(y * dpr) + 0.5)
        ctx.lineTo(w * dpr, Math.round(y * dpr) + 0.5)
      }
      if (rule === 'grid') {
        for (let x = first(step, v.x); x < w; x += step) {
          ctx.moveTo(Math.round(x * dpr) + 0.5, 0)
          ctx.lineTo(Math.round(x * dpr) + 0.5, h * dpr)
        }
      }
      ctx.stroke()
    }
    ctx.restore()
  }, [rule, ruleInk])

  /**
   * What is already on the paper, so the next pass can tell an added stroke from a changed
   * drawing. A stroke appended to the end costs one stroke; anything else costs a redraw.
   */
  const laid = useRef<{ ids: string[]; view: View; sig: string; marks: PadMark[] } | null>(null)

  useLayoutEffect(() => {
    const c = paper.current
    const ctx = inkCtx(c)
    if (!c || !ctx) return
    const resized = fitCanvas(c)
    if (fitCanvas(live.current)) wetBox.current = null
    const ids = marks.map((m) => m.id)
    const sig = `${rule}|${ruleInk}|${contrast}`
    const was = laid.current
    const appended = !!was && !resized && was.sig === sig
      && was.view.scale === view.scale && was.view.x === view.x && was.view.y === view.y
      && was.ids.length <= ids.length
      // The same marks, not only the same names: one recoloured or moved is a changed drawing.
      && was.marks.every((m, i) => marks[i] === m)
    if (appended) {
      for (let i = was.ids.length; i < marks.length; i++) drawMark(ctx, marks[i], view)
    } else {
      ctx.clearRect(0, 0, c.width, c.height)
      ground(ctx, view)
      for (const m of marks) drawMark(ctx, m, view)
      if (paths.current.size > ids.length) {
        const here = new Set(ids)
        for (const id of paths.current.keys()) if (!here.has(id)) paths.current.delete(id)
      }
    }
    laid.current = { ids, view, sig, marks }
  }, [marks, view, rule, ruleInk, contrast, ground, drawMark, fitCanvas])

  /** The stroke under the nib. Held here so a redraw can put it back where it was. */
  const wetNow = useRef<{ points: InkPoint[]; style: InkStyle; seed: number } | null>(null)
  /**
   * What the wet stroke covered last time.
   *
   * Clearing the whole canvas marks the whole canvas changed, and a screenful of pixels at
   * three times the density then has to be handed to the compositor on every single frame of
   * a stroke. Clearing only what was drawn means only what was drawn is handed over.
   */
  const wetBox = useRef<Box | null>(null)
  const drawWet = useCallback(() => {
    const ctx = inkCtx(live.current)
    if (!ctx) return
    const was = wetBox.current
    if (was) ctx.clearRect(was.x - 2, was.y - 2, was.w + 4, was.h + 4)
    const now = wetNow.current
    if (!now || now.points.length < 2) { wetBox.current = null; return }
    // Drawn a little ahead of the pen, and only here: the guess never reaches the paper.
    const guess = now.style.arrow ? null : reachAhead(now.points)
    const points = guess ? [...now.points, guess] : now.points
    wetBox.current = stroke(ctx, null, points, now.style, viewRef.current, now.seed)
  }, [stroke])

  const wet = useCallback((points: InkPoint[] | null, style: InkStyle, seed: number) => {
    wetNow.current = points && points.length ? { points, style, seed } : null
    drawWet()
  }, [drawWet])

  useEffect(() => { onReady?.({ wet }) }, [onReady, wet])

  // A stroke can be in progress while the other hand pinches the canvas about underneath it.
  useLayoutEffect(() => { drawWet() }, [drawWet, view])

  useEffect(() => {
    const again = () => {
      laid.current = null
      if (fitCanvas(live.current)) wetBox.current = null
      const c = paper.current
      const ctx = inkCtx(c)
      if (c && ctx) {
        fitCanvas(c)
        ctx.clearRect(0, 0, c.width, c.height)
        ground(ctx, viewRef.current)
        for (const m of marks) drawMark(ctx, m, viewRef.current)
        laid.current = { ids: marks.map((m) => m.id), view: viewRef.current, sig: `${rule}|${ruleInk}|${contrast}`, marks }
      }
      drawWet()
    }
    window.addEventListener('resize', again)
    // The pad can change shape without the window doing anything — opening, the keyboard
    // coming up, a fold. Measuring is no longer done on every stroke, so something has to
    // notice.
    const watch = typeof ResizeObserver === 'function' ? new ResizeObserver(again) : null
    if (watch && paper.current) watch.observe(paper.current)
    return () => {
      window.removeEventListener('resize', again)
      watch?.disconnect()
    }
  }, [marks, rule, ruleInk, contrast, ground, drawMark, drawWet, fitCanvas])

  return (
    <>
      <canvas ref={paper} className="pad-paper" />
      <canvas ref={live} className="pad-live" />
    </>
  )
}
