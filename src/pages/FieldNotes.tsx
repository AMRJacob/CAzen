import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { PageTitle } from '../components/PageTitle'
import { NotePad } from '../components/NotePad'
import IssueForm from './IssueForm'
import { FORM_LABELS, usDate as usDateOf } from '../lib/templates/fields'
import { usDate } from '../lib/dates'
import { listRegister, type RegisterRow } from '../lib/issued'
import { listPads, newPad, removePad, setPad, type NotePad as Pad, type PadKind } from '../lib/pads'
import {
  editObservation, listObservations, listTypes, nameOf, onDay, punchList, STATUS_LABELS,
  type Observation, type ObservationStatus, type ObservationType,
} from '../lib/observations'
import { ObservationForm } from '../components/ObservationForm'
import { Photos } from '../components/Photos'
import { today } from '../lib/dates'
import type { Project } from '../lib/types'
import { openFile } from '../lib/files'
import { useProject } from '../lib/project'
import { message } from '../lib/errors'
import type { FormKind } from '../lib/templates/types'

/**
 * Field notes: what was seen and what was said.
 *
 * A field report and a set of meeting notes record the job as it stood on a day. Neither
 * changes the contract, so neither belongs in the change register — they were only written
 * from there because that is where the templates lived. Observations are the same kind of
 * thing at a smaller scale: one item seen on one visit, which may end up in a report, on a
 * punch list, or in neither.
 */

type Area = 'reports' | 'meetings' | 'observations'

const KIND: Record<'reports' | 'meetings', FormKind> = {
  reports: 'field_report',
  meetings: 'meeting_notes',
}

const HEADING: Record<Area, { title: string; lead: string }> = {
  reports: {
    title: 'Field reports',
    lead: 'What the site looked like on the day — written on your firm’s template, numbered and kept with the project.',
  },
  meetings: {
    title: 'Meeting notes',
    lead: 'What was said and who owes what, kept with the project rather than in somebody’s inbox.',
  },
  observations: {
    title: 'Observations',
    lead: 'One thing seen on one visit — the raw material a field report or a punch list is made of.',
  },
}

export default function FieldNotes() {
  const { area = 'reports' } = useParams<{ area: Area }>()
  const here = (['reports', 'meetings', 'observations'] as Area[]).includes(area as Area)
    ? (area as Area) : 'reports'
  return here === 'observations' ? <Observations /> : <Reports area={here} />
}

// ---------- Field reports and meeting notes ----------

