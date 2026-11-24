import { useEffect, useRef, useState } from 'react'
import { addBox, addLoose, LOOSE, looseAt, move, placeBeside, readBoard, remove, rename, writeBoard, type Note, type Path } from '../lib/noteBoard'

/**
 * A page's notes, as things to be picked up and put somewhere.
 *
 * Standing on a site there is no time to decide where a note belongs before writing it. So a
 * note is typed and it is a card; the page's categories are boxes; and filing a note is
 * dragging its card into a box — or into a box inside a box, for a subcategory. A card dropped
 * on another card makes that card a box. What has not been put anywhere waits in a tray at the
 * top. The numbered outline the report prints is written from this and is seen on the report's
 * own page; it is not what is worked on here.
 */

const key = (p: Path) => p.join('.')
/** How many notes are in a topic, at any depth. */
const count = (n: Note): number => n.kids.reduce((t, k) => t + (k.kids.length ? count(k) : 1), 0)
const pathOf = (s: string | undefined | null): Path | null => (s == null ? null : s === '' ? [] : s.split('.').map(Number))

export function NoteBoard({ notes, onChange }: { notes: string; onChange: (next: string) => void }) {
  const board = readBoard(notes)
  const set = (next: Note[]) => { if (next !== board) onChange(writeBoard(next)) }
  const [text, setText] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  /** Subcategories made just now and still empty: shown as boxes although nothing is in them yet. */
  const [fresh, setFresh] = useState<string[]>([])
  /** The card or box in the hand: where it came from, and where the pointer is. */
  const [held, setHeld] = useState<{ path: Path; text: string; x: number; y: number; over: string | null } | null>(null)
  const press = useRef<{ path: Path; text: string; x: number; y: number; id: number; touch?: boolean } | null>(null)
  const root = useRef<HTMLDivElement>(null)

  const loose = looseAt(board)
  const tray = loose >= 0 ? board[loose].kids : []

  function add() {
    const said = text.trim()
    if (!said) return
    set(addLoose(board, said))
    setText('')
  }

  /** Which box is under a point: the innermost one, the tray, or the board itself. */
  function boxUnder(x: number, y: number, from: Path): string | null {
    for (const el of document.elementsFromPoint(x, y)) {
      const drop = (el as HTMLElement).closest?.('[data-drop]') as HTMLElement | null
      if (!drop || !root.current?.contains(drop)) continue
      const p = pathOf(drop.dataset.drop)!
      // Not into itself, nor into anything inside itself.
      if (from.length <= p.length && from.every((v, i) => v === p[i])) continue
      // Near the top or bottom edge of a note, or the top of a category's heading: beside it, not into it.
      const k = drop.dataset.drop!
      if (k && k !== 'tray' && p.length) {
        const card = drop.classList.contains('nbd-card')
        // A note held over a category goes into it; only a category is set beside another category.
        const heldBox = !!root.current?.querySelector(`.nbd-box[data-drop="${from.join('.')}"]`)
        if (!card && !heldBox) return k
        const r = (card ? drop : drop.querySelector(':scope > .nbd-box-head') ?? drop).getBoundingClientRect()
        const box = drop.getBoundingClientRect()
        if (card && y < r.top + r.height * 0.3) return `before:${k}`
        if (card && y > r.bottom - r.height * 0.3) return `after:${k}`
        if (!card && y < r.top + r.height * 0.45) return `before:${k}`
        if (!card && y > box.bottom - 10) return `after:${k}`
      }
      return k
    }
    return null
  }

  // By touch a card or box is picked up only when held still (Jacob, 11/23: scrolling over the
  // board on a phone kept picking things up). A finger that moves first is scrolling, and is let
  // go. A mouse or pen still picks up by dragging, as before.
  const HOLD_MS = 380, STILL_PX = 8
  const holdTimer = useRef<number | null>(null)
  const stopHold = () => { if (holdTimer.current !== null) { window.clearTimeout(holdTimer.current); holdTimer.current = null } }
  useEffect(() => stopHold, [])
  const grab = (path: Path, label: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('button, input, textarea') || e.button > 0) return
      e.stopPropagation()
      press.current = { path, text: label, x: e.clientX, y: e.clientY, id: e.pointerId, touch: e.pointerType === 'touch' }
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* drag anyway */ }
      if (e.pointerType === 'touch') {
        stopHold()
        const { clientX: x, clientY: y } = e
        holdTimer.current = window.setTimeout(() => {
          holdTimer.current = null
          const p = press.current
          if (!p) return
          // Picked up where the finger is; a short buzz where the phone allows it.
          try { navigator.vibrate?.(12) } catch { /* no buzz */ }
          setHeld({ path: p.path, text: p.text, x, y, over: boxUnder(x, y, p.path) })
        }, HOLD_MS)
      }
    },
    onPointerMove: (e: React.PointerEvent) => {
      const p = press.current
      if (!p || p.id !== e.pointerId) return
      const moved = Math.hypot(e.clientX - p.x, e.clientY - p.y)
      if (p.touch && !held) {
        // Moving before the hold is up: a scroll, not a pick-up.
        if (moved > STILL_PX) { stopHold(); press.current = null }
        return
      }
      if (!held && moved < 7) return
      hand.current = { x: e.clientX, y: e.clientY }
      setHeld({ path: p.path, text: p.text, x: e.clientX, y: e.clientY, over: boxUnder(e.clientX, e.clientY, p.path) })
    },
    onPointerUp: (e: React.PointerEvent) => {
      stopHold()
      hand.current = null
      const p = press.current
      press.current = null
      if (!p || !held) { setHeld(null); return }
      // Held, and let go where it was picked up: not a drag — its words are opened to change (Jacob, 11/24).
      if (p.touch && Math.hypot(e.clientX - p.x, e.clientY - p.y) <= STILL_PX * 1.5) {
        setHeld(null)
        setEditing(key(p.path))
        return
      }
      const over = boxUnder(e.clientX, e.clientY, p.path)
      setHeld(null)
      if (over === null) return
      // The tray is the box named LOOSE, made on the spot if it has gone.
      // Beside another: the line shows where it lands. Notes inside a box are shown newest first, so
      // above one on screen is after it in the outline; categories at the top are shown as kept.
      const beside = /^(before|after):(.*)$/.exec(over)
      if (beside) {
        const t = pathOf(beside[2])!
        const shownTurned = t.length >= 2
        set(placeBeside(board, p.path, t, (beside[1] === 'after') !== shownTurned))
        return
      }
      if (over === 'tray') {
        const i = looseAt(board)
        set(i >= 0 ? move(board, p.path, [i]) : move(addBox(board, [], LOOSE), p.path, [board.length]))
        return
      }
      set(move(board, p.path, pathOf(over)!))
    },
    onPointerCancel: () => { stopHold(); press.current = null; setHeld(null) },
    // A right-click opens the words to change, no menu (Jacob, 11/24). A phone that sends this for a
    // long press (and may then cancel the pointer) gets the same, unless the note is already being dragged.
    onContextMenu: (e: React.MouseEvent) => {
      // In the words being changed, the browser's own menu (paste and so on).
      if ((e.target as HTMLElement).closest('input')) return
      e.preventDefault()
      e.stopPropagation()
      if (held && hand.current) return
      stopHold(); press.current = null; setHeld(null)
      setEditing(key(path))
    },
  })

  // Held near the top or bottom of the screen, the page scrolls under the card — on a phone the
  // topics are rows down the page, so one may be well out of reach when a card is picked up.
  const hand = useRef<{ x: number; y: number } | null>(null)
  useEffect(() => {
    if (!held) return
    let raf = 0
    const scroller = (root.current?.closest('.nb-page') as HTMLElement | null) ?? (document.scrollingElement as HTMLElement | null)
    const tick = () => {
      const h = hand.current
      if (h && scroller) {
        const r = scroller === document.scrollingElement ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect()
        const zone = 70
        const by = h.y > r.bottom - zone ? 10 : h.y < r.top + zone ? -10 : 0
        if (by) {
          scroller.scrollTop += by
          setHeld((x) => (x ? { ...x, over: boxUnder(h.x, h.y, x.path) } : x))
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [held !== null]) // eslint-disable-line react-hooks/exhaustive-deps

  // A drag must not scroll the page under it.
  useEffect(() => {
    if (!held) return
    const stop = (e: TouchEvent) => e.preventDefault()
    document.addEventListener('touchmove', stop, { passive: false })
    return () => document.removeEventListener('touchmove', stop)
  }, [held])

  // Plain functions, not components: a component made afresh on every render is taken down and
  // put up again each time, and the card being dragged would lose hold of the pointer.
  const words = (path: Path, node: Note, className: string) => (
    editing === key(path) ? (
      <input className={`${className} nbd-edit`} autoFocus defaultValue={node.text} aria-label="Change the words"
        // The old words are selected, so typing replaces them rather than adding to them.
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => {
          setEditing(null)
          // A subcategory just named keeps looking like one, under the name it was given.
          setFresh((f) => f.map((x) => (x === `${key(path)}:` ? `${key(path)}:${e.target.value.trim() || node.text}` : x)))
          set(rename(board, path, e.target.value))
        }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(null) }} />
    ) : (
      <span className={className} onDoubleClick={() => setEditing(key(path))} title="Drag to move · double-click or right-click to change the words">{node.text}</span>
    )
  )

  const item = (node: Note, path: Path, depth: number): React.ReactNode => {
    const k = key(path)
    const lifted = held && key(held.path) === k
    // A line with lines under it is a box; at the top of the board every line is one.
    if (node.kids.length || depth === 0 || fresh.includes(`${k}:${node.text}`) || (editing === k && fresh.includes(`${k}:`))) {
      return (
        <div key={k} className={`nbd-box d${Math.min(depth, 2)}${held?.over === k ? ' over' : ''}${held?.over === `before:${k}` ? ' over-before' : ''}${held?.over === `after:${k}` ? ' over-after' : ''}${lifted ? ' lifted' : ''}`} data-drop={k} data-box={k}>
          <div className="nbd-box-head" {...grab(path, node.text)}>
            {words(path, node, "nbd-box-name")}
            <button className="nbd-x" aria-label={`Add a subcategory to ${node.text}`} title="Add a subcategory" onClick={() => { const at = key([...path, node.kids.length]); set(addBox(board, path, 'New category')); setFresh((f) => [...f, `${at}:`]); setEditing(at) }}>+</button>
            <button className="nbd-x" aria-label={`Remove ${node.text}`} title={node.kids.length ? 'Remove this and what is in it' : 'Remove'}
              onClick={() => { if (!node.kids.length || window.confirm(`Remove “${node.text}” and the ${node.kids.length} under it?`)) set(remove(board, path)) }}>×</button>
          </div>
          <div className="nbd-box-in">
            {/* Newest first (Jacob, 11/24): what was just typed or dropped in is at the top. Only the
                showing is turned round; the outline, and so the report, keeps the order typed. */}
            {node.kids.map((kid, i) => item(kid, [...path, i], depth + 1)).reverse()}
            {!node.kids.length && <span className="nbd-empty">Drop notes here</span>}
          </div>
        </div>
      )
    }
    return (
      <div key={k} className={`nbd-card${held?.over === k ? ' over' : ''}${held?.over === `before:${k}` ? ' over-before' : ''}${held?.over === `after:${k}` ? ' over-after' : ''}${lifted ? ' lifted' : ''}`} data-drop={k} {...grab(path, node.text)}>
        {words(path, node, "nbd-card-text")}
        <button className="nbd-x" aria-label="Remove this note" title="Remove" onClick={() => set(remove(board, path))}>×</button>
      </div>
    )
  }

  return (
    <div className={`nbd${held ? ' dragging' : ''}`} ref={root}>
      <form className="nbd-type" onSubmit={(e) => { e.preventDefault(); add() }}>
        <input value={text} onChange={(e) => setText(e.target.value)} aria-label="Type a note"
          placeholder="Type a note, then drag it where it belongs" enterKeyHint="done" autoCapitalize="sentences" />
        <button type="submit" className="primary-lite" disabled={!text.trim()}>Add</button>
      </form>

      <div className={`nbd-tray${held?.over === 'tray' ? ' over' : ''}${tray.length ? '' : ' bare'}`} data-drop="tray">
        {tray.length ? tray.map((n, i) => item(n, [loose, i], 1)).reverse()
          : <span className="nbd-empty">{held ? 'Drop here to take it back out' : 'What you type lands here'}</span>}
      </div>

      {/* At one time, on a phone, every topic as a small bubble to drop onto. Jacob, 11/23:
          not on the phone — there the topics are rows down the list (index.css hides these). */}
      <div className="nbd-bubbles" aria-label="Topics">
        {board.flatMap((n, i) => (i === loose ? [] : [
          <button key={key([i])} type="button" className={`nbd-bubble${held?.over === key([i]) ? ' over' : ''}`} data-drop={key([i])}
            onClick={() => root.current?.querySelector(`[data-box="${key([i])}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
            {n.text}{count(n) > 0 && <span className="nbd-bubble-n">{count(n)}</span>}
          </button>,
          ...n.kids.flatMap((kid, j) => (kid.kids.length ? [
            <button key={key([i, j])} type="button" className={`nbd-bubble sub${held?.over === key([i, j]) ? ' over' : ''}`} data-drop={key([i, j])}
              onClick={() => root.current?.querySelector(`[data-box="${key([i, j])}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
              {kid.text}<span className="nbd-bubble-n">{count(kid)}</span>
            </button>,
          ] : [])),
        ]))}
      </div>

      <div className={`nbd-board${held?.over === '' ? ' over' : ''}`} data-drop="">
        {board.map((n, i) => (i === loose ? null : item(n, [i], 0)))}
        <button className="nbd-new" onClick={() => { set(addBox(board, [], 'New category')); setEditing(key([board.length])) }}>+ Category</button>
      </div>

      {held && <div className="nbd-ghost" style={{ left: held.x, top: held.y }}>{held.text}</div>}
    </div>
  )
}
