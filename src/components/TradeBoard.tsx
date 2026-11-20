import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Mark } from './Logo'
import { CSI_DIVISIONS } from '../lib/csi'
import { USUAL } from '../lib/divisions'
import { fileTile, loadBoard, placed, standing, type Tile } from '../lib/tradeBoard'
import { message } from '../lib/errors'

/**
 * The trade board: CSI divisions as trays on a table that pans and zooms, and every pay line and
 * schedule activity as a tile to be dropped into the trays it belongs to. The app files each tile
 * where its words point to begin with (dashed, until kept); what it cannot place floats loose at
 * the left. Once both sides are filed, each tray reads its billing against its schedule.
 *
 * Fingers, mouse and keys: drag the table to move it, pinch or wheel to zoom, drag a tile to file
 * it. Ctrl or Alt while dropping — or Copy in the corner menu — files a tile in a second tray as
 * well, for an activity that is several trades' work.
 */

const BOX_W = 320, TILE_H = 38, GAP = 8, HEAD = 112, PAD = 6, COLS = 4, GUTTER = 28
const TITLE = new Map(CSI_DIVISIONS)

interface Placed { key: string; tile: Tile; division: string | null; x: number; y: number; w: number; tilt: number }
interface Tray { division: string; x: number; y: number; w: number; h: number }

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0) / 4294967295 }
const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US')
const short = (d?: string | null) => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''

function layout(tiles: Tile[]): { trays: Tray[]; items: Placed[]; width: number; height: number; space: number } {
  const by = new Map<string, Tile[]>()
  const loose: Tile[] = []
  for (const t of tiles) {
    const p = placed(t)
    if (!p.length) loose.push(t)
    for (const d of p) by.set(d, [...(by.get(d) ?? []), t])
  }
  const divisions = [...new Set([...USUAL, ...by.keys()])].sort()
  // The loose area is two ragged columns when there is much loose, one when there is little.
  const two = loose.length > 10
  const SPACE_W = two ? 540 : 300
  const heights = Array(COLS).fill(0)
  const trays: Tray[] = [], items: Placed[] = []
  for (const d of divisions) {
    const inside = (by.get(d) ?? []).sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'pay' ? -1 : 1))
    const h = HEAD + PAD + Math.max(1, inside.length) * (TILE_H + GAP) + PAD
    const col = heights.indexOf(Math.min(...heights))
    const x = SPACE_W + col * (BOX_W + GUTTER), y = heights[col]
    heights[col] += h + GUTTER
    trays.push({ division: d, x, y, w: BOX_W, h })
    inside.forEach((t, i) => items.push({ key: `${t.kind}:${t.id}:${d}`, tile: t, division: d, x: x + PAD, y: y + HEAD + PAD + i * (TILE_H + GAP), w: BOX_W - PAD * 2, tilt: 0 }))
  }
  // Loose tiles drift in two ragged columns at the left.
  loose.forEach((t, i) => {
    const r = hash(t.id)
    const per = two ? 2 : 1
    items.push({ key: `${t.kind}:${t.id}:-`, tile: t, division: null, x: 24 + (i % per) * 250 + (r - 0.5) * (two ? 40 : 16), y: 64 + Math.floor(i / per) * 58 + (hash(t.id + 'y') - 0.5) * 14, w: 220, tilt: (r - 0.5) * 6 })
  })
  return { trays, items, space: SPACE_W, width: SPACE_W + COLS * (BOX_W + GUTTER), height: Math.max(...heights, 64 + Math.ceil(loose.length / (two ? 2 : 1)) * 58 + 80) }
}

