import { NavLink, Route, Routes } from 'react-router-dom'
import { isConfigured } from './lib/supabase'
import { AuthProvider, CreatePassword, SignIn, useAuth } from './lib/auth'
import { ProjectProvider, useProject } from './lib/project'
import Home from './pages/Home'
import Documents from './pages/Documents'
import Submittals from './pages/Submittals'
import CaLogs from './pages/CaLogs'
import Contracts from './pages/Contracts'

const nav = [
  { to: '/', label: 'Projects' },
  { to: '/documents', label: 'Documents' },
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
    <ProjectProvider>
      <Shell />
    </ProjectProvider>
  )
}

function Shell({ offline = false }: { offline?: boolean }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">CA<span>zen</span></div>
        {!offline && <CurrentProject />}
        <nav>
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}>{n.label}</NavLink>
          ))}
        </nav>
        {!offline && <SignOut />}
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
          <Route path="/documents" element={offline ? <p className="muted">Document control needs the backend.</p> : <Documents />} />
          <Route path="/submittals" element={<Submittals />} />
          <Route path="/ca-logs" element={<CaLogs />} />
          <Route path="/contracts" element={<Contracts />} />
        </Routes>
      </main>
    </div>
  )
}

function CurrentProject() {
  const { projects, current, select } = useProject()
  if (projects.length === 0) return null
  return (
    <div className="project-picker">
      <label htmlFor="proj">Project</label>
      <select id="proj" value={current?.id ?? ''} onChange={(e) => select(e.target.value || null)}>
        <option value="">Choose…</option>
        {projects.map((p) => <option key={p.id} value={p.id}>{p.number} {p.name}</option>)}
      </select>
    </div>
  )
}

function SignOut() {
  const { session, signOut } = useAuth()
  return (
    <div className="signout">
      <span>{session?.user.email}</span>
      <button className="link light" onClick={signOut}>Sign out</button>
    </div>
  )
}
