import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../lib/supabase'
import { useProject } from '../lib/project'
import { SetPassword } from '../lib/auth'
import type { Project } from '../lib/types'

export default function Home() {
  const { projects, current, select, reload, loading } = useProject()
  const [showNew, setShowNew] = useState(false)
  const navigate = useNavigate()

  function open(p: Project) {
    select(p.id)
    navigate('/documents')
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Projects</h1>
          <p className="lead">Each project holds its drawings, project manual, contract, CA logs and submittals.</p>
        </div>
        <button className="primary" onClick={() => setShowNew(!showNew)}>{showNew ? 'Cancel' : 'New project'}</button>
      </div>

      {showNew && <NewProject onCreated={async (p) => { await reload(); setShowNew(false); open(p) }} />}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : projects.length === 0 ? (
        <div className="card muted">No projects yet. Create one to start uploading drawings.</div>
      ) : (
        <table>
          <thead><tr><th>No.</th><th>Name</th><th>Owner</th><th>Contractor</th><th /></tr></thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id} className={p.id === current?.id ? 'selected' : ''}>
                <td>{p.number}</td>
                <td>{p.name}</td>
                <td>{p.owner_name ?? ''}</td>
                <td>{p.contractor_name ?? ''}</td>
                <td className="right"><button onClick={() => open(p)}>Open</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Account</h2>
      <p className="muted small">Signed in by email link? Set a password so you can sign in without waiting for an email.</p>
      <SetPassword />
    </section>
  )
}

function NewProject({ onCreated }: { onCreated: (p: Project) => void }) {
  const [f, setF] = useState({ number: '', name: '', owner: '', contractor: '', address: '' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { data, error } = await db().rpc('create_project', {
      p_number: f.number.trim(),
      p_name: f.name.trim(),
      p_owner_name: f.owner.trim() || null,
      p_contractor_name: f.contractor.trim() || null,
      p_address: f.address.trim() || null,
    })
    setBusy(false)
    if (error) setError(error.message.includes('duplicate') ? 'That project number already exists.' : error.message)
    else onCreated(data as Project)
  }

  return (
    <form className="card form" onSubmit={submit}>
      <label>Project no.<input required value={f.number} onChange={set('number')} placeholder="2025-014" /></label>
      <label>Name<input required value={f.name} onChange={set('name')} placeholder="Westrock Landing WMO" /></label>
      <label>Owner<input value={f.owner} onChange={set('owner')} /></label>
      <label>Contractor<input value={f.contractor} onChange={set('contractor')} /></label>
      <label className="wide">Address<input value={f.address} onChange={set('address')} /></label>
      <div className="wide">
        <button className="primary" disabled={busy}>{busy ? 'Creating…' : 'Create project'}</button>
        {error && <div className="notice error">{error}</div>}
      </div>
    </form>
  )
}
