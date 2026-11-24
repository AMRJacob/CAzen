import { OfflineNotice } from './components/OfflineNotice'
import { lazy, Suspense, useEffect, useRef, useState, type ComponentType } from 'react'
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { isConfigured } from './lib/supabase'
import { AuthProvider, CreatePassword, SignIn, useAuth } from './lib/auth'
import { FirmProvider } from './lib/firm'
import { ProjectProvider, useProject } from './lib/project'
import { Logo } from './components/Logo'
import { PhoneNav } from './components/PhoneNav'
import { Shelf } from './components/Shelf'
import { FeedbackButton } from './components/Feedback'
import Home from './pages/Home'
import { useFullscreen } from './lib/fullscreen'
import { UploadHost } from './lib/uploadHost'

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
const Overview = page(() => import('./pages/Overview'))
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
const Trades = page(() => import('./pages/Trades'))

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
      { to: '/project', label: 'Overview' },
      { to: '/documents', label: 'Drawings' },
      { to: '/manual', label: 'Project Manual' },
      { to: '/submittals', label: 'Submittals' },
      { to: '/ca-logs', label: 'Change Documents' },
      { to: '/pay', label: 'Pay Applications' },
      { to: '/schedule', label: 'Construction Schedule' },
      { to: '/contracts', label: 'Contracts' },
    ],
  },
  {
    label: 'Notebooks',
    items: [
      { to: '/field-notes/reports', label: 'Field Notes' },
      { to: '/field-notes/meetings', label: 'Meeting Notes' },
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
        <UploadHost>
          <Shell />
        </UploadHost>
      </ProjectProvider>
    </FirmProvider>
  )
}

function Shell({ offline = false }: { offline?: boolean }) {
  const screen = useFullscreen()
  // The all-projects page is outside any project: no sidebar, the phone's landing page at every size.
  const atHome = useLocation().pathname === '/'
  return (
    <div className={`shell${atHome ? ' home' : ''}`}>
      {/* Always there while full screen, never hidden behind anything, and it says what it does. */}
      {screen.on && (
        <button className="fs-exit" onClick={screen.toggle}>Exit full screen</button>
      )}
      {/* On a phone the sidebar gives up its strip of screen to the drawing, and this takes
          over: a corner mark that opens a bar of destinations. */}
      {!offline && <PhoneNav />}
      {!offline && <OfflineNotice />}
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
              {/* The notebooks are not three more links: they are the books, on their table. */}
              {group.label === 'Notebooks' ? <Shelf small /> : group.items.map((n) => (
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
          {!offline && <Route path="/project" element={<Overview />} />}
          <Route path="/documents" element={offline ? <p className="muted">Drawings need the backend.</p> : <Documents />} />
          <Route path="/manual" element={offline ? <p className="muted">The project manual needs the backend.</p> : <Manual />} />
          <Route path="/submittals" element={<Submittals />} />
          <Route path="/ca-logs" element={<CaLogs />} />
          <Route path="/field-notes" element={<FieldNotes />} />
          <Route path="/field-notes/:area" element={<FieldNotes />} />
          <Route path="/pay" element={offline ? <p className="muted">Pay applications need the backend.</p> : <PayApps />} />
          <Route path="/schedule" element={offline ? <p className="muted">The schedule needs the backend.</p> : <Schedule />} />
          <Route path="/trades" element={offline ? <p className="muted">The trade board needs the backend.</p> : <Trades />} />
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

  // Choosing another project arrives at that project's front page.
  const pick = (id: string) => { select(id); setOpen(false); navigate('/project') }
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
