import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { addBox, addLoose, combine, LOOSE, looseAt, move, nodeAt, readBoard, remove, rename, spreadKeys, writeBoard, type Note, type Path } from '../lib/noteBoard'
import type { Spot } from '../lib/pageLayout'

/**
 * A page's notes spread out over the whole screen (Jacob, 11/24): opened from the notes block as
 * the pad is, so categories and loose notes can be put anywhere — grouped by eye first — and
 * combined when ready. A note dropped on another loose note makes a new category of the two; on
 * a category it goes in; on a filed note it goes under it, as on the board. A note dragged out of
 * a category onto open space is loose again, where it was dropped.
 *
 * The outline is still what is kept and printed. The places are only where things lie on this
 * spread, kept with the page by each thing's words (`spreadKeys`).
 */

const key = (p: Path) => p.join('.')
const pathOf = (s: string): Path => (s === '' ? [] : s.split('.').map(Number))
const within = (a: Path, b: Path) => a.length <= b.length && a.every((v, i) => v === b[i])
const BOX_W = 260, CARD_W = 220, GAP = 18, PAD = 24

export function NoteSpread({ notes, spots, onSave, onClose }: {
  notes: string
  spots: Record<string, Spot>
  /** The outline, the places, or both — together, so one change to the page carries both. */
  onSave: (change: { notes?: string; spots?: Record<string, Spot> }) => void
  onClose: () => void
}) {
  const board = readBoard(notes)
  const loose = looseAt(board)
  const names = spreadKeys(board)
  const [pos, setPos] = useState<Record<string, Spot>>(spots)
  // On a phone the spread starts a little smaller, so a column of loose notes and one of categories both show.
  const [zoom, setZoom] = useState(() => (window.innerWidth < 760 ? 0.75 : 1))
  const [text, setText] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const tall = useRef(new Map<string, number>())
  const [, remeasured] = useState(0)

  /** The things on the spread: each category at the top, and each loose note. Keyed by path. */
  const tops: { k: string; path: Path; node: Note; box: boolean }[] = []
  board.forEach((n, i) => {
    if (i === loose) n.kids.forEach((kid, j) => tops.push({ k: `${i}.${j}`, path: [i, j], node: kid, box: false }))
    else tops.push({ k: `${i}`, path: [i], node: n, box: true })
  })

  // Anything not yet put somewhere is laid out: loose notes down the left, categories in columns.
  const viewW = (scroller.current?.clientWidth ?? 1200) / zoom
  const placed: Record<string, Spot> = {}
  {
    const anyLoose = tops.some((t) => !t.box)
    const left = anyLoose ? PAD + CARD_W + GAP * 2 : PAD
    const cols = Math.max(1, Math.floor((viewW - left) / (BOX_W + GAP)))
    const colY = new Array(cols).fill(PAD)
    let looseY = PAD
    for (const t of tops) {
      const name = names.get(t.k)!
      if (pos[name]) { placed[t.k] = pos[name]; continue }
      const h = tall.current.get(name) ?? (t.box ? 60 + 44 * count(t.node) : 48)
      if (!t.box) { placed[t.k] = { x: PAD, y: looseY }; looseY += h + 10; continue }
      const c = colY.indexOf(Math.min(...colY))
      placed[t.k] = { x: left + c * (BOX_W + GAP), y: colY[c] }
      colY[c] += h + GAP
    }
  }
  useLayoutEffect(() => {
    let changed = false
    root.current?.querySelectorAll<HTMLElement>('[data-top]').forEach((el) => {
      const name = el.dataset.top!
      if (tall.current.get(name) !== el.offsetHeight) { tall.current.set(name, el.offsetHeight); changed = true }
    })
    if (changed) remeasured((n) => n + 1)
  })

  const out = useRef<{ notes?: string; spots?: Record<string, Spot> }>({})
  const flush = () => queueMicrotask(() => { const o = out.current; out.current = {}; if (o.notes !== undefined || o.spots) onSave(o) })
  const save = (next: Record<string, Spot>) => { setPos(next); out.current.spots = next; flush() }
  /** Every place as it is on screen now, so nothing laid out for it moves when one thing is placed. */
  const fixAll = (): Record<string, Spot> => {
    const out: Record<string, Spot> = {}
    for (const t of tops) out[names.get(t.k)!] = placed[t.k]
    return out
  }
  const set = (next: Note[]) => { out.current.notes = writeBoard(next); flush() }

  // ---- Picking up and putting down ----
  const [held, setHeld] = useState<{ path: Path; id: number; x0: number; y0: number; dx: number; dy: number; box: boolean; over: string | null; moved: boolean } | null>(null)
  const heldRef = useRef(held)
  const pressedAt = useRef(0)
  const hand = useRef<{ x: number; y: number } | null>(null)

  function under(x: number, y: number, from: Path, box: boolean): string | null {
    for (const el of document.elementsFromPoint(x, y)) {
      const d = (el as HTMLElement).closest?.('[data-drop]') as HTMLElement | null
      if (!d || !root.current?.contains(d)) continue
      if (d.dataset.drop === 'plane') return 'plane'
      const p = pathOf(d.dataset.drop!)
      if (within(from, p)) continue
      const isBox = d.dataset.box === '1'
      // A category goes only into a category.
      if (box && !isBox) {
        const outer = d.parentElement?.closest('[data-box="1"]') as HTMLElement | null
        if (!outer) return 'plane'
        const q = pathOf(outer.dataset.drop!)
        if (within(from, q)) continue
        return outer.dataset.drop!
      }
      return d.dataset.drop!
    }
    return 'plane'
  }

  const grab = (path: Path, box: boolean) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('button, input') || e.button > 0) return
      e.stopPropagation()
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* drag anyway */ }
      pressedAt.current = Date.now()
      const h = { path, id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, box, over: null, moved: false }
      heldRef.current = h
      setHeld(h)
    },
    onPointerMove: (e: React.PointerEvent) => {
      const h = heldRef.current
      if (!h || h.id !== e.pointerId) return
      const dx = e.clientX - h.x0, dy = e.clientY - h.y0
      if (!h.moved && Math.hypot(dx, dy) < 6) return
      hand.current = { x: e.clientX, y: e.clientY }
      const next = { ...h, dx, dy, moved: true, over: under(e.clientX, e.clientY, h.path, h.box) }
      heldRef.current = next
      setHeld(next)
    },
    onPointerUp: (e: React.PointerEvent) => {
      const h = heldRef.current
      heldRef.current = null
      hand.current = null
      setHeld(null)
      if (h && !h.moved && e.pointerType === 'touch' && Date.now() - pressedAt.current >= 450) { setEditing(key(h.path)); return }
      if (!h || !h.moved) return
      drop(h, e.clientX, e.clientY)
    },
    // Right-click, or a phone's long press: the words open to change, no menu (Jacob, 11/24).
    onContextMenu: (e: React.MouseEvent) => {
      // In the words being changed, the browser's own menu (paste and so on).
      if ((e.target as HTMLElement).closest('input')) return
      e.preventDefault(); e.stopPropagation()
      if (heldRef.current?.moved) return
      heldRef.current = null; setHeld(null); setEditing(key(path))
    },
    onPointerCancel: () => { heldRef.current = null; hand.current = null; setHeld(null) },
  })

  /** Where a point on screen is on the spread. */
  const onPlane = (x: number, y: number): Spot => {
    const r = scroller.current!.getBoundingClientRect()
    return { x: Math.max(0, (x - r.left + scroller.current!.scrollLeft) / zoom), y: Math.max(0, (y - r.top + scroller.current!.scrollTop) / zoom) }
  }

  function drop(h: NonNullable<typeof held>, x: number, y: number) {
    const over = under(x, y, h.path, h.box)
    const k = key(h.path)
    const top = h.path.length === 1 || (h.path.length === 2 && h.path[0] === loose)
    const all = fixAll()
    if (over === 'plane' || over === null) {
      if (top) {
        // Just moved: where it was, plus how far it went.
        const was = placed[k]
        save({ ...all, [names.get(k)!]: { x: Math.max(0, was.x + h.dx / zoom), y: Math.max(0, was.y + h.dy / zoom) } })
        return
      }
      // Out of a category onto open space: a subcategory is a category of its own; a note is loose.
      const node = nodeAt(board, h.path)!
      const at = onPlane(x, y)
      let next: Note[]
      if (node.kids.length) next = move(board, h.path, [])
      else {
        const i = looseAt(board)
        next = i >= 0 ? move(board, h.path, [i]) : move(addBox(board, [], LOOSE), h.path, [board.length])
      }
      const after = spreadKeys(next)
      // The one moved is the last of its words: at the end of the board, or of the loose notes.
      const mine = [...after.entries()].filter(([, v]) => v.startsWith(`${node.kids.length ? 'c' : 'n'}:${node.text}#`)).pop()
      set(next)
      if (mine) save({ ...all, [mine[1]]: { x: at.x - 20, y: at.y - 14 } })
      return
    }
    const t = pathOf(over)
    const ontoLoose = t.length === 2 && t[0] === loose
    if (ontoLoose && !h.box) {
      // Two loose notes: a new category of the two, where the one dropped on was.
      const spot = placed[over]
      const made = combine(board, h.path, t)
      if (made.at < 0) return
      const after = spreadKeys(made.board)
      save({ ...all, [after.get(`${made.at}`)!]: spot })
      set(made.board)
      setEditing(`${made.at}`)
      return
    }
    save(all)
    set(move(board, h.path, t))
  }

  // Held near an edge, the spread scrolls under it.
  useEffect(() => {
    if (!held?.moved) return
    let raf = 0
    const tick = () => {
      const s = scroller.current, h = hand.current
      if (s && h) {
        const r = s.getBoundingClientRect(), z = 60
        const bx = h.x > r.right - z ? 12 : h.x < r.left + z ? -12 : 0
        const by = h.y > r.bottom - z ? 12 : h.y < r.top + z ? -12 : 0
        if (bx || by) {
          s.scrollLeft += bx; s.scrollTop += by
          setHeld((x) => (x ? { ...x, x0: x.x0 - bx, y0: x.y0 - by, dx: x.dx + bx, dy: x.dy + by } : x))
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [held?.moved]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !editing) onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [editing, onClose])

  // ---- Drawing ----
  const lift = (path: Path) => (held?.moved && key(held.path) === key(path)
    ? { transform: `translate(${held.dx / zoom}px, ${held.dy / zoom}px) rotate(-1deg)`, zIndex: 30 }
    : undefined)
  const holding = (path: Path) => !!held?.moved && within(path, held.path)

  const words = (path: Path, node: Note, cls: string) => editing === key(path) ? (
    <input className={`${cls} nbd-edit`} autoFocus defaultValue={node.text} aria-label="Change the words"
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => {
        setEditing(null)
        const said = e.target.value.trim()
        if (!said || said === node.text) return
        const next = rename(board, path, said)
        // A thing on the spread keeps its place under its new words.
        const was = names.get(key(path)), now = spreadKeys(next).get(key(path))
        if (was && now && was !== now) { const all = fixAll(); all[now] = all[was]; delete all[was]; save(all) }
        set(next)
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(null) }} />
  ) : (
    <span className={cls} onDoubleClick={() => setEditing(key(path))} title="Drag to move · double-click or right-click to change the words">{node.text}</span>
  )

  const over = (k: string) => (held?.over === k ? ' over' : '')
  const item = (node: Note, path: Path, depth: number, isBox: boolean): React.ReactNode => {
    const k = key(path)
    if (isBox) {
      return (
        <div key={k} className={`nbd-box d${Math.min(depth, 2)}${over(k)}${holding(path) ? ' holding' : ''}`} data-drop={k} data-box="1" style={lift(path)}>
          <div className="nbd-box-head" {...grab(path, true)}>
            {words(path, node, 'nbd-box-name')}
            <button className="nbd-x" title="Add a subcategory" aria-label={`Add a subcategory to ${node.text}`}
              onClick={() => { const at = key([...path, node.kids.length]); set(addBox(board, path, 'New category')); setEditing(at) }}>+</button>
            <button className="nbd-x" aria-label={`Remove ${node.text}`} title={node.kids.length ? 'Remove this and what is in it' : 'Remove'}
              onClick={() => { if (!node.kids.length || window.confirm(`Remove “${node.text}” and the ${node.kids.length} under it?`)) set(remove(board, path)) }}>×</button>
          </div>
          <div className="nbd-box-in">
            {node.kids.map((kid, i) => item(kid, [...path, i], depth + 1, kid.kids.length > 0)).reverse()}
            {!node.kids.length && <span className="nbd-empty">Drop notes here</span>}
          </div>
        </div>
      )
    }
    return (
      <div key={k} className={`nbd-card${over(k)}`} data-drop={k} style={lift(path)} {...grab(path, false)}>
        {words(path, node, 'nbd-card-text')}
        <button className="nbd-x" aria-label="Remove this note" title="Remove" onClick={() => set(remove(board, path))}>×</button>
      </div>
    )
  }

  // The spread is as big as what is on it, and at least the screen.
  let w = viewW, h = (scroller.current?.clientHeight ?? 800) / zoom
  for (const t of tops) {
    const p = placed[t.k], name = names.get(t.k)!
    w = Math.max(w, p.x + (t.box ? BOX_W : CARD_W) + 200)
    h = Math.max(h, p.y + (tall.current.get(name) ?? 100) + 200)
  }

  function addNote() {
    const said = text.trim()
    if (!said) return
    const next = addLoose(board, said)
    // Where it can be seen: the top left of what is on screen, a little lower for each one added.
    const s = scroller.current!
    const after = spreadKeys(next)
    const mine = [...after.values()].filter((v) => v.startsWith(`n:${said}#`)).pop()
    const fresh = Object.keys(pos).length + 1
    if (mine) save({ ...fixAll(), [mine]: { x: s.scrollLeft / zoom + PAD + (fresh % 5) * 14, y: s.scrollTop / zoom + PAD + (fresh % 5) * 14 } })
    set(next)
    setText('')
  }
  function addCategory() {
    const next = addBox(board, [], 'New category')
    const s = scroller.current!
    const mine = spreadKeys(next).get(`${next.length - 1}`)
    if (mine) save({ ...fixAll(), [mine]: { x: s.scrollLeft / zoom + s.clientWidth / zoom / 2 - BOX_W / 2, y: s.scrollTop / zoom + PAD * 3 } })
    set(next)
    setEditing(`${next.length - 1}`)
  }

  return (
    <div className="nsp" ref={root}>
      <div className="nsp-bar">
        <button className="primary" onClick={onClose}>Done</button>
        <form className="nbd-type nsp-type" onSubmit={(e) => { e.preventDefault(); addNote() }}>
          <input value={text} onChange={(e) => setText(e.target.value)} aria-label="Type a note" placeholder="Type a note" enterKeyHint="done" autoCapitalize="sentences" />
          <button type="submit" className="primary-lite" disabled={!text.trim()}>Add</button>
        </form>
        <button onClick={addCategory}>+ Category</button>
        <span className="nsp-zoom">
          <button aria-label="Smaller" onClick={() => setZoom((z) => Math.max(0.4, Math.round((z - 0.15) * 100) / 100))}>−</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button aria-label="Larger" onClick={() => setZoom((z) => Math.min(1.5, Math.round((z + 0.15) * 100) / 100))}>+</button>
        </span>
        <button className="link" title="Lay everything out again in columns" onClick={() => { if (window.confirm('Put everything back in tidy columns?')) save({}) }}>Tidy up</button>
      </div>
      <p className="nsp-say">Drag anything anywhere. Drop a note on another loose note to start a category with the two, or on a category to file it.</p>
      <div className={`nsp-scroll${held?.moved ? " dragging" : ""}`} ref={scroller}>
        <div style={{ width: w * zoom, height: h * zoom, position: 'relative' }}>
          <div className={`nsp-plane${held?.over === 'plane' && held.moved ? ' over' : ''}`} data-drop="plane"
            style={{ width: w, height: h, transform: `scale(${zoom})` }}>
            {tops.map((t) => {
              const p = placed[t.k]
              return (
                <div key={t.k} className={`nsp-at${t.box ? ' box' : ''}${holding(t.path) ? ' holding' : ''}`} data-top={names.get(t.k)}
                  style={{ left: p.x, top: p.y, width: t.box ? BOX_W : CARD_W }}>
                  {item(t.node, t.path, 0, t.box)}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

const count = (n: Note): number => n.kids.reduce((t, k) => t + 1 + count(k), 0)
