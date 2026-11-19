import { useCallback, useEffect, useRef, useState } from 'react'
import {
  addMark, listMarks, removeMarks, setMarkBody, setPad, watchPad,
  HIGHLIGHTS, PAD_COLOURS,
  type MarkKind, type NotePad as Pad, type PadMark, type PadRule,
} from '../lib/pads'
import { inkRuns, samplesFrom, type InkPoint } from '../lib/ink'
import { message } from '../lib/errors'
import { usDate } from '../lib/dates'

/**
 * A pad you write on. It takes the whole screen, because handwriting at thumbnail size is not
 * handwriting, and because a pad you are half looking at is a pad you stop using.
 *
 * The hand rule is the thing that makes it usable on a tablet: **the pen writes and fingers
 * never do.** One finger drags the page about, two pinch it; neither leaves a mark, so you can
 * rest a hand on the glass, shove the page up to reach the bottom of it, and write — without
 * ever reaching for a mode switch. Drawing with a finger is there for anyone without a stylus,
 * and it is a deliberate choice.
 *
 * Everything is kept in fractions of the page's width, so a stroke drawn on a phone is the
 * same stroke on a laptop, at any zoom, and the page's proportions hold.
 */

/** Letter, portrait, as a multiple of its own width. */
const PAGE_H = 11 / 8.5

type Tool = 'pen' | 'highlight' | 'text' | 'erase'

const WIDTHS = { fine: 0.0018, medium: 0.003, broad: 0.0052 } as const
type Width = keyof typeof WIDTHS

const RULES: { rule: PadRule; label: string }[] = [
  { rule: 'lines', label: 'Lines' },
  { rule: 'grid', label: 'Grid' },
  { rule: 'dots', label: 'Dots' },
  { rule: 'blank', label: 'Blank' },
]

/** How the view sits over the page: a scale and an offset, both in screen pixels. */
interface View { scale: number; x: number; y: number }

