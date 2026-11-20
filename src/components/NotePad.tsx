import { useCallback, useEffect, useRef, useState } from 'react'
import {
  addMark, isPicture, listMarks, removeMarks, setMarkBody, setMarkGeometry, setMarkStyle, setPad, watchPad,
  HIGHLIGHTS, PAD_COLOURS,
  type MarkKind, type NotePad as Pad, type PadMark, type PadRule,
} from '../lib/pads'
import { enterInList, indent, outdent, toggleBullets, type Edit } from '../lib/padText'
import { PALM_ACROSS, PALM_SURE, PEN_TAIL, PINCH_TOGETHER, isHandContact, samplesFrom, type InkPoint } from '../lib/ink'
import { PadSurface, type InkStyle, type PadInk } from './PadSurface'
import { message } from '../lib/errors'
import { useProject } from '../lib/project'
import { keepPhoto, photoUrl } from '../lib/photos'
import type { ProjectStore } from '../lib/files'
import { SheetClip } from './SheetClip'
import { handOf, outlineOf, pathOf, seedOf, type Nib } from '../lib/nib'
import { headOf, leaderFrom, leaderWidth, shaftOf, type Pt } from '../lib/arrows'
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

type Tool = 'pen' | 'pencil' | 'highlight' | 'arrow' | 'text' | 'erase' | 'select'

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
/** A text box's handles: the two sides change where it wraps; the four corners scale box and type together. */
type Grip = 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se'
/**
 * The zoom at which the sizes above are what they say. Line widths and type size are kept in
 * the pad's own units, so a mark made zoomed far in used to arrive as thick, or as large, as
 * one made zoomed out — a medium line could cover the detail being drawn. What a tool makes is
 * now sized for the zoom it is made at: the same on the glass whatever the zoom, and so finer
 * on the paper the closer in the hand is working.
 */
const SIZED_AT = 600
/** How far a finger must travel before the paper follows it, for someone who writes with a pen. */
const STILL = 10

const PEN_KEY = 'cazen.pen.seen'
const penSeen = () => { try { return localStorage.getItem(PEN_KEY) === 'yes' } catch { return false } }
const rememberPen = () => { try { localStorage.setItem(PEN_KEY, 'yes') } catch { /* asked again */ } }

/** How the view sits over the canvas: a scale, and an offset in screen pixels. */
interface View { scale: number; x: number; y: number }

/** What the canvas looks like when nothing has been written yet: a page's worth, centred. */
const HOME = 1.2

