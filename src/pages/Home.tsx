import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../lib/supabase'
import { useProject } from '../lib/project'
import { useFirm } from '../lib/firm'
import type { Project } from '../lib/types'

export default function Home() {
  const { projects, current, select, reload, loading } = useProject()
  const [showNew, setShowNew] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
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
          <p className="lead">Project details fill in every form automatically, so set them once here.</p>
        </div>
        <button className="primary" onClick={() => setShowNew(!showNew)}>{showNew ? 'Cancel' : 'New project'}</button>
      </div>

      {showNew && <ProjectForm onCreated={async (p) => { await reload(); setShowNew(false); open(p) }} />}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : projects.length === 0 ? (
        <div className="card muted">No projects yet. Create one to start uploading drawings.</div>
      ) : (
        <table>
          <thead><tr><th>No.</th><th>Name</th><th>Owner</th><th>Contractor</th><th /></tr></thead>
          <tbody>
            {projects.flatMap((p) => [
              <tr key={p.id} className={p.id === current?.id ? 'selected' : ''}>
                <td>{p.number}</td>
                <td>{p.name}</td>
                <td>{p.owner_name ?? ''}</td>
                <td>{p.contractor_name ?? ''}</td>
                <td className="right nowrap"><button className="link" onClick={() => setEditing(editing === p.id ? null : p.id)}>Edit</button>{' '}<button onClick={() => open(p)}>Open</button></td>
              </tr>,
              editing === p.id && (
                <tr key={p.id + '-edit'}><td colSpan={5}><ProjectForm project={p} onCreated={async () => { await reload(); setEditing(null) }} /></td></tr>
              ),
            ])}
          </tbody>
        </table>
      )}
    </section>
  )
}

/** Create a project, or edit one when `project` is given. Everything here autofills the forms. */
function ProjectForm({ project, onCreated }: { project?: Project; onCreated: (p: Project) => void }) {
  const { firm } = useFirm()
  const [f, setF] = useState({
    number: project?.number ?? '', name: project?.name ?? '', owner: project?.owner_name ?? '',
    contractor: project?.contractor_name ?? '', address: project?.address ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    if (project) {
      const { data, error } = await db().from('projects').update({
        number: f.number.trim(), name: f.name.trim(), owner_name: f.owner.trim() || null,
        contractor_name: f.contractor.trim() || null, address: f.address.trim() || null,
      }).eq('id', project.id).select().single()
      setBusy(false)
      if (error) setError(error.message)
      else onCreated(data as Project)
      return
    }
    const { data, error } = await db().rpc('create_project', {
      p_firm_id: firm!.id,
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
        <button className="primary" disabled={busy}>{busy ? 'Saving…' : project ? 'Save project' : 'Create project'}</button>
        {error && <div className="notice error">{error}</div>}
      </div>
    </form>
  )
}
