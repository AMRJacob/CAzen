import { NavLink, Route, Routes } from 'react-router-dom'
import { isConfigured } from './lib/supabase'
import { AuthProvider, CreatePassword, SignIn, useAuth } from './lib/auth'
import { FirmProvider, useFirm } from './lib/firm'
import { ProjectProvider, useProject } from './lib/project'
import { Logo } from './components/Logo'
import Home from './pages/Home'
import Documents from './pages/Documents'
import Submittals from './pages/Submittals'
import CaLogs from './pages/CaLogs'
import Contracts from './pages/Contracts'
import Settings from './pages/Settings'

const nav = [
  { to: '/', label: 'Projects' },
  { to: '/documents', label: 'Drawings' },
  { to: '/submittals', label: 'Submittals' },
  { to: '/ca-logs', label: 'CA Logs' },
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
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-logo"><Logo size={26} /></div>
        {!offline && <FirmAndProject />}
        <nav>
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}>{n.label}</NavLink>
          ))}
        </nav>
        {!offline && (
          <div className="sidebar-foot">
            <NavLink to="/settings" className="settings-link">Settings</NavLink>
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
          <Route path="/submittals" element={<Submittals />} />
          <Route path="/ca-logs" element={<CaLogs />} />
          <Route path="/contracts" element={<Contracts />} />
          {!offline && <Route path="/settings" element={<Settings />} />}
        </Routes>
      </main>
    </div>
  )
}

function FirmAndProject() {
  const { firms, firm, select: selectFirm } = useFirm()
  const { projects, current, select } = useProject()
  return (
    <div className="context">
      {firms.length > 1 ? (
        <select className="firm-select" value={firm?.id} onChange={(e) => selectFirm(e.target.value)} aria-label="Firm">
          {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      ) : (
        <div className="firm-name">{firm?.name}</div>
      )}
      {projects.length > 0 && (
        <select value={current?.id ?? ''} onChange={(e) => select(e.target.value || null)} aria-label="Project">
          <option value="">Choose a project…</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.number} · {p.name}</option>)}
        </select>
      )}
    </div>
  )
}

function SignOut() {
  const { session, signOut } = useAuth()
  return (
    <div className="signout">
      <span>{session?.user.email}</span>
      <button className="link" onClick={signOut}>Sign out</button>
    </div>
  )
}
