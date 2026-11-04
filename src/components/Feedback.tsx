import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useFirm } from '../lib/firm'
import { useAuth } from '../lib/auth'
import {
  addFeedback, CLOSED, deleteFeedback, listFeedback, STATUS_LABELS, updateFeedback,
  type Feedback, type FeedbackKind, type FeedbackStatus,
} from '../lib/feedback'

const PAGE_NAMES: Record<string, string> = {
  '/': 'Projects', '/documents': 'Drawings', '/submittals': 'Submittals', '/ca-logs': 'Document creation',
  '/contracts': 'Contracts', '/settings': 'Settings', '/templates': 'Form templates',
}

/** A short form for a new request or issue. */
function NewItem({ firmId, onAdded, onCancel, page }: { firmId: string; onAdded: (f: Feedback) => void; onCancel?: () => void; page?: string }) {
  const [kind, setKind] = useState<FeedbackKind>('request')
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setBusy(true)
    setError(null)
    try {
      onAdded(await addFeedback(firmId, { kind, title, details, page }))
      setTitle('')
      setDetails('')
    } catch (err) { setError(err instanceof Error ? err.message : String(err)) } finally { setBusy(false) }
  }
  return (
    <form className="fb-new" onSubmit={submit}>
      <div className="fb-kind" role="radiogroup" aria-label="Type">
        {(['request', 'issue'] as FeedbackKind[]).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
            {k === 'request' ? 'Request' : 'Something’s wrong'}
          </button>
        ))}
      </div>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'request' ? 'What would help? e.g. “Meeting notes tab in Document creation”' : 'What went wrong? e.g. “Map won’t load on my phone”'} aria-label="Title" autoFocus />
      <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3}
        placeholder={kind === 'request' ? 'Details, examples, how it should work (optional)' : 'What you did, what you expected, what happened (optional)'} aria-label="Details" />
      {page && <span className="muted small">From: {page}</span>}
      <div className="fb-actions">
        <button className="primary-lite" disabled={busy || !title.trim()}>{busy ? 'Adding…' : 'Add'}</button>
        {onCancel && <button type="button" onClick={onCancel}>Cancel</button>}
      </div>
      {error && <div className="notice error">{error}</div>}
    </form>
  )
}

