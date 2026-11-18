import { useCallback, useEffect, useRef, useState } from 'react'
import type { PDFPageProxy } from 'pdfjs-dist'

const MIN_ZOOM = 0.25
const MAX_ZOOM = 8
export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

/** How much of the sheet must stay on screen, so it can't be flung out of sight. */
const KEEP_ON_SCREEN = 0.25

export interface View { x: number; y: number; zoom: number }

/**
 * Moving a drawing around: one finger or the mouse drags it, two fingers or the wheel zoom it.
 *
 * The sheet is moved by a transform rather than by scrolling it. Scrolling was the obvious way and
 * it was the wrong one for three reasons, all of which this fixes at once:
 *
 *  - It was not smooth. Changing the drawn size of a very large canvas every frame makes the
 *    browser lay out and repaint it each time; a transform is handed to the compositor and costs
 *    the main thread nothing.
 *  - There was nothing to pan once the sheet fit the screen, because a scroller with no overflow
 *    does not scroll. A transform has no such edge: the sheet can be moved wherever is useful,
 *    zoomed in or out.
 *  - Zooming out past the fit was impossible for the same reason. It is often what you want on a
 *    phone — the whole sheet, small, to find your place on it.
 *
 * The canvas is redrawn at the new scale once the movement settles. Until it does, the browser
 * scales the pixels it already has, which is why a pinch looks continuous.
 */