export function NotePad({ pad, onChanged, onClose, onTrouble, drawOver, backdrop }: {
  /** The pad is a photograph's own overlay: the photograph fills the page, cannot be moved, and
   *  the pad opens fitted to it. */
  backdrop?: boolean
  /** A photograph already on the page, to be laid on the paper and drawn over: its file's path. */
  drawOver?: string | null
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
  /** The box that actually has the cursor. `editing` asks for it; a phone may not grant it. */
  const [typingId, setTypingId] = useState<string | null>(null)
  /** A text box being dragged out, in page units, before it is one. */
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const boxFrom = useRef<{ id: number; x: number; y: number } | null>(null)
  /** A text box being made wider or narrower by its grip. */
  /** What the select tool, or a right-click, has hold of. */
  const [picked, setPicked] = useState<string[]>([])
  /** The select tool's drag: moving what is picked, or stretching a box round more. */
  const grab = useRef<{ id: number; x: number; y: number; moved: boolean; moving: boolean } | null>(null)
  /** A text box whose next leader is being placed: the next touch on the paper is where it points. */
  const [leading, setLeading] = useState<string | null>(null)
  /** A leader's point being dragged: which box, which leader. */
  const pulling = useRef<{ id: string; i: number; pointer: number } | null>(null)
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const sizing = useRef<{ id: string; x: number; y: number; gx: number; gy: number; w: number; h: number | undefined; size: number; tall: number; grip: Grip } | null>(null)
  const [mine, setMine] = useState<string[]>([])
  /** What undo took off the page, newest last, for redo to put back. Anything new empties it. */
  const [undone, setUndone] = useState<PadMark[]>([])
  /** A text box being dragged by its move grip. */
  const carrying = useRef<{ id: string; x: number; y: number; gx: number; gy: number } | null>(null)
  /** The right-click menu: where it is on the glass, and where that is on the paper. */
  const [ctx, setCtx] = useState<{ x: number; y: number; at: { x: number; y: number }; onMark: boolean } | null>(null)
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
  /** How much a size shrinks or grows to look the same on the glass at the zoom in hand. */
  const atZoom = () => SIZED_AT / Math.max(1, viewRef.current.scale)
  /** What the nib would lay down at this moment. */
  const nibNow = (): InkStyle => ({
    colour: tool === 'highlight' ? highlight : colour,
    width: (tool === 'highlight' ? 0.03 : WIDTHS[width]) * atZoom(),
    nib: tool === 'highlight' ? 'highlight' : tool === 'pencil' ? 'pencil' : 'pen',
    ...(tool === 'arrow' ? { arrow: true } : {}),
  })
  /** Show the stroke in progress. Straight onto the canvas: no render, no reconciliation. */
  const showWet = () => ink.current?.wet(wetRef.current, nibNow(), seedOf(nowId.current))
  const erasing = useRef<Set<string>>(new Set())
  const fingers = useRef<Map<number, { x: number; y: number }>>(new Map())
  const gesture = useRef<{ dist: number; mid: { x: number; y: number }; view: View } | null>(null)
  const penAt = useRef(0)
  const palms = useRef<Set<number>>(new Set())
  /** The one finger that is drawing, when fingers draw: a second one landing makes it a pinch. */
  const firstFinger = useRef<{ id: number; x: number; y: number } | null>(null)
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

  const [loaded, setLoaded] = useState(false)
  const load = useCallback(() => {
    listMarks(pad.id).then((m) => { setMarks(m); setLoaded(true) }).catch((e) => complain(message(e)))
  }, [pad.id, complain])
  useEffect(() => { load() }, [load])

  useEffect(() => watchPad(pad.id, {
    added: (m) => setMarks((all) => (all.some((x) => x.id === m.id) ? all : [...all, m])),
    changed: (m) => setMarks((all) => all.map((x) => (x.id === m.id ? m : x))),
    removed: (id) => setMarks((all) => all.filter((x) => x.id !== id)),
  }), [pad.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // While words are being typed, Escape finishes the typing and nothing else is a shortcut.
      if (typingId) { if (e.key === 'Escape') { e.stopImmediatePropagation(); (document.activeElement as HTMLElement | null)?.blur() } return }
      // Heard before the notebook behind the pad, which would otherwise turn its own page back.
      if (e.key === 'Escape') { e.stopImmediatePropagation(); if (picked.length) setPicked([]); else onClose() }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && picked.length) { e.preventDefault(); void removePicked() }
      else if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const k = e.key.toLowerCase()
        if (k === 'c' && picked.length) { e.preventDefault(); copyPicked() }
        else if (k === 'x' && picked.length) { e.preventDefault(); copyPicked(); void removePicked() }
        else if (k === 'v' && clipboard.length) { e.preventDefault(); void paste() }
        else if (k === 'd' && picked.length) { e.preventDefault(); void duplicatePicked() }
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, editing, typingId, picked, marks, page, tool])

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
   * A hand laid down ahead of the pen looks, for a moment, like fingers come to move the paper.
   * Two things keep that from showing: the paper does not move until a finger has travelled a
   * little (`STILL`), and if the pen then lands, whatever the hand did move is put back.
   */
  const landed = useRef(new Map<number, { x: number; y: number }>())
  const moving = useRef(false)
  const before = useRef<View | null>(null)
  const landFinger = (id: number, x: number, y: number) => {
    if (fingers.current.size === 0) { before.current = viewRef.current; moving.current = false }
    fingers.current.set(id, { x, y })
    landed.current.set(id, { x, y })
    gesture.current = null
  }

  /** Finger-sized contacts taken for a hand a moment ago, which a second finger may yet redeem. */
  const waiting = useRef(new Map<number, { x: number; y: number; t: number }>())
  /** Give back any contact that landed just now and was taken for a hand: it is half of a pinch. */
  function promote(): boolean {
    const now = Date.now()
    let any = false
    for (const [id, w] of waiting.current) {
      waiting.current.delete(id)
      if (now - w.t > PINCH_TOGETHER || !handIds.current.has(id)) continue
      handIds.current.delete(id); palms.current.delete(id)
      landFinger(id, w.x, w.y)
      try { frame.current?.setPointerCapture(id) } catch { /* not fatal */ }
      any = true
    }
    return any
  }

  /**
   * Taken at the capture phase, before the drawing or any button hears about it. Telling the
   * browser as well matters twice over: an unclaimed contact is one iOS may hand to a system
   * gesture, which cancels the pen mid-stroke, and a pointerdown that is spoken for does not
   * come back later as a click.
   */
  function shield(e: React.PointerEvent) {
    if (e.type === 'pointerup' || e.type === 'pointercancel') { handIds.current.delete(e.pointerId); waiting.current.delete(e.pointerId) }
    if (!isHand(e)) {
      if (e.type === 'pointerdown') { meantAt.current = Date.now(); if (e.pointerType === 'touch') promote() }
      return
    }
    if (e.type === 'pointerdown') {
      // A pinch, for someone who writes with a pen. Fingers pressed to the glass report wider
      // than the palm rule allows, so both were being taken for a resting hand and the paper
      // would not zoom. Two finger-sized contacts landing together, with the pen away, are a
      // pinch: the one already down is given back, and this one is let through to join it.
      const across = Math.max(e.width || 0, e.height || 0)
      const now = Date.now()
      if (!fingerDraws && across > PALM_ACROSS && across <= PALM_SURE && now - penAt.current >= PEN_TAIL) {
        if (promote()) { meantAt.current = now; return }
        waiting.current.set(e.pointerId, { x: e.clientX, y: e.clientY, t: now })
      }
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
    // Placing a leader: wherever the next touch lands is what it points to.
    if (leading && e.button === 0) {
      const p = at(e)
      setLeaders(leading, [...leadersOf(leading), [p.x, p.y]])
      setLeading(null)
      e.preventDefault()
      return
    }
    const read = readTouch(e)
    setTouch({ read, across: Math.round(Math.max(e.width || 0, e.height || 0)) })
    // Back on the canvas means done with the menu.
    if (open) goingAway()

    if (read === 'pen') {
      penAt.current = Date.now()
      if (!penSeen()) { rememberPen(); setFingerDraws(false) }
      // The pen has come down with touches already on the glass: they were the hand that
      // holds it. They stay ignored until they lift, and anything they moved goes back.
      if (fingers.current.size && !fingerDraws) {
        for (const id of fingers.current.keys()) { handIds.current.add(id); palms.current.add(id) }
        if (moving.current && before.current) setView(before.current)
      }
      fingers.current.clear(); landed.current.clear(); moving.current = false
      gesture.current = null
    }
    if (read === 'palm') {
      // Ignored, and told to the browser as well: an unclaimed contact is one iOS may decide
      // belongs to a system gesture, and claiming it cancels the pen mid-stroke.
      palms.current.add(e.pointerId)
      e.preventDefault()
      return
    }

    // When fingers draw, one finger draws and two move the paper. The second finger landing
    // is what says which it was: whatever the first had begun — a stroke, a box, a selection —
    // is dropped unsaved, and both become the pinch. Nobody draws with two fingers at once.
    if (read === 'finger' && fingerDraws) {
      const first = firstFinger.current
      if ((first && first.id !== e.pointerId) || fingers.current.size > 0) {
        if (first) {
          if (drawing.current === first.id) { forget(); drawing.current = null; wetRef.current = null; erasing.current = new Set(); showWet() }
          if (grab.current?.id === first.id) { grab.current = null; setMarquee(null) }
          if (boxFrom.current?.id === first.id) { boxFrom.current = null; setBox(null) }
          fingers.current.set(first.id, { x: first.x, y: first.y })
          firstFinger.current = null
        }
        fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        gesture.current = null
        capture(e)
        return
      }
      firstFinger.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
    }

    // The wheel pressed down is a hand on the paper: it drags it, and draws nothing.
    if (read === 'mouse' && e.button === 1) {
      fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      gesture.current = null
      capture(e)
      return
    }
    // Only the main button draws; the right one asks for the menu.
    if (read === 'mouse' && e.button !== 0) return
    if (ctx) setCtx(null)

    const draws = read === 'pen' || read === 'mouse' || fingerDraws
    if (!draws) {
      landFinger(e.pointerId, e.clientX, e.clientY)
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
      // A touch on the paper while a box is being typed in finishes the typing, and that is
      // all: it does not also start another box where it landed.
      if (typingId !== null) { (document.activeElement as HTMLElement | null)?.blur(); return }
      // A box that was made but never took the cursor (a phone may refuse to give it one) is
      // not being typed in: it must not hold the pad in typing.
      if (editing !== null) setEditing(null)
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
    if (firstFinger.current?.id === e.pointerId) firstFinger.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
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
    // An arrow is straight: where it began, and where the pen is now.
    if (tool === 'arrow') {
      if (wetRef.current?.length && more.length) wetRef.current = [wetRef.current[0], more[more.length - 1]]
      showWet()
      return
    }
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
    // For someone who writes with a pen, nothing moves until a finger has: a hand settling on
    // the glass shifts by a few pixels, and that is not a drag.
    if (!fingerDraws && !moving.current) {
      const from = landed.current.get(e.pointerId)
      if (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) < STILL) return
      moving.current = true
      gesture.current = null
      return
    }
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
    if (firstFinger.current?.id === e.pointerId) firstFinger.current = null
    palms.current.delete(e.pointerId)
    handIds.current.delete(e.pointerId)
    if (e.pointerType === 'pen') penAt.current = Date.now()
    landed.current.delete(e.pointerId)
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
      void placeText(b && b.w > 0.04 * atZoom() ? b : { x: f.x, y: f.y, w: 0.5 * atZoom() })
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
    if (firstFinger.current?.id === e.pointerId) firstFinger.current = null
    if (grab.current?.id === e.pointerId) { grab.current = null; setMarquee(null); return }
    if (boxFrom.current?.id === e.pointerId) { boxFrom.current = null; setBox(null); return }
    palms.current.delete(e.pointerId)
    handIds.current.delete(e.pointerId)
    landed.current.delete(e.pointerId)
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
    // An arrow too short to have a direction was a tap, not an arrow.
    if (tool === 'arrow') {
      const a = points[0], b = points[points.length - 1]
      if (points.length < 2 || Math.hypot(b[0] - a[0], b[1] - a[1]) * viewRef.current.scale < 6) { showWet(); return }
      points = [[a[0], a[1]], [b[0], b[1]]]
    }
    // A tap is a dot — an i, a bullet, a full stop. One point draws nothing, so it is given a
    // second a hair away and the round cap makes it a dot.
    if (points.length === 1) {
      const [x, y, f] = points[0] as [number, number, number?]
      points = [points[0], (f == null ? [x + 0.0004, y] : [x + 0.0004, y, f]) as InkPoint]
    }
    const kind: MarkKind = tool === 'highlight' ? 'highlight' : 'ink'
    const style = {
      colour: kind === 'highlight' ? highlight : colour,
      width: (kind === 'highlight' ? 0.03 : WIDTHS[width]) * atZoom(),
      ...(tool === 'pencil' ? { nib: 'pencil' as const } : {}),
      ...(tool === 'arrow' ? { arrow: true } : {}),
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
      // A picture is paper to draw over: the eraser takes ink off it, not the picture away.
      if (erasing.current.has(m.id) || isPicture(m)) continue
      if (touches(m, p, 0.02 * atZoom())) erasing.current.add(m.id)
    }
    if (erasing.current.size) setMarks((all) => all.filter((m) => !erasing.current.has(m.id)))
  }

  /** The topmost mark under a point: the last drawn is the one on top. */
  function markAt(p: { x: number; y: number }): PadMark | null {
    const reach = Math.max(0.008, 12 / viewRef.current.scale)
    for (let i = here.length - 1; i >= 0; i--) {
      const m = here[i]
      if (backdrop && isPicture(m)) continue
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

  /** A text box's leaders changed: drawn at once, saved behind. */
  function setLeaders(id: string, leaders: [number, number][], save = true) {
    let style: PadMark['style'] | null = null
    setMarks((all) => all.map((m) => {
      if (m.id !== id) return m
      style = { ...m.style }
      if (leaders.length) style.leaders = leaders
      else delete style.leaders
      return { ...m, style }
    }))
    if (save) queueMicrotask(() => { if (style) setMarkStyle(id, style).catch((err) => { complain(message(err)); load() }) })
  }
  const leadersOf = (id: string): [number, number][] => marks.find((m) => m.id === id)?.style.leaders ?? []

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

  // The right-click menu goes when anything that is not the menu is pressed.
  useEffect(() => {
    if (!ctx) return
    const away = (e: Event) => { if (!(e.target as HTMLElement | null)?.closest?.('.padctx')) setCtx(null) }
    window.addEventListener('pointerdown', away, true)
    return () => window.removeEventListener('pointerdown', away, true)
  }, [ctx])

  /** Copies of marks laid on this page, moved by an amount, and picked up so they can be placed. */
  async function lay(copies: PadMark[], dx: number, dy: number) {
    if (!copies.length) return
    const made: PadMark[] = copies.map((m) => ({
      ...m, id: crypto.randomUUID(), pad_id: pad.id, project_id: pad.project_id, page,
      geometry: shifted(m.geometry, dx, dy), created_at: new Date().toISOString(),
    }))
    setMarks((all) => [...all, ...made])
    setMine((m) => [...m, ...made.map((x) => x.id)])
    setUndone([])
    setPicked(made.map((m) => m.id))
    if (tool !== 'select') setTool('select')
    try {
      for (const m of made) await addMark({ id: m.id, pad_id: m.pad_id, project_id: m.project_id, page: m.page, kind: m.kind, geometry: m.geometry, style: m.style, body: m.body })
    } catch (e) { complain(message(e)); load() }
  }
  const copyPicked = () => { if (chosenNow().length) clipboard = chosenNow().map((m) => structuredClone(m)) }
  const chosenNow = () => marks.filter((m) => m.page === page && picked.includes(m.id))
  /** A little down and to the right, so the copy is seen to be one. */
  const duplicatePicked = () => lay(chosenNow(), 0.03, 0.03)
  /** What was copied, with its top-left corner where the menu was asked for — or nudged, from the keyboard. */
  function paste(where?: { x: number; y: number }) {
    if (!clipboard.length) return
    if (!where) return lay(clipboard, 0.03, 0.03)
    const boxes = clipboard.map(boxOf)
    const x = Math.min(...boxes.map((b) => b.x)), y = Math.min(...boxes.map((b) => b.y))
    return lay(clipboard, where.x - x, where.y - y)
  }

  // ---- pictures to draw over ----------------------------------------------------------------

  const { current: project } = useProject()
  const photoIn = useRef<HTMLInputElement>(null)
  const [clipping, setClipping] = useState(false)
  /** Lay a picture on the paper in the middle of what is on screen, about half the window wide. */
  async function placePicture(file: Blob, shape: { w: number; h: number }, about: string) {
    if (!project) return
    try {
      await layPicture(await keepPhoto(project as ProjectStore, file, about), shape)
    } catch (e) { complain(message(e)) }
  }
  /** A picture whose file is already kept, laid on the paper. */
  async function layPicture(path: string, shape: { w: number; h: number }) {
    try {
      if (backdrop) {
        // A photograph's overlay: the photograph is the page itself, one unit wide from the
        // corner, so what is drawn on it can be laid back over the photograph anywhere else.
        const saved = await addMark({ pad_id: pad.id, project_id: pad.project_id, page, kind: 'text',
          geometry: { x: 0, y: 0, w: 1, h: shape.h / shape.w }, style: { image: path }, body: '' })
        setMarks((all) => [...all, saved])
        return
      }
      const v = viewRef.current, box = frame.current?.getBoundingClientRect()
      const across = (box?.width ?? 800) / v.scale, down = (box?.height ?? 600) / v.scale
      let w = across * 0.55, h = w * shape.h / shape.w
      if (h > down * 0.7) { h = down * 0.7; w = h * shape.w / shape.h }
      const saved = await addMark({
        pad_id: pad.id, project_id: pad.project_id, page, kind: 'text',
        geometry: { x: -v.x / v.scale + (across - w) / 2, y: -v.y / v.scale + (down - h) / 2, w, h },
        style: { image: path }, body: '',
      })
      setMine((m) => [...m, saved.id]); setUndone([])
      setMarks((all) => [...all, saved])
      // Picked up at once, so it can be put where it belongs and made the size wanted.
      setTool('select'); setPicked([saved.id])
    } catch (e) { complain(message(e)) }
  }
  // Sent here from a photograph on the page: it is laid down once, unless it is already here.
  const laid = useRef(false)
  useEffect(() => {
    if (!drawOver || !project || laid.current || !loaded) return
    laid.current = true
    if (marks.some((m) => m.style?.image === drawOver)) return
    let gone = false
    photoUrl(project as ProjectStore, drawOver).then((url) => {
      const im = new Image()
      im.onload = () => { URL.revokeObjectURL(url); if (!gone) void layPicture(drawOver, { w: im.naturalWidth, h: im.naturalHeight }) }
      im.onerror = () => URL.revokeObjectURL(url)
      im.src = url
    }).catch((e) => complain(message(e)))
    return () => { gone = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawOver, project, loaded])

  // A photograph's overlay opens with the photograph filling the window.
  const fitted = useRef(false)
  useEffect(() => {
    if (!backdrop || fitted.current) return
    const pic = marks.find(isPicture), box = frame.current?.getBoundingClientRect()
    if (!pic || !box) return
    fitted.current = true
    const b = boxOf(pic)
    const scale = Math.min(box.width / b.w, (box.height - 80) / b.h) * 0.96
    setView({ scale, x: (box.width - b.w * scale) / 2 - b.x * scale, y: Math.max(8, (box.height - 80 - b.h * scale) / 2) - b.y * scale })
  }, [backdrop, marks])

  async function photoChosen(file: File | undefined) {
    if (!file) return
    try {
      const bmp = await createImageBitmap(file)
      await placePicture(file, { w: bmp.width, h: bmp.height }, 'Pad photo')
    } catch (e) { complain(message(e)) } finally { if (photoIn.current) photoIn.current.value = '' }
  }
  /** A corner of the one picture picked: it grows or shrinks about the opposite corner, keeping its shape. */
  const sizingPic = useRef<{ id: string; x: number; g: { x: number; y: number; w: number; h: number }; corner: 'nw' | 'ne' | 'sw' | 'se' } | null>(null)
  const picGrip = (m: PadMark, corner: 'nw' | 'ne' | 'sw' | 'se') => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation(); e.preventDefault()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      sizingPic.current = { id: m.id, x: e.clientX, g: boxOf(m), corner }
    },
    onPointerMove: (e: React.PointerEvent) => {
      const z = sizingPic.current
      if (!z || z.id !== m.id) return
      const dx = (e.clientX - z.x) / viewRef.current.scale
      const west = z.corner === 'nw' || z.corner === 'sw'
      const w = Math.max(z.g.w * 0.08, z.g.w + (west ? -dx : dx)), k = w / z.g.w, h = z.g.h * k
      const geometry = { x: west ? z.g.x + z.g.w - w : z.g.x, y: z.corner === 'nw' || z.corner === 'ne' ? z.g.y + z.g.h - h : z.g.y, w, h }
      setMarks((all) => all.map((x) => (x.id === m.id ? { ...x, geometry } : x)))
    },
    onPointerUp: () => {
      if (sizingPic.current?.id !== m.id) return
      sizingPic.current = null
      setMarkGeometry(m.id, m.geometry).catch((err) => complain(message(err)))
    },
  })

  // ---- the words in the box being typed in ------------------------------------------------

  /** The box being typed in, and the mark it is. */
  const typingIn = (): { el: HTMLElement; mark: PadMark } | null => {
    const el = document.activeElement as HTMLElement | null
    const mark = marks.find((m) => m.id === typingId)
    return el?.classList.contains('pad-text') && mark ? { el, mark } : null
  }
  /** Bold, italic, underline, and which edge the lines start from: the whole box's. */
  function restyleText(patch: Partial<PadMark['style']>) {
    const t = typingIn()
    if (!t) return
    const style = { ...t.mark.style, ...patch }
    setMarks((all) => all.map((m) => (m.id === t.mark.id ? { ...m, style } : m)))
    setMarkStyle(t.mark.id, style).catch((err) => complain(message(err)))
  }
  /** A change to the lines the cursor is on: bullets, a level in, a level out. */
  function retype(change: (text: string, start: number, end: number) => Edit) {
    const t = typingIn()
    const at = t && caretOf(t.el)
    if (!t || !at) return
    putText(t.el, change(t.el.innerText, at.start, at.end))
  }

  async function placeText(p: { x: number; y: number; w: number; h?: number }) {
    try {
      const saved = await addMark({
        pad_id: pad.id, project_id: pad.project_id, page, kind: 'text',
        geometry: { x: p.x, y: p.y, w: p.w, ...(p.h && p.h > 0.04 * atZoom() ? { h: p.h } : {}) },
        style: { colour, size: TEXT_SIZE * atZoom() },
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
  /*
   * The wheel, as on a sheet: it zooms, about the pointer. Pressing the wheel and dragging
   * moves the paper. A trackpad's two-finger swipe still moves it and its pinch still zooms —
   * a swipe is told from a wheel by coming in small steps or sideways.
   *
   * Listened for directly rather than through React, whose wheel listener cannot stop the
   * browser: with Ctrl held the whole page zoomed along with the paper.
   */
  useEffect(() => {
    const el = frame.current
    if (!el) return
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const box = el.getBoundingClientRect()
      const lines = e.deltaMode === 1
      // Only a mostly-sideways movement moves the paper. Small up-and-down steps are a
      // smooth-scrolling wheel as often as a trackpad, and a wheel that only zooms with Ctrl
      // held is the thing this was meant to end.
      const swipe = !e.ctrlKey && !e.metaKey && !lines && Math.abs(e.deltaX) > Math.abs(e.deltaY)
      if (swipe) {
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }))
        return
      }
      const step = lines ? e.deltaY * 16 : e.deltaY
      // A pinch arrives as small steps with Ctrl; a wheel as big ones. Each notch is about a sixth.
      const k = e.ctrlKey ? clamp(1 - step * 0.01, 0.8, 1.25) : Math.exp(-step * 0.0016)
      setView((v) => {
        const scale = clamp(v.scale * k, 60, 12000)
        const grew = scale / v.scale
        const px = e.clientX - box.left
        const py = e.clientY - box.top
        return { scale, x: px - (px - v.x) * grew, y: py - (py - v.y) * grew }
      })
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [])

  const strokes = here.filter((m) => m.kind !== 'text')
  const onePicture = picked.length === 1 ? here.find((m) => m.id === picked[0] && isPicture(m)) ?? null : null
  const texts = here.filter((m) => m.kind === 'text' && !isPicture(m))
  const pictures = here.filter(isPicture)
  /** Text boxes with leaders: their leaders are drawn with the ink. */
  const leadered = texts.filter((m) => m.style.leaders?.length)
  const onlyText = picked.length === 1 ? texts.find((m) => m.id === picked[0]) ?? null : null

  const nib = tool === 'highlight' ? highlight : colour
  const chosen = here.filter((m) => picked.includes(m.id))
  const pickedKinds = { ink: chosen.some((m) => m.kind === 'ink'), onlyHighlight: chosen.length > 0 && chosen.every((m) => m.kind === 'highlight') }
  /** One box round everything picked, a little clear of it. */
  const pickedBox = chosen.length ? chosen.map(boxOf).reduce((a, b) => {
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
    return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }
  }) : null
  const inky = tool === 'pen' || tool === 'pencil' || tool === 'arrow'
  // Nothing on the pad is selectable but the text box being typed in. A pencil held still asks
  // the phone to select whatever words are nearest, and the phone then raises its own Copy /
  // Look Up menu over the page; any selection that starts anywhere else is refused, and one
  // that gets through is dropped.
  const lastPointer = useRef<string>('mouse')
  useEffect(() => {
    const typing = (n: Node | null) => {
      const el = n instanceof Element ? n : n?.parentElement
      const box = el?.closest('.pad-text, textarea, input')
      return !!box && (box === document.activeElement || box.contains(document.activeElement))
    }
    const start = (e: Event) => { if (!typing(e.target as Node)) e.preventDefault() }
    const changed = () => {
      const sel = document.getSelection()
      if (sel && !sel.isCollapsed && !typing(sel.anchorNode)) sel.removeAllRanges()
    }
    const down = (e: PointerEvent) => { lastPointer.current = e.pointerType || 'mouse' }
    // The long press itself. On an iPhone it is the touch, not the pointer, that the system
    // watches to decide a finger or a hand is asking for a selection and its menu (Copy, Look
    // Up, Copy Link to Highlight); claiming the touch as it lands is what stops it. Buttons
    // and the box being typed in are left alone — they need the touch to become a tap.
    const root = frame.current?.closest('.padview') as HTMLElement | null
    const touch = (e: TouchEvent) => {
      const on = e.target as Element | null
      // A formatting key acts on pointerdown and must not take the cursor out of the box.
      // The clip picker laid over the pad is an ordinary screen: it scrolls and taps as usual.
      if (on?.closest('.pad-over')) return
      if (on?.closest('.pad-fmt')) { if (e.cancelable) e.preventDefault(); return }
      if (on?.closest('button, input, textarea, select, label, a, .pad-text')) return
      if (e.cancelable) e.preventDefault()
    }
    root?.addEventListener('touchstart', touch, { passive: false })
    document.addEventListener('selectstart', start)
    document.addEventListener('selectionchange', changed)
    document.addEventListener('pointerdown', down, true)
    return () => {
      root?.removeEventListener('touchstart', touch)
      document.removeEventListener('selectstart', start)
      document.removeEventListener('selectionchange', changed)
      document.removeEventListener('pointerdown', down, true)
    }
  }, [])

  return (
    <div className="padview"
      onPointerDownCapture={shield} onPointerMoveCapture={shield} onPointerUpCapture={shield}
      onClickCapture={noClick}>
      {/* The drawing surface is the screen. `touch-action: none` has to be on this element and
          everything in it: iOS reads it from whatever the pointer actually lands on, and a
          child left at the default lets the system claim the gesture and cancel the stroke a
          few samples in — which looks exactly like a pen that does not work. */}
      <div className="padview-frame" ref={frame}
        onPointerDown={down} onPointerMove={move} onPointerUp={up}
        onPointerCancel={cancelled}
        onContextMenu={(e) => {
          // A right-click picks what is under it, whatever tool is in hand, and its settings open.
          e.preventDefault()
          // A pencil or a finger held still also arrives here on some phones. That is writing
          // paused, not a request for a menu.
          if (lastPointer.current !== 'mouse') return
          const where = at(e)
          const hit = markAt(where)
          setPicked(hit ? (picked.includes(hit.id) ? picked : [hit.id]) : [])
          // On something: what can be done with it. On bare paper: paste, if there is anything to.
          if (hit || clipboard.length) setCtx({ x: e.clientX, y: e.clientY, at: where, onMark: !!hit })
          else setCtx(null)
        }}
        // The wheel pressed down drags the paper, and must not start the browser's own scrolling.
        onMouseDown={(e) => { if (e.button === 1) e.preventDefault() }}>
        {/* Pictures lie under the ink: a photograph or a piece of a drawing, there to be drawn over. */}
        <div className="pad-pics" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale / TEXT_UNIT})` }}>
          {pictures.map((m) => {
            const b = boxOf(m)
            return <PadPicture key={m.id} project={project as ProjectStore | null} path={m.style.image!}
              style={{ left: b.x * TEXT_UNIT, top: b.y * TEXT_UNIT, width: b.w * TEXT_UNIT, height: b.h * TEXT_UNIT }} />
          })}
        </div>
        <PadSurface
          marks={leadered.length ? [...strokes, ...leadered] : strokes} view={view} rule={pad.rule} ruleInk={pad.rule_ink ?? 40} contrast={!!pad.contrast}
          onReady={took} />

        {/* With a pen in hand the typed text is part of the paper: it takes no touch. A palm
            resting on a text box otherwise put the cursor in it, and iOS raised its Copy / Look Up
            menu over the page. The text tool, or Select, is how text is reached. */}
        <div className={`pad-texts${pad.contrast ? ' contrast' : ''}${tool === 'select' ? ' selecting' : ''}${tool !== 'text' && tool !== 'select' && editing === null ? ' resting' : ''}`} style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale / TEXT_UNIT})`,
          // One pixel of the glass, in this layer's units: frames and handles are sized by it,
          // so they are the same on screen at every zoom.
          ['--u' as string]: `${TEXT_UNIT / view.scale}px`,
        }}>
          {texts.map((m) => {
            const g = m.geometry as { x: number; y: number; w: number; h?: number }
            // As in Freeform and Keynote: a side handle changes the box (the words keep their
            // size and wrap again); a corner handle scales the box and its type together, about
            // the opposite corner. The frame itself is what the box is moved by.
            const grip = (which: Grip) => ({
              onPointerDown: (e: React.PointerEvent) => {
                e.stopPropagation(); e.preventDefault()
                ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                const el = (e.currentTarget as HTMLElement).parentElement
                sizing.current = { id: m.id, x: e.clientX, y: e.clientY, gx: g.x, gy: g.y, w: g.w, h: g.h,
                  size: m.style.size ?? TEXT_SIZE, tall: (el?.offsetHeight ?? 0) / TEXT_UNIT, grip: which }
              },
              onPointerMove: (e: React.PointerEvent) => {
                const z = sizing.current
                if (!z || z.id !== m.id) return
                const dx = (e.clientX - z.x) / viewRef.current.scale
                const west = z.grip === 'w' || z.grip === 'nw' || z.grip === 'sw'
                const w = Math.max(z.grip.length === 1 ? 0.02 : z.w * 0.15, z.w + (west ? -dx : dx))
                const x = west ? z.gx + (z.w - w) : z.gx
                if (z.grip.length === 1) {
                  setMarks((all) => all.map((mk) => (mk.id === m.id ? { ...mk, geometry: { ...g, x, w } } : mk)))
                  return
                }
                const k = w / z.w
                const y = z.grip === 'nw' || z.grip === 'ne' ? z.gy + z.tall * (1 - k) : z.gy
                setMarks((all) => all.map((mk) => (mk.id === m.id
                  ? { ...mk, geometry: { x, y, w, ...(z.h ? { h: z.h * k } : {}) }, style: { ...mk.style, size: z.size * k } } : mk)))
              },
              onPointerUp: () => {
                const z = sizing.current
                if (z?.id !== m.id) return
                sizing.current = null
                setMarkGeometry(m.id, m.geometry).catch((err) => complain(message(err)))
                if (z.grip.length > 1) setMarkStyle(m.id, m.style).catch((err) => complain(message(err)))
              },
            })
            /** The frame: taken hold of anywhere along it, the box goes where it is dragged. */
            const carry = {
              onPointerDown: (e: React.PointerEvent) => {
                e.stopPropagation(); e.preventDefault()
                ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                carrying.current = { id: m.id, x: e.clientX, y: e.clientY, gx: g.x, gy: g.y }
              },
              onPointerMove: (e: React.PointerEvent) => {
                const c = carrying.current
                if (!c || c.id !== m.id) return
                const geometry = { ...g, x: c.gx + (e.clientX - c.x) / viewRef.current.scale, y: c.gy + (e.clientY - c.y) / viewRef.current.scale }
                setMarks((all) => all.map((mk) => (mk.id === m.id ? { ...mk, geometry } : mk)))
              },
              onPointerUp: () => {
                if (carrying.current?.id !== m.id) return
                carrying.current = null
                setMarkGeometry(m.id, m.geometry).catch((err) => complain(message(err)))
              },
            }
            return (
              <div key={m.id} className={`pad-textbox${tool === 'text' || editing === m.id ? ' shown' : ''}`}
                style={{ left: g.x * TEXT_UNIT, top: g.y * TEXT_UNIT, width: g.w * TEXT_UNIT, minHeight: g.h ? g.h * TEXT_UNIT : undefined }}>
                {/* Text that fills its box and wraps at its edge, growing downward as it is
                    typed. A textarea cannot do that at this scale; an editable block can. */}
                <div className="pad-text" role="textbox" aria-multiline="true" aria-label="Text"
                  contentEditable="plaintext-only" suppressContentEditableWarning
                  data-empty={m.body ? undefined : 'Type here'}
                  style={{ color: m.style.colour ?? undefined, fontSize: (m.style.size ?? TEXT_SIZE) * TEXT_UNIT, textAlign: m.style.align ?? 'left',
                    fontWeight: m.style.bold ? 700 : undefined, fontStyle: m.style.italic ? 'italic' : undefined, textDecoration: m.style.underline ? 'underline' : undefined }}
                  onKeyDown={(e) => {
                    if (e.key === 'Tab') { e.preventDefault(); retype(e.shiftKey ? outdent : indent); return }
                    if (e.key !== 'Enter' || e.shiftKey) return
                    const el = e.currentTarget, at = caretOf(el)
                    if (!at || at.start !== at.end) return
                    const next = enterInList(el.innerText, at.start)
                    if (next) { e.preventDefault(); putText(el, next) }
                  }}
                  ref={(el) => { if (el && editing === m.id && document.activeElement !== el) el.focus() }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onFocus={() => { setEditing(m.id); setTypingId(m.id) }}
                  onInput={(e) => { (e.currentTarget as HTMLElement).dataset.empty = e.currentTarget.textContent ? '' : 'Type here' }}
                  onBlur={(e) => {
                    setEditing(null); setTypingId(null)
                    const body = e.currentTarget.innerText.replace(/\n+$/, '')
                    // A box left with nothing in it was a click that came to nothing: it goes.
                    if (!body.trim()) {
                      setMarks((all) => all.filter((x) => x.id !== m.id))
                      setMine((mine) => mine.filter((id) => id !== m.id))
                      removeMarks([m.id]).catch((err) => complain(message(err)))
                      return
                    }
                    if (body === (m.body ?? '')) return
                    setMarks((all) => all.map((x) => (x.id === m.id ? { ...x, body } : x)))
                    setMarkBody(m.id, body).catch((err) => complain(message(err)))
                  }}>{m.body ?? ''}</div>
                {(['n', 's', 'w', 'e'] as const).map((side) => <span key={side} className={`pad-textedge ${side}`} title="Drag to move this text" {...carry} />)}
                <span className="pad-textgrip side w" title="Drag to change where the text wraps" {...grip('w')} />
                <span className="pad-textgrip side e" title="Drag to change where the text wraps" {...grip('e')} />
                {(['nw', 'ne', 'sw', 'se'] as const).map((c) => <span key={c} className={`pad-textgrip corner ${c}`} title="Drag to make the text larger or smaller" {...grip(c)} />)}
              </div>
            )
          })}
          {onePicture && (() => {
            const b = boxOf(onePicture)
            return (
              <div className="pad-textbox shown pad-picframe" style={{ left: b.x * TEXT_UNIT, top: b.y * TEXT_UNIT, width: b.w * TEXT_UNIT, height: b.h * TEXT_UNIT }}>
                {(['nw', 'ne', 'sw', 'se'] as const).map((c) => <span key={c} className={`pad-textgrip corner ${c}`} title="Drag to make the picture larger or smaller" {...picGrip(onePicture, c)} />)}
              </div>
            )
          })()}
          {onlyText && (onlyText.style.leaders ?? []).map(([lx, ly], i) => (
            <span key={`${onlyText.id}:${i}`} className="pad-leaderdot" title="Drag to move where this leader points; double-click to remove it"
              style={{ left: lx * TEXT_UNIT, top: ly * TEXT_UNIT }}
              onPointerDown={(e) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); pulling.current = { id: onlyText.id, i, pointer: e.pointerId } }}
              onPointerMove={(e) => {
                const g = pulling.current
                if (!g || g.pointer !== e.pointerId) return
                const p = at(e)
                setLeaders(g.id, leadersOf(g.id).map((q, k) => (k === g.i ? [p.x, p.y] as [number, number] : q)), false)
              }}
              onPointerUp={(e) => {
                const g = pulling.current
                if (!g || g.pointer !== e.pointerId) return
                pulling.current = null
                setLeaders(g.id, leadersOf(g.id))
              }}
              onDoubleClick={(e) => { e.stopPropagation(); setLeaders(onlyText.id, leadersOf(onlyText.id).filter((_, k) => k !== i)) }} />
          ))}
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

      {ctx && (
        <div className="padctx" role="menu" style={{ left: Math.min(ctx.x, window.innerWidth - 190), top: Math.min(ctx.y, window.innerHeight - (ctx.onMark ? 232 : 60)) }}
          onPointerDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
          {ctx.onMark && <>
            <button role="menuitem" onClick={() => { copyPicked(); void removePicked(); setCtx(null) }}>Cut<kbd>Ctrl X</kbd></button>
            <button role="menuitem" onClick={() => { copyPicked(); setCtx(null) }}>Copy<kbd>Ctrl C</kbd></button>
          </>}
          <button role="menuitem" disabled={!clipboard.length} onClick={() => { void paste(ctx.at); setCtx(null) }}>Paste<kbd>Ctrl V</kbd></button>
          {ctx.onMark && <>
            <button role="menuitem" onClick={() => { void duplicatePicked(); setCtx(null) }}>Duplicate<kbd>Ctrl D</kbd></button>
            <button role="menuitem" className="danger" onClick={() => { void removePicked(); setCtx(null) }}>Delete<kbd>Del</kbd></button>
          </>}
        </div>
      )}
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
                <button key={w} className="pad-nib" aria-label={`${w} line`} onClick={() => restyle({ width: WIDTHS[w] * atZoom() })}>
                  <span style={{ height: `${WIDTHS[w] * 1100}px`, background: 'var(--ink)' }} />
                </button>
              ))}
            </>
          )}
          {onlyText && (
            <>
              <span className="padbar-split" />
              <button className="padbar-key" aria-label="Add a leader" title="Add a leader — then touch where it points" onClick={() => setLeading(onlyText.id)}>{icon.leader}</button>
              {!!onlyText.style.leaders?.length && (
                <button className="padpop-word" onClick={() => setLeaders(onlyText.id, [])}>No leaders</button>
              )}
            </>
          )}
          <span className="padbar-split" />
          <button className="padbar-key" aria-label="Delete what is selected" title="Delete" onClick={() => void removePicked()}>{icon.erase}</button>
          <button className="padbar-key" aria-label="Done" title="Done" onClick={() => setPicked([])}>{icon.close}</button>
        </div>
      )}

      {leading && (
        <div className="pad-leading" role="status" onPointerDown={(e) => e.stopPropagation()}>
          <span>Touch where the leader points</span>
          <button className="link" onClick={() => setLeading(null)}>Cancel</button>
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
      <div className={`padmenu${open || typingId !== null ? ' open' : ''}${typingId !== null ? ' typing' : ''}`} onPointerDown={(e) => { e.stopPropagation(); stay() }}>
        <button className="padmenu-mark" aria-expanded={open}
          aria-label={open ? 'Hide the tools' : 'Show the tools'}
          onClick={() => { if (open) { setOpen(false); setMenu(null) } else { setOpen(true); stay() } }}>
          <Mark size={30} />
        </button>

        <div className="padbar" {...(open || typingId !== null ? {} : { inert: '' as unknown as boolean })}>
          <button className="padbar-out" onClick={onClose} aria-label="Close the pad" title="Close the pad">
            {icon.close}<span>Close</span>
          </button>
          <span className="padbar-split" />
          {typingId !== null && (() => {
            // While words are being typed the bar is theirs: the box's weight and slant, which
            // edge its lines start from, and bullets with their levels. A key acts as it is
            // pressed and never takes the cursor out of the box.
            const st = marks.find((m) => m.id === typingId)?.style ?? {}
            const key = (label: string, on: boolean, act: () => void, face: React.ReactNode) => (
              <button key={label} className={`padbar-key pad-fmt${on ? ' on' : ''}`} aria-pressed={on} aria-label={label} title={label}
                onMouseDown={(e) => e.preventDefault()} onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); act() }}>{face}</button>
            )
            const lines = (d: string) => <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d={d} /></svg>
            return <>
              {key('Bold', !!st.bold, () => restyleText({ bold: !st.bold }), <b>B</b>)}
              {key('Italic', !!st.italic, () => restyleText({ italic: !st.italic }), <i>I</i>)}
              {key('Underline', !!st.underline, () => restyleText({ underline: !st.underline }), <u>U</u>)}
              <span className="padbar-split" />
              {key('Left', (st.align ?? 'left') === 'left', () => restyleText({ align: 'left' }), lines('M4 6h16M4 12h10M4 18h13'))}
              {key('Centre', st.align === 'center', () => restyleText({ align: 'center' }), lines('M4 6h16M7 12h10M5.5 18h13'))}
              {key('Right', st.align === 'right', () => restyleText({ align: 'right' }), lines('M4 6h16M10 12h10M7 18h13'))}
              <span className="padbar-split" />
              {key('Bullets', false, () => retype(toggleBullets), lines('M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01'))}
              {key('Level out', false, () => retype(outdent), lines('M11 6h9M11 12h9M11 18h9M7 9l-3 3 3 3'))}
              {key('Level in', false, () => retype(indent), lines('M11 6h9M11 12h9M11 18h9M4 9l3 3-3 3'))}
              <span className="padbar-split" />
              {key('Leader', false, () => { const id = typingId; (document.activeElement as HTMLElement | null)?.blur(); if (id) { setLeading(id); setPicked([id]) } }, icon.leader)}
            </>
          })()}
          {typingId === null && (['pen', 'pencil', 'highlight', 'arrow', 'text', 'erase', 'select'] as Tool[]).map((t) => (
            <button key={t} className={`padbar-key${tool === t ? ' on' : ''}`}
              aria-pressed={tool === t} aria-label={LABEL[t]} title={LABEL[t]}
              onClick={() => { setTool(t); setMenu(null); goingAway() }}>
              {icon[t]}
            </button>
          ))}
          {typingId === null && <>
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
          </>}
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
          <div className="padpop-row">
            <button className="padpop-word" disabled={!project} onClick={() => { photoIn.current?.click(); goingAway() }}>Add a photo to draw over</button>
            <button className="padpop-word" disabled={!project} onClick={() => { setClipping(true); setMenu(null); setOpen(false) }}>Clip from a drawing</button>
            <input ref={photoIn} type="file" accept="image/*" hidden onChange={(e) => void photoChosen(e.target.files?.[0])} />
          </div>
          <label className="check small">
            <input type="checkbox" checked={!!pad.contrast} onChange={(e) => {
              const contrast = e.target.checked
              onChanged({ ...pad, contrast })
              setPad(pad.id, { contrast }).catch((err) => complain(message(err)))
            }} />
            Contrast — a white edge on everything drawn, to read over a photograph
          </label>
          <label className="check small">
            <input type="checkbox" checked={fingerDraws} onChange={(e) => setFingerDraws(e.target.checked)} />
            Draw with a finger
          </label>
          <p className="muted small padpop-note">
            {fingerDraws
              ? 'One finger draws. Two fingers move the paper and pinch to zoom, and a palm is ignored.'
              : 'The pen draws. One finger moves the canvas, two pinch to zoom, and a palm is ignored.'}
            {touch && <> Last touch: <strong>{touch.read}</strong>{touch.across > 0 ? `, ${touch.across}px across` : ''}.</>}
          </p>
        </div>
      )}
      {clipping && project && (
        <div className="pad-over" onPointerDown={(e) => e.stopPropagation()}>
          <SheetClip project={project as ProjectStore} onClose={() => setClipping(false)}
            onClip={(blob, shape, from) => { setClipping(false); void placePicture(blob, shape, `Clip ${from}`) }} />
        </div>
      )}
    </div>
  )
}