/** Settings → Requests & issues: the whole list, with status for admins. */
export function FeedbackList() {
  const { firm, isAdmin } = useFirm()
  const { session } = useAuth()
  const [items, setItems] = useState<Feedback[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [show, setShow] = useState<'open' | 'closed' | 'all'>('open')
  const [adding, setAdding] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  const load = useCallback(() => {
    if (firm) listFeedback(firm.id).then(setItems).catch((e) => setError(e.message))
  }, [firm])
  useEffect(() => { load() }, [load])
  useEffect(() => { window.addEventListener('cazen:feedback', load); return () => window.removeEventListener('cazen:feedback', load) }, [load])

  const visible = useMemo(() => (items ?? []).filter((f) => show === 'all' || (show === 'closed') === CLOSED.includes(f.status)), [items, show])
  const counts = useMemo(() => ({
    open: (items ?? []).filter((f) => !CLOSED.includes(f.status)).length,
    closed: (items ?? []).filter((f) => CLOSED.includes(f.status)).length,
  }), [items])
  if (!firm) return null

  const save = async (f: Feedback, patch: Partial<Feedback>) => {
    try {
      const u = await updateFeedback(f.id, patch)
      setItems((xs) => xs!.map((x) => (x.id === u.id ? u : x)))
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  return (
    <div className="card fb-card" id="requests">
      <div className="fb-head">
        <div>
          <h2>Requests &amp; issues</h2>
          <p className="muted small">Ideas for CAzen and things that aren’t working. Anyone can add one; admins set the status and reply. Claude works through this list too.</p>
        </div>
        {!adding && <button className="primary-lite" onClick={() => setAdding(true)}>New request or issue</button>}
      </div>
      {adding && <NewItem firmId={firm.id} onAdded={(f) => { setItems((xs) => [f, ...(xs ?? [])]); setAdding(false) }} onCancel={() => setAdding(false)} />}
      <div className="tabs fb-tabs" role="tablist">
        <button role="tab" aria-selected={show === 'open'} className={show === 'open' ? 'on' : ''} onClick={() => setShow('open')}>Open ({counts.open})</button>
        <button role="tab" aria-selected={show === 'closed'} className={show === 'closed' ? 'on' : ''} onClick={() => setShow('closed')}>Closed ({counts.closed})</button>
        <button role="tab" aria-selected={show === 'all'} className={show === 'all' ? 'on' : ''} onClick={() => setShow('all')}>All</button>
      </div>
      {error && <div className="notice error">{error}</div>}
      {!items ? <p className="muted small">Loading…</p> : visible.length === 0 ? <p className="muted small">Nothing here.</p> : (
        <ul className="fb-list">
          {visible.map((f) => {
            const mine = f.created_by === session?.user.id
            const canEdit = isAdmin || (mine && (f.status === 'new' || f.status === 'under_review'))
            const expanded = open === f.id
            return (
              <li key={f.id} className={`fb-item ${CLOSED.includes(f.status) ? 'closed' : ''}`}>
                <div className="fb-row">
                  <button className={`fb-check ${CLOSED.includes(f.status) ? 'done' : ''}`} aria-hidden="true" tabIndex={-1}>{f.status === 'complete' ? '✓' : CLOSED.includes(f.status) ? '–' : ''}</button>
                  <button className="fb-title" onClick={() => setOpen(expanded ? null : f.id)} aria-expanded={expanded}>
                    <span className={`fb-kind-tag ${f.kind}`}>{f.kind === 'request' ? 'Request' : 'Issue'}</span>
                    {f.title}
                  </button>
                  {isAdmin ? (
                    <select className={`fb-status s-${f.status}`} value={f.status} onChange={(e) => save(f, { status: e.target.value as FeedbackStatus })} aria-label={`Status of ${f.title}`}>
                      {(Object.keys(STATUS_LABELS) as FeedbackStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                    </select>
                  ) : <span className={`fb-status s-${f.status}`}>{STATUS_LABELS[f.status]}</span>}
                </div>
                {f.notes && !expanded && <p className="fb-note small">{f.notes}</p>}
                {expanded && (
                  <div className="fb-body">
                    {canEdit ? (
                      <>
                        <input defaultValue={f.title} aria-label="Title" onBlur={(e) => e.target.value.trim() && e.target.value !== f.title && save(f, { title: e.target.value.trim() })} />
                        <textarea defaultValue={f.details ?? ''} rows={4} aria-label="Details" placeholder="Details" onBlur={(e) => e.target.value !== (f.details ?? '') && save(f, { details: e.target.value || null })} />
                      </>
                    ) : f.details && <p className="small">{f.details}</p>}
                    {isAdmin ? (
                      <label className="small">Reply / notes
                        <textarea defaultValue={f.notes ?? ''} rows={2} placeholder="What was done, or why not" onBlur={(e) => e.target.value !== (f.notes ?? '') && save(f, { notes: e.target.value || null })} />
                      </label>
                    ) : f.notes && <p className="fb-note small">{f.notes}</p>}
                    <p className="muted small">
                      Added {new Date(f.created_at).toLocaleDateString()}{f.page ? ` from ${f.page}` : ''}{f.closed_at ? ` · closed ${new Date(f.closed_at).toLocaleDateString()}` : ''}
                      {isAdmin && <> · <button className="link danger-link" onClick={async () => { await deleteFeedback(f.id).catch((e) => setError(e.message)); setItems((xs) => xs!.filter((x) => x.id !== f.id)) }}>Delete</button></>}
                    </p>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** "Suggest or report" from anywhere: a small pop-over that records which page you were on. */
export function FeedbackButton() {
  const { firm } = useFirm()
  const loc = useLocation()
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(false)
  if (!firm) return null
  return (
    <div className="fb-quick">
      <button className="settings-link fb-quick-btn" onClick={() => { setOpen(!open); setDone(false) }}>Suggest or report</button>
      {open && (
        <div className="fb-pop" role="dialog" aria-label="Suggest or report">
          {done
            ? <p className="small">Added to <strong>Settings → Requests &amp; issues</strong>. Thanks. <button className="link" onClick={() => setOpen(false)}>Close</button></p>
            : <NewItem firmId={firm.id} page={PAGE_NAMES[loc.pathname] ?? loc.pathname} onAdded={() => { setDone(true); window.dispatchEvent(new Event('cazen:feedback')) }} onCancel={() => setOpen(false)} />}
        </div>
      )}
    </div>
  )
}
