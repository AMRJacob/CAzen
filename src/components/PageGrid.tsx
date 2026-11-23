import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Mark } from './Logo'
import {
  addBlock, ADDED, BUILT_IN, holds, COLS, defaultLayout, depth, itemsOf, KEPT, LABEL, ROWS, screenNow, settle, textOf,
  type Block, type BlockKind, type CheckItem, type Layout, type Screen, type VisitKind, type Widget, type Widgets,
} from '../lib/pageLayout'
import { keepLayout, layoutHere, layoutThere } from '../lib/layoutStore'
import { canHoldWidgets } from '../lib/visits'

/**
 * A notebook page laid out as its writer arranged it (src/lib/pageLayout.ts), and the way of
 * arranging it: blocks picked up and dropped on the grid, pulled larger or smaller by a corner,
 * hidden, shown again, and new text boxes and checklists added.
 */

// ---------- Which layout ----------

/** The screen this is, kept current as the window changes size or a phone is turned. */
export function useScreen(): Screen {
  const [screen, setScreen] = useState<Screen>(() => screenNow())
  useEffect(() => {
    const see = () => setScreen(screenNow())
    window.addEventListener('resize', see)
    return () => window.removeEventListener('resize', see)
  }, [])
  return screen
}

/** The person's layout for this book on this kind of screen: from the device at once, then the server's if newer. */
export function usePageLayout(kind: VisitKind, screen: Screen): [Layout, (next: Layout | null) => void] {
  const [layout, setLayout] = useState<Layout>(() => defaultLayout(kind, screen))
  useEffect(() => {
    let gone = false
    void layoutHere(kind, screen).then((l) => { if (!gone) setLayout(l) })
    void layoutThere(kind, screen).then((l) => { if (!gone && l) setLayout(l) }).catch(() => {})
    return () => { gone = true }
  }, [kind, screen])
  const keep = useCallback((next: Layout | null) => {
    setLayout(next ?? defaultLayout(kind, screen))
    void keepLayout(kind, screen, next)
  }, [kind, screen])
  return [layout, keep]
}

/**
 * What a page shows: the person's blocks, and after them any added block that has something
 * written in it on this page but is not in their layout — someone else's checklist on a shared
 * job, say. Writing on a page is never hidden from the next person to open it.
 */
export function shownBlocks(layout: Layout, widgets: Widgets | undefined, screen: Screen): Block[] {
  const mine = new Set(layout.blocks.map((b) => b.id))
  const gone = new Set(layout.gone ?? [])
  const extra: Block[] = []
  let y = depth(layout.blocks)
  for (const [id, w] of Object.entries(widgets ?? {})) {
    if (mine.has(id) || gone.has(id)) continue
    const kind: BlockKind | null = id.startsWith('check-') ? 'check' : id.startsWith('text-') ? 'text' : id.startsWith('agenda-') ? 'agenda' : null
    if (!kind || !holds(w)) continue
    extra.push({ id, kind, x: 0, y, w: screen === 'phone' ? 1 : COLS[screen], h: screen === 'phone' ? 1 : 4, title: w.title })
    y += 4
  }
  return [...layout.blocks, ...extra]
}

// ---------- The grid ----------

/**
 * The page's blocks on the grid. At a desk or on a tablet the page is twelve rows tall on screen
 * — a taller arrangement scrolls — and as many columns as the screen has (twelve, or eight). On a
 * phone they are one column, each as tall as it needs.
 */
