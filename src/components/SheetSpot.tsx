import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TagMark } from './TagMark'
import { Mark as Enso } from './Logo'
import { markOfTag, type Mark, type Tag } from '../lib/tags'
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
    // No dot is drawn into the picture: the form lays the observation's own mark over its
    // middle, so the tile shows the kind of tag chosen and follows it if that changes.
    return c.toDataURL('image/jpeg', 0.8)
  } catch { return undefined }
}

export function SheetSpot({ project, start, fresh, mark, onPick, onClose, groups, trade, onTag }: {
  /** The trades and their tags, to choose what kind of thing is being tagged without going back to the form. */
  groups?: { trade: string; colour: string; mark: Mark; tags: Tag[] }[]
  trade?: string
  onTag?: (trade: string, tag: Tag | null) => void
  project: ProjectStore
  /** What the tag will look like, if the observation has a trade yet. */
  mark?: Mark | null
  start?: { sheetId: string; region: { x: number; y: number } } | null
  /** Opened to add another place: the sheet is the one given, with no tag on it yet. */
  fresh?: boolean
  onPick: (s: Spot) => void
  onClose: () => void
}) {
  const [sheets, setSheets] = useState<CurrentSheet[] | null>(null)
  const [find, setFind] = useState('')
  const [sheet, setSheet] = useState<CurrentSheet | null>(null)
  const [image, setImage] = useState<string | null>(null)
  const [at, setAt] = useState<{ x: number; y: number } | null>(fresh ? null : start?.region ?? null)
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
    if (v.k < 1.5 || sharp.current || !bytesRef.current) return
    sharp.current = true
    pdfPageThumb(bytesRef.current, 5200).then((url) => setImage((was) => (was ? url : was))).catch(() => { /* the first picture stays */ })
  }, [v.k])
  const [error, setError] = useState<string | null>(null)
  // The corner mark: the way out, the way back to the sheets, the kind of tag, and the zoom.
  const [menu, setMenu] = useState(false)
  const [choosing, setChoosing] = useState<string | null>(null)

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
    setMenu(false); setChoosing(null)
    setV({ k: 1, x: 0, y: 0 })
    readFile(project, sheet.file_path)
      .then((bytes) => {
        bytesRef.current = bytes
        // Drawn for the screen it is on: a wide monitor showed a 2,200 px picture stretched soft.
        const want = Math.min(5200, Math.max(2200, Math.round(Math.max(window.innerWidth, window.innerHeight) * (window.devicePixelRatio || 1) * 1.25)))
        if (want >= 5000) sharp.current = true
        return pdfPageThumb(bytes, want)
      })
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
          ? null
          : <input autoFocus value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a sheet by number or title" aria-label="Find a sheet" />}
        {sheet && <span className="spot-name"><span className="mono">{sheet.number}</span> {sheet.title}</span>}
        {!sheet && <button onClick={onClose} aria-label="Close">×</button>}
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
            if (x < 0 || x > 1 || y < 0 || y > 1) return
            // A touch that did not drag is the tag: it is placed and the screen is done with.
            // (There was a Tag it here button to press afterwards; Jacob, 11/20: not needed.)
            const at = { x, y }
            setAt(at)
            const img = pageEl.current.querySelector('img')
            onPick({ sheetId: sheet.sheet_id, revisionId: sheet.revision_id, number: sheet.number, region: at, thumb: img ? cropAround(img, at) : undefined })
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
          {image && <p className="spot-hint">{at ? 'Touch the drawing to move the tag.' : 'Drag and pinch to get there, then touch the drawing where it was seen.'}</p>}
        </div>
      )}
      {sheet && (() => {
        const zoom = (f: number) => { const w = wrap.current; if (w) zoomAt(w.clientWidth / 2, w.clientHeight / 2, f) }
        const I = (d: React.ReactNode) => <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
        const spot = (label: string, icon: React.ReactNode, act: () => void, on = false) => (
          <button className={`nb-menu-spot${on ? ' on' : ''}`} onClick={act}>{icon}<span>{label}</span></button>
        )
        const open = menu || choosing !== null
        const group = groups?.find((g) => g.trade === choosing)
        return (
          <>
            {choosing !== null && groups && (
              <div className="spot-tags" role="dialog" aria-label="What kind of tag">
                <div className="spot-tags-row">
                  {groups.map((g) => (
                    <button key={g.trade} className={`chip${choosing === g.trade ? ' on' : ''}`} onClick={() => setChoosing(g.trade)}><TagMark mark={g.mark} size={18} />{g.trade}</button>
                  ))}
                </div>
                {group && (
                  <div className="spot-tags-row spot-tags-issues">
                    {group.tags.map((t) => (
                      <button key={t.label} className="chip" style={{ borderColor: group.colour }} onClick={() => { onTag?.(group.trade, t); setChoosing(null); setMenu(false) }}><TagMark mark={markOfTag(group, t)} size={16} />{t.label}</button>
                    ))}
                    <button className="chip" onClick={() => { onTag?.(group.trade, null); setChoosing(null); setMenu(false) }}>Just {group.trade}</button>
                  </div>
                )}
              </div>
            )}
            <nav className={`nb-menu spot-menu${open ? ' open' : ''}`} aria-label="The drawing">
              <button className="nb-menu-mark" aria-expanded={open} aria-label={open ? 'Hide the menu' : 'Show the menu'} onClick={() => { setMenu(!open); setChoosing(null) }}><Enso size={30} /></button>
              <div className="nb-menu-bar" {...(open ? {} : { inert: '' as unknown as boolean })}>
                {spot('Close', I(<><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></>), onClose)}
                {spot('Sheets', I(<><rect x="5" y="4" width="14" height="16" rx="1.5" /><path d="M8.5 9h7M8.5 13h7" /></>), () => { setSheet(null); setAt(null) })}
                {groups && onTag && spot('Tag type', mark ? <TagMark mark={mark} size={20} /> : I(<><path d="M4 12V5h7l9 9-7 7-9-9Z" /><circle cx="8.5" cy="8.5" r="1.2" /></>),
                  () => setChoosing(choosing !== null ? null : (trade && groups.some((g) => g.trade === trade) ? trade : groups[0]?.trade ?? '')), choosing !== null)}
                {spot('Out', I(<><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4M8.5 11h5" /></>), () => zoom(1 / 1.5))}
                {spot('In', I(<><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4M8.5 11h5M11 8.5v5" /></>), () => zoom(1.5))}
                {spot('Fit', I(<><path d="M5 9V5h4M19 9V5h-4M5 15v4h4M19 15v4h-4" /></>), fit)}
              </div>
            </nav>
          </>
        )
      })()}
    </div>
  )
}
