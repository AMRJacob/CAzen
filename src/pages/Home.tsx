import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../lib/supabase'
import { useProject } from '../lib/project'
import { useFirm } from '../lib/firm'
import type { Project } from '../lib/types'
import { ProjectAdmin } from '../components/ProjectAdmin'
import { ProjectFolder } from '../components/ProjectFolder'
import { FieldCopy } from '../components/FieldCopy'
import { heldAll, release, type Held } from '../lib/offline/store'
import { FIELD_EVENT, isStale, checkedAt, keepCurrent, type FieldNews } from '../lib/offline/keepCurrent'
import { plans, takeToField, type Plan, type Progress, type Scope } from '../lib/offline/download'
import { drain, pending } from '../lib/offline/outbox'
import { message } from '../lib/errors'
import { LocationPicker, type Location } from '../components/LocationPicker'

export default function Home() {
  const { projects, current, select, reload, loading } = useProject()
  const { isAdmin } = useFirm()
  const [showNew, setShowNew] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  // On a phone the row is the project and there is no Edit, so taking it to the field — which is
  // decided on the phone — has its own way in, and a held project says so where it is listed.
  const [heldIds, setHeldIds] = useState<Set<string>>(new Set())
  const [notes, setNotes] = useState<Record<string, Held>>({})
  const lookHeld = useCallback(() => {
    heldAll().then((h) => {
      setHeldIds(new Set(h.map((x) => x.project_id)))
      setNotes(Object.fromEntries(h.map((x) => [x.project_id, x])))
    }).catch(() => {})
  }, [])
  useEffect(() => { lookHeld() }, [lookHeld, editing])

  // What each project still has to send back. Hatched until it is none; looked at every few
  // seconds while this page is open, and the queue is given a push each time in case the
  // device came back without saying so.
  const [waiting, setWaiting] = useState<Record<string, number>>({})
  useEffect(() => {
    const look = () => {
      void drain().catch(() => {})
      pending().then((q) => {
        const n: Record<string, number> = {}
        for (const j of q) n[j.project_id] = (n[j.project_id] ?? 0) + 1
        setWaiting(n)
      }).catch(() => {})
    }
    look()
    const t = setInterval(look, 4000)
    window.addEventListener('online', look)
    return () => { clearInterval(t); window.removeEventListener('online', look) }
  }, [])

  // Press and hold a project (or right-click it) to take it to the field: its current sheets
  // come down at once and the row fills as they do. Held again once it is on the device, it
  // opens what can be done with the copy — refresh it, take every revision, let it go.
  const [loading_, setLoading_] = useState<Record<string, Progress>>({})
  // The copies on this device are kept current without being asked; this is that work showing.
  useEffect(() => {
    const heard = (e: Event) => {
      const news = (e as CustomEvent<FieldNews>).detail
      if (news.done) { setLoading_((l) => { const n = { ...l }; delete n[news.project_id]; return n }); lookHeld() }
      else if (news.progress) setLoading_((l) => ({ ...l, [news.project_id]: news.progress! }))
    }
    window.addEventListener(FIELD_EVENT, heard)
    return () => window.removeEventListener(FIELD_EVENT, heard)
  }, [lookHeld])
  // "Checked yesterday" becomes "not up to date" by the clock alone, so the clock is looked at.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t) }, [])
  // With no signal, a project that is not on this device cannot be opened to anything but
  // empty pages. It is shown, greyed, and does nothing — which says why it is not there.
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const now = () => setOnline(navigator.onLine)
    window.addEventListener('online', now); window.addEventListener('offline', now)
    return () => { window.removeEventListener('online', now); window.removeEventListener('offline', now) }
  }, [])
  const away = (p: Project) => !online && !heldIds.has(p.id)
  /** A held project being asked about: update it, take more of it, or let it go. */
  const [keeping, setKeeping] = useState<Project | null>(null)
  const [trouble, setTrouble] = useState<string | null>(null)
  const press = useRef<{ timer: number; x: number; y: number } | null>(null)
  const pressed = useRef(0)
  /** The project a hold has asked about, and what taking it would bring down. */
  const [asking, setAsking] = useState<{ project: Project; plans: Plan[] | null } | null>(null)
  // A hold asks first: it says how much would come down, and nothing does until it is chosen.
  async function take(p: Project) {
    if (loading_[p.id] || away(p)) return
    if (heldIds.has(p.id)) { setKeeping(p); return }
    setTrouble(null)
    setAsking({ project: p, plans: null })
    try { const list = await plans(p.id); setAsking((a) => (a?.project.id === p.id ? { project: p, plans: list } : a)) }
    catch (e) { setAsking(null); setTrouble(`${p.name}: ${message(e)}`) }
  }
  async function download(p: Project, scope: Scope) {
    setAsking(null)
    setLoading_((l) => ({ ...l, [p.id]: { done: 0, total: 0, bytes: 0, what: '' } }))
    try {
      await takeToField(p, scope, (pr) => setLoading_((l) => ({ ...l, [p.id]: pr })))
      lookHeld()
    } catch (e) { setTrouble(`${p.name}: ${message(e)}`) }
    finally { setLoading_((l) => { const n = { ...l }; delete n[p.id]; return n }) }
  }
  const holdStart = (e: React.PointerEvent, p: Project) => {
    if (e.pointerType === 'mouse' || (e.target as HTMLElement).closest('button, a, input')) return
    const timer = window.setTimeout(() => {
      press.current = null
      pressed.current = Date.now()
      navigator.vibrate?.(12)
      void take(p)
    }, 550)
    press.current = { timer, x: e.clientX, y: e.clientY }
  }
  const holdMove = (e: React.PointerEvent) => {
    const h = press.current
    if (h && Math.hypot(e.clientX - h.x, e.clientY - h.y) > 10) { clearTimeout(h.timer); press.current = null }
  }
  const holdEnd = () => { if (press.current) { clearTimeout(press.current.timer); press.current = null } }
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
        </div>
        <button className="primary" onClick={() => setShowNew(!showNew)}>{showNew ? 'Cancel' : 'New project'}</button>
      </div>

      {trouble && <div className="notice error">{trouble}</div>}
      {asking && (
        <div className="take-ask" role="dialog" aria-label={`Take ${asking.project.name} to the field`}
          // Lifting the finger that was holding lands on this backdrop; that is not a "no".
          onClick={() => { if (Date.now() - pressed.current > 800) setAsking(null) }}>
          <div className="take-card" onClick={(e) => e.stopPropagation()}>
            <h3>Take {asking.project.name} to the field?</h3>
            <p className="muted small">Its drawings are kept on this device so they open with no signal. Sheets already here are not fetched again.</p>
            {!asking.plans ? <p className="muted small">Working out how much there is…</p> : (
              <div className="take-choices">
                {asking.plans.map((c) => (
                  <button key={c.scope} className={c.scope === 'current' ? 'primary' : ''} onClick={() => void download(asking.project, c.scope)}>
                    <strong>{c.scope === 'current' ? 'Download the current sheets' : 'Download every revision'}</strong>
                    <span>{c.files} {c.files === 1 ? 'sheet' : 'sheets'} · {c.estimated ? 'about ' : ''}{sizeOf(c.bytes)}</span>
                  </button>
                ))}
              </div>
            )}
            <button className="link" onClick={() => setAsking(null)}>Not now</button>
          </div>
        </div>
      )}
      {keeping && (
        <div className="take-ask" role="dialog" aria-label={`${keeping.name} on this device`}
          onClick={() => { if (Date.now() - pressed.current > 800) setKeeping(null) }}>
          <div className="take-card" onClick={(e) => e.stopPropagation()}>
            <h3>{keeping.name} is on this device</h3>
            <p className="muted small">
              {notes[keeping.id] ? `Last matched to the office ${ago(checkedAt(notes[keeping.id]), now)}. ` : ''}
              It is brought up to date by itself whenever CAzen is open with signal.
              {waiting[keeping.id] ? ` ${waiting[keeping.id]} ${waiting[keeping.id] === 1 ? 'change' : 'changes'} made here have not been sent yet; removing the drawings does not lose them.` : ''}
            </p>
            <div className="take-choices">
              <button className="primary" onClick={() => { const p = keeping; setKeeping(null); void keepCurrent(true).then(lookHeld).catch((e) => setTrouble(`${p.name}: ${message(e)}`)) }}>
                <strong>Update it now</strong><span>Brings down anything issued since</span>
              </button>
              {notes[keeping.id]?.scope === 'current' && (
                <button onClick={() => { const p = keeping; setKeeping(null); void download(p, 'all') }}>
                  <strong>Download every revision</strong><span>Earlier issues of each sheet as well</span>
                </button>
              )}
              <button className="take-remove" onClick={() => {
                const p = keeping; setKeeping(null)
                release(p.id).then(lookHeld).catch((e) => setTrouble(`${p.name}: ${message(e)}`))
              }}>
                <strong>Remove from this device</strong><span>Frees the space; the project itself is untouched</span>
              </button>
            </div>
            <button className="link" onClick={() => setKeeping(null)}>Close</button>
          </div>
        </div>
      )}
      {showNew && <ProjectForm onCreated={async (p) => { await reload(); setShowNew(false); open(p) }} />}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : projects.length === 0 ? (
        <div className="card muted">No projects yet. Create one to start uploading drawings.</div>
      ) : (
        <>
        <table className="projects">
          <thead><tr><th>No.</th><th>Name</th><th>Owner</th><th>Contractor</th><th /><th className="p-field" /></tr></thead>
          <tbody>
            {projects.flatMap((p) => [
              // The whole row opens the project; on a phone it becomes one tappable block.
              <tr key={p.id}
                className={`opens${p.id === current?.id ? ' selected' : ''}${waiting[p.id] || (notes[p.id] && isStale(notes[p.id], now)) ? ' p-unsynced' : heldIds.has(p.id) ? ' p-held' : ''}${loading_[p.id] ? ' p-loading' : ''}${away(p) ? ' p-away' : ''}`}
                aria-disabled={away(p) || undefined}
                style={loading_[p.id] ? { '--p-fill': `${loading_[p.id].total ? Math.round(loading_[p.id].done / loading_[p.id].total * 100) : 3}%` } as React.CSSProperties : undefined}
                tabIndex={away(p) ? -1 : 0} role="button" aria-label={away(p) ? `${p.number} ${p.name} is not on this device` : `Open ${p.number} ${p.name}`}
                onPointerDown={(e) => holdStart(e, p)} onPointerMove={holdMove} onPointerUp={holdEnd} onPointerCancel={holdEnd} onPointerLeave={holdEnd}
                onContextMenu={(e) => { e.preventDefault(); if (Date.now() - pressed.current > 800) void take(p) }}
                onClick={(e) => {
                  // The press that took it to the field is not also a tap that opens it.
                  if (Date.now() - pressed.current < 800 || away(p)) return
                  if (!(e.target as HTMLElement).closest('button, a')) open(p)
                }}
                onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !away(p)) { e.preventDefault(); open(p) } }}>
                <td className="p-number">{p.number}</td>
                <td className="p-name">{p.name}{p.status === 'archived' && <> <span className="tag muted">archived</span></>}</td>
                <td className="p-who">{p.owner_name ?? ''}</td>
                <td className="p-who">{p.contractor_name ?? ''}</td>
                <td className="right nowrap p-edit"><button className="link" onClick={() => setEditing(editing === p.id ? null : p.id)}>Edit</button></td>
                <td className="p-field p-state">
                  {loading_[p.id]
                    ? `Bringing it to this device… ${loading_[p.id].total ? `${loading_[p.id].done} of ${loading_[p.id].total} sheets` : ''}`
                    : away(p) ? 'Not on this device — needs a connection'
                    : [
                        notes[p.id] && (isStale(notes[p.id], now)
                          ? `On this device · not updated since ${ago(checkedAt(notes[p.id]), now)}`
                          : waiting[p.id] ? 'On this device' : 'On this device · up to date'),
                        waiting[p.id] && `${waiting[p.id]} ${waiting[p.id] === 1 ? 'change' : 'changes'} still to send`,
                      ].filter(Boolean).join(' · ')}
                </td>
              </tr>,
              editing === p.id && (
                <tr key={p.id + '-edit'}><td colSpan={6}><ProjectForm project={p} onCreated={async () => { await reload(); setEditing(null) }} /><ProjectFolder project={p} /><FieldCopy project={p} /><ProjectAdmin project={p} isAdmin={isAdmin} /></td></tr>
              ),
            ])}
          </tbody>
        </table>
        </>
      )}
      {/* What the page is for and what the colours mean sit under the list: the top is the list. */}
      <div className="p-about">
        <p className="muted small">Project details fill in every form automatically, so set them once here.</p>
        <p className="muted small p-hint">Press and hold a project to be asked about taking it to the field. A solid colour means it is on this device, matched to the office within the last day, with nothing left to send. Hatched means it has not been matched in that time, or something written here has not reached the office yet. Hold it again to update it or remove it from this device.</p>
      </div>
    </section>
  )
}

