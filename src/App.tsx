import { lazy, Suspense, useEffect, useRef, useState, type ComponentType } from 'react'
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import { isConfigured } from './lib/supabase'
import { AuthProvider, CreatePassword, SignIn, useAuth } from './lib/auth'
import { FirmProvider } from './lib/firm'
import { ProjectProvider, useProject } from './lib/project'
import { Logo } from './components/Logo'
import { PhoneNav } from './components/PhoneNav'
import { FeedbackButton } from './components/Feedback'
import Home from './pages/Home'
import { useFullscreen } from './lib/fullscreen'

/**
 * Each page is fetched when it is first opened, so the phone reads only the page in front of it
 * rather than the whole app on every launch. The service worker has them all on the device, so
 * this costs nothing with no signal.
 *
 * A page asked for by a copy of the app older than the last release may no longer exist on the
 * server. That is the one failure worth a reload — once, so a real fault can't loop.
 */
function page(load: () => Promise<{ default: ComponentType }>) {
  return lazy(() => load().catch((e) => {
    const KEY = 'cazen.reloadedForRelease'
    try {
      if (!sessionStorage.getItem(KEY)) { sessionStorage.setItem(KEY, '1'); window.location.reload() }
    } catch { /* fall through to the error */ }
    throw e
  }))
}
const Documents = page(() => import('./pages/Documents'))
const Manual = page(() => import('./pages/Manual'))
const PayApps = page(() => import('./pages/PayApps'))
const Submittals = page(() => import('./pages/Submittals'))
const CaLogs = page(() => import('./pages/CaLogs'))
const Contracts = page(() => import('./pages/Contracts'))
const Settings = page(() => import('./pages/Settings'))
const Templates = page(() => import('./pages/Templates'))
const FieldNotes = page(() => import('./pages/FieldNotes'))
const Schedule = page(() => import('./pages/Schedule'))

/**
 * The sidebar in three parts.
 *
 * The project switcher at the top is how you change project, and the wordmark and the switcher's
 * own last line both lead to the list of all of them — so there is no need for a link to it here.
 * Below that, the paperwork of the contract; below that, what was seen and said on site, which is
 * a different kind of record and reads better apart from the first; and at the foot, settings.
 */
const nav: { label: string; items: { to: string; label: string }[] }[] = [
  {
    label: 'Documents',
    items: [
      { to: '/documents', label: 'Drawings' },
      { to: '/manual', label: 'Project manual' },
      { to: '/submittals', label: 'Submittals' },
      { to: '/ca-logs', label: 'Change documents' },
      { to: '/pay', label: 'Pay applications' },
      { to: '/schedule', label: 'Construction schedule' },
      { to: '/contracts', label: 'Contracts' },
    ],
  },
  {
    label: 'Notebooks',
    items: [
      { to: '/field-notes/reports', label: 'Field notes' },
      { to: '/field-notes/meetings', label: 'Meeting notes' },
      { to: '/field-notes/observations', label: 'Observations' },
    ],
  },
]

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}

function Gate() {
  const { session, loading, needsPassword } = useAuth()
  if (!isConfigured) return <Shell offline />
  if (loading) return <div className="signin"><p className="muted">Loading…</p></div>
  if (!session) return <SignIn />
  if (needsPassword) return <CreatePassword />
  return (
    <FirmProvider>
      <ProjectProvider>
        <Shell />
      </ProjectProvider>
    </FirmProvider>
  )
}

function Shell({ offline = false }: { offline?: boolean }) {
  const screen = useFullscreen()
  return (
    <div className="shell">
      {/* Always there while full screen, never hidden behind anything, and it says what it does. */}
      {screen.on && (
        <button className="fs-exit" onClick={screen.toggle}>Exit full screen</button>
      )}
      {/* On a phone the sidebar gives up its strip of screen to the drawing, and this takes
          over: a corner mark that opens a bar of destinations. */}
      {!offline && <PhoneNav />}
      <aside className="sidebar">
        {/* The wordmark is the way home, as it is on every site. */}
        <div className="sidebar-logo">
          {offline ? <Logo size={23} />
            : <NavLink to="/" end className="home-link" title="All projects"><Logo size={23} /></NavLink>}
        </div>
        {!offline && <ProjectSwitcher />}
        <nav>
          {nav.map((group) => (
            <div key={group.label} className="nav-group">
              <span className="nav-group-label">{group.label}</span>
              {group.items.map((n) => (
                <NavLink key={n.to} to={n.to}>{n.label}</NavLink>
              ))}
            </div>
          ))}
        </nav>
        {!offline && (
          <div className="sidebar-foot">
            <NavLink to="/settings" className="settings-link">Settings</NavLink>
            <FeedbackButton />
            <button className="link fs-enter" onClick={screen.toggle}>Full screen</button>
            <SignOut />
          </div>
        )}
      </aside>
      <main className="content">
        {offline && (
          <div className="notice">
            Backend not connected yet. Add your Supabase URL and anon key (see <code>docs/SETUP.md</code>).
            The submittal cover sheet works without it.
          </div>
        )}
        <Suspense fallback={<p className="muted page-wait">Loading…</p>}>
        <Routes>
          <Route path="/" element={offline ? <p className="muted">Sign-in and projects need the backend.</p> : <Home />} />
          <Route path="/documents" element={offline ? <p className="muted">Drawings need the backend.</p> : <Documents />} />
          <Route path="/manual" element={offline ? <p className="muted">The project manual needs the backend.</p> : <Manual />} />
          <Route path="/submittals" element={<Submittals />} />
          <Route path="/ca-logs" element={<CaLogs />} />
          <Route path="/field-notes" element={<FieldNotes />} />
          <Route path="/field-notes/:area" element={<FieldNotes />} />
          <Route path="/pay" element={offline ? <p className="muted">Pay applications need the backend.</p> : <PayApps />} />
          <Route path="/schedule" element={offline ? <p className="muted">The schedule needs the backend.</p> : <Schedule />} />
          <Route path="/contracts" element={<Contracts />} />
          {!offline && <Route path="/settings" element={<Settings />} />}
          {!offline && <Route path="/templates" element={<Templates />} />}
        </Routes>
        </Suspense>
      </main>
    </div>
  )
}

/** The current project; click it to switch to another. */
function ProjectSwitcher() {
  const { projects, current, select } = useProject()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])

  const pick = (id: string) => { select(id); setOpen(false) }
  return (
    <div className="context" ref={box}>
      <button className={`project-switch${open ? ' open' : ''}`} onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="ps-text">
          {current ? (
            <>
              <span className="ps-number">{current.number}</span>
              <span className="ps-name">{current.name}</span>
            </>
          ) : (
            <span className="ps-name ps-empty">{projects.length ? 'Choose a project' : 'No projects yet'}</span>
          )}
        </span>
        <svg className="ps-chev" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div className="ps-menu" role="listbox" aria-label="Projects">
          {projects.map((p) => (
            <button key={p.id} role="option" aria-selected={p.id === current?.id} className={p.id === current?.id ? 'on' : ''} onClick={() => pick(p.id)}>
              <span className="ps-number">{p.number}</span>
              <span className="ps-name">{p.name}</span>
            </button>
          ))}
          <button className="ps-all" onClick={() => { setOpen(false); navigate('/') }}>{projects.length ? 'All projects' : 'Create a project'}</button>
        </div>
      )}
    </div>
  )
}

function SignOut() {
  const { session, signOut } = useAuth()
  return (
    <div className="signout">
      <span className="who">{session?.user.email}</span>
      <button className="link" onClick={signOut}>Sign out</button>
    </div>
  )
}
