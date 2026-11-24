import { useEffect, useRef, useState } from 'react'

/**
 * A photograph that can be looked into (Jacob, 11/24: zoom in while viewing photos at a desk).
 * The wheel zooms about the pointer; double-click goes to 2.5× there and back; drag moves it
 * once zoomed; two fingers pinch on a touch screen; − / + / Fit in the corner. The picture never
 * leaves its frame. What is inside (the photograph and any ink drawn on it) scales together.
 */
export function ZoomPhoto({ children }: { children: React.ReactNode }) {
  const box = useRef<HTMLDivElement | null>(null)
  const [v, setV] = useState({ k: 1, x: 0, y: 0 })
  const now = useRef(v)
  useEffect(() => { now.current = v })

  const clamp = (k: number, x: number, y: number) => {
    const r = box.current?.getBoundingClientRect()
    if (!r || k <= 1) return { k: 1, x: 0, y: 0 }
    return { k, x: Math.min(0, Math.max(r.width - r.width * k, x)), y: Math.min(0, Math.max(r.height - r.height * k, y)) }
  }
  /** Zoom to k keeping the point (px, py), in the frame's own pixels, where it is. */
  const zoomAt = (k: number, px: number, py: number) => {
    const c = now.current, nk = Math.min(8, Math.max(1, k))
    setV(clamp(nk, px - (px - c.x) * (nk / c.k), py - (py - c.y) * (nk / c.k)))
  }
  const local = (cx: number, cy: number) => { const r = box.current!.getBoundingClientRect(); return [cx - r.left, cy - r.top] as const }

  // The wheel, attached directly so the page itself does not scroll or zoom.
  useEffect(() => {
    const el = box.current
    if (!el) return
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const [px, py] = local(e.clientX, e.clientY)
      zoomAt(now.current.k * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022)), px, py)
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Pointers: one drags (when zoomed), two pinch.
  const pts = useRef(new Map<number, { x: number; y: number }>())
  const last = useRef<{ x: number; y: number; d: number } | null>(null)
  const down = (e: React.PointerEvent) => {
    if (e.button > 0) return
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    last.current = null
  }
  const move = (e: React.PointerEvent) => {
    if (!pts.current.has(e.pointerId)) return
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const ps = [...pts.current.values()]
    const cx = ps.reduce((s, p) => s + p.x, 0) / ps.length, cy = ps.reduce((s, p) => s + p.y, 0) / ps.length
    const d = ps.length > 1 ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) : 0
    const l = last.current
    last.current = { x: cx, y: cy, d }
    if (!l) return
    const c = now.current
    if (ps.length > 1 && l.d > 0) {
      const [px, py] = local(cx, cy)
      const nk = Math.min(8, Math.max(1, c.k * (d / l.d)))
      setV(clamp(nk, px - (px - c.x) * (nk / c.k) + (cx - l.x), py - (py - c.y) * (nk / c.k) + (cy - l.y)))
    } else if (c.k > 1) setV(clamp(c.k, c.x + (cx - l.x), c.y + (cy - l.y)))
  }
  const up = (e: React.PointerEvent) => { pts.current.delete(e.pointerId); last.current = null }

  const step = (f: number) => { const r = box.current!.getBoundingClientRect(); zoomAt(now.current.k * f, r.width / 2, r.height / 2) }
  return (
    <div ref={box} className={`zp${v.k > 1 ? ' zoomed' : ''}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      onDoubleClick={(e) => { const [px, py] = local(e.clientX, e.clientY); if (now.current.k > 1) setV({ k: 1, x: 0, y: 0 }); else zoomAt(2.5, px, py) }}>
      <div className="zp-in" style={{ transform: `translate(${v.x}px, ${v.y}px) scale(${v.k})` }}>{children}</div>
      <div className="zp-tools" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        <button onClick={() => step(1 / 1.6)} disabled={v.k <= 1} aria-label="Zoom out">−</button>
        <span>{Math.round(v.k * 100)}%</span>
        <button onClick={() => step(1.6)} disabled={v.k >= 8} aria-label="Zoom in">+</button>
        <button onClick={() => setV({ k: 1, x: 0, y: 0 })} disabled={v.k <= 1}>Fit</button>
      </div>
    </div>
  )
}
