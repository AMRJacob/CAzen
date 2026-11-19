import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { graphiteOf, handOf, outlineOf, seedOf, traceTo, type Nib } from '../lib/nib'
import type { InkPoint } from '../lib/ink'
import type { PadMark, PadRule } from '../lib/pads'

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
export interface InkStyle { colour: string; width: number; nib: Nib }
/** What the pad gets back: a way to show the stroke in progress. */
export interface PadInk {
  /** `seed` is the id the stroke will be saved under, so the wet ink and the dry ink are the
   *  same ink: without it the imperfections would reshuffle the instant the pen came up. */
  wet: (points: InkPoint[] | null, style: InkStyle, seed: number) => void
}

const nibOf = (m: PadMark): Nib =>
  m.kind === 'highlight' ? 'highlight' : m.style?.nib === 'pencil' ? 'pencil' : 'pen'

export function PadSurface({ marks, view, rule, ruleInk, onReady }: {
  marks: PadMark[]
  view: View
  rule: PadRule
  ruleInk: number
  onReady?: (ink: PadInk) => void
}) {
  const paper = useRef<HTMLCanvasElement | null>(null)
  const live = useRef<HTMLCanvasElement | null>(null)
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
  const paths = useRef(new Map<string, { scale: number; dpr: number; path: Path2D }>())

  const pathFor = useCallback((
    id: string | null,
    points: InkPoint[],
    style: InkStyle,
    v: View,
    seed: number,
  ): Path2D | null => {
    const { dpr } = size.current
    const had = id ? paths.current.get(id) : undefined
    if (had && had.scale === v.scale && had.dpr === dpr) return had.path
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
    if (id) paths.current.set(id, { scale: v.scale, dpr, path })
    return path
  }, [])

  /** One stroke, onto whichever canvas is asked for, at the view it is asked for. */
  const stroke = useCallback((
    ctx: CanvasRenderingContext2D,
    id: string | null,
    points: InkPoint[],
    style: InkStyle,
    v: View,
    seed: number,
  ) => {
    if (points.length < 2) return
    const path = pathFor(id, points, style, v, seed)
    if (!path) return
    const { dpr } = size.current
    const hand = handOf(style.nib)
    ctx.save()
    ctx.translate(v.x * dpr, v.y * dpr)
    ctx.globalAlpha = hand.alpha
    const grain = style.nib === 'pencil' ? graphiteOf(ctx, style.colour) : null
    ctx.fillStyle = grain ?? style.colour
    ctx.fill(path)
    ctx.restore()
  }, [pathFor])

  /** One saved mark. */
  const drawMark = useCallback((ctx: CanvasRenderingContext2D, m: PadMark, v: View) => {
    const g = m.geometry as { points?: InkPoint[] }
    if (!g.points) return
    stroke(ctx, m.id, g.points, {
      colour: m.style?.colour ?? '#2b2d2c',
      width: m.style?.width ?? 0.005,
      nib: nibOf(m),
    }, v, seedOf(m.id))
  }, [stroke])

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
  const laid = useRef<{ ids: string[]; view: View; sig: string } | null>(null)

  useLayoutEffect(() => {
    const c = paper.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const resized = fitCanvas(c)
    const ids = marks.map((m) => m.id)
    const sig = `${rule}|${ruleInk}`
    const was = laid.current
    const appended = !!was && !resized && was.sig === sig
      && was.view.scale === view.scale && was.view.x === view.x && was.view.y === view.y
      && was.ids.length <= ids.length
      && was.ids.every((id, i) => ids[i] === id)
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
    laid.current = { ids, view, sig }
  }, [marks, view, rule, ruleInk, ground, drawMark, fitCanvas])

  /** The stroke under the nib. Held here so a redraw can put it back where it was. */
  const wetNow = useRef<{ points: InkPoint[]; style: InkStyle; seed: number } | null>(null)
  const drawWet = useCallback(() => {
    const c = live.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    fitCanvas(c)
    ctx.clearRect(0, 0, c.width, c.height)
    const now = wetNow.current
    if (now && now.points.length > 1) stroke(ctx, null, now.points, now.style, viewRef.current, now.seed)
  }, [stroke, fitCanvas])

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
      const c = paper.current
      const ctx = c?.getContext('2d')
      if (c && ctx) {
        fitCanvas(c)
        ctx.clearRect(0, 0, c.width, c.height)
        ground(ctx, viewRef.current)
        for (const m of marks) drawMark(ctx, m, viewRef.current)
        laid.current = { ids: marks.map((m) => m.id), view: viewRef.current, sig: `${rule}|${ruleInk}` }
      }
      drawWet()
    }
    window.addEventListener('resize', again)
    return () => window.removeEventListener('resize', again)
  }, [marks, rule, ruleInk, ground, drawMark, drawWet, fitCanvas])

  return (
    <>
      <canvas ref={paper} className="pad-paper" />
      <canvas ref={live} className="pad-live" />
    </>
  )
}
