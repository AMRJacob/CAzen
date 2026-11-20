import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageTitle } from '../components/PageTitle'
import IssueForm from './IssueForm'
import { useProject } from '../lib/project'
import { isConfigured, db } from '../lib/supabase'
import { message } from '../lib/errors'
import { today } from '../lib/dates'
import { divisionFor, nextInSection, normaliseSection } from '../lib/csi'
import { SUBMITTAL_ACTIONS } from '../lib/templates/fields'
import { listIssued, logSubmittal, openIssued, removeLoggedSubmittal, setSubmittalValues, type IssuedForm } from '../lib/issued'
import { REVIEW_DAYS, STANDING_WORD, register, resubmittalNumber, totals, usDay, type Row } from '../lib/submittalLog'

/**
 * Submittals: the register, and the review that sends one back.
 *
 * A submittal is logged the day it comes in, sent to a consultant and brought back if it needs
 * one, and returned with the firm's transmittal on top. The register is where each one stands
 * and for how long; nothing is typed twice, because the dates logged here are the dates the
 * transmittal prints.
 */
export default function Submittals() {
  const { current } = useProject()
  const [entries, setEntries] = useState<IssuedForm[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [show, setShow] = useState<'open' | 'resubmit' | 'all'>('open')
  const [find, setFind] = useState('')
  const [logging, setLogging] = useState<Record<string, string> | null>(null)
  const [routing, setRouting] = useState<string | null>(null)
  const [writing, setWriting] = useState<{ prefill?: Record<string, string>; logId?: string } | null>(null)
  const [specs, setSpecs] = useState<{ number: string; title: string | null }[]>([])

  const projectId = current?.id
  const load = useCallback(() => {
    if (!projectId || !isConfigured) { setEntries([]); return }
    listIssued(projectId, 'submittal_cover').then(setEntries).catch((e) => setError(message(e)))
  }, [projectId])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!projectId || !isConfigured) return
    db().from('spec_sections').select('number, title').eq('project_id', projectId).order('number')
      .then(({ data }) => setSpecs((data ?? []) as { number: string; title: string | null }[]))
  }, [projectId])

  const rows = useMemo(() => register(entries ?? [], today()), [entries])
  const sum = totals(rows)
  const consultants = useMemo(() => [...new Set(rows.map((r) => r.consultant).filter(Boolean))], [rows])
  const words = find.trim().toLowerCase()
  const listed = rows.filter((r) =>
    (show === 'all' || (show === 'open' ? r.standing !== 'returned' : r.awaitingResubmittal)) &&
    (!words || [r.number, r.title, r.values['sub.subcontractor'], r.consultant].some((t) => (t ?? '').toLowerCase().includes(words))))

  const trouble = (e: unknown) => setError(message(e))
  const patch = async (row: Row, values: Record<string, string>) => {
    try {
      const next = await setSubmittalValues(row, values)
      setEntries((es) => (es ?? []).map((e) => (e.id === row.id ? { ...e, values: next } : e)))
    } catch (e) { trouble(e) }
  }

  if (!current) {
    return (
      <section>
        <PageTitle>Submittals</PageTitle>
        {isConfigured
          ? <div className="card muted">Choose a project first, on the <Link to="/">Projects</Link> page.</div>
          : <IssueForm kind="submittal_cover" />}
      </section>
    )
  }

  if (writing) {
    return (
      <section>
        <div className="page-head">
          <div>
            <PageTitle>Review and return</PageTitle>
            <p className="lead">Fill in the review, attach the contractor’s PDF, and download the returned package with your transmittal on top.</p>
          </div>
          <button onClick={() => { setWriting(null); load() }}>Back to the register</button>
        </div>
        <IssueForm key={writing.logId ?? 'new'} kind="submittal_cover" prefill={writing.prefill} onIssued={() => {
          // The returned package is the record from here on; the entry that said it was out goes.
          const done = writing.logId ? removeLoggedSubmittal(writing.logId).catch(trouble) : Promise.resolve()
          void done.then(() => { setWriting(null); load() })
        }} />
      </section>
    )
  }

  const startLog = (from?: Row) => setLogging(from
    ? { 'sub.number': resubmittalNumber(from, rows), 'sub.title': from.title ?? '', 'sub.subcontractor': from.values['sub.subcontractor'] ?? '',
        'sub.consultant': from.consultant, 'sub.received': today(), 'sub.resubmits': from.id }
    : { 'sub.number': '', 'sub.title': '', 'sub.subcontractor': '', 'sub.consultant': '', 'sub.received': today() })

  async function keepLog() {
    if (!logging || !current) return
    const number = logging['sub.number'].trim()
    if (!number || !logging['sub.title'].trim()) return
    try {
      const values: Record<string, string> = { ...logging, 'sub.number': number, 'sub.received': usDay(logging['sub.received']), 'sub.division': divisionFor(number) }
      for (const k of Object.keys(values)) if (!values[k]) delete values[k]
      const row = await logSubmittal(current.id, values)
      setEntries((es) => [row, ...(es ?? [])]); setLogging(null); setShow('open')
    } catch (e) { trouble(e) }
  }
  /** A section typed into the number box becomes that section's next number. */
  const numberTyped = (v: string) => {
    const sec = /^\D*\d[\d\s.]*$/.test(v) ? normaliseSection(v) : null
    setLogging((l) => l && { ...l, 'sub.number': v, ...(sec && v.replace(/\D/g, '').length >= 6 && !v.includes('-') ? { 'sub.number': nextInSection(sec, rows.map((r) => r.number ?? '')) } : {}) })
  }
  const actionWord = (a: string) => SUBMITTAL_ACTIONS.find((x) => x.value === a)?.label ?? a

  return (
    <section className="subs">
      <div className="page-head">
        <div>
          <PageTitle>Submittals</PageTitle>
          <p className="lead">{current.number} {current.name} · {sum.all} {sum.all === 1 ? 'submittal' : 'submittals'}</p>
        </div>
        <div className="subs-head-do">
          <button className="primary" onClick={() => startLog()}>Log a submittal</button>
          <button onClick={() => setWriting({})}>Review and return</button>
        </div>
      </div>
      {error && <div className="notice error" onClick={() => setError(null)}>{error}</div>}

      <div className="subs-totals">
        <div><strong>{sum.open}</strong><span>out for review</span></div>
        <div><strong>{sum.withConsultant}</strong><span>with a consultant</span></div>
        <div className={sum.late ? 'warn' : ''}><strong>{sum.late}</strong><span>out more than {REVIEW_DAYS} days</span></div>
        <div><strong>{sum.awaitingResubmittal}</strong><span>waiting on a resubmittal</span></div>
      </div>

      {logging && (
        <div className="card subs-log">
          <h3>{logging['sub.resubmits'] ? 'Log a resubmittal' : 'Log a submittal received'}</h3>
          <div className="form four">
            <label>Submittal no.
              <input value={logging['sub.number']} onChange={(e) => numberTyped(e.target.value)} list="subs-sections" autoFocus={!logging['sub.resubmits']} placeholder="Type a section, e.g. 09 30 00" />
              <datalist id="subs-sections">{specs.map((s) => <option key={s.number} value={nextInSection(s.number, rows.map((r) => r.number ?? ''))}>{s.title ?? ''}</option>)}</datalist>
            </label>
            <label className="wide-2">Submittal name
              <input value={logging['sub.title']} onChange={(e) => setLogging({ ...logging, 'sub.title': e.target.value })} placeholder="Tile — product data" />
            </label>
            <label>Received
              <input type="date" value={logging['sub.received']} onChange={(e) => setLogging({ ...logging, 'sub.received': e.target.value })} />
            </label>
            <label className="wide-2">Subcontractor
              <input value={logging['sub.subcontractor']} onChange={(e) => setLogging({ ...logging, 'sub.subcontractor': e.target.value })} />
            </label>
          </div>
          <div className="actions">
            <button className="primary" disabled={!logging['sub.number'].trim() || !logging['sub.title'].trim()} onClick={() => void keepLog()}>Add to the register</button>
            <button className="link" onClick={() => setLogging(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="subs-tools">
        <div className="tabs">
          {([['open', `Out for review (${sum.open})`], ['resubmit', `Waiting on a resubmittal (${sum.awaitingResubmittal})`], ['all', `All (${sum.all})`]] as const).map(([k, label]) => (
            <button key={k} className={show === k ? 'on' : ''} onClick={() => setShow(k)}>{label}</button>
          ))}
        </div>
        <input className="subs-find" type="search" placeholder="Number, name, subcontractor" value={find} onChange={(e) => setFind(e.target.value)} />
      </div>

      {entries === null ? <p className="muted">Loading…</p> : listed.length === 0 ? (
        <div className="card muted">
          {rows.length === 0 ? 'No submittals on this project yet. Log one the day it comes in, or go straight to Review and return.'
            : show === 'open' ? 'Nothing is out for review.' : show === 'resubmit' ? 'Nothing is waiting on a resubmittal.' : 'Nothing matches.'}
        </div>
      ) : (
        <div className="subs-table">
          <table>
            <thead><tr><th>No.</th><th>Submittal</th><th>Received</th><th>Where it is</th><th className="right">Days</th><th>Returned</th><th /></tr></thead>
            <tbody>
              {listed.map((r) => (
                <tr key={r.id} className={`${r.round ? 'subs-again ' : ''}${r.late ? 'subs-late' : ''}`}>
                  <td className="nowrap">{r.round ? <span className="subs-turn" aria-hidden="true">↳ </span> : null}{r.number ?? '—'}</td>
                  <td><div>{r.title ?? '—'}</div>{r.values['sub.subcontractor'] && <div className="muted small">{r.values['sub.subcontractor']}</div>}</td>
                  <td className="nowrap">{usDay(r.received) || '—'}</td>
                  <td>
                    {r.standing === 'returned'
                      ? <><span className={`subs-tag act-${r.action || 'none'}`}>{actionWord(r.action) || 'Returned'}</span>{r.awaitingResubmittal && <div className="muted small">resubmittal not in yet</div>}</>
                      : <span className={`subs-tag st-${r.standing}`}>{STANDING_WORD[r.standing]}</span>}
                    {(r.consultant || r.forwarded) && (
                      <div className="muted small">{r.consultant || 'Consultant'}{r.forwarded ? ` · sent ${usDay(r.forwarded)}` : ''}{r.back ? ` · back ${usDay(r.back)}` : ''}</div>
                    )}
                    {routing === r.id && <Route row={r} consultants={consultants} onKeep={(v) => { void patch(r, v); setRouting(null) }} onCancel={() => setRouting(null)} />}
                  </td>
                  <td className="right nowrap">{r.days == null ? '—' : r.days}{r.late && <span className="subs-over"> late</span>}</td>
                  <td className="nowrap">{usDay(r.returned) || '—'}</td>
                  <td className="right subs-do">
                    {r.standing === 'returned' ? (
                      <>
                        {r.file_path && <button onClick={() => openIssued(current, r.file_path!).catch(trouble)}>Open</button>}
                        {r.awaitingResubmittal && <button className="link" onClick={() => startLog(r)}>Log the resubmittal</button>}
                      </>
                    ) : (
                      <>
                        {r.standing === 'received' && <button className="link" onClick={() => setRouting(r.id)}>Send to a consultant</button>}
                        {r.standing === 'with_consultant' && <button className="link" onClick={() => void patch(r, { 'sub.from_consultant': usDay(today()) })}>Back from consultant</button>}
                        <button className="primary-lite" onClick={() => setWriting({ logId: r.id, prefill: { ...r.values, 'sub.returned': usDay(today()) } })}>Review and return</button>
                        <button className="link subs-remove" onClick={() => { if (window.confirm(`Take ${r.number ?? 'this submittal'} off the register?`)) removeLoggedSubmittal(r.id).then(load).catch(trouble) }}>Remove</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

/** Who a submittal is going to, and the day it went. */
function Route({ row, consultants, onKeep, onCancel }: {
  row: Row; consultants: string[]; onKeep: (v: Record<string, string>) => void; onCancel: () => void
}) {
  const [who, setWho] = useState(row.consultant)
  const [day, setDay] = useState(today())
  return (
    <div className="subs-route">
      <input value={who} onChange={(e) => setWho(e.target.value)} placeholder="Structural engineer" list="subs-consultants" autoFocus
        onKeyDown={(e) => { if (e.key === 'Enter' && who.trim()) onKeep({ 'sub.consultant': who.trim(), 'sub.to_consultant': usDay(day) }); if (e.key === 'Escape') onCancel() }} />
      <datalist id="subs-consultants">{consultants.map((c) => <option key={c} value={c} />)}</datalist>
      <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
      <button className="primary-lite" disabled={!who.trim()} onClick={() => onKeep({ 'sub.consultant': who.trim(), 'sub.to_consultant': usDay(day) })}>Sent</button>
      <button className="link" onClick={onCancel}>Cancel</button>
    </div>
  )
}
