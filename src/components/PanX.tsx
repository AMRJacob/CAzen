import { useEffect, useRef } from 'react'

/**
 * A list that can be slid sideways, but only on purpose.
 *
 * Left to the browser, a thumb scrolling down a long list drifts a little sideways and takes
 * the list with it. Here the browser is given only the vertical: a touch moves the list
 * sideways only once it has gone clearly more across than down, and from then on that touch
 * is a sideways one. Anything else is an ordinary scroll of the page.
 */
export function PanX({ className, children }: { className?: string; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = box.current
    if (!el) return
    let touch: { id: number; x: number; y: number; left: number; across: boolean } | null = null
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      touch = { id: e.pointerId, x: e.clientX, y: e.clientY, left: el.scrollLeft, across: false }
    }
    const move = (e: PointerEvent) => {
      if (!touch || touch.id !== e.pointerId) return
      const dx = e.clientX - touch.x, dy = e.clientY - touch.y
      // Across by a clear margin — more than twice as far as down — before it counts.
      if (!touch.across && Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 2.2) {
        touch.across = true
        el.setPointerCapture(e.pointerId)
      }
      if (touch.across) el.scrollLeft = touch.left - dx
    }
    // A sideways slide is not a tap on the row it ended over: the click that follows it, if one
    // does, is dropped — and only that one, by the clock, so a later tap is never eaten.
    let noTapUntil = 0
    const up = (e: PointerEvent) => {
      if (!touch || touch.id !== e.pointerId) return
      if (touch.across) noTapUntil = Date.now() + 350
      touch = null
    }
    const click = (e: MouseEvent) => { if (Date.now() < noTapUntil) { e.stopPropagation(); e.preventDefault() } }
    el.addEventListener('click', click, true)
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    return () => {
      el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up)
      el.removeEventListener('click', click, true)
    }
  }, [])

  return <div ref={box} className={`pan-x ${className ?? ''}`}>{children}</div>
}
