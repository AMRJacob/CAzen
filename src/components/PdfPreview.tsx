import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import { getDocument } from '../lib/pdf/pdfjs'
import { useDetailRender, usePageRender, usePageZoom } from '../lib/pdf/zoomPan'

/**
 * Look at a document before issuing it, in the app.
 *
 * It replaces opening a tab for it, which on a phone is two problems: the tab is built after the
 * PDF is, by which time Safari no longer counts it as something the person asked for and blocks it;
 * and a submittal package — a transmittal with the contractor's PDF behind it — is the one thing
 * worth reading through on the way out the door.
 *
 * A single page is a drawing, and behaves like one: zoom and pan with the same hand as the sheet
 * viewer. More than one page is a document, and behaves like one: the pages run down the screen
 * and you scroll, because stepping through a section of a project manual one page at a time to
 * see whether it is the right set of pages is slower than simply looking at them.
 */
export function PdfPreview({ bytes, title, onClose, onDownload, step, extra, flag }: {
  bytes: Uint8Array
  title: string
  onClose: () => void
  onDownload?: () => void
  /** Move to the next or previous document in a list — a page of an upload being named. */
  step?: { label: string; onPrev?: () => void; onNext?: () => void }
  /** A strip under the bar: fields that belong with the document being looked at. */
  extra?: React.ReactNode
  /** A short word against a page in the rail, where the caller knows something about it. */
  flag?: (page: number) => string | null
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const pageEl = useRef<HTMLDivElement>(null)
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [page, setPage] = useState<PDFPageProxy | null>(null)
  const [number, setNumber] = useState(1)
  const [aspect, setAspect] = useState(8.5 / 11)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /** More than one page reads as a document: pages down the screen, scrolled rather than paged. */
  const [pages, setPages] = useState(1)
  const many = pages > 1
  /** How wide the pages are drawn in the scrolling view, as a multiple of fitting the width. */
  const [wide, setWide] = useState(1)
  const [goTo, setGoTo] = useState<{ page: number; nonce: number } | null>(null)

  const { zoom, width, height, fit, zoomAbout, view } = usePageZoom(scroller, pageEl, aspect)
  usePageRender(canvas, page, width, zoom, !busy)
  // Past the point where one canvas can hold the whole sheet sharply, the part on screen is
  // drawn again from the original vectors over the top of it.
  const detail = useRef<HTMLCanvasElement>(null)
  useDetailRender(detail, scroller, view, page, width, !busy)

  // pdf.js takes the buffer over, so it gets a copy: the caller still needs these bytes to save
  // and to download.
  useEffect(() => {
    let cancelled = false
    const task = getDocument({ data: bytes.slice() })
    task.promise.then(
      (doc) => { if (!cancelled) setPdf(doc) },
      (e: unknown) => { if (!cancelled) { setError(e instanceof Error ? e.message : String(e)); setBusy(false) } },
    )
    return () => { cancelled = true; task.destroy() }
  }, [bytes])

  useEffect(() => {
    if (!pdf) return
    let cancelled = false
    setBusy(true)
    pdf.getPage(Math.min(number, pdf.numPages)).then((p) => {
      if (cancelled) return
      const vp = p.getViewport({ scale: 1 })
      setAspect(vp.width / vp.height)
      setPage(p)
      setBusy(false)
      requestAnimationFrame(fit)
    }, (e: unknown) => { if (!cancelled) { setError(e instanceof Error ? e.message : String(e)); setBusy(false) } })
    return () => { cancelled = true }
  }, [pdf, number])

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
      // Typing in the strip under the bar owns its own arrow keys.
      const on = e.target as HTMLElement | null
      if (on && on.closest('input, textarea, select')) return
      if (e.key === 'ArrowRight') {
        if (number < pages) { setNumber(number + 1); setGoTo({ page: number + 1, nonce: Date.now() }) }
        else step?.onNext?.()
      } else if (number > 1) { setNumber(number - 1); setGoTo({ page: number - 1, nonce: Date.now() }) }
      else step?.onPrev?.()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [pdf, number, onClose, step])

  useEffect(() => { setPages(pdf?.numPages ?? 1) }, [pdf])

  const jump = (n: number) => { setNumber(n); setGoTo({ page: n, nonce: Date.now() }) }

  return (
    <div className="sheet-viewer" role="dialog" aria-label={`Preview of ${title}`}>
      <div className="sv-bar">
        <div className="sv-title"><span className="sv-name">{title}</span></div>
        {pages > 1 && (
          <div className="sv-bar-group">
            <button className="icon" disabled={number <= 1} onClick={() => jump(number - 1)} aria-label="Previous page">‹</button>
            <span className="muted small nowrap">Page {number} of {pages}</span>
            <button className="icon" disabled={number >= pages} onClick={() => jump(number + 1)} aria-label="Next page">›</button>
          </div>
        )}
        {step && (
          <div className="sv-bar-group">
            <button className="icon" disabled={!step.onPrev} onClick={step.onPrev} aria-label="Previous sheet">‹</button>
            <span className="muted small nowrap">{step.label}</span>
            <button className="icon" disabled={!step.onNext} onClick={step.onNext} aria-label="Next sheet">›</button>
          </div>
        )}
        <div className="sv-bar-group sv-inline-tools">
          <span className="sv-sep" />
          <button className="icon" aria-label="Zoom out"
            onClick={() => (many ? setWide((w) => Math.max(0.4, w / 1.25)) : zoomAbout(1 / 1.5))}>−</button>
          <button title="Fit to the screen" onClick={() => (many ? setWide(1) : fit())}>
            {Math.round((many ? wide : zoom) * 100)}%
          </button>
          <button className="icon" aria-label="Zoom in"
            onClick={() => (many ? setWide((w) => Math.min(6, w * 1.25)) : zoomAbout(1.5))}>+</button>
        </div>
        <div className="sv-bar-group">
          {onDownload && <button onClick={onDownload}>Download</button>}
          <button onClick={onClose} aria-label="Close the preview">Close</button>
        </div>
      </div>
      {extra && <div className="pv-strip">{extra}</div>}
      <div className="sv-body">
        {many && <PageRail pdf={pdf} pages={pages} at={number} onPick={jump} flag={flag} />}
        {many ? (
          <ScrollPages pdf={pdf} pages={pages} wide={wide} at={number} onAt={setNumber} goTo={goTo} />
        ) : (
          <div className="sv-scroll" ref={scroller}>
            {busy && <p className="muted sv-msg">Drawing the page…</p>}
            {error && <div className="notice error sv-msg">{error}</div>}
            <div ref={pageEl} className="sv-page" style={{ width, height, visibility: busy && !page ? 'hidden' : 'visible' }}>
              <canvas ref={canvas} style={{ width: '100%', height: '100%' }} />
              <canvas ref={detail} className="sv-detail" />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Every page of the document down the side, so a multi-page document can be taken in at once.
 *
 * Paging through with arrows answers "what is on page 4"; it does not answer "is this the right
 * set of pages", which is the question somebody actually has when they have just joined two
 * sections of a project manual together. A rail answers that in a glance, and doubles as the way
 * to jump about.
 *
 * Pages are drawn one at a time, in order, and kept — a section is a handful of pages and a
 * submittal package is rarely more, so there is nothing to be gained by being clever about it.
 */
function PageRail({ pdf, pages, at, onPick, flag }: {
  pdf: PDFDocumentProxy | null
  pages: number
  at: number
  onPick: (n: number) => void
  flag?: (page: number) => string | null
}) {
  const [shots, setShots] = useState<Record<number, string>>({})
  const here = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setShots({})
    if (!pdf) return
    let stop = false
    ;(async () => {
      for (let n = 1; n <= pdf.numPages; n++) {
        if (stop) return
        try {
          const p = await pdf.getPage(n)
          const base = p.getViewport({ scale: 1 })
          const vp = p.getViewport({ scale: 150 / base.width })
          const c = document.createElement('canvas')
          c.width = Math.max(1, Math.floor(vp.width))
          c.height = Math.max(1, Math.floor(vp.height))
          await p.render({ canvas: c, canvasContext: c.getContext('2d')!, viewport: vp }).promise
          if (stop) return
          const url = c.toDataURL('image/png')
          setShots((s) => ({ ...s, [n]: url }))
        } catch { /* a page that won't draw just has no picture in the rail */ }
      }
    })()
    return () => { stop = true }
  }, [pdf])

  // Keep the page being read in view when the arrows or the keyboard move it.
  useEffect(() => {
    const el = here.current
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [at])

  return (
    <div className="pv-rail" aria-label={`${pages} pages`}>
      {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
        <button key={n} ref={n === at ? here : undefined}
          className={`pv-rail-page${n === at ? ' on' : ''}`}
          aria-label={`Page ${n}`} aria-current={n === at}
          onClick={() => onPick(n)}>
          {shots[n] ? <img src={shots[n]} alt="" /> : <span className="pv-rail-wait" />}
          <span className="pv-rail-n">{n}</span>
          {flag?.(n) && <span className="pv-rail-flag">{flag(n)}</span>}
        </button>
      ))}
    </div>
  )
}

/** How many pixels one page of the scrolling view may have, to stay inside what Safari will draw. */
const MAX_PAGE_PIXELS = 12_000_000

/**
 * The pages of a document, down the screen.
 *
 * A page is drawn when it comes near the screen and kept afterwards, because a document is read
 * forwards and backwards and redrawing on every pass is the thing that makes a web PDF reader
 * feel worse than a native one. Each page keeps its own size, so a manual with a landscape
 * schedule in the middle of it lays out correctly rather than stretching.
 */
function ScrollPages({ pdf, pages, wide, at, onAt, goTo }: {
  pdf: PDFDocumentProxy | null
  pages: number
  /** A multiple of fitting the column width. */
  wide: number
  at: number
  onAt: (n: number) => void
  goTo: { page: number; nonce: number } | null
}) {
  const box = useRef<HTMLDivElement>(null)
  const slots = useRef(new Map<number, HTMLDivElement>())
  const [column, setColumn] = useState(900)
  const [sizes, setSizes] = useState<Record<number, number>>({})   // aspect per page
  const drawn = useRef(new Set<string>())

  // The width available to a page, which is what "100%" means here.
  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setColumn(Math.max(240, el.clientWidth - 48))
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [])

  useEffect(() => { drawn.current.clear() }, [pdf, wide])

  // Draw a page when it is near the screen, and leave it drawn.
  useEffect(() => {
    if (!pdf || !box.current) return
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    const width = column * wide

    const paint = async (n: number) => {
      const key = `${n}@${Math.round(width)}`
      if (drawn.current.has(key)) return
      drawn.current.add(key)
      const slot = slots.current.get(n)
      if (!slot) return
      try {
        const p = await pdf.getPage(n)
        const base = p.getViewport({ scale: 1 })
        setSizes((s) => (s[n] ? s : { ...s, [n]: base.width / base.height }))
        const budget = Math.sqrt(MAX_PAGE_PIXELS / (base.width * base.height))
        const vp = p.getViewport({ scale: Math.min((width * ratio) / base.width, budget) })
        const c = document.createElement('canvas')
        c.width = Math.max(1, Math.floor(vp.width))
        c.height = Math.max(1, Math.floor(vp.height))
        await p.render({ canvas: c, canvasContext: c.getContext('2d')!, viewport: vp }).promise
        c.style.width = '100%'
        c.style.height = '100%'
        c.style.display = 'block'
        slot.replaceChildren(c)
      } catch {
        drawn.current.delete(key)
      }
    }

    const near = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const n = Number((e.target as HTMLElement).dataset.page)
        if (e.isIntersecting && n) void paint(n)
      }
    }, { root: box.current, rootMargin: '600px 0px' })

    // Whichever page covers the middle of the screen is the one being read.
    const reading = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const n = Number((e.target as HTMLElement).dataset.page)
        if (e.isIntersecting && n) onAt(n)
      }
    }, { root: box.current, rootMargin: '-45% 0px -45% 0px' })

    for (const el of slots.current.values()) { near.observe(el); reading.observe(el) }
    return () => { near.disconnect(); reading.disconnect() }
  }, [pdf, pages, column, wide, onAt])

  // A jump from the rail, the arrows or the keyboard.
  useEffect(() => {
    if (!goTo) return
    slots.current.get(goTo.page)?.scrollIntoView({ block: 'start', behavior: 'auto' })
  }, [goTo])

  const width = column * wide
  return (
    <div className="pv-pages" ref={box}>
      {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
        <div
          key={n}
          data-page={n}
          className={`pv-page${n === at ? ' on' : ''}`}
          style={{ width, height: width / (sizes[n] ?? 8.5 / 11) }}
          ref={(el) => {
            if (el) slots.current.set(n, el)
            else slots.current.delete(n)
          }}
        />
      ))}
    </div>
  )
}
