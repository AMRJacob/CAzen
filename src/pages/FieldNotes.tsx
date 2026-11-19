import { useCallback, useEffect, useMemo, useState } from 'react'
import { NavLink, useParams } from 'react-router-dom'
import { PageTitle } from '../components/PageTitle'
import { NotePad, PadPages, PadStill } from '../components/NotePad'
import IssueForm from './IssueForm'
import { FORM_LABELS, usDate as usDateOf } from '../lib/templates/fields'
import { usDate } from '../lib/dates'
import { listRegister, type RegisterRow } from '../lib/issued'
import { listMarks, listPads, newPad, removePad, setPad, type NotePad as Pad, type PadKind, type PadMark } from '../lib/pads'
import {
  asReport, editObservation, listObservations, listTypes, nameOf, onDay, photosOf, punchList,
  STATUS_LABELS, watchObservations,
  type Observation, type ObservationStatus, type ObservationType,
} from '../lib/observations'
import { ObservationForm } from '../components/ObservationForm'
import { Notebook, Shelf } from '../components/Notebook'
import { listVisits, type SiteVisit, type VisitKind } from '../lib/visits'
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
  const { area } = useParams<{ area: Area }>()
  if (!area) return <Books />
  if (area === 'observations') return <Observations />
  return <Book area={area === 'meetings' ? 'meetings' : 'reports'} />
}

/** The way in: the two books on a shelf, and the list of everything observed. */
function Books() {
  const { current } = useProject()
  return (
    <section>
      <PageTitle>Notebooks</PageTitle>
      <p className="lead">
        {current ? <>{current.number} {current.name} · </> : null}
        Open a book and turn to today’s page.
      </p>
      <Shelf project={current} />
    </section>
  )
}

/**
 * A book, open. On a database that hasn't the pages table yet (migration 0033) there is no book
 * to open, and the list of reports that was here before is shown in its place.
 */
function Book({ area }: { area: 'reports' | 'meetings' }) {
  const { current } = useProject()
  const kind: VisitKind = area === 'meetings' ? 'meeting' : 'visit'
  const [pages, setPages] = useState<SiteVisit[] | null | false>(null)
  const projectId = current?.id
  useEffect(() => {
    if (!projectId) { setPages(false); return }
    setPages(null)
    listVisits(projectId, kind).then(setPages).catch(() => setPages(false))
  }, [projectId, kind])

  if (pages === null) return <p className="muted page-wait">Opening the book…</p>
  if (!pages || !current) return <Reports area={area} />
  return <Notebook key={`${current.id}-${kind}`} project={current} kind={kind} pages={pages} onPages={setPages} />
}

/**
 * The three parts of field notes, side by side. A desk has them in the sidebar; a phone has no
 * sidebar, and without this two of the three could not be reached from one at all.
 */
function AreaSwitch({ here }: { here: Area }) {
  const parts: [Area, string][] = [['observations', 'Observations'], ['reports', 'Field reports'], ['meetings', 'Meeting notes']]
  return (
    <nav className="area-switch" aria-label="Field notes">
      {parts.map(([to, label]) => (
        <NavLink key={to} to={`/field-notes/${to}`} className={to === here ? 'on' : ''}>{label}</NavLink>
      ))}
    </nav>
  )
}

// ---------- Field reports and meeting notes ----------

