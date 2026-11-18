import { useEffect, useRef, useState } from 'react'
import {
  areaOf, buildMarkup, cloudPath, editMarkup, measure, removeMarkup, saveMarkup, squareFeet,
  type Geometry, type InkPoint, type Markup, type MarkupKind, type Point,
} from '../lib/markups'
import { message } from '../lib/errors'

/**
 * What people have drawn on a sheet, and the drawing of it.
 *
 * Shapes are kept and drawn in fractions of the page, so one SVG with a 0–1 viewBox sits over the
 * sheet at any zoom and never has to be recalculated. Strokes are told not to scale with it, or a
 * line drawn at fit-to-screen would become a stripe at 400%.
 */
export interface StylusReading {
  pressure: number
  tiltX: number
  tiltY: number
  /** How many samples came behind the last move event — 0 where the browser doesn't hand them over. */
  coalesced: number
  at: number
}

export function MarkupLayer({ markups, tool, colour, projectId, sheetId, revisionId, scale, aspect, me, onChange, onPick, selected, onSelect, keep = true, onTrouble, onStylus }: {
  markups: Markup[]
  /** Null when the sheet is being read rather than drawn on. */
  tool: MarkupKind | 'erase' | 'select' | null
  colour: string
  projectId: string
  sheetId: string
  revisionId: string
  scale: { from: Point; to: Point; inches: number } | null
  aspect: number
  me: string | null
  onChange: (markups: Markup[]) => void
  /** Picking the two ends of the scale line, when that's what's being set. */
  onPick?: (from: Point, to: Point) => void
  /** False while marks are scratch: drawn on screen, never written anywhere. */
  keep?: boolean
  /** Something went wrong keeping a mark — worth saying, never worth losing the mark over. */
  onTrouble?: (m: string) => void
  /** Which markup is picked up, with Select. The viewer holds it so the palette can recolour it. */
  selected?: string | null
  onSelect?: (id: string | null) => void
  /** What a stylus is reporting, for the readout that says whether this device reports anything. */
  onStylus?: (r: StylusReading) => void
}) {
  const [drawing, setDrawing] = useState<{ kind: MarkupKind; geometry: Geometry } | null>(null)
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null)
  const start = useRef<Point | null>(null)
  /** Where a click-click line began, while it waits for its second click. */
  const waiting = useRef<Point | null>(null)
  /**
   * The shape being drawn, as a ref as well as state.
   *
   * A click is a pointerdown and a pointerup in the same tick, and React has not re-rendered in
   * between — so the state `drawing` is still null when pointerup runs, and a click that starts
   * a line looked to the release like nothing had started. The ref is written synchronously and
   * is what the release reads; the state is what draws.
   */
  const live = useRef<{ kind: MarkupKind; geometry: Geometry } | null>(null)
  /** The corners put down so far on an area, while it is still being clicked out. */
  const poly = useRef<[number, number][] | null>(null)
  const layer = useRef<HTMLDivElement>(null)
  const setLive = (d: { kind: MarkupKind; geometry: Geometry } | null) => { live.current = d; setDrawing(d) }
  /** Which handle of the selected markup is being dragged, and where it started. */
  const grabbed = useRef<{ id: string; handle: Handle; from: Geometry; at: Point } | null>(null)
  const [dragGeom, setDragGeom] = useState<{ id: string; geometry: Geometry } | null>(null)

  useEffect(() => {
    if (tool) return
    waiting.current = null
    setLive(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool])

  const picked = selected ? markups.find((m) => m.id === selected) ?? null : null
  const mineToEdit = (m: Markup) => !m.created_by || !me || m.created_by === me

  /** Kinds drawn from one point to another, which are the ones shift and click-click apply to. */
  const twoEnded = (k: string) => k === 'line' || k === 'arrow' || k === 'dimension'

  /**
   * Square the second point up with the first while shift is held.
   *
   * Orthographic on a drawing means horizontal or vertical, so whichever of the two the line is
   * closer to wins. The page is wider than it is tall in page fractions, so the horizontal
   * distance is weighted by the aspect before they are compared, or a line that looks 45° would
   * not behave like one.
   */
  const square = (from: Point, to: Point, on: boolean): Point => {
    if (!on) return to
    const dx = Math.abs(to.x - from.x) * aspect
    const dy = Math.abs(to.y - from.y)
    return dx >= dy ? { x: to.x, y: from.y } : { x: from.x, y: to.y }
  }

  const at = (e: { clientX: number; clientY: number; currentTarget?: EventTarget | null }): Point => {
    // The layer, not whatever the event happened to land on — a handle's own box would give
    // coordinates in the wrong frame, and a detached one gives none at all.
    const r = (layer.current ?? (e.currentTarget as HTMLElement)).getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    }
  }

  /**
   * Every sample behind one move event.
   *
   * The screen reports a pointer move once a frame; a stylus samples several times faster, and
   * the samples in between are merged into the move event rather than thrown away.
   * getCoalescedEvents hands them back, which is the difference between a traced wall and a
   * chain of short straight segments. Safari got it in 18.2, so it is asked for rather than
   * assumed.
   *
   * iOS Safari reports the wrong pointerId on coalesced samples — Flutter hit this and worked
   * around it — so a sample is taken when its id matches or when it has none to speak of,
   * rather than trusting the id to route anything.
   */
  function samples(e: React.PointerEvent): InkPoint[] {
    const native = e.nativeEvent as PointerEvent
    let raw: PointerEvent[] = []
    try {
      raw = typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : []
    } catch { raw = [] }
    const mine = raw.filter((s) => !s.pointerId || s.pointerId === native.pointerId)
    const list = mine.length ? mine : [native]
    return list.map((s) => {
      const p = at(s)
      return force(s) == null ? [p.x, p.y] as InkPoint : [p.x, p.y, force(s)!] as InkPoint
    })
  }

  /**
   * How hard a stylus was pressed, or nothing for anything that can't say.
   *
   * A mouse reports a flat 0.5 while a button is down and a finger usually reports 0 or 0.5, so
   * a width taken from those would be noise dressed as expression. Only a pen is believed, and
   * only when what it reports actually moves.
   */
  function force(e: PointerEvent): number | null {
    if (e.pointerType !== 'pen') return null
    const p = e.pressure
    return typeof p === 'number' && p > 0 && p < 1 ? p : p === 1 ? 1 : null
  }

  /**
   * The pen's own hand, and keeping the hand it rests on out of the way.
   *
   * iOS already drops touches while a pen is in use, but not every device does and the drop is
   * not instant, so a touch arriving within a couple of seconds of a pen sample is taken for a
   * palm and ignored.
   */
  const penAt = useRef(0)
  const penned = (e: React.PointerEvent) => {
    if (e.pointerType === 'pen') { penAt.current = Date.now(); report(e); return false }
    return e.pointerType === 'touch' && Date.now() - penAt.current < 2000
  }

  const report = (e: React.PointerEvent) => {
    if (!onStylus) return
    const n = e.nativeEvent as PointerEvent
    onStylus({
      pressure: n.pressure, tiltX: n.tiltX ?? 0, tiltY: n.tiltY ?? 0,
      coalesced: typeof n.getCoalescedEvents === 'function' ? n.getCoalescedEvents().length : 0,
      at: Date.now(),
    })
  }

  function down(e: React.PointerEvent) {
    if (penned(e)) return
    // An area is clicked corner by corner, and closed by coming back to where it started,
    // by double-clicking, or by pressing Enter.
    if (tool === 'area') {
      const p = at(e)
      const started = poly.current
      if (!started) {
        poly.current = [[p.x, p.y]]
        setLive({ kind: 'area', geometry: { points: [[p.x, p.y], [p.x, p.y]] } })
        return
      }
      const [fx, fy] = started[0]
      if (started.length >= 3 && Math.hypot((p.x - fx) * aspect, p.y - fy) < 0.012) { closeArea(); return }
      poly.current = [...started, [p.x, p.y]]
      setLive({ kind: 'area', geometry: { points: [...poly.current, [p.x, p.y]] } })
      return
    }

    // A shape begun with a click is finished by the next one.
    if (waiting.current && live.current) {
      const from = waiting.current
      const kind = live.current.kind
      waiting.current = null
      start.current = null
      const to = square(from, at(e), e.shiftKey)
      setLive(null)
      finish({ kind, geometry: { from, to } }, from)
      return
    }
    if (tool === 'select') {
      // Pressing anywhere that isn't a markup lets go of the one in hand.
      if (!(e.target as HTMLElement).closest('.mk-pickable, .mk-handle, .mk-note')) onSelect?.(null)
      return
    }
    if (!tool || tool === 'erase') return
    if ((e.target as HTMLElement).closest('.mk-note, .mk-hit')) return
    // Capture keeps the stroke with this layer if the finger leaves it, but a browser that
    // refuses the capture must not cost the stroke — the drawing goes on without it.
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* draw anyway */ }
    const p = at(e)
    start.current = p
    setLive(tool === 'ink'
      ? { kind: 'ink', geometry: { points: samples(e) } }
      : twoEnded(tool)
        ? { kind: tool as MarkupKind, geometry: { from: p, to: p } }
        : { kind: tool as MarkupKind, geometry: { x: p.x, y: p.y, w: 0, h: 0 } })
  }

  function move(e: React.PointerEvent) {
    if (penned(e)) return
    if (tool === 'area' && poly.current) {
      const p = at(e)
      setLive({ kind: 'area', geometry: { points: [...poly.current, [p.x, p.y]] } })
      return
    }
    // Waiting for a second click: the shape follows the pointer with nothing held down.
    if (waiting.current && live.current) {
      const from = waiting.current
      setLive(live.current ? { ...live.current, geometry: { from, to: square(from, at(e), e.shiftKey) } } : null)
      return
    }
    const g = grabbed.current
    if (g) {
      setDragGeom({ id: g.id, geometry: moveHandle(g.from, g.handle, at(e), g.at) })
      return
    }
    if (!live.current || !start.current) return
    const p = at(e)
    const s = start.current
    setLive((() => {
      const d = live.current
      if (!d) return d
      if (d.kind === 'ink') {
        const g = d.geometry as { points: InkPoint[] }
        return { ...d, geometry: { points: [...g.points, ...samples(e)] } }
      }
      if (twoEnded(d.kind)) return { ...d, geometry: { from: s, to: square(s, p, e.shiftKey) } }
      return { ...d, geometry: { x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) } }
    })())
  }

  /**
   * A finished shape.
   *
   * It goes on screen first and is written down second. The other way round — awaiting storage
   * and then adding it — means any failure takes the line with it, silently, because the preview
   * has already been cleared by then. Nothing you have just drawn should depend on a database
   * being reachable.
   */
  function finish(made: { kind: MarkupKind; geometry: Geometry }, _from: Point) {
    waiting.current = null
    if (onPick && made.kind === 'dimension') {
      const g = made.geometry as { from: Point; to: Point }
      onPick(g.from, g.to)
      return
    }

    const row = buildMarkup({
      sheetId, projectId, revisionId, kind: made.kind, geometry: made.geometry,
      style: { colour, width: 2 },
      body: made.kind === 'text' ? '' : null,
      by: me,
    })
    // Scratch marks are the same thing on screen and nothing at all on disk.
    const saved = keep ? row : { ...row, id: `scratch:${row.id}` }
    onChange([...markups, saved])
    if (saved.kind === 'text') setEditing({ id: saved.id, body: '' })
    if (keep) void saveMarkup(row).catch((e: unknown) => onTrouble?.(message(e)))
  }

  async function up(e: React.PointerEvent) {
    // Finishing a handle drag, not a new shape.
    const g = grabbed.current
    if (g) {
      grabbed.current = null
      const moved = dragGeom
      setDragGeom(null)
      if (moved && JSON.stringify(moved.geometry) !== JSON.stringify(g.from)) {
        onChange(markups.map((m) => (m.id === g.id ? { ...m, geometry: moved.geometry } : m)))
        if (!isScratch(g.id)) await editMarkup(g.id, { geometry: moved.geometry })
      }
      return
    }
    if (waiting.current) return   // mid click-click: the next press is what finishes it

    const made = live.current
    const from = start.current
    start.current = null
    if (!made || !from) { setLive(null); return }

    const travelled = made.kind === 'ink'
      ? (made.geometry as { points: InkPoint[] }).points.length >= 3
      : twoEnded(made.kind)
        ? Math.hypot((made.geometry as { from: Point; to: Point }).to.x - from.x,
                     (made.geometry as { from: Point; to: Point }).to.y - from.y) >= 0.004
        : (made.geometry as { w: number; h: number }).w >= 0.004 && (made.geometry as { w: number; h: number }).h >= 0.004

    // A press and release in one spot starts a line rather than throwing it away: the second
    // click sets the far end. Dragging it out in one go still works, which is what most hands do.
    if (!travelled && twoEnded(made.kind)) {
      waiting.current = from
      setLive({ kind: made.kind, geometry: { from, to: square(from, at(e), e.shiftKey) } })
      return
    }

    setLive(null)
    if (!travelled) return
    finish(made, from)
  }

  /** Three corners or more is an area; anything less is abandoned. */
  function closeArea() {
    const pts = poly.current
    poly.current = null
    setLive(null)
    if (!pts || pts.length < 3) return
    finish({ kind: 'area', geometry: { points: pts } }, { x: pts[0][0], y: pts[0][1] })
  }

  useEffect(() => {
    if (tool !== 'area') { poly.current = null; return }
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea')) return
      if (e.key === 'Enter') { e.preventDefault(); closeArea() }
      if (e.key === 'Escape' && poly.current) { e.preventDefault(); poly.current = null; setLive(null) }
      // Backspace takes back the last corner rather than the whole thing.
      if (e.key === 'Backspace' && poly.current && poly.current.length > 1) {
        e.preventDefault()
        poly.current = poly.current.slice(0, -1)
        setLive({ kind: 'area', geometry: { points: [...poly.current, poly.current[poly.current.length - 1]] } })
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool])

  const isScratch = (id: string) => id.startsWith('scratch:')

  async function erase(m: Markup) {
    if (m.created_by && me && m.created_by !== me) return
    onChange(markups.filter((x) => x.id !== m.id))
    if (!isScratch(m.id)) await removeMarkup(m.id)
  }

  async function saveNote() {
    if (!editing) return
    onChange(markups.map((m) => (m.id === editing.id ? { ...m, body: editing.body } : m)))
    setEditing(null)
    if (!isScratch(editing.id)) await editMarkup(editing.id, { body: editing.body })
  }

  const stroke = (m: Markup | { style: Markup['style'] }) => m.style?.colour ?? '#c0392b'
  const pct = (g: { x: number; y: number; w: number; h: number }) => ({
    left: `${g.x * 100}%`, top: `${g.y * 100}%`, width: `${g.w * 100}%`, height: `${g.h * 100}%`,
  })

  const shape = (m: Markup | { kind: MarkupKind; geometry: Geometry; style: Markup['style']; id?: string }, key: string, live = false) => {
    const colourOf = stroke(m)
    const common = {
      stroke: colourOf, fill: 'none', strokeWidth: (m.style?.width ?? 2),
      vectorEffect: 'non-scaling-stroke' as const, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
      opacity: live ? 0.75 : 1,
    }
    switch (m.kind) {
      case 'ink': {
        const g = m.geometry as { points: InkPoint[] }
        const runs = inkRuns(g.points, m.style?.width ?? 2)
        // One path at one width is what a finger or a mouse draws, and what everything drawn
        // before a stylus was ever held draws too.
        if (runs.length <= 1) {
          return <path key={key} {...common} d={g.points.map((p, i) => `${i ? 'L' : 'M'} ${p[0]} ${p[1]}`).join(' ')} />
        }
        return (
          <g key={key} opacity={common.opacity}>
            {runs.map((r, i) => (
              <path key={i} {...common} opacity={1} strokeWidth={r.width} d={r.d} />
            ))}
          </g>
        )
      }
      case 'area': {
        const g = m.geometry as { points: [number, number][] }
        if (g.points.length < 2) return null
        const d = `M ${g.points.map(([x, y]) => `${x} ${y}`).join(' L ')} Z`
        return <path key={key} {...common} d={d} fill={(m.style?.colour ?? colour)} fillOpacity={0.12} />
      }
      case 'line': {
        const g = m.geometry as { from: Point; to: Point }
        return <line key={key} {...common} x1={g.from.x} y1={g.from.y} x2={g.to.x} y2={g.to.y} />
      }
      case 'arrow':
      case 'dimension': {
        const g = m.geometry as { from: Point; to: Point }
        const angle = Math.atan2(g.to.y - g.from.y, (g.to.x - g.from.x) * aspect)
        const head = 0.012
        const wing = (turn: number) => [
          g.to.x - (Math.cos(angle + turn) * head) / aspect,
          g.to.y - Math.sin(angle + turn) * head,
        ]
        const [ax, ay] = wing(0.4)
        const [bx, by] = wing(-0.4)
        return (
          <g key={key}>
            <line {...common} x1={g.from.x} y1={g.from.y} x2={g.to.x} y2={g.to.y} />
            <path {...common} d={`M ${ax} ${ay} L ${g.to.x} ${g.to.y} L ${bx} ${by}`} />
            {m.kind === 'dimension' && (
              <path {...common} d={`M ${g.from.x - (Math.cos(angle + 0.4) * -head) / aspect} ${g.from.y + Math.sin(angle + 0.4) * head} L ${g.from.x} ${g.from.y} L ${g.from.x - (Math.cos(angle - 0.4) * -head) / aspect} ${g.from.y + Math.sin(angle - 0.4) * head}`} />
            )}
          </g>
        )
      }
      case 'rect': {
        const g = m.geometry as { x: number; y: number; w: number; h: number }
        return <rect key={key} {...common} x={g.x} y={g.y} width={g.w} height={g.h} />
      }
      case 'cloud': {
        const g = m.geometry as { x: number; y: number; w: number; h: number }
        return <path key={key} {...common} d={cloudPath(g.x, g.y, g.w, g.h)} />
      }
      default:
        return null
    }
  }

  return (
    <div ref={layer} className={`mk-layer${tool ? ' on' : ''}${tool === 'select' ? ' picking' : ''}`}
      onPointerDown={down} onPointerMove={move} onPointerUp={up}
      onDoubleClick={(e) => { if (tool === 'area' && poly.current) { e.preventDefault(); closeArea() } }}>
      <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="mk-svg">
        {markups.filter((m) => m.kind !== 'text').map((m) => shape(dragGeom?.id === m.id ? { ...m, geometry: dragGeom.geometry } : m, m.id))}
        {drawing && shape({ ...drawing, style: { colour, width: 2 } }, 'live', true)}
      </svg>

      {/* What a dimension says, while it is being drawn and after. */}
      {[...markups.filter((m) => m.kind === 'dimension'), ...(drawing?.kind === 'dimension' ? [{ ...drawing, id: 'live', style: { colour } } as unknown as Markup] : [])].map((m) => {
        const g = m.geometry as { from: Point; to: Point }
        const label = measure(g.from, g.to, scale, aspect)
        if (!label) return null
        return (
          <span key={`d${m.id}`} className="mk-dim" style={{ left: `${((g.from.x + g.to.x) / 2) * 100}%`, top: `${((g.from.y + g.to.y) / 2) * 100}%`, color: stroke(m) }}>
            {label}
          </span>
        )
      })}

      {/* What an area comes to, once there's a scale to work it out from. */}
      {[...markups.filter((m) => m.kind === 'area'), ...(drawing?.kind === 'area' ? [{ ...drawing, id: 'live', style: { colour } } as unknown as Markup] : [])].map((m) => {
        const pts = (m.geometry as { points: [number, number][] }).points
        const sqft = areaOf(pts, scale, aspect)
        if (sqft == null) return null
        const mid = pts.reduce((a, [x, y]) => ({ x: a.x + x / pts.length, y: a.y + y / pts.length }), { x: 0, y: 0 })
        return (
          <span key={`a${m.id}`} className="mk-dim mk-area" style={{ left: `${mid.x * 100}%`, top: `${mid.y * 100}%`, color: stroke(m) }}>
            {squareFeet(sqft)}
          </span>
        )
      })}

      {/* Notes are HTML, so the words wrap and can be typed into. */}
      {markups.filter((m) => m.kind === 'text').map((m) => {
        const g = m.geometry as { x: number; y: number; w: number; h: number }
        const mine = !m.created_by || m.created_by === me
        return (
          <div key={m.id} className="mk-note" style={{ ...pct(g), borderColor: stroke(m) }}>
            {editing?.id === m.id ? (
              <textarea
                autoFocus value={editing.body}
                onChange={(e) => setEditing({ id: m.id, body: e.target.value })}
                onBlur={saveNote}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveNote() }}
                placeholder="Note"
              />
            ) : (
              <button className="mk-note-body" onClick={() => mine && setEditing({ id: m.id, body: m.body ?? '' })}>
                {m.body || <span className="muted">Empty note</span>}
              </button>
            )}
          </div>
        )
      })}

      {/* Select: something to click on each markup, then handles on the one that's picked up. */}
      {tool === 'select' && markups.map((m) => {
        if (m.kind === 'text') return null  // a note is already a thing you click
        const box = pad(boundsOf(m.geometry))
        return (
          <button key={`s${m.id}`} className={`mk-pickable${selected === m.id ? ' on' : ''}`} style={pct(box)}
            aria-label={`Select this ${m.kind}`}
            onPointerDown={(e) => { e.stopPropagation(); onSelect?.(m.id) }} />
        )
      })}
      {tool === 'select' && picked && mineToEdit(picked) && handlesOf(dragGeom?.id === picked.id ? dragGeom.geometry : picked.geometry).map((h) => (
        <button key={`h${h.name}`} className="mk-handle" aria-label={`Drag ${h.name}`}
          style={{ left: `${h.at.x * 100}%`, top: `${h.at.y * 100}%` }}
          onPointerDown={(e) => {
            e.stopPropagation()
            ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
            grabbed.current = { id: picked.id, handle: h.name, from: picked.geometry, at: at(e) }
          }}
          onPointerMove={move}
          onPointerUp={up}
        />
      ))}

      {/* In erase mode every markup gets something to hit. */}
      {tool === 'erase' && markups.map((m) => {
        const box = boundsOf(m.geometry)
        const mine = !m.created_by || m.created_by === me
        return (
          <button key={`e${m.id}`} className={`mk-hit${mine ? '' : ' theirs'}`} style={pct(box)}
            title={mine ? 'Remove this markup' : 'Only the person who drew this can remove it'}
            onClick={() => erase(m)} />
        )
      })}
    </div>
  )
}

