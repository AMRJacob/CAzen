import { useCallback, useEffect, useRef, useState } from 'react'
import {
  addMark, listMarks, removeMarks, setMarkBody, setPad, watchPad,
  HIGHLIGHTS, PAD_COLOURS,
  type MarkKind, type NotePad as Pad, type PadMark, type PadRule,
} from '../lib/pads'
import { inkRuns, samplesFrom, type InkPoint } from '../lib/ink'
import { message } from '../lib/errors'
import { Mark } from './Logo'

/**
 * A pad you write on: the whole screen, no edges.
 *
 * There is no sheet of paper here. The canvas runs as far in every direction as anybody cares
 * to push it, and the ruling — lines, grid, dots — is a texture on it rather than the shape of
 * a page. You pan and zoom to find room, and the room is always there.
 *
 * The hand rule: **the pen writes, a finger moves the canvas, and a palm does neither.** One
 * finger drags, two pinch, and a pen landing cancels whatever the fingers were doing, so a
 * resting hand cannot pull the canvas out from under the nib. A palm is told from a finger by
 * how much of it is on the glass.
 *
 * Coordinates are in page widths — the unit the first version used — so everything already
 * written is where it was, and the canvas simply carries on past where the page used to stop.
 */

type Tool = 'pen' | 'highlight' | 'text' | 'erase'

const WIDTHS = { fine: 0.0018, medium: 0.003, broad: 0.0052 } as const
type Width = keyof typeof WIDTHS

/**
 * How wide a contact has to be, in CSS pixels, before it is taken for a hand rather than a
 * fingertip. A stylus reports a pixel or two, a fingertip twenty or thirty, the side of a hand
 * far more — so this sits well above a thumb and well below a wrist.
 */
const PALM_ACROSS = 45

/** How long the menu stays open with nothing happening. */
const MENU_IDLE = 1000

const PEN_KEY = 'cazen.pen.seen'
const penSeen = () => { try { return localStorage.getItem(PEN_KEY) === 'yes' } catch { return false } }
const rememberPen = () => { try { localStorage.setItem(PEN_KEY, 'yes') } catch { /* asked again */ } }

/** How the view sits over the canvas: a scale, and an offset in screen pixels. */
interface View { scale: number; x: number; y: number }

/** What the canvas looks like when nothing has been written yet: a page's worth, centred. */
const HOME = 1.2

