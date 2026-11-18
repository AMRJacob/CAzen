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
export function PdfPreview({ bytes, title, onClose, onDownload, step, extra }: {
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

  return (
    <div className="sheet-viewer" role="dialog" aria-label={`Preview of ${title}`}>
      <div className="sv-bar">
        <div className="sv-title"><span className="sv-name">{title}</span></div>
        {pages > 1 && (
          <div className="sv-bar-group">
            <button className="icon" disabled={number <= 1} onClick={() => setNumber(number - 1)} aria-label="Previous page">‹</button>
            <span className="muted small">{number} / {pages}</span>
            <button className="icon" disabled={number >= pages} onClick={() => setNumber(number + 1)} aria-label="Next page">›</button>
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
      <div className="sv-body">
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
