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
 * worth paging through on the way out the door. Drawn with the same hand as the sheet viewer, so a
 * document zooms and pans exactly like a drawing does.
 */
/** The gap kept between a page's edge and the window's when reading through. */
const EDGE = 10

export function PdfPreview({ bytes, title, onClose, onDownload, step, extra, flow }: {
  /** Read straight through: the wheel moves down the page and on into the next one, and a page
   *  dragged past its end turns. The arrows stay. For a section of the project manual. */
  flow?: boolean
  bytes: Uint8Array
  title: string
  onClose: () => void
  onDownload?: () => void
  /** Move to the next or previous document in a list — a page of an upload being named. */
  step?: { label: string; onPrev?: () => void; onNext?: () => void }
  /** A strip under the bar: fields that belong with the document being looked at. */
  extra?: React.ReactNode
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
  // How the page now arriving was come to: read on into from the one before, or back into.
  const arrive = useRef<'top' | 'bottom' | null>(null)

  const { zoom, width, height, fit, zoomAbout, view } = usePageZoom(scroller, pageEl, aspect)
  usePageRender(canvas, page, width, !busy)
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
      const how = arrive.current
      arrive.current = null
      if (!how) { requestAnimationFrame(fit); return }
      // Read on into: keep the zoom and the place across the page, and start at the edge that
      // was come through — the top of the next page, the foot of the one before.
      requestAnimationFrame(() => {
        const box = scroller.current?.getBoundingClientRect(), el = pageEl.current
        if (!box || !el) return
        const v = view.current
        const h = (el.offsetWidth * vp.height / vp.width) * v.zoom
        v.y = h <= box.height ? (box.height - h) / 2 : how === 'top' ? EDGE : box.height - h - EDGE
        el.style.transform = `translate3d(${v.x}px, ${v.y}px, 0) scale(${v.zoom})`
        v.onMove?.()
      })
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
      const pages = pdf?.numPages ?? 1
      if (e.key === 'ArrowRight') {
        if (number < pages) setNumber(number + 1)
        else step?.onNext?.()
      } else if (number > 1) setNumber(number - 1)
      else step?.onPrev?.()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [pdf, number, onClose, step])

  const pages = pdf?.numPages ?? 1

  // Reading through. The wheel moves the page instead of zooming it (Ctrl + wheel and a pinch
  // still zoom); at the foot it carries on into the next page, at the head back into the last.
  const body = useRef<HTMLDivElement>(null)
  const turn = useRef({ push: 0, at: 0, last: 0 })
  useEffect(() => {
    const el = body.current
    if (!flow || !el) return
    const go = (dir: 1 | -1) => {
      const t = turn.current
      const now = performance.now()
      if (now - t.last < 380) return false
      const next = number + dir
      if (next < 1 || next > pages) return false
      t.last = now; t.push = 0
      arrive.current = dir > 0 ? 'top' : 'bottom'
      setNumber(next)
      return true
    }
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey || !e.deltaY || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      const box = scroller.current?.getBoundingClientRect(), pg = pageEl.current
      if (!box || !pg) return
      e.preventDefault(); e.stopPropagation()
      const v = view.current
      const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * box.height : e.deltaY
      const h = pg.offsetHeight * v.zoom
      // A page shorter than the window has nowhere to move: it stays put and only turns.
      const top = h <= box.height ? v.y : EDGE, bottom = h <= box.height ? v.y : box.height - h - EDGE
      const want = v.y - d
      const y = Math.min(top, Math.max(bottom, want))
      const t = turn.current, now = performance.now()
      if (y !== v.y) {
        v.y = y; t.push = 0
        pg.style.transform = `translate3d(${v.x}px, ${v.y}px, 0) scale(${v.zoom})`
        v.onMove?.()
        return
      }
      // Against the edge: a little more of the same and the page turns.
      if (now - t.at > 500) t.push = 0
      t.at = now; t.push += d
      if (Math.abs(t.push) >= 90) go(t.push > 0 ? 1 : -1)
    }
    // A page dragged well past its end, and let go, turns too — the way on a phone.
    const up = () => {
      const box = scroller.current?.getBoundingClientRect(), pg = pageEl.current
      if (!box || !pg) return
      const v = view.current, h = pg.offsetHeight * v.zoom
      if (v.y + h < box.height * 0.62) go(1)
      else if (v.y > box.height * 0.38) go(-1)
    }
    el.addEventListener('wheel', wheel, { passive: false, capture: true })
    el.addEventListener('pointerup', up)
    el.addEventListener('touchend', up)
    return () => { el.removeEventListener('wheel', wheel, { capture: true }); el.removeEventListener('pointerup', up); el.removeEventListener('touchend', up) }
  }, [flow, number, pages, view])

  return (
    <div className="sheet-viewer" role="dialog" aria-label={`Preview of ${title}`}>
      <div className="sv-bar">
        {/* Before the title, against the left edge: beside the tools these moved whenever a
            section had pages of its own to step through. */}
        {step && (
          <div className="sv-bar-group sv-step-fixed">
            <button className="icon" disabled={!step.onPrev} onClick={step.onPrev} aria-label="Previous sheet">‹</button>
            <span className="muted small nowrap sv-step-label">{step.label}</span>
            <button className="icon" disabled={!step.onNext} onClick={step.onNext} aria-label="Next sheet">›</button>
          </div>
        )}
        <div className="sv-title"><span className="sv-name">{title}</span></div>
        {pages > 1 && (
          <div className="sv-bar-group">
            <button className="icon" disabled={number <= 1} onClick={() => setNumber(number - 1)} aria-label="Previous page">‹</button>
            <span className="muted small nowrap">Page {number} of {pages}</span>
            <button className="icon" disabled={number >= pages} onClick={() => setNumber(number + 1)} aria-label="Next page">›</button>
          </div>
        )}
        <div className="sv-bar-group sv-inline-tools">
          <span className="sv-sep" />
          <button className="icon" onClick={() => zoomAbout(1 / 1.5)} aria-label="Zoom out">−</button>
          <button onClick={fit} title="Fit the page to the screen">{Math.round(zoom * 100)}%</button>
          <button className="icon" onClick={() => zoomAbout(1.5)} aria-label="Zoom in">+</button>
        </div>
        <div className="sv-bar-group">
          {onDownload && <button onClick={onDownload}>Download</button>}
          <button onClick={onClose} aria-label="Close the preview">Close</button>
        </div>
      </div>
      {extra && <div className="pv-strip">{extra}</div>}
      <div className="sv-body" ref={body}>
        <div className="sv-scroll" ref={scroller}>
          {busy && <p className="muted sv-msg">Drawing the page…</p>}
          {error && <div className="notice error sv-msg">{error}</div>}
          <div ref={pageEl} className="sv-page" style={{ width, height, visibility: busy && !page ? 'hidden' : 'visible' }}>
            <canvas ref={canvas} style={{ width: '100%', height: '100%' }} />
            <canvas ref={detail} className="sv-detail" />
          </div>
        </div>
      </div>
    </div>
  )
}
