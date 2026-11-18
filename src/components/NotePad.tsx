import { useCallback, useEffect, useRef, useState } from 'react'
import {
  addMark, listMarks, removeMarks, setMarkBody, setPad, watchPad,
  HIGHLIGHTS, PAD_COLOURS,
  type MarkKind, type NotePad as Pad, type PadMark,
} from '../lib/pads'
import { inkRuns, palmGuard, samplesFrom, type InkPoint } from '../lib/ink'
import { message } from '../lib/errors'

/**
 * A pad you write on.
 *
 * The point of it is that the handwriting is the record. Notes get typed up afterwards from
 * what was written in the room, and the writing stays where it was — so a sentence that turns
 * out to matter three months later can be read in the hand that wrote it, on the day it was
 * written, rather than only in whatever somebody made of it that evening.
 *
 * Everything is kept in fractions of the page's width, so a stroke drawn on a phone is the
 * same stroke on a laptop, at any zoom, and the page's proportions hold.
 *
 * A finger pans and a pen draws, which is the one gesture rule that makes a pad usable on a
 * tablet without a mode switch. Drawing with a finger is a deliberate choice, and a toggle.
 */

/** Letter, portrait, as a multiple of its own width. */
const PAGE_H = 11 / 8.5

type Tool = 'pen' | 'highlight' | 'text' | 'erase'

const WIDTHS = { fine: 0.0018, medium: 0.003, broad: 0.0052 } as const
type Width = keyof typeof WIDTHS