export function TradeBoard({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [tiles, setTiles] = useState<Tile[] | null>(null)
  const [asOf, setAsOf] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null | undefined>(undefined)
  const [lifted, setLifted] = useState<string | null>(null)
  const [copy, setCopy] = useState(false)
  const [menu, setMenu] = useState(false)
  const [show, setShow] = useState<'both' | 'pay' | 'act'>('both')

  useEffect(() => {
    let live = true
    loadBoard(projectId).then((b) => { if (live) { setTiles(b.tiles); setAsOf(b.asOf) } }).catch((e) => live && setError(message(e)))
    return () => { live = false }
  }, [projectId])

  const view = useMemo(() => (tiles ?? []).filter((t) => show === 'both' || t.kind === show), [tiles, show])
  const { trays, items, width, height, space } = useMemo(() => layout(view), [view])
  const [today] = useState(() => new Date().toISOString().slice(0, 10))

  // ── the table: pan and zoom, held in a ref and written straight to the transform ──────────────
  const stage = useRef<HTMLDivElement>(null)
  const plane = useRef<HTMLDivElement>(null)
  const cam = useRef({ x: 0, y: 0, z: 0.6 })
  const apply = useCallback(() => {
    const c = cam.current
    if (plane.current) plane.current.style.transform = `translate(${c.x}px, ${c.y}px) scale(${c.z})`
    stage.current?.style.setProperty('--z', String(c.z))
  }, [])
  const fit = useCallback((first = false) => {
    const s = stage.current
    if (!s) return
    const r = s.getBoundingClientRect()
    const top = (s.parentElement?.querySelector('.trb-head') as HTMLElement | null)?.offsetHeight ?? 60
    const z = Math.min(1.2, Math.max(0.15, Math.min((r.width - 40) / width, (r.height - top - 50) / height)))
    // On a phone the whole table is too small to read; it opens at the loose tiles, readable,
    // and Fit in the menu shows all of it.
    if (first && z < 0.45) cam.current = { z: 0.62, x: 8, y: top + 10 }
    else cam.current = { z, x: (r.width - width * z) / 2, y: top + 10 }
    apply()
  }, [width, height, apply])
  const fitted = useRef(false)
  useLayoutEffect(() => { if (tiles && !fitted.current) { fitted.current = true; fit(true) } }, [tiles, fit])
  const zoomAt = useCallback((f: number, sx: number, sy: number) => {
    const c = cam.current
    const z = Math.min(2.5, Math.max(0.15, c.z * f))
    c.x = sx - ((sx - c.x) * z) / c.z
    c.y = sy - ((sy - c.y) * z) / c.z
    c.z = z
    apply()
  }, [apply])

  useEffect(() => {
    const s = stage.current
    if (!s) return
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = s.getBoundingClientRect()
      if (e.ctrlKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top)
      else { cam.current.x -= e.deltaX; apply() }
    }
    s.addEventListener('wheel', wheel, { passive: false })
    return () => s.removeEventListener('wheel', wheel)
  }, [zoomAt, apply])

  // ── pointers: one on the table pans, two pinch, one on a tile carries it ──────────────────────
  const pts = useRef(new Map<number, { x: number; y: number }>())
  const drag = useRef<{ item: Placed; id: number; sx: number; sy: number; ox: number; oy: number; moved: boolean; touch: boolean } | null>(null)
  const ghostAt = useRef('')
  const place = (x: number, y: number) => {
    const g = drag.current, r = stage.current?.getBoundingClientRect()
    if (!g || !r) return
    ghostAt.current = `translate(${x - r.left - g.ox}px, ${y - r.top - g.oy}px) scale(${cam.current.z * 1.06}) rotate(-2.5deg)`
    if (ghost.current) ghost.current.style.transform = ghostAt.current
  }
  const ghost = useRef<HTMLDivElement>(null)
  const pinch = useRef<{ d: number; mx: number; my: number } | null>(null)

  const toWorld = (sx: number, sy: number) => {
    const c = cam.current
    return { x: (sx - c.x) / c.z, y: (sy - c.y) / c.z }
  }
  const trayAt = (sx: number, sy: number): string | null | undefined => {
    const r = stage.current!.getBoundingClientRect()
    const p = toWorld(sx - r.left, sy - r.top)
    const t = trays.find((b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h)
    if (t) return t.division
    return p.x < space - 20 ? null : undefined
  }

  function down(e: React.PointerEvent) {
    const el = (e.target as HTMLElement).closest('[data-key]') as HTMLElement | null
    try { stage.current!.setPointerCapture(e.pointerId) } catch { /* a pointer the browser no longer knows */ }
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pts.current.size === 2) {
      // A second finger: whatever the first was doing becomes a pinch.
      drag.current = null; setLifted(null); setHover(undefined)
      const [a, b] = [...pts.current.values()]
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }
      return
    }
    if (el && e.button === 0) {
      const item = items.find((i) => i.key === el.dataset.key)
      if (item) {
        const r = el.getBoundingClientRect()
        const touch = e.pointerType === 'touch'
        // Offsets are kept at zoom 1: the carried tile is drawn scaled by the zoom.
        drag.current = { item, id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top, moved: false, touch }
        // A finger picks a tile up by resting on it a moment; moving straight away moves the table.
        if (touch) {
          const g = drag.current
          window.setTimeout(() => {
            if (drag.current !== g || g.moved) return
            g.moved = true; setLifted(g.item.key); place(g.sx, g.sy)
            navigator.vibrate?.(8)
          }, 230)
        }
      }
    }
  }
  function move(e: React.PointerEvent) {
    const last = pts.current.get(e.pointerId)
    if (!last) return
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pinch.current && pts.current.size >= 2) {
      const [a, b] = [...pts.current.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
      const r = stage.current!.getBoundingClientRect()
      cam.current.x += mx - pinch.current.mx; cam.current.y += my - pinch.current.my
      zoomAt(d / pinch.current.d, mx - r.left, my - r.top)
      pinch.current = { d, mx, my }
      return
    }
    const g = drag.current
    if (g && g.id === e.pointerId && g.touch && !g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > 8) drag.current = null
    else if (g && g.id === e.pointerId) {
      if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 5) return
      if (!g.moved) { if (g.touch) return; g.moved = true; setLifted(g.item.key) }
      place(e.clientX, e.clientY)
      const over = trayAt(e.clientX, e.clientY)
      setHover((h) => (h === over ? h : over))
      return
    }
    cam.current.x += e.clientX - last.x; cam.current.y += e.clientY - last.y
    apply()
  }
  function up(e: React.PointerEvent) {
    pts.current.delete(e.pointerId)
    if (pts.current.size < 2) pinch.current = null
    const g = drag.current
    if (!g || g.id !== e.pointerId) return
    drag.current = null
    setLifted(null); setHover(undefined)
    if (!g.moved) return
    const to = trayAt(e.clientX, e.clientY)
    if (to === undefined || to === g.item.division) return
    const now = placed(g.item.tile)
    const keepFrom = copy || e.ctrlKey || e.altKey || e.metaKey
    let next = now.filter((d) => keepFrom || d !== g.item.division)
    if (to) next = [...new Set([...next, to])].sort()
    void file(g.item.tile, next)
  }

  async function file(t: Tile, next: string[]) {
    const before = t.filed
    setTiles((all) => all?.map((x) => (x.kind === t.kind && x.id === t.id ? { ...x, filed: next } : x)) ?? null)
    try { await fileTile(t, next) } catch (e) {
      setTiles((all) => all?.map((x) => (x.kind === t.kind && x.id === t.id ? { ...x, filed: before } : x)) ?? null)
      setError(message(e))
    }
  }
  const guessed = (tiles ?? []).filter((t) => t.filed === null && t.guess.length)
  async function keepGuesses() {
    setMenu(false)
    const list = guessed
    setTiles((all) => all?.map((x) => (x.filed === null && x.guess.length ? { ...x, filed: x.guess } : x)) ?? null)
    try { for (const t of list) await fileTile(t, t.guess) } catch (e) { setError(message(e)) }
  }

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return
      const s = stage.current?.getBoundingClientRect()
      if (!s) return
      if (e.key === 'Escape') onClose()
      else if (e.key === '+' || e.key === '=') zoomAt(1.2, s.width / 2, s.height / 2)
      else if (e.key === '-' || e.key === '_') zoomAt(1 / 1.2, s.width / 2, s.height / 2)
      else if (e.key === '0') fit()
      else if (e.key.startsWith('Arrow')) {
        const step = 80
        if (e.key === 'ArrowLeft') cam.current.x += step
        if (e.key === 'ArrowRight') cam.current.x -= step
        if (e.key === 'ArrowUp') cam.current.y += step
        if (e.key === 'ArrowDown') cam.current.y -= step
        apply()
      } else return
      e.preventDefault()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose, zoomAt, fit, apply])

  const liftedItem = lifted ? items.find((i) => i.key === lifted) : null
  // The carried tile arrives where the hand already is.
  useLayoutEffect(() => { if (lifted && ghost.current) ghost.current.style.transform = ghostAt.current }, [lifted])
  const loose = items.filter((i) => i.division === null).length

  const I = (d: React.ReactNode) => (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
  )
  const spot = (label: string, icon: React.ReactNode, act: () => void, on = false) => (
    <button className={`nb-menu-spot${on ? ' on' : ''}`} onClick={act}>{icon}<span>{label}</span></button>
  )

  return (
    <div className="trb" role="dialog" aria-label="Trades">
      <header className="trb-head">
        <h2>Trades</h2>
        <span className="trb-sub">
          {tiles ? <>
            {loose ? `${loose} not placed` : 'Everything placed'}
            {guessed.length ? ` · ${guessed.length} placed by the app, dashed until kept` : ''}
            {asOf ? ` · billing as of ${short(asOf)}` : ''}
          </> : 'Loading…'}
        </span>
        <div className="trb-show" role="group" aria-label="Show">
          {(['both', 'pay', 'act'] as const).map((k) => (
            <button key={k} className={show === k ? 'on' : ''} onClick={() => setShow(k)}>{k === 'both' ? 'Both' : k === 'pay' ? 'Pay lines' : 'Schedule'}</button>
          ))}
        </div>
      </header>
      {error && <div className="notice error trb-error" onClick={() => setError(null)}>{error}</div>}

      <div ref={stage} className={`trb-stage${lifted ? ' carrying' : ''}`}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <div ref={plane} className="trb-plane" style={{ width, height }}>
          <div className={`trb-space${hover === null ? ' over' : ''}`} style={{ width: space - 30, height }}>
            <span>Not placed</span>
          </div>
          {trays.map((t) => {
            const s = standing(view, t.division, today)
            const billedPct = s.value ? (s.billed / s.value) * 100 : null
            const count = items.filter((i) => i.division === t.division).length
            return (
              <section key={t.division} className={`trb-tray${hover === t.division ? ' over' : ''}${count ? '' : ' empty'}`} style={{ left: t.x, top: t.y, width: t.w, height: t.h }}>
                <div className="trb-tray-head">
                  <span className="trb-num">{t.division}</span>
                  <span className="trb-title">{TITLE.get(t.division) ?? 'Division ' + t.division}</span>
                </div>
                {(billedPct != null || s.reported != null) && (
                  <div className="trb-gauge" title="Billed to date against the schedule's dates and the contractor's own percent">
                    {s.planned != null && <Bar label="Dates" pct={s.planned} kind="plan" />}
                    {s.reported != null && <Bar label="Reported" pct={s.reported} kind="rep" />}
                    {billedPct != null && <Bar label={`Billed ${money(s.billed)}`} pct={billedPct} kind="bill" />}
                  </div>
                )}
              </section>
            )
          })}
          {items.map((i) => (
            <div key={i.key} data-key={i.key}
              className={`trb-tile ${i.tile.kind}${i.tile.filed === null && i.division ? ' guess' : ''}${lifted === i.key ? ' gone' : ''}${i.division === null ? ' drift' : ''}`}
              style={{ left: i.x, top: i.y, width: i.w, ['--tilt' as string]: `${i.tilt}deg`, ['--d' as string]: `${(hash(i.key) * 4).toFixed(2)}s` }}>
              <TileFace t={i.tile} />
            </div>
          ))}
        </div>
        {liftedItem && (
          <div ref={ghost} className={`trb-tile trb-ghost ${liftedItem.tile.kind}`} style={{ width: liftedItem.w }}>
            <TileFace t={liftedItem.tile} />
          </div>
        )}
      </div>

      <nav className={`nb-menu trb-menu${menu ? ' open' : ''}`} aria-label="Trade board">
        <button className="nb-menu-mark" aria-expanded={menu} aria-label={menu ? 'Hide the menu' : 'Show the menu'} onClick={() => setMenu(!menu)}>
          <Mark size={30} />
        </button>
        <div className="nb-menu-bar" {...(menu ? {} : { inert: '' as unknown as boolean })}>
          {spot('Close', I(<><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></>), onClose)}
          {guessed.length > 0 && spot(`Keep ${guessed.length}`, I(<path d="M5 12.5l4.5 4.5L19 7.5" />), () => void keepGuesses())}
          {spot('Fit', I(<><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></>), () => { fit(); setMenu(false) })}
          {spot(copy ? 'Copying' : 'Copy', I(<><rect x="8" y="8" width="11" height="12" rx="1.5" /><path d="M5 16V5.5A1.5 1.5 0 0 1 6.5 4H15" /></>), () => setCopy(!copy), copy)}
        </div>
      </nav>
    </div>
  )
}

function Bar({ label, pct, kind }: { label: string; pct: number; kind: 'plan' | 'rep' | 'bill' }) {
  const p = Math.max(0, Math.min(100, pct))
  return (
    <div className={`trb-bar ${kind}`}>
      <span className="trb-bar-label">{label}</span>
      <span className="trb-bar-track"><span style={{ width: `${p}%` }} /></span>
      <span className="trb-bar-pct">{Math.round(pct)}%</span>
    </div>
  )
}

function TileFace({ t }: { t: Tile }) {
  return t.kind === 'pay' ? (
    <>
      <span className="trb-code">{t.code ?? '·'}</span>
      <span className="trb-label">{t.label}</span>
      <span className="trb-fig">{money(t.value)}</span>
    </>
  ) : (
    <>
      <span className="trb-code trb-cal" aria-hidden="true">◷</span>
      <span className="trb-label">{t.label}</span>
      <span className="trb-fig">{short(t.starts)}{t.ends ? '–' + short(t.ends) : ''}</span>
    </>
  )
}