/** The rectangle a shape occupies, for hit targets. */
function boundsOf(g: Geometry): { x: number; y: number; w: number; h: number } {
  if ('points' in g) {
    const xs = g.points.map((p) => p[0]), ys = g.points.map((p) => p[1])
    const x = Math.min(...xs), y = Math.min(...ys)
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
  }
  if ('from' in g) {
    const x = Math.min(g.from.x, g.to.x), y = Math.min(g.from.y, g.to.y)
    return { x, y, w: Math.abs(g.to.x - g.from.x), h: Math.abs(g.to.y - g.from.y) }
  }
  return g
}

type Handle = 'from' | 'to' | 'nw' | 'ne' | 'se' | 'sw'

const pad = (b: { x: number; y: number; w: number; h: number }) => ({
  x: b.x - 0.004, y: b.y - 0.004, w: b.w + 0.008, h: b.h + 0.008,
})

/**
 * Where a shape can be taken hold of.
 *
 * A line has its two ends; a box and a cloud have their corners. Ink is left alone — a freehand
 * stroke has no handle that means anything, and the way to change one is to rub it out and draw
 * it again.
 */
function handlesOf(g: Geometry): { name: Handle; at: Point }[] {
  if ('from' in g) return [{ name: 'from', at: g.from }, { name: 'to', at: g.to }]
  if ('points' in g) return []
  return [
    { name: 'nw', at: { x: g.x, y: g.y } },
    { name: 'ne', at: { x: g.x + g.w, y: g.y } },
    { name: 'se', at: { x: g.x + g.w, y: g.y + g.h } },
    { name: 'sw', at: { x: g.x, y: g.y + g.h } },
  ]
}