function Reports({ area }: { area: 'reports' | 'meetings' }) {
  const kind = KIND[area]
  const { current } = useProject()
  const [writing, setWriting] = useState(false)
  /** The pad this document is being written from, kept open beside the form. */
  const [from, setFrom] = useState<Pad | null>(null)
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
          <button onClick={() => { setWriting(false); setFrom(null); load() }}>Back to the list</button>
        </div>
        {/* The pad it is being written from, kept open beside the form: typing it up means
            reading what was written in the room, and closing the pad to type is the one thing
            that makes people not bother. */}
        {from && (
          <div className="card">
            <div className="pad-head">
              <h3>{from.title || (kind === 'meeting_notes' ? 'Meeting notes' : 'Site visit')}</h3>
              <span className="muted small">{usDate(from.noted_on)}</span>
              <button className="link" onClick={() => setFrom(null)}>Put it away</button>
            </div>
            <PadPages pad={from} onTrouble={setError} />
          </div>
        )}
        <IssueForm key={kind} kind={kind} />
      </section>
    )
  }

  return (
    <section>
      <AreaSwitch here={area} />
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
        projectId={projectId} onTrouble={setError}
        onWriteUp={(pad) => { setFrom(pad); setWriting(true) }} />

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
function Pads({ kind, projectId, onTrouble, onWriteUp, attached }: {
  /** Pads that belong to a visit and are reached from it. With this given, the card shows only
      the loose ones, and nothing at all when there are none. */
  attached?: Set<string>
  kind: PadKind
  projectId: string | undefined
  onTrouble: (m: string) => void
  /** Open the document form with this pad beside it. */
  onWriteUp?: (pad: Pad) => void
}) {
  const [pads, setPads] = useState<Pad[] | null>(null)
  const [open, setOpen] = useState<Pad | null>(null)
  /** The pad just closed, marked in the list for a moment so it is obvious where it went. */
  const [justClosed, setJustClosed] = useState<string | null>(null)

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
      <NotePad pad={open}
        onChanged={(p) => {
          setOpen(p)
          setPads((all) => (all ?? []).map((x) => (x.id === p.id ? p : x)))
        }}
        onClose={() => { setJustClosed(open.id); setOpen(null); load() }}
        onTrouble={onTrouble} />
    )
  }

  const loose = attached ? (pads ?? []).filter((p) => !attached.has(p.id)) : pads
  if (attached && (!pads || !loose?.length)) return null

  return (
    <div className="card">
      <div className="pad-head">
        <h3>{attached ? 'Pads not part of a visit' : 'Handwritten'}</h3>
        {!attached && <button className="primary-lite" onClick={() => void start()} disabled={!projectId}>New pad</button>}
      </div>
      <p className="muted small">
        Write by hand in the room, and type it up afterwards from what you wrote. Pads live here —
        this is where one you have closed will be waiting. More than one person can write on the
        same pad at once.
      </p>
      {!pads ? <p className="muted small">Loading…</p>
        : !pads.length ? <p className="muted small">No pads yet.</p> : (
          <div className="pad-grid">
            {(loose ?? pads).map((p) => (
              <PadCard key={p.id} pad={p} kind={kind} fresh={justClosed === p.id}
                onOpen={() => setOpen(p)}
                onWriteUp={onWriteUp ? () => onWriteUp(p) : undefined}
                onDiscard={() => void discard(p)}
                onRename={(title) => {
                  setPads((all) => (all ?? []).map((x) => (x.id === p.id ? { ...x, title } : x)))
                  setPad(p.id, { title: title || null }).catch((err) => onTrouble(message(err)))
                }} />
            ))}
          </div>
        )}
    </div>
  )
}

/**
 * One pad in the list, showing the first page of what is actually on it.
 *
 * Pads look alike in a list of titles and dates, and most of them never get titled. A glance
 * at your own handwriting is how you find the one you mean — and seeing it here is also the
 * answer to where a pad goes when you close it.
 */
