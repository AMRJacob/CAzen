import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'

/**
 * Every page of a document, one under another, to be read by scrolling.
 *
 * For a section of the project manual: each page is still its own sheet, the size it had when
 * pages were shown one at a time (the whole page fitted to the window), with the next one
 * under it. Only the pages on or near the screen are drawn. The wheel and a finger scroll;
 * Ctrl + wheel, a pinch, and the − / + buttons change the size of every page together.
 */
/** A box on one page, as fractions of it, that can be moved and resized (where a figure was read). */
export interface StripMark { page: number; x: number; y: number; w: number; h: number; /** Changed to bring the box into view again. */ ask?: number }

export function PdfStrip({ pdf, zoom, onZoom, onPage, goTo, mark, onMark }: {
  mark?: StripMark | null
  /** The box moved or resized; without it the box is only shown. */
  onMark?: (m: StripMark) => void
  pdf: PDFDocumentProxy
  /** 1 is the whole page fitted to the window. */
  zoom: number
  onZoom: (z: number) => void
  /** The page most of the screen is showing, as it changes. */
  onPage: (n: number) => void
  /** Ask for a page to be brought to the top: the number and a counter that changes each ask. */
  goTo: { page: number; ask: number }
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 800, h: 1000 })
  const [aspects, setAspects] = useState<number[]>([])
  const [near, setNear] = useState<Set<number>>(new Set([1, 2]))
  const pages = pdf.numPages

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Each page's own shape, so a landscape sheet in a portrait section is not squeezed.
  useEffect(() => {
    let gone = false
    void (async () => {
      const out: number[] = []
      for (let n = 1; n <= pages; n++) {
        const p = await pdf.getPage(n)
        const vp = p.getViewport({ scale: 1 })
        out.push(vp.width / vp.height)
        if (gone) return
        if (n === 1 || n % 12 === 0 || n === pages) setAspects([...out])
      }
    })()
    return () => { gone = true }
  }, [pdf, pages])

  const sizeOf = (n: number) => {
    const a = aspects[n - 1] ?? aspects[0] ?? 8.5 / 11
    // The whole page inside the window, as it was when one page was shown at a time.
    const h = Math.min(box.h - 2 * GAP, (box.w - 2 * GAP) / a)
    return { w: Math.max(40, h * a * zoom), h: Math.max(40, h * zoom) }
  }

  // Which pages are on or near the screen, and which one is being read.
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const see = () => {
      const top = el.scrollTop, bottom = top + el.clientHeight, mid = top + el.clientHeight * 0.4
      const next = new Set<number>()
      let reading = 1
      el.querySelectorAll<HTMLElement>('.ps-page').forEach((p) => {
        const n = Number(p.dataset.n), y0 = p.offsetTop, y1 = y0 + p.offsetHeight
        if (y1 > top - 1400 && y0 < bottom + 1400) next.add(n)
        if (y0 <= mid) reading = n
      })
      setNear((was) => (was.size === next.size && [...next].every((n) => was.has(n)) ? was : next))
      onPage(reading)
    }
    see()
    el.addEventListener('scroll', see, { passive: true })
    return () => el.removeEventListener('scroll', see)
  }, [onPage, aspects, box, zoom])

  // Each ask is answered once, as soon as its page is laid out (an ask made on opening waits for it).
  const answered = useRef(0)
  useEffect(() => {
    if (!goTo.ask || answered.current === goTo.ask) return
    const el = scroller.current
    const p = el?.querySelector<HTMLElement>(`.ps-page[data-n="${goTo.page}"]`)
    if (el && p) {
      // With a box on the page, bring the box to the middle of the window rather than the page's top.
      const y = mark && mark.page === goTo.page ? p.offsetTop + (mark.y + mark.h / 2) * p.offsetHeight - el.clientHeight / 2 : p.offsetTop - GAP
      const x = mark && mark.page === goTo.page ? p.offsetLeft + (mark.x + mark.w / 2) * p.offsetWidth - el.clientWidth / 2 : el.scrollLeft
      el.scrollTo({ top: Math.max(0, y), left: Math.max(0, x) }); answered.current = goTo.ask
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goTo.ask, aspects])

  // Ctrl + wheel and a pinch change the size, about the middle of the window, keeping the place.
  const zoomNow = useRef(zoom)
  // However the size was changed — a button, the wheel, a pinch — what was in the middle of the
  // window stays in the middle of it.
  const drawnAt = useRef(zoom)
  useLayoutEffect(() => {
    const el = scroller.current
    const k = zoom / drawnAt.current
    drawnAt.current = zoom
    zoomNow.current = zoom
    if (el && k !== 1) el.scrollTop = (el.scrollTop + el.clientHeight / 2) * k - el.clientHeight / 2
  }, [zoom])
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const set = (z: number) => {
      const next = Math.min(6, Math.max(0.4, z))
      if (next === zoomNow.current) return
      zoomNow.current = next
      onZoom(next)
    }
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      set(zoomNow.current * Math.exp(-e.deltaY / 300))
    }
    let apart = 0, from = 1
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const start = (e: TouchEvent) => { if (e.touches.length === 2) { apart = dist(e.touches); from = zoomNow.current } }
    const move = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !apart) return
      e.preventDefault()
      set(from * dist(e.touches) / apart)
    }
    const end = () => { apart = 0 }
    el.addEventListener('wheel', wheel, { passive: false })
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    return () => { el.removeEventListener('wheel', wheel); el.removeEventListener('touchstart', start); el.removeEventListener('touchmove', move); el.removeEventListener('touchend', end) }
  }, [onZoom])

  return (
    <div className="ps-scroll" ref={scroller}>
      {Array.from({ length: pages }, (_, i) => i + 1).map((n) => {
        const s = sizeOf(n)
        return (
          <div key={n} className="ps-page" data-n={n} style={{ width: s.w, height: s.h }}>
            {near.has(n) && <PageCanvas pdf={pdf} n={n} width={s.w} />}
            {mark && mark.page === n && <MarkBox mark={mark} onMark={onMark} />}
          </div>
        )
      })}
    </div>
  )
}

