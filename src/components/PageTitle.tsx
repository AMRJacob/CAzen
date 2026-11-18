import { Link } from 'react-router-dom'

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
      <Link to="/" className="page-title-link" title="All projects">{children}</Link>
    </h1>
  )
}