function PadCard({ pad, kind, fresh, onOpen, onWriteUp, onDiscard, onRename }: {
  pad: Pad
  kind: PadKind
  fresh: boolean
  onOpen: () => void
  onWriteUp?: () => void
  onDiscard: () => void
  onRename: (title: string) => void
}) {
  const [marks, setMarks] = useState<PadMark[] | null>(null)

  useEffect(() => {
    let gone = false
    listMarks(pad.id)
      .then((m) => { if (!gone) setMarks(m.filter((x) => x.page === 1)) })
      .catch(() => { if (!gone) setMarks([]) })
    return () => { gone = true }
  }, [pad.id, pad.pages])

  return (
    <div className={`pad-card-item${fresh ? ' fresh' : ''}`}>
      <button className="pad-thumb" onClick={onOpen} aria-label={`Open ${pad.title || untitled(kind)}`}>
        <PadStill marks={marks ?? []} rule={pad.rule} ink={pad.rule_ink ?? 40} />
        {marks && !marks.length && <span className="pad-thumb-empty muted small">Nothing written yet</span>}
      </button>
      <input className="pad-card-title" defaultValue={pad.title ?? ''} placeholder={untitled(kind)}
        aria-label="What these notes are about"
        onBlur={(e) => { if (e.target.value !== (pad.title ?? '')) onRename(e.target.value) }} />
      <div className="pad-card-foot">
        <span className="muted small nowrap">{usDate(pad.noted_on)}</span>
        <span className="muted small nowrap">{pad.pages} {pad.pages === 1 ? 'page' : 'pages'}</span>
      </div>
      <div className="pad-card-actions">
        {onWriteUp && <button className="link" onClick={onWriteUp}>Type it up</button>}
        <button className="link danger-link" onClick={onDiscard}>Delete</button>
      </div>
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
  /** The day whose observations are being written up, while that is happening. */
  const [reporting, setReporting] = useState<string | null>(null)

  const projectId = current?.id
  const load = useCallback(() => {
    if (!projectId) return
    listObservations(projectId).then(setAll).catch((e) => setError(message(e)))
  }, [projectId])
  useEffect(() => { load() }, [load])
  useEffect(() => { listTypes().then(setTypes).catch(() => setTypes([])) }, [])

  // Two people walking the same building, neither writing down what the other already has.
  useEffect(() => {
    if (!projectId) return
    try {
      return watchObservations(projectId, {
        added: (o) => setAll((list) => ((list ?? []).some((x) => x.id === o.id) ? list : [o, ...(list ?? [])])),
        changed: (o) => setAll((list) => (list ?? []).map((x) => (x.id === o.id ? { ...x, ...o } : x))),
        removed: (id) => setAll((list) => (list ?? []).filter((x) => x.id !== id)),
      })
    } catch { return }
  }, [projectId])

  const shown = useMemo(() => {
    const list = all ?? []
    if (view === 'day') return onDay(list, day)
    if (view === 'punch') return punchList(list, types)
    return list
  }, [all, view, day, types])

  const days = useMemo(
    () => [...new Set((all ?? []).map((o) => o.observed_on))].sort().reverse(),
    [all])

  if (reporting) {
    const items = onDay(all ?? [], reporting)
    return (
      <section>
        <div className="page-head">
          <div>
            <PageTitle>Field report</PageTitle>
            <p className="lead">
              Written from the {items.length} {items.length === 1 ? 'observation' : 'observations'} of{' '}
              {usDate(reporting)}. Edit it as you like — the observations themselves are untouched.
            </p>
          </div>
          <button onClick={() => setReporting(null)}>Back to the observations</button>
        </div>
        <IssueForm key={reporting} kind="field_report" prefill={{
          'fr.date': usDateOf(new Date(`${reporting}T12:00:00`)),
          'fr.observations': asReport(items, types),
        }} />
        {photosOf(items).length > 0 && current && (
          <div className="card">
            <h3>The photographs from that day</h3>
            <p className="muted small">
              {photosOf(items).length} taken with the observations above. They are in the project's
              files under Field Reports.
            </p>
            <Photos project={current} paths={photosOf(items)} about="Field report"
              editable={false} onChange={() => {}} onTrouble={setError} />
          </div>
        )}
      </section>
    )
  }

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
        <ObservationForm project={current} types={types} existing={editing ?? undefined} known={all}
          onSaved={(o, another) => {
            if (another) { setAll((list) => [o, ...(list ?? []).filter((x) => x.id !== o.id)]); return }
            setWriting(false); setEditing(null); load()
          }}
          onCancel={() => { setWriting(false); setEditing(null); load() }}
          onTrouble={setError} />
      </section>
    )
  }

  return (
    <section>
      <AreaSwitch here="observations" />
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
          {shown.length > 0 && (
            <button className="primary-lite" onClick={() => setReporting(day)}>
              Write the field report
            </button>
          )}
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
