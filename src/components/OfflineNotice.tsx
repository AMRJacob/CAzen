import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useProject } from '../lib/project'
import { held } from '../lib/offline/store'

/**
 * Said when the signal goes while somebody is inside a project that is not on this device.
 *
 * A project that was downloaded carries on working and says nothing. One that was not has
 * nothing behind it once the connection drops — pages that load empty, changes that go
 * nowhere — and the kind thing is to say so plainly rather than let each page fail in its own
 * way. It goes away by itself when the connection comes back.
 */
export function OfflineNotice() {
  const { current } = useProject()
  const place = useLocation()
  const [online, setOnline] = useState(() => navigator.onLine)
  const [here, setHere] = useState(true)

  useEffect(() => {
    const now = () => setOnline(navigator.onLine)
    window.addEventListener('online', now); window.addEventListener('offline', now)
    return () => { window.removeEventListener('online', now); window.removeEventListener('offline', now) }
  }, [])

  useEffect(() => {
    let gone = false
    if (!current) return
    held(current.id).then((h) => { if (!gone) setHere(!!h) }).catch(() => { if (!gone) setHere(false) })
    return () => { gone = true }
  }, [current, online])

  // The project list has its own way of saying it: the projects that can't be opened are greyed.
  if (online || !current || here || place.pathname === '/') return null
  return (
    <div className="offline-notice" role="alert">
      <strong>Not connected to the internet.</strong> Connect to the internet to keep working.
    </div>
  )
}
