import { useEffect, useRef, useState } from 'react'
import {
  addMarkup, cloudPath, editMarkup, measure, removeMarkup,
  type Geometry, type Markup, type MarkupKind, type Point,
} from '../lib/markups'

/**
 * What people have drawn on a sheet, and the drawing of it.
 *
 * Shapes are kept and drawn in fractions of the page, so one SVG with a 0–1 viewBox sits over the
 * sheet at any zoom and never has to be recalculated. Strokes are told not to scale with it, or a
 * line drawn at fit-to-screen would become a stripe at 400%.
 */
export function MarkupLayer({ markups, tool, colour, projectId, sheetId, revisionId, scale, aspect, me, onChange, onPick, selected, onSelect, keep = true }: {
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
  /** Which markup is picked up, with Select. The viewer holds it so the palette can recolour it. */
  selected?: string | null
  onSelect?: (id: string | null) => void
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

  const at = (e: React.PointerEvent): Point => {
    // The layer, not whatever the event happened to land on — a handle's own box would give
    // coordinates in the wrong frame, and a detached one gives none at all.
    const r = (layer.current ?? (e.currentTarget as HTMLElement)).getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    }
  }

  function down(e: React.PointerEvent) {
    // A shape begun with a click is finished by the next one.
    if (waiting.current && live.current) {
      const from = waiting.current
      const kind = live.current.kind
      waiting.current = null
      start.current = null
      const to = square(from, at(e), e.shiftKey)
      setLive(null)
      void finish({ kind, geometry: { from, to } }, from)
      return
    }
    if (tool === 'select') {
      // Pressing anywhere that isn't a markup lets go of the one in hand.
      if (!(e.target as HTMLElement).closest('.mk-pickable, .mk-handle, .mk-note')) onSelect?.(null)
      return
    }
    if (!tool || tool === 'erase') return
    if ((e.target as HTMLElement).closest('.mk-note, .mk-hit')) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const p = at(e)
    start.current = p
    setLive(tool === 'ink'
      ? { kind: 'ink', geometry: { points: [[p.x, p.y]] } }
      : twoEnded(tool)
        ? { kind: tool as MarkupKind, geometry: { from: p, to: p } }
        : { kind: tool as MarkupKind, geometry: { x: p.x, y: p.y, w: 0, h: 0 } })
  }

  function move(e: React.PointerEvent) {
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
        const g = d.geometry as { points: [number, number][] }
        return { ...d, geometry: { points: [...g.points, [p.x, p.y]] } }
      }
      if (twoEnded(d.kind)) return { ...d, geometry: { from: s, to: square(s, p, e.shiftKey) } }
      return { ...d, geometry: { x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) } }
    })())
  }

  /** A finished shape: kept, or handed to whoever is picking the scale line. */
  async function finish(made: { kind: MarkupKind; geometry: Geometry }, from: Point) {
    waiting.current = null
    if (onPick && made.kind === 'dimension') {
      const g = made.geometry as { from: Point; to: Point }
      onPick(g.from, g.to)
      return
    }
    // Scratch marks are the same thing on screen and nothing at all on disk: no row, no queue,
    // no trip to the server. Closing the sheet is what gets rid of them.
    const saved = keep
      ? await addMarkup({
          sheetId, projectId, revisionId, kind: made.kind, geometry: made.geometry,
          style: { colour, width: 2 },
          body: made.kind === 'text' ? '' : null,
        })
      : {
          id: `scratch:${crypto.randomUUID()}`,
          sheet_id: sheetId, project_id: projectId, revision_id: revisionId,
          kind: made.kind, geometry: made.geometry, style: { colour, width: 2 },
          body: made.kind === 'text' ? '' : null,
          created_by: me, created_at: new Date().toISOString(),
        } as Markup
    onChange([...markups, saved])
    if (saved.kind === 'text') setEditing({ id: saved.id, body: '' })
    void from
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
      ? (made.geometry as { points: [number, number][] }).points.length >= 3
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
    await finish(made, from)
  }

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
        const g = m.geometry as { points: [number, number][] }
        return <path key={key} {...common} d={g.points.map((p, i) => `${i ? 'L' : 'M'} ${p[0]} ${p[1]}`).join(' ')} />
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
      onPointerDown={down} onPointerMove={move} onPointerUp={up}>
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
