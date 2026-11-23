import { Children } from 'react'
import { Link } from 'react-router-dom'
import { titleCase } from '../lib/titleCase'

/**
 * A page's heading, which is also the way back out to the project list.
 *
 * Everything below a heading belongs to one project; the heading itself is the level above that,
 * so clicking it goes up. It stays a heading to read — the only sign it does anything is the
 * pointer and an underline when you are on it.
 */
export function PageTitle({ children }: { children: React.ReactNode }) {
  return (
    <h1>
      <Link to="/" className="page-title-link" title="All projects">{titled(children)}</Link>
    </h1>
  )
}

/** The words of a heading in title case; anything that isn't words is left alone. A heading made of
 *  pieces ("New ", label) is joined first so the small-word rule sees the whole phrase. */
function titled(children: React.ReactNode): React.ReactNode {
  const parts = Children.toArray(children)
  if (parts.every((p) => typeof p === 'string' || typeof p === 'number')) return titleCase(parts.join(''))
  return parts.map((p) => (typeof p === 'string' ? titleCase(p) : p))
}
