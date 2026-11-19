import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TagMark } from './TagMark'
import type { Mark } from '../lib/tags'
import { listCurrentSheets, localCurrentSheets } from '../lib/sheets'
import { readFile, type ProjectStore } from '../lib/files'
import { pdfPageThumb } from '../lib/pdf/pdfjs'
import { message } from '../lib/errors'
import type { CurrentSheet } from '../lib/types'

/**
 * Choosing a spot on a drawing: find the sheet, then touch where it is.
 *
 * Used to tie an observation to the place it was seen when it was written somewhere other than
 * on the sheet — in the notebook, or in the list. Two steps and no more: the sheets, searchable
 * by number or title; then the sheet itself, to be touched once. The spot can be touched again
 * until it is right.
 *
 * The sheet moves like the drawings do: drag to pan, pinch or wheel to zoom, and only a touch
 * that did not move places the tag — so getting close enough to be exact does not drop tags on
 * the way there.
 */
export interface Spot {
  sheetId: string; revisionId: string; number: string; region: { x: number; y: number }
  /** A small picture of the drawing around the spot, to show where it is without opening the sheet. */
  thumb?: string
}

/** The piece of the sheet around a point, as a picture. */
function cropAround(img: HTMLImageElement, at: { x: number; y: number }): string | undefined {
  try {
    const side = Math.round(img.naturalWidth * 0.16)
    const c = document.createElement('canvas')
    c.width = c.height = 220
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, 220, 220)
    ctx.drawImage(img, at.x * img.naturalWidth - side / 2, at.y * img.naturalHeight - side / 2, side, side, 0, 0, 220, 220)
    ctx.fillStyle = '#c0392b'
    ctx.beginPath(); ctx.arc(110, 110, 9, 0, Math.PI * 2); ctx.fill()
    ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke()
    return c.toDataURL('image/jpeg', 0.8)
  } catch { return undefined }
}

