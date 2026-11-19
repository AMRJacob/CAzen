import { useCallback, useEffect, useRef, useState } from 'react'
import { NotePad, PadStill } from './NotePad'
import { Photos } from './Photos'
import { ObservationForm } from './ObservationForm'
import { OutlineTools } from './OutlineTools'
import IssueForm from '../pages/IssueForm'
import { usDate as usDateOf } from '../lib/templates/fields'
import { getPad, listMarks, newPad, type NotePad as Pad, type PadMark } from '../lib/pads'
import {
  asReport, listObservations, listTypes, nameOf, onDay, photosOf,
  type Observation, type ObservationType,
} from '../lib/observations'
import { photoUrl } from '../lib/photos'
import { clockTime, coverOf, longDay, shortDay, removeVisit, setVisit, type SiteVisit } from '../lib/visits'
import { message } from '../lib/errors'
import type { Project } from '../lib/types'

/** A photograph filling whatever box it is put in. */
function Cover({ project, path }: { project: Project; path: string | null }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!path) { setUrl(null); return }
    let made: string | null = null, gone = false
    photoUrl(project, path).then((u) => { if (gone) URL.revokeObjectURL(u); else { made = u; setUrl(u) } }).catch(() => {})
    return () => { gone = true; if (made) URL.revokeObjectURL(made) }
  }, [project, path])
  return url ? <img src={url} alt="" /> : <span className="visit-cover-none" aria-hidden="true" />
}

// ---------- The list: one page a visit ----------

/**
 * Every visit to the job, newest first, each as a page: its cover photograph, the day and the
 * time, and how much came back from it.
 */
