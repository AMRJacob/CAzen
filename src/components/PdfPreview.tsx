import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import { getDocument } from '../lib/pdf/pdfjs'
import { usePageRender, usePageZoom } from '../lib/pdf/zoomPan'

/**
 * Look at a document before issuing it, in the app.
 *
 * It replaces opening a tab for it, which on a phone is two problems: the tab is built after the
 * PDF is, by which time Safari no longer counts it as something the person asked for and blocks it;
 * and a submittal package — a transmittal with the contractor's PDF behind it — is the one thing
 * worth paging through on the way out the door. Drawn with the same hand as the sheet viewer, so a
 * document zooms and pans exactly like a drawing does.
 */
export function PdfPreview({ bytes, title, onClose, onDownload }: {
  bytes: Uint8Array
  title: string
  onClose: () => void
  onDownload?: () => void
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

  const { zoom, width, height, fit, zoomAbout } = usePageZoom(scroller, pageEl, aspect)
  usePageRender(canvas, page, width, zoom, !busy)

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
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' && pdf && number < pdf.numPages) setNumber(number + 1)
      if (e.key === 'ArrowLeft' && number > 1) setNumber(number - 1)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [pdf, number, onClose])

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
      <div className="sv-body">
        <div className="sv-scroll" ref={scroller}>
          {busy && <p className="muted sv-msg">Drawing the page…</p>}
          {error && <div className="notice error sv-msg">{error}</div>}
          <div ref={pageEl} className="sv-page" style={{ width, height, visibility: busy && !page ? 'hidden' : 'visible' }}>
            <canvas ref={canvas} style={{ width: '100%', height: '100%' }} />
          </div>
        </div>
      </div>
    </div>
  )
}
