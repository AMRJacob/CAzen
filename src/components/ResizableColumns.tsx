import { useCallback, useEffect, useRef } from 'react'
import { PREFS, readPref, usePref } from '../lib/prefs'

/**
 * Columns you can set the width of, on a table that would otherwise decide for itself.
 *
 * Sheet titles are long and uneven — one job's are two words, another's run to a line and a half —
 * so no set of widths is right for every project. The handle sits on the boundary between two
 * headers and the width is remembered per column, per browser, until it is reset in Settings.
 *
 * Only the columns given here are fixed; the rest are left to the table, so dragging one column
 * doesn't force a width on every other.
 */

export interface Column { key: string; min?: number }

export function useColumnWidths(columns: Column[]) {
  const [widths, setWidths] = usePref<Record<string, number>>(PREFS.registerWidths, {})
  const table = useRef<HTMLTableElement>(null)

  const drag = useCallback((key: string, startX: number, startWidth: number, min: number) => {
    // Written straight to the DOM while the pointer moves, and to the preference once at the
    // end: a re-render per pixel makes a long register crawl.
    const el = () => table.current?.querySelector<HTMLElement>(`col[data-col="${key}"]`)
    let width = startWidth
    const move = (e: PointerEvent) => {
      width = Math.max(min, Math.round(startWidth + (e.clientX - startX)))
      const c = el()
      if (c) c.style.width = `${width}px`
    }
    const up = () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      document.body.classList.remove('col-resizing')
      setWidths({ ...readPref<Record<string, number>>(PREFS.registerWidths, {}), [key]: width })
    }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
    document.body.classList.add('col-resizing')
  }, [setWidths])

  /** The <colgroup> that carries the widths. */
  const cols = (
    <colgroup>
      {columns.map((c) => (
        <col key={c.key} data-col={c.key} style={widths[c.key] ? { width: `${widths[c.key]}px` } : undefined} />
      ))}
    </colgroup>
  )

  /** The grip to put at the right-hand edge of a header cell. */
  const grip = (key: string, min = 56) => (
    <span
      className="col-grip"
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize the ${key} column`}
      onPointerDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
        const th = (e.currentTarget as HTMLElement).closest('th')
        drag(key, e.clientX, th?.getBoundingClientRect().width ?? 120, min)
      }}
      onDoubleClick={(e) => {
        // Back to letting the table decide for this one column.
        e.stopPropagation()
        const next = { ...readPref<Record<string, number>>(PREFS.registerWidths, {}) }
        delete next[key]
        setWidths(next)
      }}
    />
  )

  // A width saved on a wide screen can leave a column off the edge of a narrow one.
  useEffect(() => {
    const trim = () => {
      const t = table.current
      if (!t) return
      const room = t.parentElement?.clientWidth ?? t.clientWidth
      const saved = readPref<Record<string, number>>(PREFS.registerWidths, {})
      const total = Object.values(saved).reduce((n, w) => n + w, 0)
      if (total > room) t.classList.add('over-wide')
      else t.classList.remove('over-wide')
    }
    trim()
    window.addEventListener('resize', trim)
    return () => window.removeEventListener('resize', trim)
  }, [widths])

  return { table, cols, grip }
}
