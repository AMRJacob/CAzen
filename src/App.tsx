import { NavLink, Route, Routes } from 'react-router-dom'
import { isConfigured } from './lib/supabase'
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
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">CA<span>zen</span></div>
        <nav>
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}>{n.label}</NavLink>
          ))}
        </nav>
      </aside>
      <main className="content">
        {!isConfigured && (
          <div className="notice">
            Backend not connected yet. Copy <code>.env.example</code> to <code>.env</code> and add your
            Supabase URL and anon key (see <code>docs/SETUP.md</code>). The PDF tools below work without it.
          </div>
        )}
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/submittals" element={<Submittals />} />
          <Route path="/ca-logs" element={<CaLogs />} />
          <Route path="/contracts" element={<Contracts />} />
        </Routes>
      </main>
    </div>
  )
}
