import { useEffect, type RefObject } from 'react'

/**
 * Clicking somewhere else gets you out.
 *
 * A small editor that opens in place — renaming a sheet, renaming a set — has a Cancel button,
 * but reaching for it is a detour when the thing you actually want is whatever you just clicked
 * on. So anywhere outside closes it, and because the point is to leave rather than to commit,
 * closing this way discards rather than saves. Escape does the same.
 *
 * The listener is on pointerdown, not click: by the time a click completes the thing under the
 * pointer may have moved, and the press is where the intention was.
 */
export function useClickAway(ref: RefObject<HTMLElement | null>, away: () => void, active = true) {
  useEffect(() => {
    if (!active) return
    const out = (e: Event) => {
      const el = ref.current
      if (!el) return
      const target = e.target as Node | null
      // A click on something already removed from the page isn't a click somewhere else.
      if (!target || !target.isConnected) return
      if (el.contains(target)) return
      away()
    }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') away() }
    // Capture, so a handler that stops propagation on its own row can't swallow this.
    document.addEventListener('pointerdown', out, true)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', out, true)
      document.removeEventListener('keydown', key)
    }
  }, [ref, away, active])
}