/** The shape after a handle has been dragged to a point. */
function moveHandle(g: Geometry, handle: Handle, to: Point, _from: Point): Geometry {
  if ('from' in g) return handle === 'from' ? { from: to, to: g.to } : { from: g.from, to }
  if ('points' in g) return g
  const x1 = g.x, y1 = g.y, x2 = g.x + g.w, y2 = g.y + g.h
  const [ax, ay] = handle === 'nw' ? [x2, y2] : handle === 'ne' ? [x1, y2] : handle === 'se' ? [x1, y1] : [x2, y1]
  return { x: Math.min(ax, to.x), y: Math.min(ay, to.y), w: Math.abs(to.x - ax), h: Math.abs(to.y - ay) }
}

/**
 * A pressure stroke, as a handful of paths rather than one.
 *
 * SVG gives a path a single stroke width, so a line that swells and tapers has to be drawn in
 * pieces. Drawing a piece per sample would put a thousand elements on a page, so widths are
 * rounded to a quarter of a pixel and consecutive samples at the same rounded width become one
 * path — a real stroke comes out as a dozen or so. Each piece starts where the last ended, or
 * the joins would show as gaps.
 *
 * Pressure runs the width from just over a third of the set width to a little over half again,
 * which is about what a felt tip does on paper. A stroke whose samples carry no pressure comes
 * back as one run, which is the caller's signal to draw it the plain way.
 */
function inkRuns(points: InkPoint[], base: number): { width: number; d: string }[] {
  if (points.length < 2) return []
  const widthAt = (p: InkPoint) => {
    const f = p.length > 2 ? (p[2] as number) : null
    if (f == null) return base
    return Math.round(base * (0.4 + 1.3 * f) * 4) / 4
  }
  const runs: { width: number; d: string }[] = []
  let width = widthAt(points[0])
  let run: InkPoint[] = [points[0]]
  for (let i = 1; i < points.length; i++) {
    const w = widthAt(points[i])
    if (w !== width) {
      run.push(points[i])
      runs.push({ width, d: pathOf(run) })
      // The next run begins at the point the last one ended on, so the pieces meet.
      run = [points[i]]
      width = w
    } else {
      run.push(points[i])
    }
  }
  if (run.length > 1) runs.push({ width, d: pathOf(run) })
  return runs
}

const pathOf = (points: InkPoint[]) =>
  points.map((p, i) => `${i ? 'L' : 'M'} ${p[0]} ${p[1]}`).join(' ')
