import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { MARKUP_COLOURS, type MarkupKind } from '../lib/markups'

/**
 * The markup tools, as a small palette floating over the drawing.
 *
 * A rail down the side of the viewer takes width from the sheet and puts the tools wherever the
 * layout decides. On a drawing you want them near the hand and out of the way of whatever you are
 * marking up, so this is picked up by its grip and put down anywhere over the sheet. Where it was
 * left is remembered per browser; nothing about it is shared or saved to the project.
 *
 * The tools are icons, because seven words down a rail is a column of reading. Each one names
 * itself after a second's hover, which is long enough not to flicker while the pointer crosses
 * the palette on its way somewhere else.
 */

export type Tool = MarkupKind | 'erase' | 'select' | null

const TOOLS: { key: Exclude<Tool, null>; name: string; key_: string; icon: ReactElement }[] = [
  { key: 'select', name: 'Select', key_: 'S', icon: <path d="M5 3.5 18.5 12 12 13.2l-2.4 6.3L5 3.5Z" /> },
  { key: 'ink', name: 'Draw', key_: 'D', icon: <path d="M3 17.3V21h3.7L17.6 10.1l-3.7-3.7L3 17.3ZM20.7 7a1 1 0 0 0 0-1.4l-2.3-2.3a1 1 0 0 0-1.4 0l-1.8 1.8 3.7 3.7L20.7 7Z" /> },
  { key: 'arrow', name: 'Arrow', key_: 'A', icon: <path d="M4 20 20 4M20 4h-7M20 4v7" /> },
  { key: 'rect', name: 'Box', key_: 'B', icon: <rect x="3.5" y="5.5" width="17" height="13" rx="1.5" /> },
  { key: 'cloud', name: 'Cloud', key_: 'C', icon: <path d="M7 18h10a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6-1.2A3.9 3.9 0 0 0 7 18Z" /> },
  { key: 'text', name: 'Note', key_: 'N', icon: <path d="M4 5h16v11H9l-5 4V5Z" /> },
  { key: 'dimension', name: 'Measure', key_: 'M', icon: <><rect x="2.5" y="8.5" width="19" height="7" rx="1" /><path d="M7 8.5v3M12 8.5v4M17 8.5v3" /></> },
  { key: 'erase', name: 'Erase', key_: 'E', icon: <><path d="M8.5 20 3.6 15a1.8 1.8 0 0 1 0-2.6l8-8a1.8 1.8 0 0 1 2.6 0l5.8 5.8a1.8 1.8 0 0 1 0 2.6L13 20Z" /><path d="M8.5 20H20" /></> },
]

/** The letter that picks each tool, for the viewer's key handler and the palette's own labels. */
export const TOOL_KEYS: Record<string, Exclude<Tool, null>> =
  Object.fromEntries(TOOLS.map((t) => [t.key_.toLowerCase(), t.key]))

const Icon = ({ children }: { children: ReactElement }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)

const SPOT = 'cazen.markupPalette'
const read = (): { x: number; y: number } | null => {
  try { const v = localStorage.getItem(SPOT); return v ? JSON.parse(v) : null } catch { return null }
}
const write = (p: { x: number; y: number }) => { try { localStorage.setItem(SPOT, JSON.stringify(p)) } catch { /* fine */ } }