function Reports({ area }: { area: 'reports' | 'meetings' }) {
  const kind = KIND[area]
  const { current } = useProject()
  const [writing, setWriting] = useState(false)
  const [rows, setRows] = useState<RegisterRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const projectId = current?.id
  const load = useCallback(() => {
    if (!projectId) return
    setRows(null)
    listRegister(projectId, [kind]).then(setRows).catch((e) => setError(message(e)))
  }, [projectId, kind])
  useEffect(() => { load() }, [load])

  // Leaving the form behind is the same gesture whichever kind it was.
  useEffect(() => { setWriting(false) }, [kind])

  const listed = useMemo(
    () => [...(rows ?? [])].sort((a, b) => b.issued_at.localeCompare(a.issued_at)),
    [rows])

  if (writing) {
    return (
      <section>
        <div className="page-head">
          <div>
            <PageTitle>New {FORM_LABELS[kind].toLowerCase()}</PageTitle>
            <p className="lead">On your firm’s template. It fills itself in, numbers itself and is kept with the project.</p>
          </div>
          <button onClick={() => { setWriting(false); load() }}>Back to the list</button>
        </div>
        <IssueForm key={kind} kind={kind} />
      </section>
    )
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <PageTitle>{HEADING[area].title}</PageTitle>
          <p className="lead">
            {current ? <>{current.number} {current.name} · </> : null}
            {HEADING[area].lead}
          </p>
        </div>
        <button className="primary" onClick={() => setWriting(true)}>
          New {FORM_LABELS[kind].toLowerCase()}
        </button>
      </div>

      {error && <div className="notice error">{error}</div>}

      <Pads kind={kind === 'meeting_notes' ? 'meeting_notes' : 'field_report'}
        projectId={projectId} onTrouble={setError} />

      <h2 className="field-notes-written">Written up</h2>
      {!rows ? <p className="muted">Loading…</p>
        : !listed.length ? <div className="card muted">Nothing written yet.</div> : (
          <table className="register">
            <thead>
              <tr><th>Number</th><th className="col-title">Subject</th><th className="col-date">Issued</th></tr>
            </thead>
            <tbody>
              {listed.map((r) => (
                <tr key={r.id} className={r.file_path ? 'opens' : undefined}
                  onClick={() => {
                    if (!r.file_path || !current) return
                    openFile(current, r.file_path).catch((err) => setError(message(err)))
                  }}>
                  <td className="mono">{r.number ?? '—'}</td>
                  <td className="col-title">{r.title ?? r.values?.[`${r.kind.split('_')[0]}.title`] ?? ''}</td>
                  <td className="col-date">{usDateOf(new Date(r.issued_at))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
    </section>
  )
}

// ---------- Pads ----------

/**
 * The pads for this kind of note.
 *
 * Opening one gives it the whole page, because handwriting wants room. Closing it comes back
 * here. A pad is not a draft of the document — it goes on existing after the document is
 * written, and the two are linked rather than merged.
 */
function Pads({ kind, projectId, onTrouble }: {
  kind: PadKind
  projectId: string | undefined
  onTrouble: (m: string) => void
}) {
  const [pads, setPads] = useState<Pad[] | null>(null)
  const [open, setOpen] = useState<Pad | null>(null)

  const load = useCallback(() => {
    if (!projectId) return
    listPads(projectId, kind).then(setPads).catch((e) => onTrouble(message(e)))
  }, [projectId, kind, onTrouble])
  useEffect(() => { load() }, [load])

  async function start() {
    if (!projectId) return
    try {
      const made = await newPad(projectId, kind, {})
      setPads((all) => [made, ...(all ?? [])])
      setOpen(made)
    } catch (e) { onTrouble(message(e)) }
  }

  async function discard(pad: Pad) {
    try {
      await removePad(pad.id)
      setPads((all) => (all ?? []).filter((p) => p.id !== pad.id))
    } catch (e) { onTrouble(message(e)) }
  }

  if (open) {
    return (
      <div className="card pad-card">
        <div className="pad-head">
          <input className="pad-title" value={open.title ?? ''} placeholder={untitled(kind)}
            aria-label="What these notes are about"
            onChange={(e) => setOpen({ ...open, title: e.target.value })}
            onBlur={(e) => {
              setPads((all) => (all ?? []).map((p) => (p.id === open.id ? { ...p, title: e.target.value } : p)))
              setPad(open.id, { title: e.target.value || null }).catch((err) => onTrouble(message(err)))
            }} />
          <input type="date" value={open.noted_on} aria-label="The day these notes are about"
            onChange={(e) => {
              const noted_on = e.target.value
              setOpen({ ...open, noted_on })
              setPads((all) => (all ?? []).map((p) => (p.id === open.id ? { ...p, noted_on } : p)))
              setPad(open.id, { noted_on }).catch((err) => onTrouble(message(err)))
            }} />
          <button onClick={() => { setOpen(null); load() }}>Done</button>
        </div>
        <NotePad pad={open} onChanged={(p) => {
          setOpen(p)
          setPads((all) => (all ?? []).map((x) => (x.id === p.id ? p : x)))
        }} onTrouble={onTrouble} />
      </div>
    )
  }

  return (
    <div className="card">
      <div className="pad-head">
        <h3>Handwritten</h3>
        <button className="primary-lite" onClick={() => void start()} disabled={!projectId}>New pad</button>
      </div>
      <p className="muted small">
        Write by hand in the room, and type it up afterwards from what you wrote. More than one
        person can write on the same pad at once.
      </p>
      {!pads ? <p className="muted small">Loading…</p>
        : !pads.length ? <p className="muted small">No pads yet.</p> : (
          <div className="pad-list">
            {pads.map((p) => (
              <div key={p.id} className="pad-row">
                <button className="link" onClick={() => setOpen(p)}>{p.title || untitled(kind)}</button>
                <span className="muted small nowrap">{usDate(p.noted_on)}</span>
                <span className="muted small nowrap">{p.pages} {p.pages === 1 ? 'page' : 'pages'}</span>
                <button className="link danger-link" onClick={() => void discard(p)}>Delete</button>
              </div>
            ))}
          </div>
        )}
    </div>
  )
}

const untitled = (kind: PadKind) => (kind === 'meeting_notes' ? 'Meeting notes' : 'Site visit')

// ---------- Observations ----------

function Observations() {
  const { current } = useProject()
  const [types, setTypes] = useState<ObservationType[]>([])
  const [all, setAll] = useState<Observation[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [writing, setWriting] = useState(false)
  const [editing, setEditing] = useState<Observation | null>(null)
  const [view, setView] = useState<'all' | 'day' | 'punch'>('all')
  const [day, setDay] = useState(today())

  const projectId = current?.id
  const load = useCallback(() => {
    if (!projectId) return
    listObservations(projectId).then(setAll).catch((e) => setError(message(e)))
  }, [projectId])
  useEffect(() => { load() }, [load])
  useEffect(() => { listTypes().then(setTypes).catch(() => setTypes([])) }, [])

  const shown = useMemo(() => {
    const list = all ?? []
    if (view === 'day') return onDay(list, day)
    if (view === 'punch') return punchList(list, types)
    return list
  }, [all, view, day, types])

  const days = useMemo(
    () => [...new Set((all ?? []).map((o) => o.observed_on))].sort().reverse(),
    [all])

  if (current && (writing || editing)) {
    return (
      <section>
        <div className="page-head">
          <div>
            <PageTitle>{editing ? 'Observation' : 'New observation'}</PageTitle>
            <p className="lead">{editing ? 'What was seen, and where it stands.' : HEADING.observations.lead}</p>
          </div>
        </div>
        {error && <div className="notice error">{error}</div>}
        <ObservationForm project={current} types={types} existing={editing ?? undefined}
          onSaved={() => { setWriting(false); setEditing(null); load() }}
          onCancel={() => { setWriting(false); setEditing(null) }}
          onTrouble={setError} />
      </section>
    )
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <PageTitle>{HEADING.observations.title}</PageTitle>
          <p className="lead">
            {current ? <>{current.number} {current.name} · </> : null}
            {HEADING.observations.lead}
          </p>
        </div>
        <button className="primary" disabled={!current} onClick={() => setWriting(true)}>New observation</button>
      </div>

      {error && <div className="notice error">{error}</div>}

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={view === 'all'} className={view === 'all' ? 'on' : ''}
          onClick={() => setView('all')}>Everything</button>
        <button role="tab" aria-selected={view === 'day'} className={view === 'day' ? 'on' : ''}
          onClick={() => setView('day')}>One visit</button>
        <button role="tab" aria-selected={view === 'punch'} className={view === 'punch' ? 'on' : ''}
          onClick={() => setView('punch')}>Punch list</button>
      </div>

      {view === 'day' && (
        <div className="set-actions">
          <label className="inline-field">Seen on
            <select value={day} onChange={(e) => setDay(e.target.value)}>
              {days.length ? days.map((d) => <option key={d} value={d}>{usDate(d)}</option>)
                : <option value={day}>{usDate(day)}</option>}
            </select>
          </label>
          <span className="muted small">
            {shown.length} {shown.length === 1 ? 'observation' : 'observations'} — what a field report of that day is made of.
          </span>
        </div>
      )}
      {view === 'punch' && (
        <p className="muted small">
          Everything still open that was raised under a type that belongs on a punch list. Nothing is
          copied here; closing one closes it everywhere.
        </p>
      )}

      {!all ? <p className="muted">Loading…</p>
        : !shown.length ? <div className="card muted">Nothing here yet.</div> : (
          <div className="obs-list">
            {shown.map((o) => (
              <ObservationRow key={o.id} o={o} types={types} project={current}
                onOpen={() => setEditing(o)}
                onStatus={async (status) => {
                  try {
                    const next = await editObservation(o, { status })
                    setAll((list) => (list ?? []).map((x) => (x.id === o.id ? next : x)))
                  } catch (e) { setError(message(e)) }
                }} />
            ))}
          </div>
        )}
    </section>
  )
}

function ObservationRow({ o, types, project, onOpen, onStatus }: {
  o: Observation
  types: ObservationType[]
  project: Project | null
  onOpen: () => void
  onStatus: (s: ObservationStatus) => void
}) {
  const type = types.find((t) => t.id === o.type_id)
  return (
    <div className={`obs-row obs-${o.status}`}>
      <div className="obs-row-main">
        <span className="mono obs-no">{nameOf(o, types)}</span>
        <button className="link obs-title" onClick={onOpen}>{o.title}</button>
        {type && <span className="tag">{type.name}</span>}
        {o.sheet_id && <span className="tag">on a sheet</span>}
      </div>
      <div className="obs-row-side">
        {o.area && <span className="muted small">{o.area}</span>}
        {o.trade && <span className="muted small">{o.trade}</span>}
        <span className="muted small nowrap">{usDate(o.observed_on)}</span>
        <select value={o.status} aria-label={`Status of ${o.title}`}
          onChange={(e) => onStatus(e.target.value as ObservationStatus)}>
          {(Object.keys(STATUS_LABELS) as ObservationStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>
      {o.photos.length > 0 && project && (
        <Photos project={project} paths={o.photos} about={o.title} editable={false}
          onChange={() => {}} onTrouble={() => {}} />
      )}
      {o.detail && <p className="muted small obs-detail">{o.detail}</p>}
    </div>
  )
}