export function PageGrid({ blocks, screen, arranging, render, onArrange }: {
  blocks: Block[]
  screen: Screen
  arranging: boolean
  render: (b: Block) => React.ReactNode
  /** While arranging: the blocks moved, sized or hidden; `done` is the end of a drag. */
  onArrange: (next: Block[], done: boolean) => void
}) {
  const cols = COLS[screen]
  const grid = useRef<HTMLDivElement | null>(null)
  const [row, setRow] = useState(64)
  useEffect(() => {
    const el = grid.current
    if (!el || screen === 'phone') return
    // Twelve rows fill what the paper leaves; never so short that a block has no room to say what it is.
    // A row is that tall at least — taller when what is in a block needs it, so no block scrolls
    // inside itself: the page grows and scrolls instead.
    const see = () => {
      const paper = el.parentElement
      if (!paper) return
      const cs = getComputedStyle(paper)
      const inner = paper.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
      setRow(Math.max(44, Math.floor(inner / ROWS)))
    }
    see()
    const ro = new ResizeObserver(see)
    if (el.parentElement) ro.observe(el.parentElement)
    return () => ro.disconnect()
  }, [screen])

  // A drag in progress: which block, how, where the pointer started, and the size of one cell.
  const drag = useRef<{ id: string; how: 'move' | 'size'; x0: number; y0: number; cw: number; rh: number; from: Block; start: Block[]; moved: boolean } | null>(null)
  const [lifted, setLifted] = useState<string | null>(null)
  const latest = useRef(blocks)
  useEffect(() => { latest.current = blocks })

  const grab = (e: React.PointerEvent, b: Block, how: 'move' | 'size') => {
    if (screen === 'phone' || e.button > 0) return
    // By touch, a block is picked up by its name or its corner; a swipe anywhere else on it
    // scrolls the page, so a block below the fold can still be reached.
    if (e.pointerType === 'touch' && how === 'move' && !(e.target as HTMLElement).closest('.nb-arr-head')) return
    const cell = (e.currentTarget as HTMLElement).closest('.nb-cell') as HTMLElement | null
    if (!cell) return
    e.preventDefault(); e.stopPropagation()
    const r = cell.getBoundingClientRect()
    setLifted(b.id)
    drag.current = { id: b.id, how, x0: e.clientX, y0: e.clientY, cw: r.width / b.w, rh: r.height / b.h, from: b, start: latest.current, moved: false }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  // Held near the top or bottom of the screen while dragging, the page scrolls under the block.
  const edge = useRef<{ dir: number; raf: number } | null>(null)
  const stopEdge = () => { if (edge.current) cancelAnimationFrame(edge.current.raf); edge.current = null }
  useEffect(() => stopEdge, [])
  const follow = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const paper = grid.current?.parentElement
    if (paper) {
      const r = paper.getBoundingClientRect(), zone = 56
      const dir = e.clientY > r.bottom - zone ? 1 : e.clientY < r.top + zone ? -1 : 0
      if (!dir) stopEdge()
      else if (!edge.current) {
        const tick = () => {
          if (!edge.current || !drag.current) return
          const before = paper.scrollTop
          paper.scrollTop += edge.current.dir * 12
          // The block's start moves with the page, so it stays under the finger.
          drag.current.y0 -= paper.scrollTop - before
          edge.current.raf = requestAnimationFrame(tick)
        }
        edge.current = { dir, raf: requestAnimationFrame(tick) }
      } else edge.current.dir = dir
    }
    const dx = Math.round((e.clientX - d.x0) / d.cw), dy = Math.round((e.clientY - d.y0) / d.rh)
    const b = d.how === 'move' ? { ...d.from, x: d.from.x + dx, y: d.from.y + dy } : { ...d.from, w: d.from.w + dx, h: d.from.h + dy }
    const next = settle(d.start.map((x) => (x.id === d.id ? b : x)), cols, d.id, d.how === 'move' ? d.from : undefined)
    const was = latest.current.find((x) => x.id === d.id)!, now = next.find((x) => x.id === d.id)!
    if (was.x === now.x && was.y === now.y && was.w === now.w && was.h === now.h) return
    d.moved = true
    onArrange(next, false)
  }
  const drop = () => {
    stopEdge()
    const d = drag.current
    drag.current = null
    setLifted(null)
    if (d?.moved) onArrange(latest.current, true)
  }

  const move = (b: Block, by: number) => {
    const at = blocks.findIndex((x) => x.id === b.id), to = at + by
    if (to < 0 || to >= blocks.length) return
    const next = [...blocks]; [next[at], next[to]] = [next[to], next[at]]
    onArrange(next.map((x, i) => ({ ...x, y: i })), true)
  }
  const hide = (b: Block) => onArrange(blocks.filter((x) => x.id !== b.id), true)
  const rename = (b: Block, title: string) => onArrange(blocks.map((x) => (x.id === b.id ? { ...x, title } : x)), true)

  const phone = screen === 'phone'
  const order = phone ? blocks : [...blocks].sort((a, b) => a.y - b.y || a.x - b.x)
  return (
    <div ref={grid} className={`nb-grid${phone ? ' nb-grid-phone' : ''}${arranging ? ' nb-arranging' : ''}`}
      style={phone ? undefined : { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: `minmax(${row}px, auto)`, ['--rows' as string]: depth(blocks) }}>
      {order.map((b, i) => (
        <div key={b.id} data-block={b.id}
          className={`nb-cell nb-cell-${b.kind}${b.x === 0 ? ' at-left' : ''}${b.y === 0 ? ' at-top' : ''}${lifted === b.id ? ' lifted' : ''}`}
          style={phone ? undefined : { gridColumn: `${b.x + 1} / span ${b.w}`, gridRow: `${b.y + 1} / span ${b.h}` }}>
          {/* While arranging, what is in a block cannot be touched — the block is something to move. */}
          <div className="nb-cell-in" {...(arranging ? { inert: '' as unknown as boolean } : {})}>{render(b)}</div>
          {arranging && (
            <div className="nb-arr" onPointerDown={(e) => grab(e, b, 'move')} onPointerMove={follow} onPointerUp={drop} onPointerCancel={drop}>
              <div className="nb-arr-head" onPointerDown={(e) => { if ((e.target as HTMLElement).closest('input, button')) e.stopPropagation() }}>
                {!phone && <span className="nb-arr-grip" aria-hidden="true">⠿</span>}
                {ADDED.includes(b.kind)
                  ? <input className="nb-arr-name" defaultValue={b.title ?? LABEL[b.kind]} aria-label="Heading"
                      onBlur={(e) => { const t = e.target.value.trim(); if (t !== (b.title ?? '')) rename(b, t || LABEL[b.kind]) }}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
                  : <span className="nb-arr-name">{LABEL[b.kind]}</span>}
                {phone && <>
                  <button disabled={i === 0} onClick={() => move(b, -1)} aria-label={`Move ${LABEL[b.kind]} up`}>↑</button>
                  <button disabled={i === order.length - 1} onClick={() => move(b, 1)} aria-label={`Move ${LABEL[b.kind]} down`}>↓</button>
                </>}
                {!KEPT.includes(b.kind) && <button className="nb-arr-hide" onClick={() => hide(b)} aria-label={`Hide ${LABEL[b.kind]}`} title="Hide">×</button>}
              </div>
              {!phone && <span className="nb-arr-size" onPointerDown={(e) => grab(e, b, 'size')} aria-label="Drag to resize" title="Drag to resize" />}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ---------- Arranging, from the corner ----------

/**
 * The corner menu while a page is being arranged: the same mark in the same corner, open the
 * whole time. Close keeps the arrangement; Discard puts back what there was before arranging began.
 */
export function ArrangeMenu({ kind, screen, layout, onChange, onClose, onDiscard }: {
  kind: VisitKind
  screen: Screen
  layout: Layout
  onChange: (next: Layout) => void
  onClose: () => void
  onDiscard: () => void
}) {
  const cols = COLS[screen]
  const hidden = BUILT_IN[kind].filter((k) => !layout.blocks.some((b) => b.kind === k))
  const [showing, setShowing] = useState(false)
  useEffect(() => {
    if (!showing) return
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowing(false) }
    const away = (e: PointerEvent) => { if (!(e.target as HTMLElement | null)?.closest?.('.nb-arr-show, .nb-menu-arrange')) setShowing(false) }
    window.addEventListener('keydown', key); window.addEventListener('pointerdown', away)
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('pointerdown', away) }
  }, [showing])
  const I = (d: React.ReactNode) => (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
  )
  const spot = (label: string, icon: React.ReactNode, act: (() => void) | undefined) => (
    <button className="nb-menu-spot" disabled={!act} onClick={() => act?.()}>{icon}<span>{label}</span></button>
  )
  const add = (k: BlockKind) => onChange(addBlock(layout, k, cols, ADDED.includes(k) ? LABEL[k] : undefined))
  return (
    <>
    {/* Above the mark, as the pad's colour and More panels are; outside the bar so the bar cannot clip it. */}
    {showing && hidden.length > 0 && (
      <div className="nb-arr-show" role="menu" aria-label="Show a hidden block">
        {hidden.map((k) => <button key={k} role="menuitem" onClick={() => { add(k); setShowing(false) }}>{LABEL[k]}</button>)}
      </div>
    )}
    <nav className="nb-menu open nb-menu-arrange" aria-label="Arrange the page">
      <span className="nb-menu-mark" aria-hidden="true"><Mark size={30} /></span>
      <div className="nb-menu-bar">
        {spot('Close', I(<><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></>), onClose)}
        {/* Greyed until the database can keep what they hold (migration 0044). */}
        {spot('Text box', I(<><rect x="4" y="5" width="16" height="14" rx="1.5" /><path d="M8 9h8M8 12h8M8 15h5" /></>), canHoldWidgets() ? () => add('text') : undefined)}
        {spot('Checklist', I(<><path d="M4 7l2 2 3-3M4 14l2 2 3-3" /><path d="M12 8h8M12 15h8" /></>), canHoldWidgets() ? () => add('check') : undefined)}
        {spot('Agenda', I(<><path d="M8 4h8M9 2.8h6v2.4H9z" /><rect x="5" y="4" width="14" height="17" rx="1.5" /><path d="M8.5 10l1.3 1.3 2.2-2.3M8.5 15.5l1.3 1.3 2.2-2.3M14 10.5h2.5M14 16h2.5" /></>), canHoldWidgets() ? () => add('agenda') : undefined)}
        {spot(`Show${hidden.length ? ` · ${hidden.length}` : ''}`, I(<><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" /><circle cx="12" cy="12" r="2.6" /></>), hidden.length ? () => setShowing(!showing) : undefined)}
        {spot('Reset', I(<><path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4v4h4" /></>), () => onChange(defaultLayout(kind, screen)))}
        {spot('Discard', I(<><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></>), onDiscard)}
      </div>
    </nav>
    </>
  )
}

// ---------- The added blocks ----------

/** Keeps typing on the device's screen at once and sends it a moment after the hand stops, and when the block goes. */
export function useSoon<T>(value: T, save: (v: T) => void, ms = 600) {
  const [here, setHere] = useState(value)
  const pending = useRef<T | null>(null)
  const saveRef = useRef(save)
  useEffect(() => { saveRef.current = save })
  const timer = useRef<number | null>(null)
  const flush = useCallback(() => {
    if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null }
    if (pending.current !== null) { const v = pending.current; pending.current = null; saveRef.current(v) }
  }, [])
  useEffect(() => flush, [flush])
  const set = (v: T, now = false) => {
    setHere(v); pending.current = v
    if (timer.current !== null) window.clearTimeout(timer.current)
    if (now) flush(); else timer.current = window.setTimeout(flush, ms)
  }
  return [here, set, flush] as const
}

/** A plain box to type in, on the page's ruling, under a heading of the writer's choosing. */
export function TextBlock({ title, widget, onSave }: { title: string; widget: Widget | undefined; onSave: (w: Widget) => void }) {
  const [text, setText, flush] = useSoon(textOf(widget), (t) => onSave({ title, text: t }))
  // As tall as what is typed, at least the block's height: the box grows rather than scroll.
  const box = useRef<HTMLTextAreaElement | null>(null)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    el.style.flex = 'none'; el.style.height = '0px'
    const h = el.scrollHeight
    el.style.height = `${h}px`; el.style.flex = ''
  }, [text])
  return (
    <section className="nb-z nb-z-text">
      <div className="nb-z-top"><h2>{title}</h2></div>
      <textarea ref={box} className="nb-write nb-ruled nb-free" value={text} placeholder="Type here"
        onChange={(e) => setText(e.target.value)} onBlur={flush} aria-label={title} />
    </section>
  )
}

/**
 * A list to tick off. Enter makes the next item; Backspace in an empty one takes it away. A
 * tick is kept at once; typing a moment after the hand stops.
 */
export function CheckBlock({ title, widget, onSave }: { title: string; widget: Widget | undefined; onSave: (w: Widget) => void }) {
  const [items, setItems, flush] = useSoon<CheckItem[]>(itemsOf(widget), (list) => onSave({ title, items: list }))
  const list = useRef<HTMLUListElement | null>(null)
  // The line to put the cursor in once the list has been drawn — before the next key arrives, so nothing typed is lost.
  const [focusAt, focus] = useState<number | null>(null)
  useLayoutEffect(() => {
    if (focusAt === null) return
    list.current?.querySelectorAll<HTMLInputElement>('input[type="text"]')[focusAt]?.focus()
    focus(null)
  }, [focusAt])
  const at = (i: number, patch: Partial<CheckItem>, now = false) => setItems(items.map((x, n) => (n === i ? { ...x, ...patch } : x)), now)
  const done = items.filter((x) => x.done && x.text.trim()).length, all = items.filter((x) => x.text.trim()).length
  return (
    <section className="nb-z nb-z-check">
      <div className="nb-z-top"><h2>{title}{all ? ` · ${done} of ${all}` : ''}</h2></div>
      <ul ref={list} className="nb-check">
        {items.map((it, i) => (
          <li key={i} className={it.done ? 'done' : ''}>
            <input type="checkbox" checked={it.done} onChange={(e) => at(i, { done: e.target.checked }, true)} aria-label={it.done ? 'Untick' : 'Tick'} />
            <input type="text" value={it.text} placeholder="Item" enterKeyHint="next" onBlur={flush}
              onChange={(e) => at(i, { text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); setItems([...items.slice(0, i + 1), { text: '', done: false }, ...items.slice(i + 1)]); focus(i + 1) }
                if (e.key === 'Backspace' && !it.text && items.length > 0) { e.preventDefault(); setItems(items.filter((_, n) => n !== i)); focus(Math.max(0, i - 1)) }
              }} />
          </li>
        ))}
      </ul>
      <button className="link nb-check-add" onClick={() => { setItems([...items, { text: '', done: false }]); focus(items.length) }}>+ Add item</button>
    </section>
  )
}