export function NotePad({ pad, onChanged, onClose, onTrouble }: {
  pad: Pad
  onChanged: (pad: Pad) => void
  /** Leaving the pad. The caller decides where that goes. */
  onClose: () => void
  onTrouble: (m: string) => void
}) {
  const [marks, setMarks] = useState<PadMark[]>([])
  const [page, setPage] = useState(1)
  const [tool, setTool] = useState<Tool>('pen')
  const [colour, setColour] = useState<string>(PAD_COLOURS[0])
  const [highlight, setHighlight] = useState<string>(HIGHLIGHTS[0])
  const [width, setWidth] = useState<Width>('medium')
  const [fingerDraws, setFingerDraws] = useState(false)
  const [wet, setWet] = useState<InkPoint[] | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [mine, setMine] = useState<string[]>([])
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 })
  /** The scale at which the page fits, so the readout can call that 100%. */
  const [fitted, setFitted] = useState(1)
  const [paper, setPaper] = useState(false)

  const frame = useRef<HTMLDivElement | null>(null)
  const surface = useRef<HTMLDivElement | null>(null)
  const drawing = useRef<number | null>(null)
  const erasing = useRef<Set<string>>(new Set())
  /** The fingers currently on the glass, by pointer id — how pinch and pan are worked out. */
  const fingers = useRef<Map<number, { x: number; y: number }>>(new Map())
  const gesture = useRef<{ dist: number; mid: { x: number; y: number }; view: View } | null>(null)

  // ---- what is on the pad ----------------------------------------------------------------

  const load = useCallback(() => {
    listMarks(pad.id).then(setMarks).catch((e) => onTrouble(message(e)))
  }, [pad.id, onTrouble])
  useEffect(() => { load() }, [load])

  useEffect(() => watchPad(pad.id, {
    added: (m) => setMarks((all) => (all.some((x) => x.id === m.id) ? all : [...all, m])),
    changed: (m) => setMarks((all) => all.map((x) => (x.id === m.id ? m : x))),
    removed: (id) => setMarks((all) => all.filter((x) => x.id !== id)),
  }), [pad.id])

  // Escape leaves the pad, as it does everywhere else.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !editing) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, editing])

  const here = marks.filter((m) => m.page === page)

  // ---- where the pen is, and where the fingers are ----------------------------------------

  /** A pointer's position in fractions of the page's width. */
  function at(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const box = surface.current?.getBoundingClientRect()
    if (!box || !box.width) return { x: 0, y: 0 }
    return { x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.width }
  }

  /** True when this pointer is one that writes rather than one that moves the page. */
  const writes = (e: React.PointerEvent): boolean =>
    e.pointerType === 'pen' || e.pointerType === 'mouse' || (e.pointerType === 'touch' && fingerDraws)

  function down(e: React.PointerEvent) {
    if (!writes(e)) {
      // A finger. It moves the page; it never leaves a mark.
      fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      gesture.current = null
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* not fatal */ }
      return
    }
    // A pen landing cancels whatever the fingers were doing, so a resting hand cannot drag the
    // page out from under the nib.
    fingers.current.clear()
    gesture.current = null

    if (tool === 'text') { void placeText(at(e)); return }
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* not fatal */ }
    drawing.current = e.pointerId
    if (tool === 'erase') { erasing.current = new Set(); rub(e); return }
    setWet(samplesFrom(e.nativeEvent as PointerEvent, at))
  }

  function move(e: React.PointerEvent) {
    if (fingers.current.has(e.pointerId)) { moveFingers(e); return }
    if (drawing.current !== e.pointerId) return
    if (tool === 'erase') { rub(e); return }
    const more = samplesFrom(e.nativeEvent as PointerEvent, at)
    setWet((w) => (w ? [...w, ...more] : more))
  }

  /** One finger drags the page; two pinch it and drag it at once. */
  function moveFingers(e: React.PointerEvent) {
    const was = fingers.current.get(e.pointerId)
    if (!was) return
    fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const all = [...fingers.current.values()]

    if (all.length === 1) {
      setView((v) => ({ ...v, x: v.x + (e.clientX - was.x), y: v.y + (e.clientY - was.y) }))
      return
    }
    if (all.length < 2) return

    const [a, b] = all
    const dist = Math.hypot(a.x - b.x, a.y - b.y)
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    if (!gesture.current) {
      setView((v) => { gesture.current = { dist, mid, view: v }; return v })
      return
    }
    const start = gesture.current
    if (start.dist < 1) return
    const scale = clamp(start.view.scale * (dist / start.dist), 0.4, 8)
    // Zoom about the midpoint of the two fingers, so the page grows under them rather than
    // running away towards a corner.
    const k = scale / start.view.scale
    setView({
      scale,
      x: mid.x - (start.mid.x - start.view.x) * k,
      y: mid.y - (start.mid.y - start.view.y) * k,
    })
  }

  function up(e: React.PointerEvent) {
    if (fingers.current.delete(e.pointerId)) {
      if (fingers.current.size < 2) gesture.current = null
      return
    }
    if (drawing.current !== e.pointerId) return
    drawing.current = null
    void finish()
  }

  async function finish() {
    if (tool === 'erase') {
      const ids = [...erasing.current]
      erasing.current = new Set()
      if (!ids.length) return
      setMarks((all) => all.filter((m) => !ids.includes(m.id)))
      try { await removeMarks(ids) } catch (e) { onTrouble(message(e)); load() }
      return
    }
    const points = wet
    setWet(null)
    if (!points || points.length < 2) return
    const kind: MarkKind = tool === 'highlight' ? 'highlight' : 'ink'
    try {
      const saved = await addMark({
        pad_id: pad.id, project_id: pad.project_id, page, kind,
        geometry: { points },
        style: {
          colour: kind === 'highlight' ? highlight : colour,
          width: kind === 'highlight' ? 0.022 : WIDTHS[width],
        },
      })
      setMine((m) => [...m, saved.id])
      setMarks((all) => (all.some((x) => x.id === saved.id) ? all : [...all, saved]))
    } catch (e) { onTrouble(message(e)) }
  }

  /** What the eraser is passing over. Strokes go whole: half a word is not a correction. */
  function rub(e: React.PointerEvent) {
    const p = at(e)
    for (const m of here) {
      if (erasing.current.has(m.id)) continue
      if (touches(m, p, 0.02)) erasing.current.add(m.id)
    }
    if (erasing.current.size) setMarks((all) => all.filter((m) => !erasing.current.has(m.id)))
  }

  async function placeText(p: { x: number; y: number }) {
    try {
      const saved = await addMark({
        pad_id: pad.id, project_id: pad.project_id, page, kind: 'text',
        geometry: { x: Math.min(p.x, 0.92), y: p.y, w: Math.min(0.56, 1 - p.x - 0.04) },
        style: { colour },
        body: '',
      })
      setMine((m) => [...m, saved.id])
      setMarks((all) => [...all, saved])
      setEditing(saved.id)
    } catch (e) { onTrouble(message(e)) }
  }

  async function undo() {
    const id = mine[mine.length - 1]
    if (!id) return
    setMine((m) => m.slice(0, -1))
    setMarks((all) => all.filter((m) => m.id !== id))
    try { await removeMarks([id]) } catch (e) { onTrouble(message(e)); load() }
  }

  async function addPage() {
    const pages = pad.pages + 1
    try { await setPad(pad.id, { pages }); onChanged({ ...pad, pages }); setPage(pages) }
    catch (e) { onTrouble(message(e)) }
  }

  async function setRule(rule: PadRule) {
    onChanged({ ...pad, rule })
    try { await setPad(pad.id, { rule }) } catch (e) { onTrouble(message(e)) }
  }

  // ---- fitting the page to the screen ------------------------------------------------------

  const fit = useCallback(() => {
    const box = frame.current?.getBoundingClientRect()
    if (!box || !box.width) return
    // Fit the page's height, with a little air, and centre it.
    const wide = box.width / BASE
    const tall = (box.height - 16) / (BASE * PAGE_H)
    const scale = clamp(Math.min(wide, tall), 0.4, 8)
    setFitted(scale)
    setView({ scale, x: (box.width - BASE * scale) / 2, y: 8 })
  }, [])

  useEffect(() => { fit() }, [fit])
  useEffect(() => {
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [fit])

  /**
   * On a desktop: the wheel and a two-finger trackpad swipe move the page; pinching on the
   * trackpad, or holding ctrl, zooms. That is the convention everywhere else, and a trackpad
   * pinch arrives as a wheel event with ctrlKey set, so both are the same branch.
   */
  function wheel(e: React.WheelEvent) {
    const box = frame.current?.getBoundingClientRect()
    if (!box) return
    if (!e.ctrlKey && !e.metaKey) {
      setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }))
      return
    }
    const k = clamp(1 - e.deltaY * 0.01, 0.8, 1.25)
    setView((v) => {
      const scale = clamp(v.scale * k, 0.4, 8)
      const grew = scale / v.scale
      const px = e.clientX - box.left
      const py = e.clientY - box.top
      return { scale, x: px - (px - v.x) * grew, y: py - (py - v.y) * grew }
    })
  }

  const inks = here.filter((m) => m.kind !== 'text')
  const texts = here.filter((m) => m.kind === 'text')
  const nib = tool === 'highlight' ? highlight : colour

  return (
    <div className="padview">
      <header className="padview-head">
        <button className="padview-back" onClick={onClose} aria-label="Back to Field notes">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
          Field notes
        </button>
        <span className="padview-title">
          <strong>{pad.title || 'Untitled'}</strong>
          <span className="muted small">{usDate(pad.noted_on)}</span>
        </span>
        <span className="padview-saved muted small">Saved as you write</span>
      </header>

      <div className="padview-tools">
        <div className="pad-tool-group">
          {(['pen', 'highlight', 'text', 'erase'] as Tool[]).map((t) => (
            <button key={t} className={tool === t ? 'on' : ''} onClick={() => setTool(t)}
              aria-pressed={tool === t}>
              {t === 'pen' ? 'Pen' : t === 'highlight' ? 'Highlighter' : t === 'text' ? 'Type' : 'Erase'}
            </button>
          ))}
        </div>

        {(tool === 'pen' || tool === 'highlight') && (
          <div className="pad-tool-group">
            {(tool === 'pen' ? PAD_COLOURS : HIGHLIGHTS).map((c) => (
              <button key={c} className={`pad-swatch${nib === c ? ' on' : ''}`} style={{ background: c }}
                onClick={() => (tool === 'pen' ? setColour(c) : setHighlight(c))}
                aria-label={`${tool === 'pen' ? 'Ink' : 'Highlighter'} ${c}`} />
            ))}
          </div>
        )}
        {tool === 'pen' && (
          <div className="pad-tool-group">
            {(['fine', 'medium', 'broad'] as Width[]).map((w) => (
              <button key={w} className={`pad-nib${width === w ? ' on' : ''}`} onClick={() => setWidth(w)}
                aria-label={w}>
                <span style={{ height: `${WIDTHS[w] * 1100}px`, background: colour }} />
              </button>
            ))}
          </div>
        )}

        <div className="pad-tool-group padview-tools-end">
          <button className="link" onClick={() => void undo()} disabled={!mine.length}>Undo</button>
          <button className={`link${paper ? ' on' : ''}`} onClick={() => setPaper(!paper)}>Paper</button>
          <button className="link" onClick={fit}>Fit</button>
        </div>
      </div>

      {paper && (
        <div className="padview-paper">
          <div className="pad-tool-group">
            {RULES.map((r) => (
              <button key={r.rule} className={pad.rule === r.rule ? 'on' : ''}
                onClick={() => void setRule(r.rule)}>{r.label}</button>
            ))}
          </div>
          <label className="check small">
            <input type="checkbox" checked={fingerDraws} onChange={(e) => setFingerDraws(e.target.checked)} />
            Draw with a finger
          </label>
          <span className="muted small">
            {fingerDraws
              ? 'A finger draws. Two fingers still pinch to zoom.'
              : 'The pen draws. One finger moves the page, two pinch to zoom.'}
          </span>
        </div>
      )}

      <div className="padview-frame" ref={frame} onWheel={wheel}
        onPointerDown={down} onPointerMove={move} onPointerUp={up}
        onPointerCancel={up} onPointerLeave={up}>
        <div className="pad-surface" ref={surface}
          style={{
            width: BASE, height: BASE * PAGE_H,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          }}>
          <svg className="pad-ink" viewBox={`0 0 1 ${PAGE_H}`} preserveAspectRatio="xMidYMin meet">
            <Paper rule={pad.rule} />
            {inks.map((m) => <Stroke key={m.id} mark={m} />)}
            {wet && (
              <g className={tool === 'highlight' ? 'pad-hl' : undefined}>
                {inkRuns(wet, tool === 'highlight' ? 0.022 : WIDTHS[width]).map((r, i) => (
                  <path key={i} d={r.d} stroke={nib} strokeWidth={r.width}
                    fill="none" strokeLinecap="round" strokeLinejoin="round" />
                ))}
              </g>
            )}
          </svg>

          {texts.map((m) => {
            const g = m.geometry as { x: number; y: number; w: number }
            return (
              <textarea key={m.id} className="pad-text"
                style={{
                  left: `${g.x * 100}%`, top: `${(g.y / PAGE_H) * 100}%`,
                  width: `${g.w * 100}%`, color: m.style.colour ?? undefined,
                }}
                defaultValue={m.body ?? ''}
                autoFocus={editing === m.id}
                placeholder="Type here"
                onPointerDown={(e) => e.stopPropagation()}
                onBlur={(e) => {
                  setEditing(null)
                  const body = e.target.value
                  if (body === (m.body ?? '')) return
                  setMarks((all) => all.map((x) => (x.id === m.id ? { ...x, body } : x)))
                  setMarkBody(m.id, body).catch((err) => onTrouble(message(err)))
                }} />
            )
          })}
        </div>
      </div>

      <footer className="padview-foot">
        <button className="icon" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">‹</button>
        <span className="muted small nowrap">Page {page} of {pad.pages}</span>
        <button className="icon" disabled={page >= pad.pages} onClick={() => setPage(page + 1)} aria-label="Next page">›</button>
        <button className="link" onClick={() => void addPage()}>Add a page</button>
        <span className="muted small nowrap padview-zoom">{Math.round((view.scale / fitted) * 100)}%</span>
      </footer>
    </div>
  )
}