export function VisitList({ project, visits, observations, onOpen }: {
  project: Project
  visits: SiteVisit[]
  observations: Observation[]
  onOpen: (v: SiteVisit) => void
}) {
  if (!visits.length) {
    return <div className="card muted">No visits yet. A new field report starts one: a pad, notes, photographs and observations, all on one page.</div>
  }
  return (
    <div className="visit-grid">
      {visits.map((v) => {
        const seen = onDay(observations, v.visited_on)
        const photos = v.photos.length + photosOf(seen).length
        return (
          <button key={v.id} className="visit-card" onClick={() => onOpen(v)}>
            <span className="visit-cover"><Cover project={project} path={coverOf(v, photosOf(seen))} /></span>
            <span className="visit-when">
              <span className="visit-day">{shortDay(v.visited_on)}</span>
              {v.visited_at && <span className="visit-time">{clockTime(v.visited_at)}</span>}
            </span>
            {v.title && <span className="visit-title">{v.title}</span>}
            <span className="visit-counts muted small">
              {[
                photos ? `${photos} ${photos === 1 ? 'photo' : 'photos'}` : '',
                seen.length ? `${seen.length} ${seen.length === 1 ? 'observation' : 'observations'}` : '',
                v.pad_id ? 'sketch' : '',
              ].filter(Boolean).join(' · ') || 'Nothing recorded yet'}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ---------- One visit ----------

type Zone = 'sketch' | 'notes' | 'photos' | 'seen'
const ZONES: [Zone, string][] = [['sketch', 'Sketch'], ['notes', 'Notes'], ['photos', 'Photos'], ['seen', 'Observations']]

/**
 * A visit, as one page in four parts: something to draw on, somewhere to type, the photographs,
 * and what was observed. Wide enough, all four are on screen at once; on a phone they are one at
 * a time behind a row of four, because a quarter of a phone is no use for any of them.
 */
export function VisitPage({ project, visit, onChanged, onClose, onRemoved }: {
  project: Project
  visit: SiteVisit
  onChanged: (v: SiteVisit) => void
  onClose: () => void
  onRemoved: () => void
}) {
  const [zone, setZone] = useState<Zone>('seen')
  const [error, setError] = useState<string | null>(null)
  const [pad, setPadRow] = useState<Pad | null>(null)
  const [marks, setMarks] = useState<PadMark[]>([])
  const [drawing, setDrawing] = useState(false)
  const [notes, setNotes] = useState(visit.notes ?? '')
  const [all, setAll] = useState<Observation[] | null>(null)
  const [types, setTypes] = useState<ObservationType[]>([])
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Observation | null>(null)
  const [writing, setWriting] = useState(false)
  const notesBox = useRef<HTMLTextAreaElement | null>(null)

  const change = useCallback((patch: Partial<SiteVisit>) => {
    onChanged({ ...visit, ...patch })
    setVisit(visit.id, patch).catch((e) => setError(message(e)))
  }, [visit, onChanged])

  const loadSeen = useCallback(() => {
    listObservations(project.id).then(setAll).catch((e) => setError(message(e)))
  }, [project.id])
  useEffect(() => { loadSeen() }, [loadSeen])
  useEffect(() => { listTypes().then(setTypes).catch(() => setTypes([])) }, [])

  const padId = visit.pad_id
  useEffect(() => {
    if (!padId || drawing) return
    let gone = false
    getPad(padId).then((p) => { if (!gone) setPadRow(p) }).catch(() => {})
    listMarks(padId).then((m) => { if (!gone) setMarks(m.filter((x) => x.page === 1)) }).catch(() => {})
    return () => { gone = true }
  }, [padId, drawing])

  async function draw() {
    try {
      let p = pad
      if (!p) {
        p = await newPad(project.id, 'field_report', { noted_on: visit.visited_on, title: visit.title })
        setPadRow(p)
        change({ pad_id: p.id })
      }
      setDrawing(true)
    } catch (e) { setError(message(e)) }
  }

  const seen = onDay(all ?? [], visit.visited_on)
  const seenPhotos = photosOf(seen)
  const cover = coverOf(visit, seenPhotos)

  if (drawing && pad) {
    return <NotePad pad={pad} onChanged={setPadRow} onClose={() => setDrawing(false)} onTrouble={setError} />
  }

  if (writing) {
    return (
      <section>
        <div className="page-head">
          <div>
            <h1>Field report</h1>
            <p className="lead">Written from the visit of {longDay(visit.visited_on)}. Edit it as you like — the visit itself is untouched.</p>
          </div>
          <button onClick={() => setWriting(false)}>Back to the visit</button>
        </div>
        <IssueForm key={visit.id} kind="field_report" prefill={{
          'fr.date': usDateOf(new Date(`${visit.visited_on}T12:00:00`)),
          ...(visit.visited_at ? { 'fr.time': clockTime(visit.visited_at) } : {}),
          ...(visit.weather ? { 'fr.weather': visit.weather } : {}),
          ...(seen.length ? { 'fr.observations': asReport(seen, types) } : {}),
          ...(notes.trim() ? { 'fr.notes': notes } : {}),
        }} />
      </section>
    )
  }

  return (
    <section className="visit">
      <header className="visit-head">
        <div className="visit-head-cover"><Cover project={project} path={cover} /></div>
        <div className="visit-head-text">
          <button className="link visit-back" onClick={onClose}>← All visits</button>
          <h1>{longDay(visit.visited_on)}</h1>
          <div className="visit-head-fields">
            <input type="date" value={visit.visited_on} aria-label="Day of the visit"
              onChange={(e) => { if (e.target.value) change({ visited_on: e.target.value }) }} />
            <input type="time" value={(visit.visited_at ?? '').slice(0, 5)} aria-label="Time on site"
              onChange={(e) => change({ visited_at: e.target.value ? `${e.target.value}:00` : null })} />
            <input className="visit-title-box" defaultValue={visit.title ?? ''} placeholder="What the visit was for"
              aria-label="What the visit was for"
              onBlur={(e) => { if (e.target.value !== (visit.title ?? '')) change({ title: e.target.value.trim() || null }) }} />
            <input className="visit-weather" defaultValue={visit.weather ?? ''} placeholder="Weather" aria-label="Weather"
              onBlur={(e) => { if (e.target.value !== (visit.weather ?? '')) change({ weather: e.target.value.trim() || null }) }} />
          </div>
          <div className="actions">
            <button className="primary" onClick={() => setWriting(true)}>Write the field report</button>
            <button className="link danger-link" onClick={() => {
              if (!window.confirm('Remove this visit? Its pad, photographs and observations are kept.')) return
              removeVisit(visit.id).then(onRemoved).catch((e) => setError(message(e)))
            }}>Remove visit</button>
          </div>
        </div>
      </header>

      {error && <div className="notice error">{error}</div>}

      <nav className="visit-zones" aria-label="Parts of the visit">
        {ZONES.map(([z, label]) => (
          <button key={z} className={zone === z ? 'on' : ''} onClick={() => setZone(z)}>
            {label}{z === 'seen' && seen.length ? ` ${seen.length}` : ''}{z === 'photos' && visit.photos.length ? ` ${visit.photos.length}` : ''}
          </button>
        ))}
      </nav>

      <div className="visit-quad" data-zone={zone}>
        <div className="card visit-zone" data-z="sketch">
          <div className="pad-head"><h3>Sketch</h3><button className="primary-lite" onClick={() => void draw()}>{pad ? 'Open the pad' : 'Start a pad'}</button></div>
          <button className="pad-thumb visit-pad" onClick={() => void draw()} aria-label="Open the pad">
            <PadStill marks={marks} rule={pad?.rule ?? 'lines'} ink={pad?.rule_ink ?? 40} />
            {!marks.length && <span className="pad-thumb-empty muted small">Draw or write by hand</span>}
          </button>
        </div>

        <div className="card visit-zone" data-z="notes">
          <div className="pad-head"><h3>Notes</h3></div>
          <OutlineTools textarea={notesBox} value={notes} onChange={setNotes} />
          <textarea ref={notesBox} className="mono-ish visit-notes" value={notes}
            aria-label="Typed notes"
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => { if (notes !== (visit.notes ?? '')) change({ notes }) }} />
        </div>

        <div className="card visit-zone" data-z="photos">
          <div className="pad-head"><h3>Site photos</h3></div>
          <Photos project={project} paths={visit.photos} about={visit.title || 'Site visit'} editable
            cover={cover} onCover={(p) => change({ cover_photo: p })}
            onChange={(photos) => change({ photos })} onTrouble={setError} />
          {seenPhotos.length > 0 && (
            <p className="muted small">Plus {seenPhotos.length} taken with the observations.</p>
          )}
        </div>

        <div className="card visit-zone" data-z="seen">
          <div className="pad-head">
            <h3>Observations</h3>
            {!adding && !editing && <button className="primary-lite" onClick={() => setAdding(true)}>New observation</button>}
          </div>
          {(adding || editing) ? (
            <ObservationForm project={project} types={types} existing={editing ?? undefined} known={all} day={visit.visited_on}
              onSaved={(o, another) => {
                setAll((list) => [o, ...(list ?? []).filter((x) => x.id !== o.id)])
                if (!another) { setAdding(false); setEditing(null) }
              }}
              onCancel={() => { setAdding(false); setEditing(null); loadSeen() }}
              onTrouble={setError} />
          ) : !all ? <p className="muted small">Loading…</p>
            : !seen.length ? <p className="muted small">Nothing observed on this day yet.</p> : (
              <ul className="visit-seen">
                {seen.map((o) => (
                  <li key={o.id}>
                    <span className="mono muted">{nameOf(o, types)}</span>
                    <button className="link" onClick={() => setEditing(o)}>{o.title}</button>
                    {(o.area || o.trade) && <span className="muted small">{[o.area, o.trade].filter(Boolean).join(' · ')}</span>}
                    {o.photos.length > 0 && <span className="tag">{o.photos.length} {o.photos.length === 1 ? 'photo' : 'photos'}</span>}
                  </li>
                ))}
              </ul>
            )}
        </div>
      </div>
    </section>
  )
}