export function usePageZoom(
  viewport: React.RefObject<HTMLDivElement | null>,
  page: React.RefObject<HTMLDivElement | null>,
  aspect: number,
) {
  const [fitWidth, setFitWidth] = useState(1000)
  const [zoom, setZoom] = useState(1)
  /** Where the sheet sits, in pixels, before this render has been committed. */
  const view = useRef<View>({ x: 0, y: 0, zoom: 1 })
  const frame = useRef(0)

  const width = fitWidth
  const height = fitWidth / aspect

  /** Put the transform on the element now, without waiting for React. */
  const paint = useCallback(() => {
    const el = page.current
    if (!el) return
    const v = view.current
    el.style.transform = `translate3d(${v.x}px, ${v.y}px, 0) scale(${v.zoom})`
  }, [page])

  const schedule = useCallback(() => {
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      paint()
    })
  }, [paint])

  /** Keep enough of the sheet on screen to grab hold of. */
  const contain = useCallback(() => {
    const box = viewport.current?.getBoundingClientRect()
    if (!box) return
    const v = view.current
    const w = width * v.zoom
    const h = (width / aspect) * v.zoom
    const slackX = box.width - w * KEEP_ON_SCREEN
    const slackY = box.height - h * KEEP_ON_SCREEN
    v.x = Math.min(slackX, Math.max(-w + box.width * KEEP_ON_SCREEN, v.x))
    v.y = Math.min(slackY, Math.max(-h + box.height * KEEP_ON_SCREEN, v.y))
  }, [viewport, width, aspect])

  /** Centre the sheet at its current zoom. */
  const centre = useCallback(() => {
    const box = viewport.current?.getBoundingClientRect()
    if (!box) return
    const v = view.current
    v.x = (box.width - width * v.zoom) / 2
    v.y = (box.height - (width / aspect) * v.zoom) / 2
    paint()
  }, [viewport, width, aspect, paint])

  /** Zoom about a point on the screen, so whatever is under it stays under it. */
  const zoomAbout = useCallback((factor: number, clientX?: number, clientY?: number) => {
    const box = viewport.current?.getBoundingClientRect()
    if (!box) return
    const v = view.current
    const next = clampZoom(v.zoom * factor)
    const applied = next / v.zoom
    const px = (clientX ?? box.left + box.width / 2) - box.left
    const py = (clientY ?? box.top + box.height / 2) - box.top
    v.x = px - (px - v.x) * applied
    v.y = py - (py - v.y) * applied
    v.zoom = next
    contain()
    schedule()
    setZoom(next)
  }, [viewport, contain, schedule])

  const moveBy = useCallback((dx: number, dy: number) => {
    view.current.x += dx
    view.current.y += dy
    contain()
    schedule()
  }, [contain, schedule])

  /** Fit the sheet to the room there is, and put it in the middle. */
  const fit = useCallback(() => {
    const box = viewport.current?.getBoundingClientRect()
    if (!box) return
    view.current.zoom = 1
    setZoom(1)
    const w = Math.max(240, Math.min(box.width - 24, (box.height - 24) * aspect))
    setFitWidth(w)
    // Centre against the size about to be applied, not the one on screen.
    view.current.x = (box.width - w) / 2
    view.current.y = (box.height - w / aspect) / 2
    schedule()
  }, [viewport, aspect, schedule])

  // Re-fit when the window changes shape — which is also what a folding phone does, with no
  // reload and no event to say so.
  useEffect(() => {
    fit()
    const onResize = () => fit()
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [fit])

  useEffect(() => { paint() }, [paint, width, height])

  // Drag to pan, wheel to zoom, two fingers to pinch. All on the viewport, all by hand, because
  // these have to be able to stop the browser doing its own thing with the same gesture.
  useEffect(() => {
    const el = viewport.current
    if (!el) return
    let dragging: { x: number; y: number; id: number } | null = null
    let pinch: { gap: number; zoom: number } | null = null

    /**
     * Somewhere a drag means something other than moving the sheet.
     *
     * Marking up is two different jobs sharing a screen. A drawing tool is drawing, so a drag
     * over the sheet is a stroke; Select is not, so a drag over the sheet is the sheet moving —
     * which is what makes the drawing still feel like a drawing while the tools are out. The
     * things Select can take hold of are listed too, so dragging a handle resizes rather than
     * pans.
     */
    const drawingHere = (target: EventTarget | null) =>
      (target as HTMLElement | null)?.closest(
        '.mk-layer.on:not(.picking), .mk-pickable, .mk-handle, .sv-page.linking, .sv-link, .sv-pop, .mk-note, .mk-palette')

    // Holding space turns any tool into a hand for as long as it's held, as drawing apps do.
    let spaceHeld = false
    const keyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || (e.target as HTMLElement)?.closest('input, textarea, select')) return
      spaceHeld = true
      el.classList.add('hand')
    }
    const keyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      spaceHeld = false
      el.classList.remove('hand')
    }

    const down = (e: PointerEvent) => {
      if (e.button !== 0 && e.button !== 1) return
      // The middle button is never drawing, and space says to move the sheet whatever is in hand.
      if (e.button !== 1 && !spaceHeld && drawingHere(e.target)) return
      dragging = { x: e.clientX, y: e.clientY, id: e.pointerId }
      el.classList.add('dragging')
    }
    const move = (e: PointerEvent) => {
      if (!dragging || e.pointerId !== dragging.id || pinch) return
      moveBy(e.clientX - dragging.x, e.clientY - dragging.y)
      dragging = { ...dragging, x: e.clientX, y: e.clientY }
      el.setPointerCapture?.(e.pointerId)
    }
    const up = () => { dragging = null; el.classList.remove('dragging') }

    const wheel = (e: WheelEvent) => {
      if (!e.deltaY) return
      e.preventDefault()
      const step = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
      zoomAbout(Math.exp(-step / 400), e.clientX, e.clientY)
    }

    const gap = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const mid = (t: TouchList) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 })
    let lastMid = { x: 0, y: 0 }
    let lastTap = 0

    const touchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        if (drawingHere(e.target)) return
        e.preventDefault()
        dragging = null
        pinch = { gap: gap(e.touches), zoom: view.current.zoom }
        lastMid = mid(e.touches)
        return
      }
      if (e.touches.length !== 1 || drawingHere(e.target)) return
      const now = Date.now()
      if (now - lastTap < 300) {
        lastTap = 0
        e.preventDefault()
        const t = e.touches[0]
        zoomAbout(view.current.zoom > 1.2 ? 1 / view.current.zoom : 2.5, t.clientX, t.clientY)
      } else {
        lastTap = now
      }
    }
    const touchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinch) return
      e.preventDefault()
      const m = mid(e.touches)
      // Two fingers move the sheet as well as scale it, which is what makes it feel attached.
      moveBy(m.x - lastMid.x, m.y - lastMid.y)
      lastMid = m
      zoomAbout((gap(e.touches) / pinch.gap) * (pinch.zoom / view.current.zoom), m.x, m.y)
    }
    const touchEnd = (e: TouchEvent) => { if (e.touches.length < 2) pinch = null }

    // Safari handles pinch above touch events; preventing these is what stops it zooming the page.
    const gesture = (e: Event) => e.preventDefault()

    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('wheel', wheel, { passive: false })
    el.addEventListener('touchstart', touchStart, { passive: false })
    el.addEventListener('touchmove', touchMove, { passive: false })
    el.addEventListener('touchend', touchEnd)
    el.addEventListener('gesturestart', gesture, { passive: false })
    el.addEventListener('gesturechange', gesture, { passive: false })
    return () => {
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('keyup', keyUp)
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('wheel', wheel)
      el.removeEventListener('touchstart', touchStart)
      el.removeEventListener('touchmove', touchMove)
      el.removeEventListener('touchend', touchEnd)
      el.removeEventListener('gesturestart', gesture)
      el.removeEventListener('gesturechange', gesture)
    }
  }, [viewport, moveBy, zoomAbout])

  /** Put a point on the sheet (0–1) in the middle of the view, at a given zoom. */
  const showPoint = useCallback((fx: number, fy: number, atZoom?: number) => {
    const box = viewport.current?.getBoundingClientRect()
    if (!box) return
    const v = view.current
    if (atZoom) { v.zoom = clampZoom(atZoom); setZoom(v.zoom) }
    v.x = box.width / 2 - fx * width * v.zoom
    v.y = box.height / 2 - fy * (width / aspect) * v.zoom
    contain()
    paint()
  }, [viewport, width, aspect, contain, paint])

  return { zoom, width, height, fit, centre, zoomAbout, showPoint, view }
}