export function SheetSpot({ project, start, mark, onPick, onClose }: {
  project: ProjectStore
  /** What the tag will look like, if the observation has a trade yet. */
  mark?: Mark | null
  start?: { sheetId: string; region: { x: number; y: number } } | null
  onPick: (s: Spot) => void
  onClose: () => void
}) {
  const [sheets, setSheets] = useState<CurrentSheet[] | null>(null)
  const [find, setFind] = useState('')
  const [sheet, setSheet] = useState<CurrentSheet | null>(null)
  const [image, setImage] = useState<string | null>(null)
  const [at, setAt] = useState<{ x: number; y: number } | null>(start?.region ?? null)
  const wrap = useRef<HTMLDivElement>(null)
  const pageEl = useRef<HTMLDivElement>(null)
  const bytesRef = useRef<Uint8Array | null>(null)
  const sharp = useRef(false)
  const [v, setV] = useState({ k: 1, x: 0, y: 0 })
  const ptrs = useRef(new Map<number, { x: number; y: number }>())
  const hand = useRef<{ moved: boolean; sx: number; sy: number; pinch?: { d: number; mx: number; my: number; v: { k: number; x: number; y: number } } } | null>(null)

  /** The whole sheet in view, centred. */
  const fit = useCallback(() => {
    const w = wrap.current, p = pageEl.current
    if (!w || !p || !p.offsetHeight) return
    const k = Math.min(1, w.clientHeight / p.offsetHeight)
    setV({ k, x: (w.clientWidth - p.offsetWidth * k) / 2, y: Math.max(0, (w.clientHeight - p.offsetHeight * k) / 2) })
  }, [])

  /** Zoom about a point of the viewport, so what is under the finger stays under it. */
  const zoomAt = useCallback((cx: number, cy: number, factor: number) => {
    setV((o) => {
      const k = Math.min(14, Math.max(0.3, o.k * factor))
      return { k, x: cx - (cx - o.x) * (k / o.k), y: cy - (cy - o.y) * (k / o.k) }
    })
  }, [])

  // Close in, the first picture runs out of detail; a finer one is drawn once and swapped in.
  useEffect(() => {
    if (v.k < 2.2 || sharp.current || !bytesRef.current) return
    sharp.current = true
    pdfPageThumb(bytesRef.current, 5200).then((url) => setImage((was) => (was ? url : was))).catch(() => { /* the first picture stays */ })
  }, [v.k])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let gone = false
    ;(async () => {
      const here = await localCurrentSheets(project.id).catch(() => [])
      if (!gone && here.length) setSheets(here)
      try { const all = await listCurrentSheets(project.id); if (!gone) setSheets(all) }
      catch (e) { if (!gone && !here.length) { setSheets([]); setError(message(e)) } }
    })()
    return () => { gone = true }
  }, [project.id])

  // Reopened on an observation already tagged: go straight to its sheet.
  useEffect(() => {
    if (!start || sheet || !sheets) return
    const s = sheets.find((x) => x.sheet_id === start.sheetId)
    if (s) setSheet(s)
  }, [start, sheet, sheets])

  useEffect(() => {
    if (!sheet) { setImage(null); return }
    let gone = false
    setImage(null)
    sharp.current = false
    bytesRef.current = null
    setV({ k: 1, x: 0, y: 0 })
    readFile(project, sheet.file_path)
      .then((bytes) => { bytesRef.current = bytes; return pdfPageThumb(bytes, 2200) })
      .then((url) => { if (!gone) setImage(url) })
      .catch((e) => { if (!gone) setError(message(e)) })
    return () => { gone = true }
  }, [project, sheet])

  const shown = useMemo(() => {
    const q = find.trim().toLowerCase()
    const all = (sheets ?? []).filter((s) => !s.is_void)
    return q ? all.filter((s) => s.number.toLowerCase().includes(q) || (s.title ?? '').toLowerCase().includes(q)) : all
  }, [sheets, find])

  return (
    <div className="spot" role="dialog" aria-label="Tag to a drawing">
      <header className="spot-bar">
        {sheet
          ? <button onClick={() => { setSheet(null); setAt(null) }}>‹ Sheets</button>
          : <input autoFocus value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a sheet by number or title" aria-label="Find a sheet" />}
        {sheet && <span className="spot-name"><span className="mono">{sheet.number}</span> {sheet.title}</span>}
        {sheet && image && (
          <span className="spot-zoom">
            <button aria-label="Zoom out" onClick={() => { const w = wrap.current; if (w) zoomAt(w.clientWidth / 2, w.clientHeight / 2, 1 / 1.5) }}>−</button>
            <button aria-label="Zoom in" onClick={() => { const w = wrap.current; if (w) zoomAt(w.clientWidth / 2, w.clientHeight / 2, 1.5) }}>+</button>
            <button onClick={fit}>Fit</button>
          </span>
        )}
        {/* Always there once a sheet is open: appearing only after the touch made the bar taller,
            which slid the drawing down under the tag just placed. */}
        {sheet && <button className="primary" disabled={!at} onClick={() => {
          if (!at) return
          const img = document.querySelector<HTMLImageElement>('.spot-page img')
          onPick({ sheetId: sheet.sheet_id, revisionId: sheet.revision_id, number: sheet.number, region: at, thumb: img ? cropAround(img, at) : undefined })
        }}>Tag it here</button>}
        <button onClick={onClose} aria-label="Close">×</button>
      </header>
      {error && <div className="notice error">{error}</div>}
      {!sheet ? (
        <div className="spot-list">
          {!sheets ? <p className="muted">Loading the sheets…</p>
            : !shown.length ? <p className="muted">{sheets.length ? 'No sheet matches that.' : 'No drawings on this project yet.'}</p>
              : shown.map((s) => (
                <button key={s.sheet_id} onClick={() => { setSheet(s); setAt(null) }}>
                  <span className="mono">{s.number}</span><span>{s.title}</span>
                </button>
              ))}
        </div>
      ) : (
        <div className="spot-sheet" ref={wrap}
          onWheel={(e) => {
            const box = e.currentTarget.getBoundingClientRect()
            zoomAt(e.clientX - box.left, e.clientY - box.top, Math.exp(-e.deltaY * 0.0016))
          }}
          onPointerDown={(e) => {
            if ((e.target as Element).closest('button')) return
            e.currentTarget.setPointerCapture(e.pointerId)
            ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
            if (ptrs.current.size === 1) hand.current = { moved: false, sx: e.clientX, sy: e.clientY }
            else if (ptrs.current.size === 2 && hand.current) {
              const [a, b2] = [...ptrs.current.values()], box = e.currentTarget.getBoundingClientRect()
              hand.current.moved = true
              hand.current.pinch = { d: Math.hypot(a.x - b2.x, a.y - b2.y), mx: (a.x + b2.x) / 2 - box.left, my: (a.y + b2.y) / 2 - box.top, v }
            }
          }}
          onPointerMove={(e) => {
            const was = ptrs.current.get(e.pointerId), h = hand.current
            if (!was || !h) return
            ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
            if (ptrs.current.size === 1) {
              if (!h.moved && Math.hypot(e.clientX - h.sx, e.clientY - h.sy) < 7) return
              h.moved = true
              const dx = e.clientX - was.x, dy = e.clientY - was.y
              setV((o) => ({ ...o, x: o.x + dx, y: o.y + dy }))
            } else if (h.pinch && h.pinch.d > 1) {
              const [a, b2] = [...ptrs.current.values()], box = e.currentTarget.getBoundingClientRect()
              const p = h.pinch, mx = (a.x + b2.x) / 2 - box.left, my = (a.y + b2.y) / 2 - box.top
              const k = Math.min(14, Math.max(0.3, p.v.k * Math.hypot(a.x - b2.x, a.y - b2.y) / p.d))
              setV({ k, x: mx - (p.mx - p.v.x) * (k / p.v.k), y: my - (p.my - p.v.y) * (k / p.v.k) })
            }
          }}
          onPointerUp={(e) => {
            const h = hand.current, had = ptrs.current.delete(e.pointerId)
            if (!had || !h) return
            if (ptrs.current.size) { h.pinch = undefined; return }
            hand.current = null
            if (h.moved || !pageEl.current) return
            const box = pageEl.current.getBoundingClientRect()
            const x = (e.clientX - box.left) / box.width, y = (e.clientY - box.top) / box.height
            if (x >= 0 && x <= 1 && y >= 0 && y <= 1) setAt({ x, y })
          }}
          onPointerCancel={(e) => { ptrs.current.delete(e.pointerId); if (!ptrs.current.size) hand.current = null }}>
          {!image ? <p className="muted">Opening {sheet.number}…</p> : (
            <div className="spot-page" ref={pageEl} style={{ transform: `translate(${v.x}px, ${v.y}px) scale(${v.k})` }}>
              <img src={image} alt={`Sheet ${sheet.number}`} draggable={false} onLoad={() => { if (!sharp.current) fit() }} />
              {at && (
                <span className="spot-pin" style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%`, transform: `translate(-50%, -50%) scale(${1 / v.k})` }}>
                  {mark ? <TagMark mark={mark} size={30} /> : <span className="spot-pin-dot" />}
                </span>
              )}
            </div>
          )}
          {image && !at && <p className="spot-hint">Drag and pinch to get there, then touch the drawing where it was seen.</p>}
        </div>
      )}
    </div>
  )
}
