import { useRef, useState } from 'react'
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
export function MarkupLayer({ markups, tool, colour, projectId, sheetId, revisionId, scale, aspect, me, onChange, onPick }: {
  markups: Markup[]
  /** Null when the sheet is being read rather than drawn on. */
  tool: MarkupKind | 'erase' | null
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
}) {
  const [drawing, setDrawing] = useState<{ kind: MarkupKind; geometry: Geometry } | null>(null)
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null)
  const start = useRef<Point | null>(null)

  const at = (e: React.PointerEvent): Point => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    }
  }

  function down(e: React.PointerEvent) {
    if (!tool || tool === 'erase') return
    if ((e.target as HTMLElement).closest('.mk-note, .mk-hit')) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const p = at(e)
    start.current = p
    setDrawing(tool === 'ink'
      ? { kind: 'ink', geometry: { points: [[p.x, p.y]] } }
      : tool === 'arrow' || tool === 'dimension'
        ? { kind: tool, geometry: { from: p, to: p } }
        : { kind: tool, geometry: { x: p.x, y: p.y, w: 0, h: 0 } })
  }

  function move(e: React.PointerEvent) {
    if (!drawing || !start.current) return
    const p = at(e)
    const s = start.current
    setDrawing((d) => {
      if (!d) return d
      if (d.kind === 'ink') {
        const g = d.geometry as { points: [number, number][] }
        return { ...d, geometry: { points: [...g.points, [p.x, p.y]] } }
      }
      if (d.kind === 'arrow' || d.kind === 'dimension') return { ...d, geometry: { from: s, to: p } }
      return { ...d, geometry: { x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) } }
    })
  }

  async function up() {
    const made = drawing
    const from = start.current
    start.current = null
    setDrawing(null)
    if (!made || !from) return

    // Ignore a tap that was meant as a tap.
    const tiny = made.kind === 'ink'
      ? (made.geometry as { points: [number, number][] }).points.length < 3
      : made.kind === 'arrow' || made.kind === 'dimension'
        ? Math.hypot((made.geometry as { from: Point; to: Point }).to.x - from.x, (made.geometry as { from: Point; to: Point }).to.y - from.y) < 0.004
        : (made.geometry as { w: number; h: number }).w < 0.004 || (made.geometry as { w: number; h: number }).h < 0.004
    if (tiny) return

    if (onPick && made.kind === 'dimension') {
      const g = made.geometry as { from: Point; to: Point }
      onPick(g.from, g.to)
      return
    }

    const saved = await addMarkup({
      sheetId, projectId, revisionId, kind: made.kind, geometry: made.geometry,
      style: { colour, width: 2 },
      body: made.kind === 'text' ? '' : null,
    })
    onChange([...markups, saved])
    if (saved.kind === 'text') setEditing({ id: saved.id, body: '' })
  }

  async function erase(m: Markup) {
    if (m.created_by && me && m.created_by !== me) return
    await removeMarkup(m.id)
    onChange(markups.filter((x) => x.id !== m.id))
  }

  async function saveNote() {
    if (!editing) return
    await editMarkup(editing.id, { body: editing.body })
    onChange(markups.map((m) => (m.id === editing.id ? { ...m, body: editing.body } : m)))
    setEditing(null)
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
    <div className={`mk-layer${tool ? ' on' : ''}`} onPointerDown={down} onPointerMove={move} onPointerUp={up}>
      <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="mk-svg">
        {markups.filter((m) => m.kind !== 'text').map((m) => shape(m, m.id))}
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