/** How many pixels a canvas may have. Past this, Safari on a phone quietly gives up and draws nothing. */
const MAX_CANVAS_PIXELS = 16_000_000

/**
 * Draw a PDF page into a canvas at the size it is being shown, a moment after that size settles.
 *
 * The cap matters more than it looks: a D-size sheet at 400% on a 3x screen asks for something
 * near 80 megapixels, and rather than being slow, Safari returns a blank canvas. Holding the area
 * down keeps the drawing on screen — at the cost of sharpness past the point where the cap bites,
 * which is what the detail layer below exists to give back.
 */
export function usePageRender(
  canvas: React.RefObject<HTMLCanvasElement | null>,
  page: PDFPageProxy | null,
  cssWidth: number,
  zoom: number,
  ready: boolean,
) {
  useEffect(() => {
    if (!page || !ready || !canvas.current) return
    let task: { cancel: () => void } | null = null
    const timer = window.setTimeout(() => {
      const base = page.getViewport({ scale: 1 })
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      const wanted = (cssWidth * Math.max(1, zoom) * ratio) / base.width
      const budget = Math.sqrt(MAX_CANVAS_PIXELS / (base.width * base.height))
      const vp = page.getViewport({ scale: Math.min(wanted, budget) })
      const c = canvas.current
      if (!c) return
      c.width = Math.floor(vp.width)
      c.height = Math.floor(vp.height)
      const t = page.render({ canvas: c, canvasContext: c.getContext('2d')!, viewport: vp })
      task = t
      t.promise.catch(() => {})
    }, 140)
    return () => { window.clearTimeout(timer); task?.cancel() }
  }, [page, ready, cssWidth, zoom, canvas])
}

/**
 * The part of the sheet you are actually looking at, drawn again at full resolution.
 *
 * A PDF is vector, but a browser shows it by rasterising it to a canvas, and a canvas has a
 * pixel budget — past about sixteen megapixels Safari stops drawing altogether. A D-size sheet
 * at 800% on a retina screen would want a quarter of a billion pixels, so the whole-page canvas
 * is drawn at the cap and stretched, which is exactly what pixellation at high zoom is.
 *
 * The fix is not a bigger canvas but a smaller piece of paper: once the zoom passes what the
 * whole page can be drawn at, the visible rectangle alone is re-rendered from the original
 * vectors at the resolution of the screen, and laid over the stretched page. What is off screen
 * costs nothing, so the budget is spent entirely on what is being read.
 *
 * It redraws after movement stops rather than during it, so panning stays on the compositor.
 * The stretched page underneath means there is never a blank area while that happens.
 */