/** The page's own width in layout pixels. Everything else is a scale on top of it. */
const BASE = 850

const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n))

/** What the paper looks like under the writing. */
export function Paper({ rule }: { rule: PadRule }) {
  if (rule === 'blank') return null
  const step = 0.042
  const rows = Math.floor(PAGE_H / step) - 1
  if (rule === 'dots') {
    const cols = Math.floor(1 / step) - 1
    return (
      <g className="pad-rules">
        {Array.from({ length: rows }, (_, r) =>
          Array.from({ length: cols }, (_, c) => (
            <circle key={`${r}-${c}`} cx={(c + 1) * step} cy={(r + 1) * step} r={0.0016} />
          )))}
      </g>
    )
  }
  return (
    <g className="pad-rules">
      {Array.from({ length: rows }, (_, i) => (
        <line key={`h${i}`} x1={rule === 'grid' ? 0.02 : 0.06} x2={rule === 'grid' ? 0.98 : 0.96}
          y1={(i + 2) * step} y2={(i + 2) * step} />
      ))}
      {rule === 'grid'
        ? Array.from({ length: Math.floor(1 / step) - 1 }, (_, i) => (
          <line key={`v${i}`} x1={(i + 1) * step} x2={(i + 1) * step} y1={0.02} y2={PAGE_H - 0.03} />
        ))
        : <line className="pad-margin" x1={0.09} x2={0.09} y1={0.02} y2={PAGE_H - 0.03} />}
    </g>
  )
}