export function MarkupPalette({
  tool, setTool, colour, setColour, scale, settingScale, setSettingScale, stale, onBringForward, onDone,
}: {
  tool: Tool
  setTool: (t: Tool) => void
  colour: string
  setColour: (c: string) => void
  scale: unknown
  settingScale: boolean
  setSettingScale: (b: boolean) => void
  stale: number
  onBringForward: () => void
  onDone: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<{ x: number; y: number }>(() => read() ?? { x: 16, y: 16 })
  const drag = useRef<{ dx: number; dy: number; id: number } | null>(null)

  // Keep it on screen: the window can change size, and a palette left off the edge is gone.
  const clamp = useCallback((p: { x: number; y: number }) => {
    const box = ref.current?.getBoundingClientRect()
    const area = ref.current?.parentElement?.getBoundingClientRect()
    if (!box || !area) return p
    return {
      x: Math.max(6, Math.min(p.x, area.width - box.width - 6)),
      y: Math.max(6, Math.min(p.y, area.height - box.height - 6)),
    }
  }, [])

  useEffect(() => {
    const onResize = () => setAt((p) => clamp(p))
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [clamp])

  const grab = (e: React.PointerEvent) => {
    const box = ref.current!.getBoundingClientRect()
    drag.current = { dx: e.clientX - box.left, dy: e.clientY - box.top, id: e.pointerId }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    e.preventDefault()
    e.stopPropagation()
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    const area = ref.current!.parentElement!.getBoundingClientRect()
    setAt(clamp({ x: e.clientX - area.left - d.dx, y: e.clientY - area.top - d.dy }))
    e.preventDefault()
  }
  const drop = (e: React.PointerEvent) => {
    if (!drag.current || e.pointerId !== drag.current.id) return
    drag.current = null
    setAt((p) => { write(p); return p })
  }

  const noScale = !scale && !settingScale

  return (
    <div ref={ref} className="mk-palette" style={{ left: at.x, top: at.y }} role="toolbar" aria-label="Markup tools">
      <button className="mk-grip" onPointerDown={grab} onPointerMove={move} onPointerUp={drop} onPointerCancel={drop}
        aria-label="Move the markup tools" data-tip="Drag to move">
        <svg viewBox="0 0 24 10" width="22" height="10" aria-hidden="true">
          <circle cx="7" cy="4" r="1.3" /><circle cx="12" cy="4" r="1.3" /><circle cx="17" cy="4" r="1.3" />
          <circle cx="7" cy="8" r="1.3" /><circle cx="12" cy="8" r="1.3" /><circle cx="17" cy="8" r="1.3" />
        </svg>
      </button>

      <div className="mk-grid">
        {TOOLS.map((t) => {
          const off = t.key === 'dimension' && noScale
          return (
            <button key={t.key} className={tool === t.key ? 'on' : ''} disabled={off}
              onClick={() => setTool(t.key)} aria-label={t.name} aria-pressed={tool === t.key}
              data-tip={off ? 'Measure — set the scale first' : `${t.name} (${t.key_})`}>
              <Icon>{t.icon}</Icon>
            </button>
          )
        })}
      </div>

      <div className="mk-swatches">
        {MARKUP_COLOURS.map((c) => (
          <button key={c} className={`swatch${colour === c ? ' on' : ''}`} style={{ background: c }}
            aria-label={`Draw in ${c}`} aria-pressed={colour === c} data-tip={c} onClick={() => setColour(c)} />
        ))}
      </div>

      <div className="mk-foot">
        <button className={settingScale ? 'on' : ''} onClick={() => setSettingScale(true)}
          aria-label={scale ? 'Reset scale' : 'Set scale'} data-tip={scale ? 'Reset the scale' : 'Set the scale, so Measure can read in feet'}>
          <Icon><>
            {/* A span measured, over the thing that measures it. */}
            <path d="M3 6h18M3 6l2.6-2M3 6l2.6 2M21 6l-2.6-2M21 6l-2.6 2" />
            <rect x="2.5" y="11.5" width="19" height="7" rx="0.8" />
            <path d="M6 11.5v3M9 11.5v2M12 11.5v3M15 11.5v2M18 11.5v3" />
          </></Icon>
        </button>
        {stale > 0 && (
          <button onClick={onBringForward} aria-label={`Bring ${stale} forward`}
            data-tip={`Bring ${stale} markup${stale === 1 ? '' : 's'} forward to this revision`}>
            <Icon><><path d="M12 19V5" /><path d="M6 11l6-6 6 6" /></></Icon>
          </button>
        )}
        <button className="mk-done" onClick={onDone} aria-label="Done" data-tip="Done (Esc)">
          <Icon><path d="M5 12.5 10 17.5 19 7" /></Icon>
        </button>
      </div>
    </div>
  )
}
