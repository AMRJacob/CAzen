import { useEffect, useMemo, useState } from 'react'
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

export function SheetSpot({ project, start, onPick, onClose }: {
  project: ProjectStore
  start?: { sheetId: string; region: { x: number; y: number } } | null
  onPick: (s: Spot) => void
  onClose: () => void
}) {
  const [sheets, setSheets] = useState<CurrentSheet[] | null>(null)
  const [find, setFind] = useState('')
  const [sheet, setSheet] = useState<CurrentSheet | null>(null)
  const [image, setImage] = useState<string | null>(null)
  const [at, setAt] = useState<{ x: number; y: number } | null>(start?.region ?? null)
  const [big, setBig] = useState(false)
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
    readFile(project, sheet.file_path)
      .then((bytes) => pdfPageThumb(bytes, 2200))
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
        {sheet && <button onClick={() => setBig(!big)}>{big ? 'Fit' : 'Larger'}</button>}
        {sheet && at && <button className="primary" onClick={() => {
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
        <div className="spot-sheet">
          {!image ? <p className="muted">Opening {sheet.number}…</p> : (
            <div className={`spot-page${big ? ' big' : ''}`}
              onClick={(e) => {
                const box = e.currentTarget.getBoundingClientRect()
                setAt({ x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height })
              }}>
              <img src={image} alt={`Sheet ${sheet.number}`} draggable={false} />
              {at && <span className="spot-pin" style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%` }} />}
            </div>
          )}
          {image && !at && <p className="spot-hint">Touch the drawing where it was seen.</p>}
        </div>
      )}
    </div>
  )
}
