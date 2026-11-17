import { useCallback, useEffect, useRef, useState } from 'react'
import type { PDFPageProxy } from 'pdfjs-dist'

const MIN_ZOOM = 1
const MAX_ZOOM = 8
export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

/**
 * Fit a page to the room there is, and let fingers move it: one to pan (left to the browser, which
 * does it better), two to zoom about the point between them, a double tap to zoom in on whatever it
 * landed on.
 *
 * Whatever is in the middle of the view is kept in the middle of it through every change of size.
 * That is what a zoom should do anyway, and it is also what a folding phone needs: unfolding one
 * re-lays out the page with no reload and no event to say what happened, so the only sound response
 * is to re-fit to the new size and hold the reader's place while doing it.
 *
 * The caller owns the scrolling element and the page inside it; this returns the size to draw the
 * page at and the handlers to wire up.
 */
export function usePageZoom(scroller: React.RefObject<HTMLDivElement | null>, aspect: number) {
  const [fitWidth, setFitWidth] = useState(1000)
  const [zoom, setZoom] = useState(1)
  /** The middle of the view, as a fraction of the whole page. */
  const centre = useRef({ x: 0.5, y: 0.5 })
  /** The zoom as the gesture handlers below see it; they outlive any one render. */
  const zoomRef = useRef(zoom)
  useEffect(() => { zoomRef.current = zoom }, [zoom])

  const width = fitWidth * zoom
  const height = width / aspect

  // Fit to the element's content box, whatever padding the stylesheet gives it at this size.
  useEffect(() => {
    const fit = () => {
      const el = scroller.current
      if (!el) return
      const style = getComputedStyle(el)
      const gutter = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0)
      const vGutter = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0)
      setFitWidth(Math.max(320, Math.min(el.clientWidth - gutter, (el.clientHeight - vGutter) * aspect)))
    }
    fit()
    window.addEventListener('resize', fit)
    window.addEventListener('orientationchange', fit)
    return () => {
      window.removeEventListener('resize', fit)
      window.removeEventListener('orientationchange', fit)
    }
  }, [aspect, scroller])

  const recentre = useCallback(() => {
    const el = scroller.current
    if (!el || !el.scrollWidth) return
    el.scrollLeft = centre.current.x * el.scrollWidth - el.clientWidth / 2
    el.scrollTop = centre.current.y * el.scrollHeight - el.clientHeight / 2
  }, [scroller])

  useEffect(recentre, [width, height, recentre])

  /** Remember where the reader is looking, so the next re-size can put it back. */
  const onScroll = useCallback(() => {
    const el = scroller.current
    if (!el || !el.scrollWidth || !el.scrollHeight) return
    centre.current = {
      x: (el.scrollLeft + el.clientWidth / 2) / el.scrollWidth,
      y: (el.scrollTop + el.clientHeight / 2) / el.scrollHeight,
    }
  }, [scroller])

  // Touch gestures. Registered by hand rather than through React because the two-finger case has
  // to be able to stop the browser scrolling or zooming the whole page along with it.
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    let startGap = 0
    let startZoom = 1
    let lastTap = 0
    const gap = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const pointAt = (clientX: number, clientY: number) => {
      const r = el.getBoundingClientRect()
      return {
        x: (el.scrollLeft + (clientX - r.left)) / Math.max(1, el.scrollWidth),
        y: (el.scrollTop + (clientY - r.top)) / Math.max(1, el.scrollHeight),
      }
    }

    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        startGap = gap(e.touches)
        startZoom = zoomRef.current
        return
      }
      if (e.touches.length !== 1) return
      // A tap on a link is a tap on a link, not half of a zoom.
      if ((e.target as HTMLElement).closest('.sv-link, .sv-pop')) { lastTap = 0; return }
      const t = e.touches[0]
      const now = Date.now()
      if (now - lastTap < 300) {
        lastTap = 0
        centre.current = pointAt(t.clientX, t.clientY)
        setZoom((z) => (z > 1.2 ? MIN_ZOOM : clampZoom(2.5)))
        e.preventDefault()
      } else {
        lastTap = now
      }
    }
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !startGap) return
      e.preventDefault()
      centre.current = pointAt(
        (e.touches[0].clientX + e.touches[1].clientX) / 2,
        (e.touches[0].clientY + e.touches[1].clientY) / 2,
      )
      setZoom(clampZoom(startZoom * (gap(e.touches) / startGap)))
    }
    const onEnd = (e: TouchEvent) => { if (e.touches.length < 2) startGap = 0 }

    el.addEventListener('touchstart', onStart, { passive: false })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [scroller])

  return {
    zoom,
    setZoom,
    width,
    height,
    centre,
    onScroll,
    recentre,
    fit: useCallback(() => setZoom(MIN_ZOOM), []),
    zoomIn: useCallback(() => setZoom((z) => clampZoom(z * 1.5)), []),
    zoomOut: useCallback(() => setZoom((z) => clampZoom(z / 1.5)), []),
  }
}

/**
 * Draw a PDF page into a canvas at a given width, a moment after that width settles. The canvas is
 * already stretched to the new size by the time this runs, so the page scales on screen at once and
 * sharpens just after; waiting keeps a pinch smooth instead of starting a render on every frame.
 */
export function usePageRender(
  canvas: React.RefObject<HTMLCanvasElement | null>,
  page: PDFPageProxy | null,
  width: number,
  ready: boolean,
) {
  useEffect(() => {
    if (!page || !ready || !canvas.current) return
    let task: { cancel: () => void } | null = null
    const timer = window.setTimeout(() => {
      const base = page.getViewport({ scale: 1 })
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      const scale = Math.min((width * ratio) / base.width, 9000 / base.width)
      const vp = page.getViewport({ scale })
      const c = canvas.current
      if (!c) return
      c.width = vp.width
      c.height = vp.height
      const t = page.render({ canvas: c, canvasContext: c.getContext('2d')!, viewport: vp })
      task = t
      t.promise.catch(() => {})
    }, 90)
    return () => { window.clearTimeout(timer); task?.cancel() }
  }, [page, ready, width, canvas])
}
