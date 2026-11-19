import { useEffect, useRef, useState, type ReactElement } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Mark } from './Logo'

/**
 * Getting around CAzen on a phone.
 *
 * A drawing wants the whole screen, so navigation isn't given a permanent strip of it. The ensō
 * sits in the bottom-left corner — reachable by the thumb holding the phone — and opening it
 * slides a bar of labelled destinations out to the right. That keeps what matters about a tab
 * bar (one row, along the bottom, with words under the icons, saying where you are) while
 * costing nothing when you aren't using it.
 *
 * It closes itself again, but not on a fixed count from opening: a second is less time than it
 * takes to read four labels and aim at one. The clock is generous until the first touch and
 * (It used to put itself away on a clock; it now stays until something is chosen or the
 * screen is touched elsewhere.)
 */


interface Spot { to: string; label: string; icon: ReactElement; end?: boolean }

const I = (d: ReactElement) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
)

/* The three places the work actually happens, plus the way to the rest. Apple's guidance is
   three to five, and three leaves the words full width on a folded phone. */
const SPOTS: Spot[] = [
  { to: '/documents', label: 'Drawings', icon: I(<><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M8 8h8M8 12h8M8 16h5" /></>) },
  { to: '/manual', label: 'Project manual', icon: I(<><path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4Z" /><path d="M9 8h6M9 12h6" /></>) },
  { to: '/field-notes/reports', label: 'Field notes', icon: I(<><path d="M8 4h9a2 2 0 0 1 2 2v14H8a2 2 0 0 1-2-2V4Z" /><path d="M10 9h5M10 13h5" /><path d="M6 4v16" /></>) },
]

const MORE: Spot[] = [
  { to: '/project', label: 'Overview', icon: I(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 10v10" /></>) },
  { to: '/', end: true, label: 'Projects', icon: I(<><path d="M3 7h7l2 2h9v11H3V7Z" /></>) },
  { to: '/field-notes/meetings', label: 'Meeting notes', icon: I(<><path d="M8 4h9a2 2 0 0 1 2 2v14H8a2 2 0 0 1-2-2V4Z" /><path d="M10 9h5M10 13h5" /><path d="M6 4v16" /></>) },
  { to: '/field-notes/observations', label: 'Observations', icon: I(<><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" /><circle cx="12" cy="12" r="2.6" /></>) },
  { to: '/ca-logs', label: 'Changes', icon: I(<><path d="M4 5h16M4 12h16M4 19h10" /><path d="M17 16l3 3-3 3" /></>) },
  { to: '/submittals', label: 'Submittals', icon: I(<><path d="M12 3v12M8 11l4 4 4-4" /><path d="M4 19h16" /></>) },
  { to: '/pay', label: 'Pay apps', icon: I(<><rect x="3" y="6" width="18" height="13" rx="1.5" /><path d="M3 10h18M7 15h4" /></>) },
  { to: '/documents?upload=1', label: 'Upload', icon: I(<><path d="M12 16V4M8 8l4-4 4 4" /><path d="M4 20h16" /></>) },
  { to: '/contracts', label: 'Contracts', icon: I(<><path d="M6 3h9l3 3v15H6V3Z" /><path d="M9 12h6M9 16h4" /></>) },
  { to: '/settings', label: 'Settings', icon: I(<><circle cx="12" cy="12" r="3.2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>) },
]

export function PhoneNav() {
  const [open, setOpen] = useState(false)
  const [more, setMore] = useState(false)
  const nav = useRef<HTMLElement>(null)
  const place = useLocation()

  // Going somewhere is reason enough to put it away.
  useEffect(() => { setOpen(false); setMore(false) }, [place.pathname])

  // It stays until something is chosen or the screen is touched anywhere else. It used to put
  // itself away on a clock, which on a phone meant it was gone before a thumb got to it.
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => { if (!nav.current?.contains(e.target as Node)) { setOpen(false); setMore(false) } }
    document.addEventListener('pointerdown', away, true)
    return () => document.removeEventListener('pointerdown', away, true)
  }, [open])

  // Everything else takes rows of four; the bar is as tall as the rows it has, and grows
  // upward from the bottom edge so none of it is under the screen.
  const rows = Math.ceil((MORE.length + 1) / 4)
  const height = !open ? 52 : more ? 8 + rows * 50 : 58

  return (
    <nav
      className={`phone-nav${open ? ' open' : ''}${open && more ? ' more' : ''}`}
      aria-label="Go to"
      ref={nav}
      style={{ '--pn-h': `${height}px` } as React.CSSProperties}
    >
      {/* One shape, not two. Closed it is the ensō; opening it grows the ring into the border
          around the whole menu and fades the CA out from inside it, so the menu costs no screen
          beyond the circle it came from. */}
      <button
        className="pn-mark"
        aria-expanded={open}
        aria-label={open ? 'Hide the menu' : 'Show the menu'}
        onClick={() => { setOpen(!open); setMore(false) }}
      >
        <Mark size={30} />
      </button>

      <div className="pn-bar" {...(open ? {} : { inert: '' as unknown as boolean })}>
        {(more ? MORE : SPOTS).map((s) => (
          <NavLink key={s.to} to={s.to} end={s.end} className="pn-spot">
            {s.icon}
            <span>{s.label}</span>
          </NavLink>
        ))}
        <button className={`pn-spot${more ? ' on' : ''}`} onClick={() => setMore(!more)}>
          {more
            ? I(<><path d="M15 6l-6 6 6 6" /></>)
            : I(<><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></>)}
          <span>{more ? 'Back' : 'More'}</span>
        </button>
      </div>
    </nav>
  )
}