const GAP = 12

/** The box over its page: drag inside it to move it, drag a corner to size it. */
function MarkBox({ mark, onMark }: { mark: StripMark; onMark?: (m: StripMark) => void }) {
  const start = (how: 'move' | 'nw' | 'ne' | 'sw' | 'se') => (e: React.PointerEvent) => {
    if (!onMark) return
    e.preventDefault(); e.stopPropagation()
    const page = (e.currentTarget as HTMLElement).closest('.ps-page') as HTMLElement
    const r = page.getBoundingClientRect()
    const from = { x: e.clientX, y: e.clientY }, was = { ...mark }
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - from.x) / r.width, dy = (ev.clientY - from.y) / r.height
      let { x, y, w, h } = was
      if (how === 'move') { x += dx; y += dy }
      if (how === 'nw' || how === 'sw') { x += dx; w -= dx }
      if (how === 'ne' || how === 'se') w += dx
      if (how === 'nw' || how === 'ne') { y += dy; h -= dy }
      if (how === 'sw' || how === 'se') h += dy
      const min = 0.004
      if (w < min) { if (how === 'nw' || how === 'sw') x -= min - w; w = min }
      if (h < min) { if (how === 'nw' || how === 'ne') y -= min - h; h = min }
      onMark({ page: was.page, ask: was.ask, x: Math.max(0, Math.min(1 - w, x)), y: Math.max(0, Math.min(1 - h, y)), w: Math.min(1, w), h: Math.min(1, h) })
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  return (
    <div className={`ps-mark${onMark ? ' live' : ''}`} onPointerDown={start('move')}
      style={{ left: `${mark.x * 100}%`, top: `${mark.y * 100}%`, width: `${mark.w * 100}%`, height: `${mark.h * 100}%` }}>
      {onMark && (['nw', 'ne', 'sw', 'se'] as const).map((c) => <span key={c} className={`ps-mark-h ${c}`} onPointerDown={start(c)} />)}
    </div>
  )
}

/** One page, drawn at the size it is shown; drawn again a moment after that size settles. */
function PageCanvas({ pdf, n, width }: { pdf: PDFDocumentProxy; n: number; width: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let gone = false
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null
    const t = window.setTimeout(async () => {
      try {
        const page = await pdf.getPage(n)
        if (gone) return
        const base = page.getViewport({ scale: 1 })
        const dpr = Math.min(3, window.devicePixelRatio || 1)
        // Sharp at the size shown, within what a phone will hold in one canvas.
        const scale = Math.min((width * dpr) / base.width, Math.sqrt(12_000_000 / (base.width * base.height)))
        const vp = page.getViewport({ scale })
        const off = document.createElement('canvas')
        off.width = Math.round(vp.width); off.height = Math.round(vp.height)
        task = page.render({ canvas: off, canvasContext: off.getContext('2d')!, viewport: vp })
        await task.promise
        const c = canvas.current
        if (gone || !c) return
        // Swapped in whole, so the page is never blank while it is drawn again.
        c.width = off.width; c.height = off.height
        c.getContext('2d')!.drawImage(off, 0, 0)
      } catch { /* cancelled, or a page that will not draw: left as paper */ }
    }, canvas.current?.width ? 220 : 0)
    return () => { gone = true; window.clearTimeout(t); task?.cancel() }
  }, [pdf, n, width])
  return <canvas ref={canvas} style={{ width: '100%', height: '100%', display: 'block' }} />
}
