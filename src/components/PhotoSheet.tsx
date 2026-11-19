import { useEffect, useMemo, useRef, useState } from 'react'
import type { ProjectStore } from '../lib/files'
import { photoUrl } from '../lib/photos'
import { captionOf, layOut, ratioOf, whole, type Crop } from '../lib/photoSheet'
import type { SheetItem, SheetState } from '../lib/photoSheetBytes'
import { SHEET, sheetRoom } from '../lib/templates/photoPages'
import { PAGE_H, PAGE_W } from '../lib/templates/types'

/**
 * The photo table of a field report, before it is one.
 *
 * What is on screen is the pages as they will print, small: the same layout draws both. A
 * photograph is clicked to say what part of it is worth printing, what it is called, and
 * whether it is in the table at all — and the pages rearrange behind it as that is decided.
 */

interface Seen { url: string; width: number; height: number }

export function PhotoSheet({ project, state, onChange }: {
  project: ProjectStore
  state: SheetState
  onChange: (next: SheetState) => void
}) {
  const [seen, setSeen] = useState<Record<string, Seen>>({})
  const [editing, setEditing] = useState<string | null>(null)
  const paths = state.items.map((i) => i.path).join('|')

  // Every photograph is opened once, for its picture and its shape.
  useEffect(() => {
    let gone = false
    const made: string[] = []
    for (const path of paths ? paths.split('|') : []) {
      photoUrl(project, path).then((url) => {
        if (gone) { URL.revokeObjectURL(url); return }
        made.push(url)
        const img = new Image()
        img.onload = () => { if (!gone) setSeen((s) => ({ ...s, [path]: { url, width: img.naturalWidth, height: img.naturalHeight } })) }
        img.src = url
      }).catch(() => { /* a photograph that will not open is left out of the picture */ })
    }
    return () => { gone = true; made.forEach((u) => URL.revokeObjectURL(u)) }
  }, [project, paths])

  const used = state.items.filter((i) => i.use && seen[i.path])
  const left = state.items.filter((i) => !i.use)
  const waiting = state.items.filter((i) => i.use && !seen[i.path]).length

  const { boxes, pages } = useMemo(() => layOut(
    used.map((i) => ({ id: i.path, ratio: ratioOf(seen[i.path].width, seen[i.path].height, i.crop) })),
    {
      ...sheetRoom(), perRow: state.perRow, pad: SHEET.pad, line: SHEET.line,
      // Near enough to the printed wrap for the preview: Helvetica capitals run about 0.6 em.
      lines: (id, width) => {
        const item = used.find((i) => i.path === id)
        return Math.max(1, Math.ceil(captionOf(0, item?.label ?? '').length * SHEET.size * 0.6 / Math.max(1, width)))
      },
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [JSON.stringify(used), seen, state.perRow])

  const setItem = (path: string, change: Partial<SheetItem>) =>
    onChange({ ...state, items: state.items.map((i) => (i.path === path ? { ...i, ...change } : i)) })
  const move = (path: string, by: number) => {
    const items = [...state.items]
    const at = items.findIndex((i) => i.path === path)
    // Past the ones left out, to the next photograph that is actually in the table.
    let to = at + by
    while (to >= 0 && to < items.length && !items[to].use) to += by
    if (at < 0 || to < 0 || to >= items.length) return
    const [it] = items.splice(at, 1)
    items.splice(to, 0, it)
    onChange({ ...state, items })
  }

  const item = editing ? state.items.find((i) => i.path === editing) : null
  const top = SHEET.margin + SHEET.head
  const pct = (v: number, of: number) => `${(v / of) * 100}%`

  return (
    <section className="psheet card">
      <label className="psheet-on">
        <input type="checkbox" checked={state.on} onChange={(e) => onChange({ ...state, on: e.target.checked })} />
        <span>Attach the photographs as a table <em>{state.items.length} taken</em></span>
      </label>

      {state.on && (
        <>
          <div className="psheet-bar">
            <span className="chips-label">Across a row</span>
            {[1, 2, 3, 4].map((n) => (
              <button key={n} type="button" className={`chip${state.perRow === n ? ' on' : ''}`} aria-pressed={state.perRow === n}
                onClick={() => onChange({ ...state, perRow: n })}>{n}</button>
            ))}
            <span className="psheet-count">
              {used.length} {used.length === 1 ? 'photograph' : 'photographs'} on {pages} {pages === 1 ? 'page' : 'pages'}
              {waiting ? ` · opening ${waiting} more` : ''}
            </span>
          </div>
          <p className="muted small">Click a photograph to crop it, caption it, move it, or leave it out.</p>

          <div className="psheet-pages">
            {Array.from({ length: pages }, (_, p) => (
              <div key={p} className="psheet-page" style={{ aspectRatio: `${PAGE_W} / ${PAGE_H}` }}>
                <span className="psheet-head" style={{ left: pct(SHEET.margin, PAGE_W), top: pct(SHEET.margin, PAGE_H) }}>SITE PHOTOS</span>
                {boxes.filter((b) => b.page === p).map((b) => {
                  const it = used.find((i) => i.path === b.id)!
                  const c: Crop = whole(it.crop) ? { x: 0, y: 0, w: 1, h: 1 } : it.crop!
                  return (
                    <button key={b.id} type="button" className="psheet-cell" title="Crop, caption or leave out"
                      style={{ left: pct(SHEET.margin + b.x, PAGE_W), top: pct(top + b.y, PAGE_H), width: pct(b.w, PAGE_W), height: pct(b.h, PAGE_H) }}
                      onClick={() => setEditing(b.id)}>
                      <span className="psheet-photo" style={{
                        left: pct(b.px - b.x, b.w), top: pct(b.py - b.y, b.h), width: pct(b.pw, b.w), height: pct(b.ph, b.h),
                      }}>
                        <img src={seen[b.id].url} alt="" style={{
                          width: `${100 / c.w}%`, height: `${100 / c.h}%`,
                          left: `${-c.x / c.w * 100}%`, top: `${-c.y / c.h * 100}%`,
                        }} />
                      </span>
                      <span className="psheet-cap" style={{ top: pct(b.cy - b.y, b.h) }}>{captionOf(b.n, it.label)}</span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          {left.length > 0 && (
            <div className="psheet-left">
              <span className="chips-label">Left out</span>
              {left.map((i) => (
                <button key={i.path} type="button" className="psheet-out" title="Put back in the table"
                  onClick={() => setItem(i.path, { use: true })}>
                  {seen[i.path] ? <img src={seen[i.path].url} alt="" /> : null}<span>+</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {item && seen[item.path] && (
        <Cropper key={item.path} seen={seen[item.path]} item={item}
          number={boxes.find((b) => b.id === item.path)?.n ?? 0}
          onChange={(change) => setItem(item.path, change)}
          onMove={(by) => move(item.path, by)}
          onDone={() => setEditing(null)} />
      )}
    </section>
  )
}

type Grip = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w'
/** No smaller than this, as a share of the photograph: past it a slip of the hand loses it. */
const LEAST = 0.08

function Cropper({ seen, item, number, onChange, onMove, onDone }: {
  seen: Seen
  item: SheetItem
  number: number
  onChange: (change: Partial<SheetItem>) => void
  onMove: (by: number) => void
  onDone: () => void
}) {
  const stage = useRef<HTMLDivElement>(null)
  const drag = useRef<{ grip: Grip; x: number; y: number; from: Crop; w: number; h: number } | null>(null)
  const c: Crop = whole(item.crop) ? { x: 0, y: 0, w: 1, h: 1 } : item.crop!

  function down(e: React.PointerEvent, grip: Grip) {
    const box = stage.current?.getBoundingClientRect()
    if (!box) return
    e.preventDefault(); e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { grip, x: e.clientX, y: e.clientY, from: c, w: box.width, h: box.height }
  }
  function moved(e: React.PointerEvent) {
    const d = drag.current
    if (!d) return
    const dx = (e.clientX - d.x) / d.w, dy = (e.clientY - d.y) / d.h
    let { x, y, w, h } = d.from
    const right = x + w, bottom = y + h
    if (d.grip === 'move') {
      x = Math.min(1 - w, Math.max(0, x + dx)); y = Math.min(1 - h, Math.max(0, y + dy))
    } else {
      if (d.grip.includes('w')) { x = Math.min(right - LEAST, Math.max(0, x + dx)); w = right - x }
      if (d.grip.includes('e')) w = Math.min(1 - x, Math.max(LEAST, w + dx))
      if (d.grip.includes('n')) { y = Math.min(bottom - LEAST, Math.max(0, y + dy)); h = bottom - y }
      if (d.grip.includes('s')) h = Math.min(1 - y, Math.max(LEAST, h + dy))
    }
    onChange({ crop: { x, y, w, h } })
  }
  const up = () => { drag.current = null }

  return (
    <div className="pcrop" role="dialog" aria-label="Crop and caption" onClick={onDone}>
      <div className="pcrop-card" onClick={(e) => e.stopPropagation()}>
        <div className="pcrop-stage" ref={stage} style={{ aspectRatio: `${seen.width} / ${seen.height}` }}>
          <img src={seen.url} alt="" draggable={false} />
          <div className="pcrop-box"
            style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%`, width: `${c.w * 100}%`, height: `${c.h * 100}%` }}
            onPointerDown={(e) => down(e, 'move')} onPointerMove={moved} onPointerUp={up} onPointerCancel={up}>
            {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as Grip[]).map((g) => (
              <span key={g} className={`pcrop-grip g-${g}`}
                onPointerDown={(e) => down(e, g)} onPointerMove={moved} onPointerUp={up} onPointerCancel={up} />
            ))}
          </div>
        </div>
        <label className="pcrop-cap">Caption
          <input value={item.label} placeholder="What this shows" autoFocus
            onChange={(e) => onChange({ label: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') onDone() }} />
        </label>
        <div className="pcrop-acts">
          <button type="button" onClick={() => onMove(-1)} disabled={number <= 1}>‹ Earlier</button>
          <button type="button" onClick={() => onMove(1)}>Later ›</button>
          <button type="button" onClick={() => onChange({ crop: null })} disabled={whole(item.crop)}>Whole photograph</button>
          <button type="button" onClick={() => { onChange({ use: false }); onDone() }}>Leave out</button>
          <span className="pcrop-gap" />
          <button type="button" className="primary" onClick={onDone}>Done</button>
        </div>
      </div>
    </div>
  )
}