/** "today at 2:05 PM", "yesterday", "3 weeks ago" — how long since a copy was matched. */
function ago(then: number, now: number): string {
  const mins = Math.round((now - then) / 60_000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins} minutes ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return hours === 1 ? 'an hour ago' : `${hours} hours ago`
  const days = Math.round(hours / 24)
  if (days < 14) return days === 1 ? 'yesterday' : `${days} days ago`
  return `${Math.round(days / 7)} weeks ago`
}

/** Create a project, or edit one when `project` is given. Everything here autofills the forms. */
function ProjectForm({ project, onCreated }: { project?: Project; onCreated: (p: Project) => void }) {
  const { firm } = useFirm()
  const [f, setF] = useState({
    number: project?.number ?? '', name: project?.name ?? '', owner: project?.owner_name ?? '',
    contractor: project?.contractor_name ?? '', address: project?.address ?? '',
  })
  const [loc, setLoc] = useState<Location>({ address: project?.address ?? '', lat: project?.latitude ?? null, lng: project?.longitude ?? null })
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
        contractor_name: f.contractor.trim() || null, address: loc.address.trim() || null, latitude: loc.lat, longitude: loc.lng,
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
      p_address: loc.address.trim() || null,
    })
    if (!error && loc.lat != null) {
      await db().from('projects').update({ latitude: loc.lat, longitude: loc.lng }).eq('id', (data as Project).id)
    }
    setBusy(false)
    if (error) setError(error.message.includes('duplicate') ? 'That project number already exists.' : error.message)
    else onCreated({ ...(data as Project), latitude: loc.lat, longitude: loc.lng })
  }

  return (
    <form className="card form" onSubmit={submit}>
      <label>Project no.<input required value={f.number} onChange={set('number')} placeholder="2025-014" /></label>
      <label>Name<input required value={f.name} onChange={set('name')} placeholder="Westrock Landing WMO" /></label>
      <label>Owner<input value={f.owner} onChange={set('owner')} /></label>
      <label>Contractor<input value={f.contractor} onChange={set('contractor')} /></label>
      <div className="wide stack-field">
        <span className="field-label">Location</span>
        <LocationPicker value={loc} onChange={setLoc} />
      </div>
      <div className="wide">
        <button className="primary" disabled={busy}>{busy ? 'Saving…' : project ? 'Save project' : 'Create project'}</button>
        {error && <div className="notice error">{error}</div>}
      </div>
    </form>
  )
}

const sizeOf = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${Math.round(n / 1e6)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`)