export function Stroke({ mark }: { mark: PadMark }) {
  const g = mark.geometry as { points: InkPoint[] }
  if (!g?.points?.length) return null
  const runs = inkRuns(g.points, mark.style.width ?? 0.003)
  return (
    <g className={mark.kind === 'highlight' ? 'pad-hl' : undefined}>
      {runs.map((r, i) => (
        <path key={i} d={r.d} stroke={mark.style.colour ?? '#2b2d2c'} strokeWidth={r.width}
          fill="none" strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </g>
  )
}

/** Whether a mark passes within `reach` of a point — how the eraser finds what it is over. */
function touches(mark: PadMark, p: { x: number; y: number }, reach: number): boolean {
  const g = mark.geometry as { points?: InkPoint[]; x?: number; y?: number; w?: number }
  if (g.points) return g.points.some((q) => Math.hypot(q[0] - p.x, q[1] - p.y) < reach)
  if (g.x != null && g.y != null && g.w != null) {
    return p.x > g.x - reach && p.x < g.x + g.w + reach && p.y > g.y - reach && p.y < g.y + 0.08
  }
  return false
}

export { PAGE_H }

/**
 * A pad to read from rather than write on.
 *
 * What you want while typing something up is to see what you wrote, not to risk changing it
 * with a stray touch. So this is every page of it, stacked and read-only, at whatever width
 * it is given.
 */
export function PadPages({ pad, onTrouble }: { pad: Pad; onTrouble: (m: string) => void }) {
  const [marks, setMarks] = useState<PadMark[]>([])

  useEffect(() => {
    let gone = false
    listMarks(pad.id)
      .then((m) => { if (!gone) setMarks(m) })
      .catch((e) => { if (!gone) onTrouble(message(e)) })
    return () => { gone = true }
  }, [pad.id, onTrouble])

  return (
    <div className="pad-pages">
      {Array.from({ length: pad.pages }, (_, i) => {
        const n = i + 1
        const here = marks.filter((m) => m.page === n)
        return (
          <figure key={n} className="pad-page-read">
            <svg viewBox={`0 0 1 ${PAGE_H}`} preserveAspectRatio="xMidYMin meet">
              <Paper rule={pad.rule} />
              {here.filter((m) => m.kind !== 'text').map((m) => <Stroke key={m.id} mark={m} />)}
            </svg>
            {here.filter((m) => m.kind === 'text').map((m) => {
              const g = m.geometry as { x: number; y: number; w: number }
              return (
                <p key={m.id} className="pad-text-read" style={{
                  left: `${g.x * 100}%`, top: `${(g.y / PAGE_H) * 100}%`,
                  width: `${g.w * 100}%`, color: m.style.colour ?? undefined,
                }}>{m.body}</p>
              )
            })}
            {pad.pages > 1 && <figcaption className="muted small">Page {n}</figcaption>}
          </figure>
        )
      })}
    </div>
  )
}