export function useDetailRender(
  detail: React.RefObject<HTMLCanvasElement | null>,
  box: React.RefObject<HTMLElement | null>,
  view: React.RefObject<View>,
  page: PDFPageProxy | null,
  cssWidth: number,
  ready: boolean,
) {
  useEffect(() => {
    if (!page || !ready) return
    let task: { cancel: () => void } | null = null
    let drawnFor = ''
    let settleAt = 0
    let last = ''

    const hide = () => {
      const c = detail.current
      if (c) c.style.display = 'none'
      drawnFor = ''
    }

    const tick = () => {
      const c = detail.current
      const area = box.current
      const v = view.current
      if (!c || !area || !v) return

      const base = page.getViewport({ scale: 1 })
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      const pageScale = cssWidth / base.width            // CSS px per PDF point at 100%
      const wanted = pageScale * v.zoom * ratio          // device px per PDF point now
      const budget = Math.sqrt(MAX_CANVAS_PIXELS / (base.width * base.height))
      // Below the cap the whole page is already as sharp as the screen can show.
      if (wanted <= budget * 1.02) { if (drawnFor) hide(); return }

      const rect = area.getBoundingClientRect()
      const height = cssWidth / (base.width / base.height)
      // What of the page is on screen, in the page's own CSS pixels.
      const x0 = Math.max(0, (0 - v.x) / v.zoom)
      const y0 = Math.max(0, (0 - v.y) / v.zoom)
      const x1 = Math.min(cssWidth, (rect.width - v.x) / v.zoom)
      const y1 = Math.min(height, (rect.height - v.y) / v.zoom)
      if (x1 - x0 < 1 || y1 - y0 < 1) { if (drawnFor) hide(); return }

      // A margin, so a small pan doesn't fall off the edge of what was drawn.
      const padX = Math.min((x1 - x0) * 0.15, cssWidth - (x1 - x0))
      const padY = Math.min((y1 - y0) * 0.15, height - (y1 - y0))
      const left = Math.max(0, x0 - padX)
      const top = Math.max(0, y0 - padY)
      const right = Math.min(cssWidth, x1 + padX)
      const bottom = Math.min(height, y1 + padY)

      // Rounded, so a pan of two pixels isn't a reason to redraw a megapixel.
      const key = [Math.round(left), Math.round(top), Math.round(right), Math.round(bottom), v.zoom.toFixed(3)].join(',')
      const now = Date.now()
      if (key !== last) { last = key; settleAt = now; return }
      if (key === drawnFor || now - settleAt < 150) return

      const scale = Math.min(wanted, Math.sqrt(MAX_CANVAS_PIXELS / Math.max(1, ((right - left) / pageScale) * ((bottom - top) / pageScale))))
      const vp = page.getViewport({ scale })
      const sx = (left / pageScale) * scale
      const sy = (top / pageScale) * scale
      const w = Math.floor(((right - left) / pageScale) * scale)
      const h = Math.floor(((bottom - top) / pageScale) * scale)
      if (w < 1 || h < 1) return

      task?.cancel()
      c.width = w
      c.height = h
      c.style.display = 'block'
      c.style.left = `${left}px`
      c.style.top = `${top}px`
      c.style.width = `${right - left}px`
      c.style.height = `${bottom - top}px`
      drawnFor = key
      const t = page.render({
        canvas: c,
        canvasContext: c.getContext('2d')!,
        viewport: vp,
        // Slide the page under the canvas so only this rectangle lands on it.
        transform: [1, 0, 0, 1, -sx, -sy],
      })
      task = t
      t.promise.catch(() => { if (drawnFor === key) drawnFor = '' })
    }

    const timer = window.setInterval(tick, 120)
    return () => { window.clearInterval(timer); task?.cancel(); hide() }
  }, [page, ready, cssWidth, detail, box, view])
}
