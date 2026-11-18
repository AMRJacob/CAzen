import { useEffect, useRef, useState } from 'react'
import { pdfPageImage } from '../lib/pdf/pdfjs'
import type { Region } from '../lib/pdf/pageText'

/**
 * Drawing a box on a page to say where something is.
 *
 * The same idea as a title block template, for a manual: automatic detection reads a whole page
 * and weighs what it finds, which works until it doesn't, and when it doesn't there is nothing
 * to argue with. Pointing at the box ends the argument — and because it is the same gesture as
 * the title block, nobody has to learn it twice.
 *
 * It shows what it reads at the moment it is drawn, and on how many of the other pages it reads
 * anything, because a box that works on the page in front of you and nowhere else is the one
 * mistake worth catching before saving.
 */
export function RegionPicker({ bytes, value, reads, onChange, onClose, onStep, label, hint }: {
  /** The page to draw on, as a one-page PDF. */
  bytes: Uint8Array
  value: Region | null
  /** What the box currently reads here, and across everything, for the caller to work out. */
  reads: { here: string | null; across: number; total: number }
  onChange: (r: Region | null) => void
  onClose: () => void
  /** Move to another page to check the box against. */
  onStep?: { label: string; onPrev?: () => void; onNext?: () => void }
  label: string
  hint: string
}) {
  const [image, setImage] = useState<string | null>(null)
  const [drawing, setDrawing] = useState<Region | null>(null)
  const sheet = useRef<HTMLDivElement>(null)
  const from = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    let stop = false
    setImage(null)
    pdfPageImage(bytes, 2).then((url) => { if (!stop) setImage(url) }, () => { if (!stop) setImage(null) })
    return () => { stop = true }
  }, [bytes])

  const at = (e: React.PointerEvent) => {
    const r = sheet.current!.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    }
  }

  const box = drawing ?? value

  return (
    <div className="sheet-viewer" role="dialog" aria-label={label}>
      <div className="sv-bar">
        <div className="sv-title"><span className="sv-name">{label}</span></div>
        {onStep && (
          <div className="sv-bar-group">
            <button className="icon" disabled={!onStep.onPrev} onClick={onStep.onPrev} aria-label="Previous page">‹</button>
            <span className="muted small nowrap">{onStep.label}</span>
            <button className="icon" disabled={!onStep.onNext} onClick={onStep.onNext} aria-label="Next page">›</button>
          </div>
        )}
        <div className="sv-bar-group">
          {value && <button onClick={() => onChange(null)}>Clear</button>}
          <button className="primary" onClick={onClose}>Done</button>
        </div>
      </div>

      <div className="sv-hint rp-read">
        <span>{hint}</span>
        {value && (
          <span className="rp-result">
            Reads <strong>{reads.here ?? 'nothing on this page'}</strong>
            {' · '}
            <strong>{reads.across}</strong> of {reads.total} pages
          </span>
        )}
      </div>

      <div className="sv-body">
        <div className="sv-scroll rp-scroll">
          {!image && <p className="muted sv-msg">Drawing the page…</p>}
          {image && (
            <div ref={sheet} className="rp-sheet"
              onPointerDown={(e) => {
                ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                from.current = at(e)
                setDrawing({ ...from.current, w: 0, h: 0 })
              }}
              onPointerMove={(e) => {
                const start = from.current
                if (!start) return
                const p = at(e)
                setDrawing({
                  x: Math.min(start.x, p.x), y: Math.min(start.y, p.y),
                  w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y),
                })
              }}
              onPointerUp={() => {
                const made = drawing
                from.current = null
                setDrawing(null)
                // A tap is not a box: anything this small is somebody missing, not choosing.
                if (made && made.w > 0.006 && made.h > 0.004) onChange(made)
              }}
            >
              <img src={image} alt="" draggable={false} />
              {box && (
                <span className="rp-box" style={{
                  left: `${box.x * 100}%`, top: `${box.y * 100}%`,
                  width: `${box.w * 100}%`, height: `${box.h * 100}%`,
                }} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