export function NotePad({ pad, onChanged, onClose, onTrouble }: {
  pad: Pad
  onChanged: (pad: Pad) => void
  onClose: () => void
  onTrouble: (m: string) => void
}) {
  const [marks, setMarks] = useState<PadMark[]>([])
  const [page, setPage] = useState(1)
  const [tool, setTool] = useState<Tool>('pen')
  const [colour, setColour] = useState<string>(PAD_COLOURS[0])
  const [highlight, setHighlight] = useState<string>(HIGHLIGHTS[0])
  const [width, setWidth] = useState<Width>('medium')
  const [fingerDraws, setFingerDraws] = useState(() => !penSeen())
  const [wet, setWet] = useState<InkPoint[] | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [mine, setMine] = useState<string[]>([])
  const [view, setView] = useState<View>({ scale: 600, x: 40, y: 40 })
  /** Whether the bar is out of the mark at all, and which panel is hanging off it. */
  const [open, setOpen] = useState(false)
  const [menu, setMenu] = useState<null | 'tools' | 'more'>(null)
  const [trouble, setTrouble] = useState<string | null>(null)
  /** What the pad made of the last thing that touched it, and how big it was. */
  const [touch, setTouch] = useState<{ read: string; across: number } | null>(null)

  const frame = useRef<HTMLDivElement | null>(null)
  const drawing = useRef<number | null>(null)
  const wetRef = useRef<InkPoint[] | null>(null)
  const erasing = useRef<Set<string>>(new Set())
  const fingers = useRef<Map<number, { x: number; y: number }>>(new Map())
  const gesture = useRef<{ dist: number; mid: { x: number; y: number }; view: View } | null>(null)
  const penAt = useRef(0)
  const palms = useRef<Set<number>>(new Set())
  /**
   * The view as the pointer handlers see it.
   *
   * They need the current one, not the one captured when the handler was made, and writing a
   * ref while rendering is not safe under the compiler — so it is synced after the commit,
   * which is always before the next pointer event can run.
   */
  const viewRef = useRef(view)
  useEffect(() => { viewRef.current = view }, [view])

  const complain = useCallback((m: string) => { setTrouble(m); onTrouble(m) }, [onTrouble])

  // ---- the menu, which puts itself away -----------------------------------------------------

  /**
   * The menu waits, then goes.
   *
   * It stays out as long as you are looking at it — deciding is not idling. The second only
   * starts once you have chosen something or gone back to the canvas, which are the two ways
   * of saying you are done with it.
   */
  const clock = useRef<number | undefined>(undefined)
  const stopClock = useCallback(() => {
    if (clock.current) { clearTimeout(clock.current); clock.current = undefined }
  }, [])
  const goingAway = useCallback(() => {
    stopClock()
    clock.current = window.setTimeout(() => { setMenu(null); setOpen(false) }, MENU_IDLE)
  }, [stopClock])
  const stay = useCallback(() => stopClock(), [stopClock])
  useEffect(() => () => stopClock(), [stopClock])

  // ---- what is on the canvas ----------------------------------------------------------------

  const load = useCallback(() => {
    listMarks(pad.id).then(setMarks).catch((e) => complain(message(e)))
  }, [pad.id, complain])
  useEffect(() => { load() }, [load])

  useEffect(() => watchPad(pad.id, {
    added: (m) => setMarks((all) => (all.some((x) => x.id === m.id) ? all : [...all, m])),
    changed: (m) => setMarks((all) => all.map((x) => (x.id === m.id ? m : x))),
    removed: (id) => setMarks((all) => all.filter((x) => x.id !== id)),
  }), [pad.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !editing) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, editing])

  const here = marks.filter((m) => m.page === page)

  // ---- where things are ---------------------------------------------------------------------

  /** A pointer's position on the canvas. */
  function at(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const box = frame.current?.getBoundingClientRect()
    const v = viewRef.current
    if (!box) return { x: 0, y: 0 }
    return { x: (e.clientX - box.left - v.x) / v.scale, y: (e.clientY - box.top - v.y) / v.scale }
  }

  /**
   * What just touched the glass.
   *
   * Size is the honest signal: a stylus tip reports a contact a pixel or two across, a
   * fingertip twenty or thirty, the side of a hand far more. A contact arriving while the pen
   * is writing is hand whatever its size, because the pen is what the person is doing.
   */
  function readTouch(e: React.PointerEvent): 'pen' | 'finger' | 'palm' | 'mouse' {
    if (e.pointerType === 'pen') return 'pen'
    if (e.pointerType !== 'touch') return 'mouse'
    if (Date.now() - penAt.current < 1200) return 'palm'
    return Math.max(e.width || 0, e.height || 0) > PALM_ACROSS ? 'palm' : 'finger'
  }

  function down(e: React.PointerEvent) {
    const read = readTouch(e)
    setTouch({ read, across: Math.round(Math.max(e.width || 0, e.height || 0)) })
    // Back on the canvas means done with the menu.
    if (open) goingAway()

    if (read === 'pen') {
      penAt.current = Date.now()
      if (!penSeen()) { rememberPen(); setFingerDraws(false) }
      fingers.current.clear()
      gesture.current = null
    }
    if (read === 'palm') { palms.current.add(e.pointerId); return }

    const draws = read === 'pen' || read === 'mouse' || fingerDraws
    if (!draws) {
      fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      gesture.current = null
      capture(e)
      return
    }

    if (tool === 'text') { void placeText(at(e)); return }
    capture(e)
    drawing.current = e.pointerId
    if (tool === 'erase') { erasing.current = new Set(); rub(e); return }
    wetRef.current = samplesFrom(e.nativeEvent as PointerEvent, at)
    setWet(wetRef.current)
  }

  function move(e: React.PointerEvent) {
    if (palms.current.has(e.pointerId)) return
    if (e.pointerType === 'pen') penAt.current = Date.now()
    if (fingers.current.has(e.pointerId)) { moveFingers(e); return }
    if (drawing.current !== e.pointerId) return
    if (tool === 'erase') { rub(e); return }
    const more = samplesFrom(e.nativeEvent as PointerEvent, at)
    wetRef.current = wetRef.current ? [...wetRef.current, ...more] : more
    setWet(wetRef.current)
  }

  /** One finger drags the canvas; two pinch it and drag it at once. */
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
      gesture.current = { dist, mid, view: viewRef.current }
      return
    }
    const start = gesture.current
    if (start.dist < 1) return
    const scale = clamp(start.view.scale * (dist / start.dist), 60, 12000)
    // Zoom about the midpoint of the two fingers, so the canvas grows under them rather than
    // running away towards a corner.
    const k = scale / start.view.scale
    setView({
      scale,
      x: mid.x - (start.mid.x - start.view.x) * k,
      y: mid.y - (start.mid.y - start.view.y) * k,
    })
  }

  /**
   * The end of a stroke — and only ever a real end.
   *
   * There is deliberately no pointerleave handler here. Calling setPointerCapture makes the
   * browser fire boundary events with a null relatedTarget, which React reads as the pointer
   * leaving every ancestor at once; a leave handler then ends the stroke two or three samples
   * in, which looks for all the world like a pen that does not write. Capture is what keeps
   * the pointer ours after it crosses anything, so leave has no job to do.
   */
  function up(e: React.PointerEvent) {
    palms.current.delete(e.pointerId)
    if (e.pointerType === 'pen') penAt.current = Date.now()
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
      try { await removeMarks(ids) } catch (e) { complain(message(e)); load() }
      return
    }
    let points = wetRef.current
    wetRef.current = null
    setWet(null)
    if (!points || !points.length) return
    // A tap is a dot — an i, a bullet, a full stop. One point draws nothing, so it is given a
    // second a hair away and the round cap makes it a dot.
    if (points.length === 1) {
      const [x, y, f] = points[0] as [number, number, number?]
      points = [points[0], (f == null ? [x + 0.0004, y] : [x + 0.0004, y, f]) as InkPoint]
    }
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
    } catch (e) { complain(message(e)) }
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
        geometry: { x: p.x, y: p.y, w: 0.5 },
        style: { colour },
        body: '',
      })
      setMine((m) => [...m, saved.id])
      setMarks((all) => [...all, saved])
      setEditing(saved.id)
    } catch (e) { complain(message(e)) }
  }

  async function undo() {
    const id = mine[mine.length - 1]
    if (!id) return
    setMine((m) => m.slice(0, -1))
    setMarks((all) => all.filter((m) => m.id !== id))
    try { await removeMarks([id]) } catch (e) { complain(message(e)); load() }
  }

  async function addPage() {
    const pages = pad.pages + 1
    try { await setPad(pad.id, { pages }); onChanged({ ...pad, pages }); setPage(pages) }
    catch (e) { complain(message(e)) }
  }

  async function setRule(rule: PadRule) {
    onChanged({ ...pad, rule })
    try { await setPad(pad.id, { rule }) } catch (e) { complain(message(e)) }
  }

  /** Back to where the writing is — or to a page's worth of room, if there is none. */
  const home = useCallback(() => {
    const box = frame.current?.getBoundingClientRect()
    if (!box) return
    const bounds = extentOf(here)
    if (!bounds) {
      const scale = clamp(Math.min(box.width / HOME, box.height / (HOME * 1.3)), 60, 12000)
      setView({ scale, x: (box.width - HOME * scale) / 2, y: 24 })
      return
    }
    const pad_ = 0.06
    const w = bounds.x2 - bounds.x1 + pad_ * 2
    const h = bounds.y2 - bounds.y1 + pad_ * 2
    const scale = clamp(Math.min(box.width / w, box.height / h), 60, 12000)
    setView({
      scale,
      x: box.width / 2 - ((bounds.x1 + bounds.x2) / 2) * scale,
      y: box.height / 2 - ((bounds.y1 + bounds.y2) / 2) * scale,
    })
  }, [here])

  // Find the writing on the first look, and whenever the page changes.
  const settled = useRef<number | null>(null)
  useEffect(() => {
    if (settled.current === page) return
    settled.current = page
    const id = requestAnimationFrame(home)
    return () => cancelAnimationFrame(id)
  }, [page, home])

  /**
   * On a desktop: the wheel and a two-finger trackpad swipe move the canvas; pinching on the
   * trackpad, or holding ctrl, zooms — the convention everywhere else, and a trackpad pinch
   * arrives as a wheel event with ctrlKey set.
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
      const scale = clamp(v.scale * k, 60, 12000)
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
      {/* The drawing surface is the screen. `touch-action: none` has to be on this element and
          everything in it: iOS reads it from whatever the pointer actually lands on, and a
          child left at the default lets the system claim the gesture and cancel the stroke a
          few samples in — which looks exactly like a pen that does not work. */}
      <div className="padview-frame" ref={frame} onWheel={wheel}
        onPointerDown={down} onPointerMove={move} onPointerUp={up}
        onPointerCancel={up}>
        <svg className="pad-ink" aria-label="The pad">
          <Ground rule={pad.rule} view={view} />
          <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
            {inks.map((m) => <Stroke key={m.id} mark={m} />)}
            {wet && (
              <g className={tool === 'highlight' ? 'pad-hl' : undefined}>
                {inkRuns(wet, tool === 'highlight' ? 0.022 : WIDTHS[width]).map((r, i) => (
                  <path key={i} d={r.d} stroke={nib} strokeWidth={r.width}
                    fill="none" strokeLinecap="round" strokeLinejoin="round" />
                ))}
              </g>
            )}
          </g>
        </svg>

        <div className="pad-texts" style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
        }}>
          {texts.map((m) => {
            const g = m.geometry as { x: number; y: number; w: number }
            return (
              <textarea key={m.id} className="pad-text"
                style={{ left: g.x, top: g.y, width: g.w, color: m.style.colour ?? undefined }}
                defaultValue={m.body ?? ''}
                autoFocus={editing === m.id}
                placeholder="Type here"
                onPointerDown={(e) => e.stopPropagation()}
                onBlur={(e) => {
                  setEditing(null)
                  const body = e.target.value
                  if (body === (m.body ?? '')) return
                  setMarks((all) => all.map((x) => (x.id === m.id ? { ...x, body } : x)))
                  setMarkBody(m.id, body).catch((err) => complain(message(err)))
                }} />
            )
          })}
        </div>
      </div>

      {trouble && (
        <div className="pad-trouble" role="alert">
          <span>{trouble}</span>
          <button className="link" onClick={() => setTrouble(null)}>Dismiss</button>
        </div>
      )}

      {/* Everything lives in the mark, as it does everywhere else in the app: closed it is
          the ensō, open it is the border around the tools. */}
      <div className={`padmenu${open ? ' open' : ''}`} onPointerDown={(e) => { e.stopPropagation(); stay() }}>
        <button className="padmenu-mark" aria-expanded={open}
          aria-label={open ? 'Hide the tools' : 'Show the tools'}
          onClick={() => { if (open) { setOpen(false); setMenu(null) } else { setOpen(true); stay() } }}>
          <Mark size={30} />
        </button>

        <div className="padbar" {...(open ? {} : { inert: '' as unknown as boolean })}>
          <button className="padbar-out" onClick={onClose} aria-label="Close the pad" title="Close the pad">
            {icon.close}
          </button>
          <span className="padbar-split" />
          {(['pen', 'highlight', 'text', 'erase'] as Tool[]).map((t) => (
            <button key={t} className={`padbar-key${tool === t ? ' on' : ''}`}
              aria-pressed={tool === t} aria-label={LABEL[t]} title={LABEL[t]}
              onClick={() => { setTool(t); setMenu(null); goingAway() }}>
              {icon[t]}
            </button>
          ))}
          <button className={`padbar-ink${menu === 'tools' ? ' on' : ''}`}
            aria-label="Colour and width" title="Colour and width"
            onClick={() => { setMenu(menu === 'tools' ? null : 'tools'); stay() }}>
            <span style={{ background: nib }} />
          </button>
          <span className="padbar-split" />
          <button className="padbar-key" onClick={() => { void undo(); goingAway() }} disabled={!mine.length}
            aria-label="Undo" title="Undo">{icon.undo}</button>
          <button className={`padbar-key${menu === 'more' ? ' on' : ''}`}
            onClick={() => { setMenu(menu === 'more' ? null : 'more'); stay() }}
            aria-label="More" title="More">{icon.more}</button>
        </div>
      </div>

      {open && menu === 'tools' && (
        <div className="padpop" onPointerDown={(e) => { e.stopPropagation(); stay() }}>
          <div className="padpop-row">
            {(tool === 'highlight' ? HIGHLIGHTS : PAD_COLOURS).map((c) => (
              <button key={c} className={`pad-swatch${nib === c ? ' on' : ''}`} style={{ background: c }}
                onClick={() => { tool === 'highlight' ? setHighlight(c) : setColour(c); goingAway() }}
                aria-label={c} />
            ))}
          </div>
          {tool !== 'highlight' && (
            <div className="padpop-row">
              {(['fine', 'medium', 'broad'] as Width[]).map((w) => (
                <button key={w} className={`pad-nib${width === w ? ' on' : ''}`}
                  onClick={() => { setWidth(w); goingAway() }} aria-label={w}>
                  <span style={{ height: `${WIDTHS[w] * 1100}px`, background: colour }} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {open && menu === 'more' && (
        <div className="padpop padpop-wide" onPointerDown={(e) => { e.stopPropagation(); stay() }}>
          <div className="padpop-row">
            {RULES.map((r) => (
              <button key={r.rule} className={`padpop-word${pad.rule === r.rule ? ' on' : ''}`}
                onClick={() => { void setRule(r.rule); goingAway() }}>{r.label}</button>
            ))}
          </div>
          <div className="padpop-row">
            <button className="padbar-key" disabled={page <= 1} onClick={() => setPage(page - 1)}
              aria-label="Previous page">{icon.back}</button>
            <span className="muted small nowrap">Page {page} of {pad.pages}</span>
            <button className="padbar-key" disabled={page >= pad.pages} onClick={() => setPage(page + 1)}
              aria-label="Next page">{icon.on}</button>
            <button className="padpop-word" onClick={() => void addPage()}>Add a page</button>
            <button className="padpop-word" onClick={() => { home(); goingAway() }}>Find my writing</button>
          </div>
          <label className="check small">
            <input type="checkbox" checked={fingerDraws} onChange={(e) => setFingerDraws(e.target.checked)} />
            Draw with a finger
          </label>
          <p className="muted small padpop-note">
            {fingerDraws
              ? 'A finger draws. Two fingers pinch to zoom, and a palm is ignored.'
              : 'The pen draws. One finger moves the canvas, two pinch to zoom, and a palm is ignored.'}
            {touch && <> Last touch: <strong>{touch.read}</strong>{touch.across > 0 ? `, ${touch.across}px across` : ''}.</>}
          </p>
        </div>
      )}
    </div>
  )
}

const LABEL: Record<Tool, string> = {
  pen: 'Pen', highlight: 'Highlighter', text: 'Type', erase: 'Erase',
}

const RULES: { rule: PadRule; label: string }[] = [
  { rule: 'lines', label: 'Lines' },
  { rule: 'grid', label: 'Grid' },
  { rule: 'dots', label: 'Dots' },
  { rule: 'blank', label: 'Blank' },
]

const stroked = (d: React.ReactNode) => (
  <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
)

const icon = {
  pen: stroked(<><path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1Z" /><path d="M14.5 6.5l3 3" /></>),
  highlight: stroked(<><path d="M5 18h5l8.5-8.5a2 2 0 0 0-3-3L7 15v3Z" /><path d="M4 21h9" /></>),
  text: stroked(<><path d="M5 6V4h14v2" /><path d="M12 4v16" /><path d="M9 20h6" /></>),
  erase: stroked(<><path d="M8 20h11" /><path d="M15.5 4.5 20 9l-9 9H6.5L3.5 15l12-10.5Z" /><path d="M9 9l6 6" /></>),
  undo: stroked(<><path d="M4 9h11a5 5 0 0 1 0 10h-5" /><path d="M7.5 5.5 4 9l3.5 3.5" /></>),
  more: stroked(<><circle cx="5.5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="18.5" cy="12" r="1.3" /></>),
  close: stroked(<><path d="M15 5l-7 7 7 7" /></>),
  back: stroked(<><path d="M15 5l-7 7 7 7" /></>),
  on: stroked(<><path d="M9 5l7 7-7 7" /></>),
}

const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n))

function capture(e: React.PointerEvent): void {
  try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* not fatal */ }
}

/**
 * The ruling, drawn as a texture over the whole screen rather than onto a page.
 *
 * It is a pattern in screen space offset by the view, so it carries on wherever the canvas is
 * pushed, and it fades out when zoomed far enough that it would be noise.
 */
function Ground({ rule, view }: { rule: PadRule; view: View }) {
  if (rule === 'blank') return null
  // Keep the ruling about a finger's width apart on screen, doubling as you zoom out so it
  // never turns into a grey wash.
  let step = 0.042 * view.scale
  while (step < 14) step *= 2
  while (step > 90) step /= 2
  const ox = view.x % step
  const oy = view.y % step
  const id = `ground-${rule}`
  return (
    <>
      <defs>
        <pattern id={id} width={step} height={step} patternUnits="userSpaceOnUse" x={ox} y={oy}>
          {rule === 'dots'
            ? <circle cx={step / 2} cy={step / 2} r={Math.max(0.7, step * 0.022)} className="ground-dot" />
            : <>
              <path d={`M 0 ${step} H ${step}`} className="ground-line" />
              {rule === 'grid' && <path d={`M ${step} 0 V ${step}`} className="ground-line" />}
            </>}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </>
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

/** Everything written on a page, as a box — what "find my writing" aims at. */
export function extentOf(marks: PadMark[]): { x1: number; y1: number; x2: number; y2: number } | null {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
  for (const m of marks) {
    const g = m.geometry as { points?: InkPoint[]; x?: number; y?: number; w?: number }
    if (g.points) {
      for (const p of g.points) {
        x1 = Math.min(x1, p[0]); x2 = Math.max(x2, p[0])
        y1 = Math.min(y1, p[1]); y2 = Math.max(y2, p[1])
      }
    } else if (g.x != null && g.y != null) {
      x1 = Math.min(x1, g.x); x2 = Math.max(x2, g.x + (g.w ?? 0.5))
      y1 = Math.min(y1, g.y); y2 = Math.max(y2, g.y + 0.08)
    }
  }
  return Number.isFinite(x1) ? { x1, y1, x2, y2 } : null
}

/**
 * A page of a pad, still: fitted to whatever was written on it, read-only.
 *
 * On an endless canvas there is no page to show, so what gets shown is the writing — framed
 * to its own extent. Used for the thumbnails in the list and for reading a pad while typing
 * it up, where a live pad would only be something a stray touch could change.
 */
export function PadStill({ marks, rule, ratio = 11 / 8.5 }: {
  marks: PadMark[]
  rule: PadRule
  /** How tall the frame is relative to its width. */
  ratio?: number
}) {
  const bounds = extentOf(marks)
  // Nothing written: show a page's worth of empty canvas rather than an empty box.
  const box = bounds
    ? { x: bounds.x1, y: bounds.y1, w: bounds.x2 - bounds.x1, h: bounds.y2 - bounds.y1 }
    : { x: 0, y: 0, w: 1, h: ratio }
  const air = Math.max(box.w, box.h) * 0.06 + 0.02
  // Widen or heighten the window so the writing is not stretched to the frame's shape.
  let w = box.w + air * 2
  let h = box.h + air * 2
  if (w / h > 1 / ratio) h = w * ratio
  else w = h / ratio
  const x = box.x + box.w / 2 - w / 2
  const y = box.y + box.h / 2 - h / 2

  return (
    <svg className="pad-still" viewBox={`${x} ${y} ${w} ${h}`} preserveAspectRatio="xMidYMid meet"
      aria-hidden="true">
      <StillGround rule={rule} x={x} y={y} w={w} h={h} />
      {marks.filter((m) => m.kind !== 'text').map((m) => <Stroke key={m.id} mark={m} />)}
      {marks.filter((m) => m.kind === 'text').map((m) => {
        const g = m.geometry as { x: number; y: number; w: number }
        return (
          <text key={m.id} x={g.x} y={g.y + 0.028} fontSize={0.026}
            fill={m.style.colour ?? '#2b2d2c'}>{(m.body ?? '').slice(0, 60)}</text>
        )
      })}
    </svg>
  )
}

/** The ruling behind a still, in canvas units rather than screen pixels. */
function StillGround({ rule, x, y, w, h }: {
  rule: PadRule; x: number; y: number; w: number; h: number
}) {
  if (rule === 'blank') return null
  let step = 0.042
  while (w / step > 44) step *= 2
  const first = Math.ceil(y / step) * step
  const down = Math.ceil(h / step) + 1
  const left = Math.ceil(x / step) * step
  const across = Math.ceil(w / step) + 1
  if (rule === 'dots') {
    return (
      <g>
        {Array.from({ length: down }, (_, r) => Array.from({ length: across }, (_, c) => (
          <circle key={`${r}-${c}`} cx={left + c * step} cy={first + r * step}
            r={step * 0.04} className="ground-dot" />
        )))}
      </g>
    )
  }
  return (
    <g>
      {Array.from({ length: down }, (_, r) => (
        <path key={`h${r}`} d={`M ${x} ${first + r * step} H ${x + w}`} className="ground-line"
          strokeWidth={step * 0.02} />
      ))}
      {rule === 'grid' && Array.from({ length: across }, (_, c) => (
        <path key={`v${c}`} d={`M ${left + c * step} ${y} V ${y + h}`} className="ground-line"
          strokeWidth={step * 0.02} />
      ))}
    </g>
  )
}

/**
 * A pad to read from rather than write on: every page of it, stacked.
 *
 * What you want while typing something up is to see what you wrote, without risking changing
 * it with a stray touch.
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
            <PadStill marks={here} rule={pad.rule} />
            {pad.pages > 1 && <figcaption className="muted small">Page {n}</figcaption>}
          </figure>
        )
      })}
    </div>
  )
}