export function NotePad({ pad, onChanged, onTrouble }: {
  pad: Pad
  onChanged: (pad: Pad) => void
  onTrouble: (m: string) => void
}) {
  const [marks, setMarks] = useState<PadMark[]>([])
  const [page, setPage] = useState(1)
  const [tool, setTool] = useState<Tool>('pen')
  const [colour, setColour] = useState<string>(PAD_COLOURS[0])
  const [highlight, setHighlight] = useState<string>(HIGHLIGHTS[0])
  const [width, setWidth] = useState<Width>('medium')
  const [zoom, setZoom] = useState(1)
  const [fingerDraws, setFingerDraws] = useState(false)
  const [wet, setWet] = useState<InkPoint[] | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)

  const surface = useRef<HTMLDivElement | null>(null)
  const drawing = useRef(false)
  const erasing = useRef<Set<string>>(new Set())
  const mine = useRef<string[]>([])
  const palm = useRef(palmGuard())

  // ---- what is on the pad ----------------------------------------------------------------

  const load = useCallback(() => {
    setBusy(true)
    listMarks(pad.id)
      .then((m) => setMarks(m))
      .catch((e) => onTrouble(message(e)))
      .finally(() => setBusy(false))
  }, [pad.id, onTrouble])
  useEffect(() => { load() }, [load])

  // Everything anybody else writes, as they write it. Our own rows arrive here too, so they
  // are matched on id rather than appended blindly.
  useEffect(() => watchPad(pad.id, {
    added: (m) => setMarks((all) => all.some((x) => x.id === m.id) ? all : [...all, m]),
    changed: (m) => setMarks((all) => all.map((x) => (x.id === m.id ? m : x))),
    removed: (id) => setMarks((all) => all.filter((x) => x.id !== id)),
  }), [pad.id])

  const here = marks.filter((m) => m.page === page)

  // ---- where the pen is ------------------------------------------------------------------

  /** A pointer's position in fractions of the page's width. */
  function at(e: PointerEvent): { x: number; y: number } {
    const box = surface.current?.getBoundingClientRect()
    if (!box || !box.width) return { x: 0, y: 0 }
    return { x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.width }
  }

  function down(e: React.PointerEvent) {
    if (palm.current.isPalm(e)) return
    if (e.pointerType === 'touch' && !fingerDraws) return     // a finger pans
    if (tool === 'text') { void placeText(at(e.nativeEvent as PointerEvent)); return }
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* not fatal */ }
    drawing.current = true
    if (tool === 'erase') { erasing.current = new Set(); rub(e); return }
    setWet(samplesFrom(e.nativeEvent as PointerEvent, at))
  }

  function move(e: React.PointerEvent) {
    if (!drawing.current) return
    if (palm.current.isPalm(e)) return
    if (tool === 'erase') { rub(e); return }
    const more = samplesFrom(e.nativeEvent as PointerEvent, at)
    setWet((w) => (w ? [...w, ...more] : more))
  }

  async function up() {
    if (!drawing.current) return
    drawing.current = false

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
      mine.current.push(saved.id)
      setMarks((all) => (all.some((x) => x.id === saved.id) ? all : [...all, saved]))
    } catch (e) { onTrouble(message(e)) }
  }

  /** What the eraser is passing over. Strokes go whole: half a word is not a correction. */
  function rub(e: React.PointerEvent) {
    const p = at(e.nativeEvent as PointerEvent)
    const reach = 0.02
    for (const m of here) {
      if (erasing.current.has(m.id)) continue
      if (touches(m, p, reach)) erasing.current.add(m.id)
    }
    // Rubbed-out strokes leave the screen at once; the rows go when the pen lifts.
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
      mine.current.push(saved.id)
      setMarks((all) => [...all, saved])
      setEditing(saved.id)
    } catch (e) { onTrouble(message(e)) }
  }

  async function undo() {
    const id = mine.current.pop()
    if (!id) return
    setMarks((all) => all.filter((m) => m.id !== id))
    try { await removeMarks([id]) } catch (e) { onTrouble(message(e)); load() }
  }

  async function addPage() {
    const pages = pad.pages + 1
    try { await setPad(pad.id, { pages }); onChanged({ ...pad, pages }); setPage(pages) }
    catch (e) { onTrouble(message(e)) }
  }

  // ---- drawing it ------------------------------------------------------------------------

  const inks = here.filter((m) => m.kind !== 'text')
  const texts = here.filter((m) => m.kind === 'text')

  return (
    <div className="pad">
      <div className="pad-tools">
        <div className="pad-tool-group">
          {(['pen', 'highlight', 'text', 'erase'] as Tool[]).map((t) => (
            <button key={t} className={tool === t ? 'on' : ''} onClick={() => setTool(t)}
              aria-pressed={tool === t}>
              {t === 'pen' ? 'Pen' : t === 'highlight' ? 'Highlighter' : t === 'text' ? 'Type' : 'Erase'}
            </button>
          ))}
        </div>

        {tool === 'pen' && (
          <div className="pad-tool-group">
            {PAD_COLOURS.map((c) => (
              <button key={c} className={`pad-swatch${colour === c ? ' on' : ''}`} style={{ background: c }}
                onClick={() => setColour(c)} aria-label={`Ink ${c}`} />
            ))}
            {(['fine', 'medium', 'broad'] as Width[]).map((w) => (
              <button key={w} className={`pad-nib${width === w ? ' on' : ''}`} onClick={() => setWidth(w)}>
                <span style={{ height: `${WIDTHS[w] * 1100}px`, background: colour }} />
              </button>
            ))}
          </div>
        )}
        {tool === 'highlight' && (
          <div className="pad-tool-group">
            {HIGHLIGHTS.map((c) => (
              <button key={c} className={`pad-swatch${highlight === c ? ' on' : ''}`} style={{ background: c }}
                onClick={() => setHighlight(c)} aria-label={`Highlighter ${c}`} />
            ))}
          </div>
        )}

        <div className="pad-tool-group pad-tools-end">
          <button className="link" onClick={() => void undo()} disabled={!mine.current.length}>Undo</button>
          <label className="check small" title="Off, a finger scrolls the page and only a pen draws">
            <input type="checkbox" checked={fingerDraws} onChange={(e) => setFingerDraws(e.target.checked)} />
            Draw with a finger
          </label>
          <span className="pad-zoom">
            <button className="icon" onClick={() => setZoom((z) => Math.max(1, z - 0.5))} aria-label="Zoom out">−</button>
            <span className="muted small">{Math.round(zoom * 100)}%</span>
            <button className="icon" onClick={() => setZoom((z) => Math.min(3, z + 0.5))} aria-label="Zoom in">+</button>
          </span>
        </div>
      </div>

      <div className="pad-sheet">
        <div className="pad-surface" ref={surface}
          style={{ width: `${zoom * 100}%`, touchAction: fingerDraws ? 'none' : 'pan-y pan-x' }}
          onPointerDown={down} onPointerMove={move} onPointerUp={() => void up()}
          onPointerCancel={() => void up()}>
          <svg className="pad-ink" viewBox={`0 0 1 ${PAGE_H}`} preserveAspectRatio="xMidYMin meet">
            {/* Ruled, because people write straighter on lines and a blank screen asks to be
                treated as a drawing rather than a page. */}
            <g className="pad-rules">
              {Array.from({ length: Math.floor(PAGE_H / 0.042) - 1 }, (_, i) => (
                <line key={i} x1="0.06" x2="0.96" y1={(i + 2) * 0.042} y2={(i + 2) * 0.042} />
              ))}
              <line className="pad-margin" x1="0.09" x2="0.09" y1="0.02" y2={PAGE_H - 0.03} />
            </g>
            {inks.map((m) => <Stroke key={m.id} mark={m} />)}
            {wet && (
              <g className={tool === 'highlight' ? 'pad-wet pad-hl' : 'pad-wet'}>
                {inkRuns(wet, tool === 'highlight' ? 0.022 : WIDTHS[width]).map((r, i) => (
                  <path key={i} d={r.d} stroke={tool === 'highlight' ? highlight : colour}
                    strokeWidth={r.width} fill="none" strokeLinecap="round" strokeLinejoin="round" />
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

      <div className="pad-foot">
        <button className="icon" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">‹</button>
        <span className="muted small nowrap">Page {page} of {pad.pages}</span>
        <button className="icon" disabled={page >= pad.pages} onClick={() => setPage(page + 1)} aria-label="Next page">›</button>
        <button className="link" onClick={() => void addPage()}>Add a page</button>
        {busy && <span className="muted small">Loading…</span>}
      </div>
    </div>
  )
}

function Stroke({ mark }: { mark: PadMark }) {
  const g = mark.geometry as { points: InkPoint[] }
  if (!g?.points?.length) return null
  const base = mark.style.width ?? 0.003
  const runs = inkRuns(g.points, base)
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
  if (g.points) {
    return g.points.some((q) => Math.hypot(q[0] - p.x, q[1] - p.y) < reach)
  }
  if (g.x != null && g.y != null && g.w != null) {
    return p.x > g.x - reach && p.x < g.x + g.w + reach && p.y > g.y - reach && p.y < g.y + 0.08
  }
  return false
}