/** One picture on the paper. The device's own copy shows first, so it is there with no signal. */
function PadPicture({ project, path, style }: { project: ProjectStore | null; path: string; style: React.CSSProperties }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!project) return
    let gone = false, made: string | null = null
    photoUrl(project, path).then((u) => { made = u; if (gone) URL.revokeObjectURL(u); else setUrl(u) }).catch(() => {})
    return () => { gone = true; if (made) URL.revokeObjectURL(made) }
  }, [project, path])
  return <div className={`pad-pic${url ? '' : ' waiting'}`} style={style}>{url && <img src={url} alt="" draggable={false} />}</div>
}

const LABEL: Record<Tool, string> = {
  pen: 'Pen', pencil: 'Pencil', highlight: 'Highlighter', arrow: 'Arrow', text: 'Type', erase: 'Erase', select: 'Select',
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
  arrow: stroked(<><path d="M5 19 18 6" /><path d="M10 6h8v8" /></>),
  leader: stroked(<><path d="M3 6h9" /><path d="M12 6 19 17" /><path d="M15.5 16.5 19 17l.4-3.6" /></>),
  select: stroked(<><path d="M5 3.5 18.5 12l-6 1.4-2.3 5.9L5 3.5Z" /></>),
  erase: stroked(<><path d="M8 20h11" /><path d="M15.5 4.5 20 9l-9 9H6.5L3.5 15l12-10.5Z" /><path d="M9 9l6 6" /></>),
  undo: stroked(<><path d="M4 9h11a5 5 0 0 1 0 10h-5" /><path d="M7.5 5.5 4 9l3.5 3.5" /></>),
  redo: stroked(<><path d="M20 9H9a5 5 0 0 0 0 10h5" /><path d="M16.5 5.5 20 9l-3.5 3.5" /></>),
  more: stroked(<><circle cx="5.5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="18.5" cy="12" r="1.3" /></>),
  // The same on every corner menu: a circle with a cross in it, and the word under it.
  close: stroked(<><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></>),
  back: stroked(<><path d="M15 5l-7 7 7 7" /></>),
  on: stroked(<><path d="M9 5l7 7-7 7" /></>),
}

const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n))

