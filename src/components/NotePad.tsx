import { useCallback, useEffect, useRef, useState } from 'react'
import {
  addMark, listMarks, removeMarks, setMarkBody, setMarkGeometry, setMarkStyle, setPad, watchPad,
  HIGHLIGHTS, PAD_COLOURS,
  type MarkKind, type NotePad as Pad, type PadMark, type PadRule,
} from '../lib/pads'
import { isHandContact, samplesFrom, type InkPoint } from '../lib/ink'
import { PadSurface, type InkStyle, type PadInk } from './PadSurface'
import { message } from '../lib/errors'
import { handOf, outlineOf, pathOf, seedOf, type Nib } from '../lib/nib'
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

type Tool = 'pen' | 'pencil' | 'highlight' | 'text' | 'erase' | 'select'

/**
 * Pen weights, as fractions of a page's width — so 0.005 is about a millimetre, the weight of
 * an ordinary rollerball. The old set was a third of this and read as a hairline on a phone.
 */
const WIDTHS = { fine: 0.003, medium: 0.005, broad: 0.013 } as const

/**
 * The thinnest ink may ever be drawn, in CSS pixels.
 *
 * Ink is kept in canvas units so it thickens as you zoom in, the way real ink would — but
 * that also means it thins to nothing as you zoom out, and a stroke you cannot see is a
 * stroke you have lost. Below this it stops shrinking.
 */
type Width = keyof typeof WIDTHS

/**
 * How wide a contact has to be, in CSS pixels, before it is taken for a hand rather than a
 * fingertip. A stylus reports a pixel or two, a fingertip twenty or thirty, the side of a hand
 * far more — so this sits well above a thumb and well below a wrist.
 */


/** How long the menu stays open with nothing happening. */
const MENU_IDLE = 1000
/**
 * The text layer is laid out a thousand times the page's own units and scaled back down. In
 * page units a line of type is 0.03 px high, and a browser asked for type that small draws
 * nothing — Safari has a floor under font sizes — so what was typed showed in the thumbnail,
 * which is drawn another way, and not on the pad.
 */
