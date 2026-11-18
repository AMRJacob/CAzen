import { useEffect, useRef, useState } from 'react'
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import { isConfigured } from './lib/supabase'
import { AuthProvider, CreatePassword, SignIn, useAuth } from './lib/auth'
import { FirmProvider } from './lib/firm'
import { ProjectProvider, useProject } from './lib/project'
import { Logo } from './components/Logo'
import { PhoneNav } from './components/PhoneNav'
import { FeedbackButton } from './components/Feedback'
import Home from './pages/Home'
import Documents from './pages/Documents'
import Manual from './pages/Manual'
import Submittals from './pages/Submittals'
import CaLogs from './pages/CaLogs'
import Contracts from './pages/Contracts'
import Settings from './pages/Settings'
import Templates from './pages/Templates'
import { useFullscreen } from './lib/fullscreen'

// The project switcher at the top of the sidebar is how you change project, so the list of all of
// them belongs with the other things you go to now and then, not at the head of the work.
const nav = [
  { to: '/documents', label: 'Drawings' },
  { to: '/manual', label: 'Project manual' },
  { to: '/submittals', label: 'Submittals' },
  { to: '/ca-logs', label: 'Change documents' },
  { to: '/contracts', label: 'Contracts' },
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
        <div className="sidebar-logo"><Logo size={23} /></div>
        {!offline && <ProjectSwitcher />}
        <nav>
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to}>{n.label}</NavLink>
          ))}
        </nav>
        {!offline && (
          <div className="sidebar-foot">
            <NavLink to="/" end className="settings-link">All projects</NavLink>
            <NavLink to="/templates" className="settings-link">Form templates</NavLink>
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
        <Routes>
          <Route path="/" element={offline ? <p className="muted">Sign-in and projects need the backend.</p> : <Home />} />
          <Route path="/documents" element={offline ? <p className="muted">Drawings need the backend.</p> : <Documents />} />
          <Route path="/manual" element={offline ? <p className="muted">The project manual needs the backend.</p> : <Manual />} />
          <Route path="/submittals" element={<Submittals />} />
          <Route path="/ca-logs" element={<CaLogs />} />
          <Route path="/contracts" element={<Contracts />} />
          {!offline && <Route path="/settings" element={<Settings />} />}
          {!offline && <Route path="/templates" element={<Templates />} />}
        </Routes>
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