/** The box a mark sits in, in page units, with a little air round a stroke. */
/**
 * What was last copied on a pad. Kept outside any one pad, so something drawn on one page of
 * notes can be pasted onto another. It lasts as long as the app is open.
 */
let clipboard: PadMark[] = []

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

/** Where the cursor or selection is in a text box, counted in characters of its text. */
function caretOf(el: HTMLElement): { start: number; end: number } | null {
  const sel = document.getSelection()
  if (!sel || !sel.rangeCount || !el.contains(sel.anchorNode)) return null
  const r = sel.getRangeAt(0)
  const upTo = (node: Node, offset: number) => { const x = document.createRange(); x.selectNodeContents(el); x.setEnd(node, offset); return x.toString().length }
  return { start: upTo(r.startContainer, r.startOffset), end: upTo(r.endContainer, r.endOffset) }
}
/** Put new words in a text box, with the cursor where it belongs. */
function putText(el: HTMLElement, next: Edit): void {
  // A box whose words end in a line break needs one more for the browser to give the empty
  // last line a place to put the cursor; it is taken off again when the words are kept.
  el.textContent = next.text.endsWith('\n') ? next.text + '\n' : next.text
  el.dataset.empty = next.text ? '' : 'Type here'
  const node = el.firstChild
  const sel = document.getSelection()
  if (!sel) return
  const r = document.createRange()
  if (node) { r.setStart(node, Math.min(next.start, next.text.length)); r.setEnd(node, Math.min(next.end, next.text.length)) } else r.selectNodeContents(el)
  sel.removeAllRanges(); sel.addRange(r)
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
/** An arrow or a leader in a still: a line and a head, in the pad's own units. */
function StillArrow({ pts, width, colour, contrast }: { pts: Pt[]; width: number; colour: string; contrast?: boolean }) {
  const shaft = shaftOf(pts, width), head = headOf(pts, width)
  const line = shaft.map((p) => p.join(',')).join(' '), tip = head.map((p) => p.join(',')).join(' ')
  const edge = width * 0.9 + 0.0012
  return (
    <g>
      {contrast && <polyline points={line} fill="none" stroke="#fff" strokeWidth={width + edge * 2} strokeLinecap="round" strokeLinejoin="round" />}
      {contrast && <polygon points={tip} fill="#fff" stroke="#fff" strokeWidth={edge * 2} strokeLinejoin="round" />}
      <polyline points={line} fill="none" stroke={colour} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
      <polygon points={tip} fill={colour} />
    </g>
  )
}

export function Stroke({ mark, across = 1, contrast }: { mark: PadMark; across?: number; contrast?: boolean }) {
  const g = mark.geometry as { points: InkPoint[] }
  if (!g?.points?.length) return null
  if (mark.style?.arrow) {
    const pts = g.points.map((p) => [p[0], p[1]] as Pt)
    return <StillArrow pts={[pts[0], pts[pts.length - 1]]} width={mark.style.width ?? 0.005} colour={mark.style.colour ?? '#2b2d2c'} contrast={contrast} />
  }
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
  const edge = contrast && nib !== 'highlight'
  return <path d={d} transform={`scale(${1 / px})`} fill={mark.style?.colour ?? '#2b2d2c'} opacity={handOf(nib).alpha}
    {...(edge ? { stroke: '#fff', strokeWidth: 3, strokeLinejoin: 'round' as const, paintOrder: 'stroke' } : {})} />
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
export function PadStill({ marks, rule, ink = 40, ratio = 11 / 8.5, frame, contrast }: {
  /** A white edge on everything, as the pad was drawn. */
  contrast?: boolean
  /** Show exactly this part of the paper, with no ground: ink to be laid over a picture. */
  frame?: { x: number; y: number; w: number; h: number }
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
  let x = box.x + box.w / 2 - w / 2
  let y = box.y + box.h / 2 - h / 2
  if (frame) { x = frame.x; y = frame.y; w = frame.w; h = frame.h }

  return (
    <svg className="pad-still" viewBox={`${x} ${y} ${w} ${h}`} preserveAspectRatio="xMidYMid meet"
      aria-hidden="true">
      {!frame && <StillGround rule={rule} ink={ink} x={x} y={y} w={w} h={h} />}
      {marks.filter((m) => m.kind !== 'text').map((m) => <Stroke key={m.id} mark={m} across={w} contrast={contrast} />)}
      {marks.filter((m) => m.kind === 'text' && m.style.leaders?.length).flatMap((m) => {
        const g = m.geometry as { x: number; y: number; w: number }
        const size = m.style.size ?? TEXT_SIZE
        return (m.style.leaders ?? []).map((to, i) => (
          <StillArrow key={`${m.id}:L${i}`} pts={leaderFrom(g, size, to)} width={leaderWidth(size)} colour={m.style.colour ?? '#2b2d2c'} contrast={contrast} />
        ))
      })}
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
          <text key={m.id} x={g.x} y={g.y + fs * 1.08} fontSize={fs} fill={m.style.colour ?? '#2b2d2c'}
            {...(contrast ? { stroke: '#fff', strokeWidth: fs * 0.14, strokeLinejoin: 'round' as const, paintOrder: 'stroke' } : {})}
            fontWeight={m.style.bold ? 700 : undefined} fontStyle={m.style.italic ? 'italic' : undefined} textDecoration={m.style.underline ? 'underline' : undefined}>
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
            <PadStill marks={here} rule={pad.rule} ink={pad.rule_ink ?? 40} contrast={!!pad.contrast} />
            {pad.pages > 1 && <figcaption className="muted small">Page {n}</figcaption>}
          </figure>
        )
      })}
    </div>
  )
}
