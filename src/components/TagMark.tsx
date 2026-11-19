import { useRef, useState } from 'react'
import { SHAPES, type Glyph, type Mark, type Shape } from '../lib/tags'

/** Each shape in a 24-unit box, and where on it the letters sit best. */
const SHAPE: Record<Shape, { d: string; cy: number; room: number }> = {
  circle: { d: 'M12 1.5a10.5 10.5 0 1 0 0 21a10.5 10.5 0 1 0 0-21Z', cy: 12, room: 14 },
  square: { d: 'M2.5 2.5h19v19h-19Z', cy: 12, room: 15 },
  diamond: { d: 'M12 0.8 23.2 12 12 23.2 0.8 12Z', cy: 12, room: 11 },
  triangle: { d: 'M12 1.5 23.2 21.5H0.8Z', cy: 15, room: 10 },
  hexagon: { d: 'M6.6 2.4h10.8L23 12l-5.6 9.6H6.6L1 12Z', cy: 12, room: 14 },
  flag: { d: 'M3 1.5h18v13.5l-9 8-9-8Z', cy: 9.5, room: 13 },
}

/** A tag's mark: the shape in its colour, with its letters or its drawn mark in white. */
export function TagMark({ mark, size = 26, faded = false }: { mark: Mark; size?: number; faded?: boolean }) {
  const s = SHAPE[mark.shape] ?? SHAPE.circle
  const text = (mark.text ?? '').slice(0, 3)
  const font = text.length <= 1 ? 12 : text.length === 2 ? 9.6 : 7.4
  const r = s.room / 2
  return (
    <svg className="tagmark" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={faded ? { opacity: 0.45 } : undefined}>
      <path d={s.d} fill={mark.colour} stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" paintOrder="stroke" />
      {mark.glyph?.length
        ? mark.glyph.map((run, i) => (
          <polyline key={i} fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            points={run.map(([x, y]) => `${(12 - r + x * s.room).toFixed(2)},${(s.cy - r + y * s.room).toFixed(2)}`).join(' ')} />
        ))
        : text && (
          <text x="12" y={s.cy} textAnchor="middle" dominantBaseline="central" fontSize={font} fontWeight="700"
            fill="#fff" style={{ fontFamily: 'inherit', letterSpacing: '-0.02em' }}>{text}</text>
        )}
    </svg>
  )
}

/**
 * Choosing what a mark looks like: shape, colour, up to three letters — or a mark drawn by
 * hand in place of the letters, on the shape it will sit on.
 */
export function MarkEditor({ title, start, onSave, onCancel, onRemove }: {
  title: string
  start: Mark
  onSave: (m: Mark) => void
  onCancel: () => void
  /** Present when this mark is the firm's own and can be put back to what it was. */
  onRemove?: () => void
}) {
  const [mark, setMark] = useState<Mark>(start)
  const [drawing, setDrawing] = useState(!!start.glyph?.length)
  const pad = useRef<SVGSVGElement>(null)
  const run = useRef<[number, number][] | null>(null)
  const s = SHAPE[mark.shape]
  const r = s.room / 2

  /** Where a touch is, as a fraction of the box the drawn mark lives in. */
  const point = (e: React.PointerEvent): [number, number] => {
    const box = pad.current!.getBoundingClientRect()
    const x = (e.clientX - box.left) / box.width * 24, y = (e.clientY - box.top) / box.height * 24
    const f = (v: number) => Math.min(1.15, Math.max(-0.15, v))
    return [+f((x - (12 - r)) / s.room).toFixed(3), +f((y - (s.cy - r)) / s.room).toFixed(3)]
  }
  const glyph: Glyph = mark.glyph ?? []

  return (
    <div className="markedit" role="dialog" aria-label={`Mark for ${title}`} onClick={onCancel}>
      <div className="markedit-card" onClick={(e) => e.stopPropagation()}>
        <h3><TagMark mark={mark} size={30} /> {title}</h3>
        <div className="markedit-row">
          <span className="chips-label">Shape</span>
          {SHAPES.map((shape) => (
            <button key={shape} type="button" className={`markedit-shape${mark.shape === shape ? ' on' : ''}`} aria-label={shape} aria-pressed={mark.shape === shape}
              onClick={() => setMark({ ...mark, shape })}>
              <TagMark mark={{ shape, colour: mark.colour, text: '' }} size={26} />
            </button>
          ))}
        </div>
        <div className="markedit-row">
          <label className="markedit-colour">Colour <input type="color" value={mark.colour} onChange={(e) => setMark({ ...mark, colour: e.target.value })} /></label>
          <span className="chips-label">On it</span>
          <button type="button" className={`chip${!drawing ? ' on' : ''}`} onClick={() => { setDrawing(false); setMark({ ...mark, glyph: null }) }}>Letters</button>
          <button type="button" className={`chip${drawing ? ' on' : ''}`} onClick={() => setDrawing(true)}>Sketch</button>
        </div>
        {!drawing ? (
          <label className="markedit-text">Up to three letters or numbers
            <input value={mark.text} maxLength={3} autoFocus onChange={(e) => setMark({ ...mark, text: e.target.value })} />
          </label>
        ) : (
          <div className="markedit-draw">
            <svg ref={pad} viewBox="0 0 24 24" className="markedit-pad"
              onPointerDown={(e) => { (e.currentTarget as Element).setPointerCapture(e.pointerId); run.current = [point(e)]; setMark({ ...mark, glyph: [...glyph, run.current] }) }}
              onPointerMove={(e) => {
                const cur = run.current
                if (!cur) return
                const p = point(e), last = cur[cur.length - 1]
                if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.03 || cur.length > 80) return
                cur.push(p)
                setMark({ ...mark, glyph: [...glyph.slice(0, -1), [...cur]] })
              }}
              onPointerUp={() => { run.current = null }} onPointerCancel={() => { run.current = null }}>
              <path d={s.d} fill={mark.colour} />
              {glyph.map((g, i) => (
                <polyline key={i} fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                  points={g.map(([x, y]) => `${12 - r + x * s.room},${s.cy - r + y * s.room}`).join(' ')} />
              ))}
            </svg>
            <div className="markedit-drawside">
              <p className="muted small">Draw on the shape. Keep it bold — on a sheet it is about this big:</p>
              <TagMark mark={mark} size={26} />
              <button type="button" onClick={() => setMark({ ...mark, glyph: glyph.slice(0, -1) })} disabled={!glyph.length}>Undo stroke</button>
              <button type="button" onClick={() => setMark({ ...mark, glyph: [] })} disabled={!glyph.length}>Clear</button>
            </div>
          </div>
        )}
        <div className="pcrop-acts">
          {onRemove && <button type="button" onClick={onRemove}>Back to the standard mark</button>}
          <span className="pcrop-gap" />
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" className="primary" onClick={() => onSave({ ...mark, text: mark.text.trim(), glyph: drawing && glyph.length ? glyph : null })}>Save mark</button>
        </div>
      </div>
    </div>
  )
}
