import { useEffect, useRef, useState } from 'react'
import { listCurrentSheets, localCurrentSheets } from '../lib/sheets'
import { readFile, type ProjectStore } from '../lib/files'
import { pdfPageThumb } from '../lib/pdf/pdfjs'
import { message } from '../lib/errors'
import type { CurrentSheet } from '../lib/types'

/**
 * A piece of a drawing, cut out to be drawn over.
 *
 * Choose a sheet, drag a box round the part wanted, and that part comes back as a picture —
 * drawn again from the sheet at a finer size than the one on screen, so linework stays crisp
 * when it is enlarged on the pad.
 */
export function SheetClip({ project, onClip, onClose }: {
  project: ProjectStore
  onClip: (picture: Blob, shape: { w: number; h: number }, from: string) => void
  onClose: () => void
}) {
  const [sheets, setSheets] = useState<CurrentSheet[] | null>(null)
  const [find, setFind] = useState('')
  const [sheet, setSheet] = useState<CurrentSheet | null>(null)
  const [image, setImage] = useState<string | null>(null)
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bytes = useRef<Uint8Array | null>(null)
  const img = useRef<HTMLImageElement>(null)
  const from = useRef<{ x: number; y: number } | null>(null)

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

  useEffect(() => {
    if (!sheet) return
    let gone = false
    setImage(null); setBox(null); bytes.current = null
    readFile(project, sheet.file_path).then(async (b) => {
      if (gone) return
      bytes.current = new Uint8Array(b)
      const url = await pdfPageThumb(bytes.current, 2600)
      if (!gone) setImage(url)
    }).catch((e) => { if (!gone) setError(message(e)) })
    return () => { gone = true }
  }, [project, sheet])

  const at = (e: React.PointerEvent) => {
    const r = img.current!.getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }
  }

  async function use() {
    if (!box || !bytes.current || !sheet || busy) return
    setBusy(true)
    try {
      // Drawn again, finer, so the part cut out is sharp at the size it will be drawn over.
      const fine = await pdfPageThumb(bytes.current, 5200)
      const whole = new Image()
      await new Promise<void>((ok, no) => { whole.onload = () => ok(); whole.onerror = () => no(new Error('The sheet could not be drawn.')); whole.src = fine })
      const c = document.createElement('canvas')
      c.width = Math.max(1, Math.round(box.w * whole.naturalWidth)); c.height = Math.max(1, Math.round(box.h * whole.naturalHeight))
      const ctx = c.getContext('2d')!
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
      ctx.drawImage(whole, box.x * whole.naturalWidth, box.y * whole.naturalHeight, c.width, c.height, 0, 0, c.width, c.height)
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.9))
      if (!blob) throw new Error('The clip could not be made.')
      onClip(blob, { w: c.width, h: c.height }, sheet.number)
    } catch (e) { setError(message(e)); setBusy(false) }
  }

  const words = find.trim().toLowerCase()
  const shown = (sheets ?? []).filter((s) => !words || `${s.number} ${s.title ?? ''}`.toLowerCase().includes(words))

  return (
    <div className="spot clip" role="dialog" aria-label="Clip from a drawing">
      <header className="spot-bar">
        {sheet ? <button onClick={() => setSheet(null)}>Sheets</button> : <strong>Clip from a drawing</strong>}
        {sheet && <span className="spot-name"><span className="mono">{sheet.number}</span> {sheet.title}</span>}
        <span className="clip-do">
          {sheet && <button className="primary" disabled={!box || busy} onClick={() => void use()}>{busy ? 'Cutting it out…' : 'Use this part'}</button>}
          <button onClick={onClose}>Cancel</button>
        </span>
      </header>
      {error && <div className="notice error" onClick={() => setError(null)}>{error}</div>}
      {!sheet ? (
        <div className="spot-list">
          <input type="search" placeholder="Sheet number or title" value={find} onChange={(e) => setFind(e.target.value)} />
          {sheets === null ? <p className="muted">Loading…</p> : shown.length === 0 ? <p className="muted">No sheets{words ? ' match' : ' on this project yet'}.</p> : (
            <ul>{shown.map((s) => <li key={s.sheet_id}><button onClick={() => setSheet(s)}><span className="mono">{s.number}</span> {s.title}</button></li>)}</ul>
          )}
        </div>
      ) : (
        <div className="clip-sheet">
          {!image ? <p className="muted spot-hint">Drawing the sheet…</p> : (
            <div className="clip-page"
              onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); from.current = at(e); setBox(null) }}
              onPointerMove={(e) => {
                const f = from.current
                if (!f) return
                const p = at(e)
                setBox({ x: Math.min(f.x, p.x), y: Math.min(f.y, p.y), w: Math.abs(p.x - f.x), h: Math.abs(p.y - f.y) })
              }}
              onPointerUp={() => { from.current = null; setBox((b) => (b && b.w > 0.01 && b.h > 0.01 ? b : null)) }}>
              <img ref={img} src={image} alt={`Sheet ${sheet.number}`} draggable={false} />
              {box && <span className="clip-box" style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }} />}
            </div>
          )}
          {image && !box && <p className="spot-hint">Drag a box round the part to draw over.</p>}
        </div>
      )}
    </div>
  )
}