const TEXT_UNIT = 1000
/** Type size on the pad when a box has none of its own, in page units. */
const TEXT_SIZE = 0.03

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
  const [editing, setEditing] = useState<string | null>(null)
  /** A text box being dragged out, in page units, before it is one. */
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const boxFrom = useRef<{ id: number; x: number; y: number } | null>(null)
  /** A text box being made wider or narrower by its grip. */
  /** What the select tool, or a right-click, has hold of. */
  const [picked, setPicked] = useState<string[]>([])
  /** The select tool's drag: moving what is picked, or stretching a box round more. */
  const grab = useRef<{ id: number; x: number; y: number; moved: boolean; moving: boolean } | null>(null)
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const typeSize = useRef<{ id: string; y: number; size: number } | null>(null)
  const sizing = useRef<{ id: string; x: number; w: number; h: number | undefined; grip: 'e' | 'se'; y: number } | null>(null)
  const [mine, setMine] = useState<string[]>([])
  /** What undo took off the page, newest last, for redo to put back. Anything new empties it. */
  const [undone, setUndone] = useState<PadMark[]>([])
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
  const nowId = useRef<string>('')
  /** What the nib would lay down at this moment. */
  const nibNow = (): InkStyle => ({
    colour: tool === 'highlight' ? highlight : colour,
    width: tool === 'highlight' ? 0.03 : WIDTHS[width],
    nib: tool === 'highlight' ? 'highlight' : tool === 'pencil' ? 'pencil' : 'pen',
  })
  /** Show the stroke in progress. Straight onto the canvas: no render, no reconciliation. */
  const showWet = () => ink.current?.wet(wetRef.current, nibNow(), seedOf(nowId.current))
  const erasing = useRef<Set<string>>(new Set())
  const fingers = useRef<Map<number, { x: number; y: number }>>(new Map())
  const gesture = useRef<{ dist: number; mid: { x: number; y: number }; view: View } | null>(null)
  const penAt = useRef(0)
  const palms = useRef<Set<number>>(new Set())
  /** Lays one finished stroke onto the paper without redrawing the rest. */
  const ink = useRef<PadInk | null>(null)
  const took = useCallback((api: PadInk) => { ink.current = api }, [])
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
    const onKey = (e: KeyboardEvent) => {
      if (editing) return
      // Heard before the notebook behind the pad, which would otherwise turn its own page back.
      if (e.key === 'Escape') { e.stopImmediatePropagation(); if (picked.length) setPicked([]); else onClose() }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && picked.length) { e.preventDefault(); void removePicked() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, editing, picked])

  const here = marks.filter((m) => m.page === page)

  // ---- where things are ---------------------------------------------------------------------

  /**
   * Where the drawing sits on the screen.
   *
   * Asking the browser costs a layout, and the pen asks through `at` for every sample it
   * reports — eight or more a frame. The pad is a fixed overlay, so between one stroke and
   * the next this cannot move; it is measured when a stroke starts and when the window
   * changes, and read from there.
   */
  const frameBox = useRef<{ left: number; top: number } | null>(null)
  const measure = useCallback(() => {
    const box = frame.current?.getBoundingClientRect()
    frameBox.current = box ? { left: box.left, top: box.top } : null
    return frameBox.current
  }, [])
  useEffect(() => {
    measure()
    const again = () => measure()
    window.addEventListener('resize', again)
    window.addEventListener('orientationchange', again)
    return () => {
      window.removeEventListener('resize', again)
      window.removeEventListener('orientationchange', again)
    }
  }, [measure])

  /** A pointer's position on the canvas. */
  function at(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const box = frameBox.current ?? measure()
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
    return isHand(e) ? 'palm' : 'finger'
  }

  /** Contacts already judged to be hand, which stay hand until they leave the glass. */
  const handIds = useRef(new Set<number>())

  /** The rule itself lives in `ink`, where it can be tested; this is the pad's answer to it. */
  const isHand = (e: React.PointerEvent): boolean => isHandContact(e, {
    hands: handIds.current,
    fingers: fingers.current.size,
    penAt: penAt.current,
    now: Date.now(),
    // A wide contact is a palm only for someone writing with a pen, and only on the page. A
    // finger that draws, or a thumb on the menu, is wide and meant.
    sized: !fingerDraws && !(e.target as Element | null)?.closest?.('button, input, textarea, select, label, .padmenu, .padpop'),
  })

  const handAt = useRef(0)
  const meantAt = useRef(0)

  /**
   * Taken at the capture phase, before the drawing or any button hears about it. Telling the
   * browser as well matters twice over: an unclaimed contact is one iOS may hand to a system
   * gesture, which cancels the pen mid-stroke, and a pointerdown that is spoken for does not
   * come back later as a click.
   */
  function shield(e: React.PointerEvent) {
    if (e.type === 'pointerup') handIds.current.delete(e.pointerId)
    if (!isHand(e)) {
      if (e.type === 'pointerdown') meantAt.current = Date.now()
      return
    }
    if (e.type === 'pointerdown') {
      handAt.current = Date.now()
      handIds.current.add(e.pointerId)
      setTouch({ read: 'palm', across: Math.round(Math.max(e.width || 0, e.height || 0)) })
    }
    e.stopPropagation()
    if (e.cancelable) e.preventDefault()
  }

  /**
   * A click with nothing behind it.
   *
   * A spoken-for pointerdown should not come back as a click, but that is a promise about the
   * contact, not about the hand: it is the last contact that counts. So a click is let through
   * only when something deliberate — a pen, a mouse, a fingertip — went down after the hand
   * last did. Writing with the palm resting and then tapping a tool with the pen is deliberate,
   * and goes through.
   */
  function noClick(e: React.MouseEvent) {
    if (handAt.current <= meantAt.current) return
    e.stopPropagation()
    e.preventDefault()
  }

  function down(e: React.PointerEvent) {
    measure()
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
    if (read === 'palm') {
      // Ignored, and told to the browser as well: an unclaimed contact is one iOS may decide
      // belongs to a system gesture, and claiming it cancels the pen mid-stroke.
      palms.current.add(e.pointerId)
      e.preventDefault()
      return
    }

    const draws = read === 'pen' || read === 'mouse' || fingerDraws
    if (!draws) {
      fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      gesture.current = null
      capture(e)
      return
    }

    if (tool === 'select') {
      const p = at(e)
      const hit = markAt(p)
      capture(e)
      if (hit && !picked.includes(hit.id)) setPicked([hit.id])
      if (!hit) setPicked([])
      grab.current = { id: e.pointerId, x: p.x, y: p.y, moved: false, moving: !!hit }
      return
    }
    if (picked.length) setPicked([])
    if (tool === 'text') {
      // Dragged out to the size wanted; a tap without a drag is a box of the usual width.
      const p = at(e)
      capture(e)
      boxFrom.current = { id: e.pointerId, x: p.x, y: p.y }
      setBox({ x: p.x, y: p.y, w: 0, h: 0 })
      return
    }
    capture(e)
    forget()
    drawing.current = e.pointerId
    if (tool === 'erase') { erasing.current = new Set(); rub(e); return }
    // The stroke is named before it is drawn, so what is on the glass while writing and what
    // is saved when the pen lifts are one and the same stroke, down to the last speck.
    nowId.current = crypto.randomUUID()
    wetRef.current = samplesFrom(e.nativeEvent as PointerEvent, at)
    showWet()
  }

  function move(e: React.PointerEvent) {
    if (palms.current.has(e.pointerId)) return
    if (e.pointerType === 'pen') penAt.current = Date.now()
    // Still writing: whatever the browser said, the pen is clearly still on the glass.
    if (doubt.current && drawing.current === e.pointerId) forget()
    if (fingers.current.has(e.pointerId)) { moveFingers(e); return }
    if (grab.current?.id === e.pointerId) {
      const g = grab.current, p = at(e)
      if (!g.moved && Math.hypot(p.x - g.x, p.y - g.y) * viewRef.current.scale < 5) return
      g.moved = true
      if (g.moving) {
        const dx = p.x - g.x, dy = p.y - g.y
        g.x = p.x; g.y = p.y
        setMarks((all) => all.map((m) => (picked.includes(m.id) ? { ...m, geometry: shifted(m.geometry, dx, dy) } : m)))
      } else {
        setMarquee({ x: Math.min(g.x, p.x), y: Math.min(g.y, p.y), w: Math.abs(p.x - g.x), h: Math.abs(p.y - g.y) })
      }
      return
    }
    if (boxFrom.current?.id === e.pointerId) {
      const p = at(e), f = boxFrom.current
      setBox({ x: Math.min(f.x, p.x), y: Math.min(f.y, p.y), w: Math.abs(p.x - f.x), h: Math.abs(p.y - f.y) })
      return
    }
    if (drawing.current !== e.pointerId) return
    if (tool === 'erase') { rub(e); return }
    const more = samplesFrom(e.nativeEvent as PointerEvent, at)
    // Added to the stroke in place. Copying it afresh for every sample meant a stroke cost
    // the square of its own length by the time it was finished.
    if (wetRef.current) for (const p of more) wetRef.current.push(p)
    else wetRef.current = more
    showWet()
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
    handIds.current.delete(e.pointerId)
    if (e.pointerType === 'pen') penAt.current = Date.now()
    if (fingers.current.delete(e.pointerId)) {
      if (fingers.current.size < 2) gesture.current = null
      return
    }
    if (grab.current?.id === e.pointerId) {
      const g = grab.current
      grab.current = null
      if (g.moving && g.moved) {
        // Where they were put is kept; a move that will not keep is put back by reading again.
        for (const m of marks.filter((x) => picked.includes(x.id))) setMarkGeometry(m.id, m.geometry).catch((err) => { complain(message(err)); load() })
      } else if (marquee) {
        const r = marquee
        setPicked(here.filter((m) => { const b = boxOf(m); return b.x < r.x + r.w && b.x + b.w > r.x && b.y < r.y + r.h && b.y + b.h > r.y }).map((m) => m.id))
      }
      setMarquee(null)
      return
    }
    if (boxFrom.current?.id === e.pointerId) {
      const f = boxFrom.current, b = box
      boxFrom.current = null
      setBox(null)
      // Too small to have been meant as a box: a tap, which gets the usual width where it landed.
      void placeText(b && b.w > 0.04 ? b : { x: f.x, y: f.y, w: 0.5 })
      return
    }
    if (drawing.current !== e.pointerId) return
    forget()
    drawing.current = null
    void finish()
  }

  /**
   * A cancelled pointer is given a moment to come back.
   *
   * iOS cancels the pen when a palm lands, and then — often enough to matter — carries on
   * sending its moves as though nothing had happened. Ending the stroke the instant the
   * cancel arrives is what makes writing stop halfway through a word whenever a hand touches
   * down. So the stroke is held open briefly, and if the pen is still writing it simply
   * continues; if it really has gone, what was drawn is kept.
   */
  const doubt = useRef<number | undefined>(undefined)
  const forget = () => {
    if (doubt.current) { clearTimeout(doubt.current); doubt.current = undefined }
  }
  useEffect(() => () => { if (doubt.current) clearTimeout(doubt.current) }, [])

  function cancelled(e: React.PointerEvent) {
    if (grab.current?.id === e.pointerId) { grab.current = null; setMarquee(null); return }
    if (boxFrom.current?.id === e.pointerId) { boxFrom.current = null; setBox(null); return }
    palms.current.delete(e.pointerId)
    handIds.current.delete(e.pointerId)
    if (fingers.current.delete(e.pointerId)) {
      if (fingers.current.size < 2) gesture.current = null
      return
    }
    if (drawing.current !== e.pointerId) return
    const pointer = e.pointerId
    forget()
    doubt.current = window.setTimeout(() => {
      doubt.current = undefined
      if (drawing.current !== pointer) return
      drawing.current = null
      void finish()
    }, 300)
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
    if (!points || !points.length) { showWet(); return }
    // A tap is a dot — an i, a bullet, a full stop. One point draws nothing, so it is given a
    // second a hair away and the round cap makes it a dot.
    if (points.length === 1) {
      const [x, y, f] = points[0] as [number, number, number?]
      points = [points[0], (f == null ? [x + 0.0004, y] : [x + 0.0004, y, f]) as InkPoint]
    }
    const kind: MarkKind = tool === 'highlight' ? 'highlight' : 'ink'
    const style = {
      colour: kind === 'highlight' ? highlight : colour,
      width: kind === 'highlight' ? 0.03 : WIDTHS[width],
      ...(tool === 'pencil' ? { nib: 'pencil' as const } : {}),
    }

    /**
     * The stroke goes up as a finished mark in the same breath as it stops being the wet one.
     *
     * Clearing the wet stroke and waiting for the server to hand the saved one back leaves a
     * gap where the ink is nowhere — which is seen as a line that draws, vanishes and comes
     * back. Choosing the id here means the finished mark exists before anybody is told about
     * it, so there is no gap to see.
     */
    const id = nowId.current
    const here_and_now: PadMark = {
      id, pad_id: pad.id, project_id: pad.project_id, page, kind,
      geometry: { points }, style, body: null,
      created_by: null, created_at: new Date().toISOString(),
    }
    // The finished mark goes into the drawing, which paints it onto the paper in the same
    // breath, and only then is the wet stroke taken away. Both happen before the browser
    // paints again, so the ink is never nowhere — which is what the blinking was.
    setMarks((all) => [...all, here_and_now])
    wetRef.current = null
    showWet()
    setMine((m) => [...m, id])
    setUndone([])
    try {
      await addMark({ id, pad_id: pad.id, project_id: pad.project_id, page, kind, geometry: { points }, style })
    } catch (e) {
      // It never reached the server, so it should not look as though it had.
      setMarks((all) => all.filter((m) => m.id !== id))
      setMine((m) => m.filter((x) => x !== id))
      complain(message(e))
    }
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

  /** The topmost mark under a point: the last drawn is the one on top. */
  function markAt(p: { x: number; y: number }): PadMark | null {
    const reach = Math.max(0.008, 12 / viewRef.current.scale)
    for (let i = here.length - 1; i >= 0; i--) {
      const m = here[i]
      if (m.kind === 'text') { const b = boxOf(m); if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return m }
      else if (touches(m, p, reach + (m.style?.width ?? 0) / 2)) return m
    }
    return null
  }

  /** Another colour or width for everything picked. */
  function restyle(change: { colour?: string; width?: number }) {
    const next = new Map<string, PadMark['style']>()
    for (const m of marks) {
      if (!picked.includes(m.id)) continue
      // A highlighter stays a highlighter: it takes a colour but not a pen's width.
      if (change.width != null && m.kind !== 'ink') continue
      next.set(m.id, { ...m.style, ...change })
    }
    setMarks((all) => all.map((m) => (next.has(m.id) ? { ...m, style: next.get(m.id)! } : m)))
    for (const [id, style] of next) setMarkStyle(id, style).catch((err) => { complain(message(err)); load() })
  }

  async function removePicked() {
    const ids = picked
    if (!ids.length) return
    const gone = marks.filter((m) => ids.includes(m.id))
    setPicked([])
    setMarks((all) => all.filter((m) => !ids.includes(m.id)))
    setMine((m) => m.filter((x) => !ids.includes(x)))
    // Redo puts them back, as it does for anything undone.
    setUndone((u) => [...u, ...gone])
    try { await removeMarks(ids) } catch (e) { complain(message(e)); load() }
  }

  async function placeText(p: { x: number; y: number; w: number; h?: number }) {
    try {
      const saved = await addMark({
        pad_id: pad.id, project_id: pad.project_id, page, kind: 'text',
        geometry: { x: p.x, y: p.y, w: p.w, ...(p.h && p.h > 0.04 ? { h: p.h } : {}) },
        style: { colour },
        body: '',
      })
      setMine((m) => [...m, saved.id])
      setUndone([])
      setMarks((all) => [...all, saved])
      setEditing(saved.id)
    } catch (e) { complain(message(e)) }
  }

  async function undo() {
    const id = mine[mine.length - 1]
    if (!id) return
    const gone = marks.find((m) => m.id === id)
    setMine((m) => m.slice(0, -1))
    setMarks((all) => all.filter((m) => m.id !== id))
    if (gone) setUndone((u) => [...u, gone])
    try { await removeMarks([id]) } catch (e) { complain(message(e)); load() }
  }

  /** The last thing undone, back where it was — the same mark, under the same name. */
  async function redo() {
    const back = undone[undone.length - 1]
    if (!back) return
    setUndone((u) => u.slice(0, -1))
    setMarks((all) => [...all, back])
    setMine((m) => [...m, back.id])
    try {
      await addMark({
        id: back.id, pad_id: back.pad_id, project_id: back.project_id, page: back.page, kind: back.kind,
        geometry: back.geometry, style: back.style, body: back.body,
      })
    } catch (e) { complain(message(e)); load() }
  }

  async function addPage() {
    const pages = pad.pages + 1
    try { await setPad(pad.id, { pages }); onChanged({ ...pad, pages }); setPage(pages) }
    catch (e) { complain(message(e)) }
  }

  /** The ruling's strength, written once the slider is let go rather than on every step. */
  async function saveInk(rule_ink: number) {
    try { await setPad(pad.id, { rule_ink }) } catch (e) { complain(message(e)) }
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
    // Framing everything written is only worth doing while it still leaves the writing
    // readable. Past that it is better to show less of it at a size you can read, so the
    // scale never falls below roughly two page widths across the screen.
    const readable = box.width / 2.2
    const scale = clamp(Math.max(Math.min(box.width / w, box.height / h), readable), 60, 12000)
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

  const strokes = here.filter((m) => m.kind !== 'text')
  const texts = here.filter((m) => m.kind === 'text')

  const nib = tool === 'highlight' ? highlight : colour
  const chosen = here.filter((m) => picked.includes(m.id))
  const pickedKinds = { ink: chosen.some((m) => m.kind === 'ink'), onlyHighlight: chosen.length > 0 && chosen.every((m) => m.kind === 'highlight') }
  /** One box round everything picked, a little clear of it. */
  const pickedBox = chosen.length ? chosen.map(boxOf).reduce((a, b) => {
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
    return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }
  }) : null
  const inky = tool === 'pen' || tool === 'pencil'
  return (
    <div className="padview"
      onPointerDownCapture={shield} onPointerMoveCapture={shield} onPointerUpCapture={shield}
      onClickCapture={noClick}>
      {/* The drawing surface is the screen. `touch-action: none` has to be on this element and
          everything in it: iOS reads it from whatever the pointer actually lands on, and a
          child left at the default lets the system claim the gesture and cancel the stroke a
          few samples in — which looks exactly like a pen that does not work. */}
      <div className="padview-frame" ref={frame} onWheel={wheel}
        onPointerDown={down} onPointerMove={move} onPointerUp={up}
        onPointerCancel={cancelled}
        onContextMenu={(e) => {
          // A right-click picks what is under it, whatever tool is in hand, and its settings open.
          e.preventDefault()
          const hit = markAt(at(e))
          setPicked(hit ? (picked.includes(hit.id) ? picked : [hit.id]) : [])
        }}>
        <PadSurface
          marks={strokes} view={view} rule={pad.rule} ruleInk={pad.rule_ink ?? 40}
          onReady={took} />

        <div className="pad-texts" style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale / TEXT_UNIT})`,
        }}>
          {texts.map((m) => {
            const g = m.geometry as { x: number; y: number; w: number; h?: number }
            const save = (next: { w: number; h?: number }) => {
              const geometry = { x: g.x, y: g.y, w: next.w, ...(next.h ? { h: next.h } : {}) }
              setMarks((all) => all.map((x) => (x.id === m.id ? { ...x, geometry } : x)))
              return geometry
            }
            const grip = (which: 'e' | 'se') => ({
              onPointerDown: (e: React.PointerEvent) => {
                e.stopPropagation(); e.preventDefault()
                ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                sizing.current = { id: m.id, x: e.clientX, y: e.clientY, w: g.w, h: g.h, grip: which }
              },
              onPointerMove: (e: React.PointerEvent) => {
                const s = sizing.current
                if (!s || s.id !== m.id) return
                const w = Math.max(0.06, s.w + (e.clientX - s.x) / viewRef.current.scale)
                const h = s.grip === 'se' ? Math.max(0.04, (s.h ?? 0.04) + (e.clientY - s.y) / viewRef.current.scale) : g.h
                save({ w, h })
              },
              onPointerUp: () => {
                if (sizing.current?.id !== m.id) return
                sizing.current = null
                setMarkGeometry(m.id, { x: g.x, y: g.y, w: g.w, ...(g.h ? { h: g.h } : {}) }).catch((err) => complain(message(err)))
              },
            })
            return (
              <div key={m.id} className={`pad-textbox${tool === 'text' || editing === m.id ? ' shown' : ''}`}
                style={{ left: g.x * TEXT_UNIT, top: g.y * TEXT_UNIT, width: g.w * TEXT_UNIT, minHeight: g.h ? g.h * TEXT_UNIT : undefined }}>
                {/* Text that fills its box and wraps at its edge, growing downward as it is
                    typed. A textarea cannot do that at this scale; an editable block can. */}
                <div className="pad-text" role="textbox" aria-multiline="true" aria-label="Text"
                  contentEditable="plaintext-only" suppressContentEditableWarning
                  data-empty={m.body ? undefined : 'Type here'}
                  style={{ color: m.style.colour ?? undefined, fontSize: (m.style.size ?? TEXT_SIZE) * TEXT_UNIT }}
                  ref={(el) => { if (el && editing === m.id && document.activeElement !== el) el.focus() }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onFocus={() => setEditing(m.id)}
                  onInput={(e) => { (e.currentTarget as HTMLElement).dataset.empty = e.currentTarget.textContent ? '' : 'Type here' }}
                  onBlur={(e) => {
                    setEditing(null)
                    const body = e.currentTarget.innerText.replace(/\n$/, '')
                    if (body === (m.body ?? '')) return
                    setMarks((all) => all.map((x) => (x.id === m.id ? { ...x, body } : x)))
                    setMarkBody(m.id, body).catch((err) => complain(message(err)))
                  }}>{m.body ?? ''}</div>
                <span className="pad-textgrip e" title="Drag to change where the text wraps" {...grip('e')} />
                <span className="pad-textgrip se" title="Drag to resize" {...grip('se')} />
                {/* Type size: dragged up for larger, down for smaller. */}
                <span className="pad-textgrip size" title="Drag up or down to change the text size"
                  onPointerDown={(e) => {
                    e.stopPropagation(); e.preventDefault()
                    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                    typeSize.current = { id: m.id, y: e.clientY, size: m.style.size ?? TEXT_SIZE }
                  }}
                  onPointerMove={(e) => {
                    const t = typeSize.current
                    if (!t || t.id !== m.id) return
                    const size = Math.min(0.16, Math.max(0.012, t.size + (t.y - e.clientY) / viewRef.current.scale * 0.5))
                    setMarks((all) => all.map((x) => (x.id === m.id ? { ...x, style: { ...x.style, size } } : x)))
                  }}
                  onPointerUp={() => {
                    if (typeSize.current?.id !== m.id) return
                    typeSize.current = null
                    setMarkStyle(m.id, m.style).catch((err) => complain(message(err)))
                  }}>A</span>
              </div>
            )
          })}
          {pickedBox && (
            <div className="pad-picked" style={{ left: pickedBox.x * TEXT_UNIT, top: pickedBox.y * TEXT_UNIT, width: pickedBox.w * TEXT_UNIT, height: pickedBox.h * TEXT_UNIT }} />
          )}
          {marquee && (
            <div className="pad-textdraft" style={{ left: marquee.x * TEXT_UNIT, top: marquee.y * TEXT_UNIT, width: marquee.w * TEXT_UNIT, height: marquee.h * TEXT_UNIT }} />
          )}
          {box && box.w > 0.01 && (
            <div className="pad-textdraft" style={{ left: box.x * TEXT_UNIT, top: box.y * TEXT_UNIT, width: box.w * TEXT_UNIT, height: box.h * TEXT_UNIT }} />
          )}
        </div>
      </div>

      {picked.length > 0 && (
        <div className="padsel" role="toolbar" aria-label="What is selected" onPointerDown={(e) => e.stopPropagation()}>
          <span className="padsel-count">{picked.length} selected</span>
          {(pickedKinds.onlyHighlight ? HIGHLIGHTS : PAD_COLOURS).map((c) => (
            <button key={c} className="pad-swatch" style={{ background: c }} aria-label={`Colour ${c}`} onClick={() => restyle({ colour: c })} />
          ))}
          {pickedKinds.ink && (
            <>
              <span className="padbar-split" />
              {(['fine', 'medium', 'broad'] as Width[]).map((w) => (
                <button key={w} className="pad-nib" aria-label={`${w} line`} onClick={() => restyle({ width: WIDTHS[w] })}>
                  <span style={{ height: `${WIDTHS[w] * 1100}px`, background: 'var(--ink)' }} />
                </button>
              ))}
            </>
          )}
          <span className="padbar-split" />
          <button className="padbar-key" aria-label="Delete what is selected" title="Delete" onClick={() => void removePicked()}>{icon.erase}</button>
          <button className="padbar-key" aria-label="Done" title="Done" onClick={() => setPicked([])}>{icon.close}</button>
        </div>
      )}

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
          {(['pen', 'pencil', 'highlight', 'text', 'erase', 'select'] as Tool[]).map((t) => (
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
          <button className="padbar-key" onClick={() => { void redo(); goingAway() }} disabled={!undone.length}
            aria-label="Redo" title="Redo">{icon.redo}</button>
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
                onClick={() => { if (tool === 'highlight') setHighlight(c); else setColour(c); goingAway() }}
                aria-label={c} />
            ))}
          </div>
          {inky && (
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
                onClick={() => { void setRule(r.rule); stay() }}>{r.label}</button>
            ))}
          </div>
          {pad.rule !== 'blank' && (
            <label className="padpop-slider">
              <span className="muted small">Ruling</span>
              <input type="range" min={0} max={100} step={5} value={pad.rule_ink ?? 40}
                aria-label="How strongly the ruling is drawn"
                onChange={(e) => { onChanged({ ...pad, rule_ink: Number(e.target.value) }); stay() }}
                onPointerUp={(e) => void saveInk(Number((e.target as HTMLInputElement).value))}
                onKeyUp={(e) => void saveInk(Number((e.target as HTMLInputElement).value))} />
              <span className="muted small nowrap">{pad.rule_ink ?? 40}%</span>
            </label>
          )}
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
  pen: 'Pen', pencil: 'Pencil', highlight: 'Highlighter', text: 'Type', erase: 'Erase', select: 'Select',
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
  pencil: stroked(<><path d="M3 21l1.2-4.6L15 5.6l3.4 3.4L7.6 19.8 3 21Z" /><path d="M13 7.6l3.4 3.4" /><path d="M4.2 16.4l3.4 3.4" /></>),
  highlight: stroked(<><path d="M5 18h5l8.5-8.5a2 2 0 0 0-3-3L7 15v3Z" /><path d="M4 21h9" /></>),
  text: stroked(<><path d="M5 6V4h14v2" /><path d="M12 4v16" /><path d="M9 20h6" /></>),
  select: stroked(<><path d="M5 3.5 18.5 12l-6 1.4-2.3 5.9L5 3.5Z" /></>),
  erase: stroked(<><path d="M8 20h11" /><path d="M15.5 4.5 20 9l-9 9H6.5L3.5 15l12-10.5Z" /><path d="M9 9l6 6" /></>),
  undo: stroked(<><path d="M4 9h11a5 5 0 0 1 0 10h-5" /><path d="M7.5 5.5 4 9l3.5 3.5" /></>),
  redo: stroked(<><path d="M20 9H9a5 5 0 0 0 0 10h5" /><path d="M16.5 5.5 20 9l-3.5 3.5" /></>),
  more: stroked(<><circle cx="5.5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="18.5" cy="12" r="1.3" /></>),
  close: stroked(<><path d="M15 5l-7 7 7 7" /></>),
  back: stroked(<><path d="M15 5l-7 7 7 7" /></>),
  on: stroked(<><path d="M9 5l7 7-7 7" /></>),
}

const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n))

/** The box a mark sits in, in page units, with a little air round a stroke. */
function boxOf(m: PadMark): { x: number; y: number; w: number; h: number } {
  const g = m.geometry as { points?: InkPoint[]; x?: number; y?: number; w?: number; h?: number }
  if (!g.points) return { x: g.x ?? 0, y: g.y ?? 0, w: g.w ?? 0.2, h: Math.max(g.h ?? 0, 0.05) }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const p of g.points) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1] }
  const air = 0.008 + (m.style?.width ?? 0) / 2
  return { x: x0 - air, y: y0 - air, w: x1 - x0 + 2 * air, h: y1 - y0 + 2 * air }
}

/** A mark's geometry, moved. */
function shifted(g: PadMark['geometry'], dx: number, dy: number): PadMark['geometry'] {
  if ('points' in g) return { points: g.points.map((p) => (p.length > 2 ? [p[0] + dx, p[1] + dy, p[2] as number] : [p[0] + dx, p[1] + dy]) as InkPoint) }
  return { ...g, x: g.x + dx, y: g.y + dy }
}

function capture(e: React.PointerEvent): void {
  try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* not fatal */ }
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
 * A stroke in a still picture of a pad.
 *
 * The same outline the canvas fills, as an SVG path — so a thumbnail is made of the same ink
 * as the pad, rather than of a second idea of what ink looks like.
 */
export function Stroke({ mark, across = 1 }: { mark: PadMark; across?: number }) {
  const g = mark.geometry as { points: InkPoint[] }
  if (!g?.points?.length) return null
  const nib: Nib = mark.kind === 'highlight' ? 'highlight'
    : mark.style?.nib === 'pencil' ? 'pencil' : 'pen'
  /*
   * The outline is worked out in pixels, exactly as the pad itself does it, and then drawn back
   * at the pad's own scale. Working it out in the pad's units — where the whole view is about one
   * unit across — was wrong in a way that only showed here: the stroke maker pads a single-point
   * stroke by one whole unit, so a tap became a wedge the width of the page, and a dab of
   * highlighter flooded the whole picture with its colour.
   */
  const px = STILL_PX / Math.max(across, 1e-6)
  const here = g.points.map((p) => (p.length > 2 ? [p[0] * px, p[1] * px, p[2] as number] : [p[0] * px, p[1] * px])) as InkPoint[]
  const width = Math.max(1.4, (mark.style?.width ?? 0.005) * px)
  const d = pathOf(outlineOf(here, width, nib, seedOf(mark.id)))
  if (!d) return null
  return <path d={d} transform={`scale(${1 / px})`} fill={mark.style?.colour ?? '#2b2d2c'} opacity={handOf(nib).alpha} />
}

/** How many pixels wide a still is taken to be when its ink is worked out. */
const STILL_PX = 900

/**
 * A page of a pad, still: fitted to whatever was written on it, read-only.
 *
 * On an endless canvas there is no page to show, so what gets shown is the writing — framed
 * to its own extent. Used for the thumbnails in the list and for reading a pad while typing
 * it up, where a live pad would only be something a stray touch could change.
 */
export function PadStill({ marks, rule, ink = 40, ratio = 11 / 8.5 }: {
  marks: PadMark[]
  rule: PadRule
  /** How strongly the ruling is drawn, nought to a hundred. */
  ink?: number
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
      <StillGround rule={rule} ink={ink} x={x} y={y} w={w} h={h} />
      {marks.filter((m) => m.kind !== 'text').map((m) => <Stroke key={m.id} mark={m} across={w} />)}
      {marks.filter((m) => m.kind === 'text').map((m) => {
        const g = m.geometry as { x: number; y: number; w: number }
        // Wrapped at the box's width, near enough: the still is a thumbnail, not the page.
        const fs = (m.style.size ?? TEXT_SIZE) * 0.87
        const fit = Math.max(4, Math.floor(g.w / (fs * 0.5)))
        const lines: string[] = []
        for (const para of (m.body ?? '').split('\n')) {
          let line = ''
          for (const word of para.split(' ')) {
            if (line && (line + ' ' + word).length > fit) { lines.push(line); line = word } else line = line ? `${line} ${word}` : word
          }
          lines.push(line)
        }
        return (
          <text key={m.id} x={g.x} y={g.y + fs * 1.08} fontSize={fs} fill={m.style.colour ?? '#2b2d2c'}>
            {lines.slice(0, 40).map((l, i) => <tspan key={i} x={g.x + 0.006} dy={i ? fs * 1.3 : 0}>{l}</tspan>)}
          </text>
        )
      })}
    </svg>
  )
}

/** The ruling behind a still, in canvas units rather than screen pixels. */
function StillGround({ rule, ink, x, y, w, h }: {
  rule: PadRule; ink: number; x: number; y: number; w: number; h: number
}) {
  if (rule === 'blank' || ink <= 0) return null
  let step = 0.042
  while (w / step > 44) step *= 2
  const first = Math.ceil(y / step) * step
  const down = Math.ceil(h / step) + 1
  const left = Math.ceil(x / step) * step
  const across = Math.ceil(w / step) + 1
  if (rule === 'dots') {
    return (
      <g opacity={ink / 100}>
        {Array.from({ length: down }, (_, r) => Array.from({ length: across }, (_, c) => (
          <circle key={`${r}-${c}`} cx={left + c * step} cy={first + r * step}
            r={step * 0.04} className="ground-dot" />
        )))}
      </g>
    )
  }
  return (
    <g opacity={ink / 100}>
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
            <PadStill marks={here} rule={pad.rule} ink={pad.rule_ink ?? 40} />
            {pad.pages > 1 && <figcaption className="muted small">Page {n}</figcaption>}
          </figure>
        )
      })}
    </div>
  )
}
