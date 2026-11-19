import { NavLink } from 'react-router-dom'

/**
 * The notebooks, as the thing you reach for: a table top with the three books lying on it —
 * field notes, meeting notes, observations — each its own colour with its initials on the
 * cover. In the sidebar it is the menu itself, small; the book that is open is lifted.
 */
const BOOKS: { mono: string; name: string; to: string; tone: string; line: string }[] = [
  { mono: 'Fn', name: 'Field notes', to: '/field-notes/reports', tone: 'fn', line: 'Site visits' },
  { mono: 'Mn', name: 'Meeting notes', to: '/field-notes/meetings', tone: 'mn', line: 'Meetings' },
  { mono: 'Ob', name: 'Observations', to: '/field-notes/observations', tone: 'ob', line: 'Everything observed, and the punch list' },
]

export function Shelf({ job, small = false }: { job?: string | null; small?: boolean }) {
  return (
    <div className={`nb-table${small ? ' small' : ''}`} role="list" aria-label="Notebooks">
      {BOOKS.map((b) => (
        <NavLink key={b.mono} role="listitem" to={b.to} className={({ isActive }) => `nb-tome nb-tome-${b.tone}${isActive ? ' open' : ''}`}
          aria-label={`Open ${b.name}`}>
          <span className="nb-tome-band" aria-hidden="true" />
          <span className="nb-tome-mono" aria-hidden="true">{b.mono}</span>
          <span className="nb-tome-text">
            <span className="nb-tome-name">{b.name}</span>
            {!small && <span className="nb-tome-line">{job ? `${job} · ${b.line}` : b.line}</span>}
          </span>
        </NavLink>
      ))}
    </div>
  )
}
