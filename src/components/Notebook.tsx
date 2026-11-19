import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { NotePad, PadStill } from './NotePad'
import { Photos } from './Photos'
import IssueForm from '../pages/IssueForm'
import { usDate as usDateOf } from '../lib/templates/fields'
import { getPad, listMarks, newPad, type NotePad as Pad, type PadMark } from '../lib/pads'
import {
  buildObservation, listObservations, listTypes, nameOf, onDay, photosOf, saveObservation,
  type Observation, type ObservationType,
} from '../lib/observations'
import { keepPhoto, photoUrl } from '../lib/photos'
import {
  clockTime, coverOf, longDay, parseSections, removeVisit, setVisit, shortDay, startVisit, writeSections,
  type Section, type SiteVisit, type VisitKind,
} from '../lib/visits'
import { message } from '../lib/errors'
import type { Project } from '../lib/types'

/**
 * Field notes, as a notebook.
 *
 * Standing on a site nobody wants a form. They want the book in their pocket: open it, turn to
 * today's page, and write, draw or photograph what is in front of them. So this is a book — a
 * cover, a contents page, and a page a visit — taking the whole screen. The page already has
 * its categories on it, taken from the firm's own report template, so what is written lands in
 * the right place without being filed afterwards. The report in its title block is still made,
 * from the page, when it is wanted; it is something the book produces, not how the book is used.
 *
 * The meeting book is the same book with the photographs and observations left out, so there is
 * nothing on the page but the paper.
 */

const BOOK: Record<VisitKind, { title: string; page: string; exportAs: string }> = {
  visit: { title: 'Field notes', page: 'visit', exportAs: 'Make the field report' },
  meeting: { title: 'Meeting notes', page: 'meeting', exportAs: 'Make the meeting notes' },
}

function Thumb({ project, path }: { project: Project; path: string | null }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!path) { setUrl(null); return }
    let made: string | null = null, gone = false
    photoUrl(project, path).then((u) => { if (gone) URL.revokeObjectURL(u); else { made = u; setUrl(u) } }).catch(() => {})
    return () => { gone = true; if (made) URL.revokeObjectURL(made) }
  }, [project, path])
  // A photograph that won't load leaves its frame empty; it doesn't show a broken picture.
  return url ? <img src={url} alt="" onError={() => setUrl(null)} /> : null
}

/** A textarea as tall as what is written in it, so a page reads as a page and not as boxes. */
function Lines({ value, onChange, onDone, placeholder, label }: {
  value: string; onChange: (v: string) => void; onDone: () => void; placeholder?: string; label: string
}) {
  const box = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => {
    const el = box.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return (
    <textarea ref={box} className="nb-lines" rows={1} value={value} placeholder={placeholder} aria-label={label}
      onChange={(e) => onChange(e.target.value)} onBlur={onDone} />
  )
}

export function Notebook({ project, kind, pages, onPages }: {
  project: Project
  kind: VisitKind
  pages: SiteVisit[]
  onPages: (next: SiteVisit[]) => void
}) {
  const navigate = useNavigate()
  /** null is the contents page. */
  const [at, setAt] = useState<string | null>(null)
  const [turn, setTurn] = useState<'fwd' | 'back'>('fwd')
  const [error, setError] = useState<string | null>(null)
  const [observations, setObservations] = useState<Observation[]>([])
  const [types, setTypes] = useState<ObservationType[]>([])

  useEffect(() => {
    if (kind !== 'visit') return
    listObservations(project.id).then(setObservations).catch(() => setObservations([]))
    listTypes().then(setTypes).catch(() => setTypes([]))
  }, [project.id, kind])

  const i = at ? pages.findIndex((p) => p.id === at) : -1
  const page = i >= 0 ? pages[i] : null
  const go = (id: string | null, dir: 'fwd' | 'back') => { setTurn(dir); setAt(id) }

  async function newPage() {
    try {
      const v = await startVisit(project.id, kind)
      onPages([v, ...pages])
      go(v.id, 'fwd')
    } catch (e) { setError(message(e)) }
  }

  // Arrow keys turn the page, as long as nobody is typing on it.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select, [contenteditable]')) return
      if (e.key === 'Escape') { if (at) go(null, 'back'); else navigate('/field-notes') }
      if (!page) return
      // Pages run newest first, so "next" in the book is the older one.
      if (e.key === 'ArrowRight' && i < pages.length - 1) go(pages[i + 1].id, 'fwd')
      if (e.key === 'ArrowLeft') go(i > 0 ? pages[i - 1].id : null, 'back')
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })

  return (
    <div className={`nb nb-${kind}`}>
      <header className="nb-bar">
        <button className="nb-close" onClick={() => navigate('/field-notes')} aria-label="Close the book">×</button>
        <span className="nb-bar-title">{BOOK[kind].title}<span className="nb-bar-job"> · {project.number} {project.name}</span></span>
        <span className="nb-bar-turn">
          {page && (
            <>
              <button onClick={() => go(i > 0 ? pages[i - 1].id : null, 'back')} aria-label="Turn back">‹</button>
              <span className="nb-bar-count">{pages.length - i} of {pages.length}</span>
              <button disabled={i >= pages.length - 1} onClick={() => go(pages[i + 1].id, 'fwd')} aria-label="Turn forward">›</button>
            </>
          )}
          {page && <button className="nb-bar-contents" onClick={() => go(null, 'back')}>Contents</button>}
        </span>
      </header>

      {error && <div className="notice error nb-error">{error}</div>}

      <div className="nb-stage">
        {page ? (
          <Page key={page.id} turn={turn} project={project} page={page}
            observations={observations} types={types}
            onObserved={(o) => setObservations((all) => [o, ...all.filter((x) => x.id !== o.id)])}
            onChanged={(v) => onPages(pages.map((x) => (x.id === v.id ? v : x)))}
            onRemoved={() => { onPages(pages.filter((x) => x.id !== page.id)); go(null, 'back') }}
            onTrouble={setError} />
        ) : (
          <article key="contents" className={`nb-paper nb-contents nb-turn-${turn}`}>
            <div className="nb-holes" aria-hidden="true" />
            <h1>{BOOK[kind].title}</h1>
            <p className="nb-sub">{project.number} · {project.name}</p>
            <button className="nb-today" onClick={() => void newPage()}>
              <span className="nb-today-plus" aria-hidden="true">+</span>
              <span>
                <strong>New page</strong>
                <span className="nb-today-day">{longDay(new Date().toISOString().slice(0, 10))}</span>
              </span>
            </button>
            {pages.length > 0 && <h2>Pages</h2>}
            <ol className="nb-toc">
              {pages.map((p, n) => {
                const seen = kind === 'visit' ? onDay(observations, p.visited_on) : []
                const photos = p.photos.length + photosOf(seen).length
                return (
                  <li key={p.id}>
                    <button onClick={() => go(p.id, 'fwd')}>
                      {kind === 'visit' && <span className="nb-toc-thumb"><Thumb project={project} path={coverOf(p, photosOf(seen))} /></span>}
                      <span className="nb-toc-day">{shortDay(p.visited_on)}</span>
                      <span className="nb-toc-title">{p.title || (kind === 'meeting' ? 'Meeting' : 'Site visit')}</span>
                      <span className="nb-toc-dots" aria-hidden="true" />
                      <span className="nb-toc-what">
                        {[p.visited_at ? clockTime(p.visited_at) : '',
                          photos ? `${photos} ${photos === 1 ? 'photo' : 'photos'}` : '',
                          seen.length ? `${seen.length} obs.` : ''].filter(Boolean).join(' · ')}
                      </span>
                      <span className="nb-toc-no">{pages.length - n}</span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </article>
        )}
      </div>
    </div>
  )
}

// ---------- One page ----------

function Page({ project, page, turn, observations, types, onObserved, onChanged, onRemoved, onTrouble }: {
  project: Project
  page: SiteVisit
  turn: 'fwd' | 'back'
  observations: Observation[]
  types: ObservationType[]
  onObserved: (o: Observation) => void
  onChanged: (v: SiteVisit) => void
  onRemoved: () => void
  onTrouble: (m: string) => void
}) {
  const visit = page.kind === 'visit'
  const [sections, setSections] = useState<Section[]>(() => parseSections(page.notes))
  const [pad, setPadRow] = useState<Pad | null>(null)
  const [marks, setMarks] = useState<PadMark[]>([])
  const [drawing, setDrawing] = useState(false)
  const [exporting, setExporting] = useState(false)
  /** What the camera button is for: a photograph for the record, or one that is an observation. */
  const [shot, setShot] = useState<'documentation' | 'observation'>('documentation')
  const [working, setWorking] = useState(false)
  /** A photograph just taken as an observation, waiting to be told what it shows. */
  const [naming, setNaming] = useState<{ path: string; text: string } | null>(null)
  const camera = useRef<HTMLInputElement | null>(null)

  const change = useCallback((patch: Partial<SiteVisit>) => {
    onChanged({ ...page, ...patch })
    setVisit(page.id, patch).catch((e) => onTrouble(message(e)))
  }, [page, onChanged, onTrouble])

  const saveNotes = (next: Section[] = sections) => {
    const text = writeSections(next)
    if (text !== (page.notes ?? '')) change({ notes: text })
  }
  const editSection = (n: number, patch: Partial<Section>) =>
    setSections((all) => all.map((s, k) => (k === n ? { ...s, ...patch } : s)))

  const padId = page.pad_id
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
        p = await newPad(project.id, visit ? 'field_report' : 'meeting_notes', { noted_on: page.visited_on, title: page.title })
        setPadRow(p)
        change({ pad_id: p.id })
      }
      setDrawing(true)
    } catch (e) { onTrouble(message(e)) }
  }

  async function taken(files: FileList | null) {
    const file = files?.[0]
    if (camera.current) camera.current.value = ''
    if (!file) return
    setWorking(true)
    try {
      const path = await keepPhoto(project, file, page.title || 'Site visit', page.photos.length + 1)
      if (shot === 'observation') setNaming({ path, text: '' })
      else change({ photos: [...page.photos, path] })
    } catch (e) { onTrouble(message(e)) } finally { setWorking(false) }
  }

  async function keepObservation() {
    if (!naming) return
    const title = naming.text.trim()
    // A photograph with nothing said about it is a photograph, so it goes with the others.
    if (!title) { change({ photos: [...page.photos, naming.path] }); setNaming(null); return }
    try {
      const row = buildObservation({
        projectId: project.id, typeId: types[0]?.id ?? null, title,
        detail: null, area: null, trade: null, status: 'open',
        observedOn: page.visited_on, dueOn: null, photos: [naming.path],
        sheetId: null, revisionId: null, region: null,
      })
      await saveObservation(row)
      onObserved(row)
      setNaming(null)
    } catch (e) { onTrouble(message(e)) }
  }

  const seen = visit ? onDay(observations, page.visited_on) : []
  const cover = visit ? coverOf(page, photosOf(seen)) : null

  if (drawing && pad) {
    return <NotePad pad={pad} onChanged={setPadRow} onClose={() => setDrawing(false)} onTrouble={onTrouble} />
  }

  if (exporting) {
    const notes = writeSections(sections)
    const recorded = seen.length
      ? `\n${sections.length + 1}. Observations recorded\n` + seen.map((o, n) => `  ${String.fromCharCode(97 + (n % 26))}. ${nameOf(o, types)} ${o.title}${o.area ? ` (${o.area})` : ''}`).join('\n')
      : ''
    const day = usDateOf(new Date(`${page.visited_on}T12:00:00`))
    return (
      <article className="nb-paper nb-export">
        <div className="pad-head">
          <h2>{BOOK[page.kind].exportAs}</h2>
          <button onClick={() => setExporting(false)}>Back to the page</button>
        </div>
        <p className="muted small">On your firm’s template, filled in from the page. Change anything here; the page stays as it is.</p>
        {visit ? (
          <IssueForm key={page.id} kind="field_report" prefill={{
            'fr.date': day,
            ...(page.visited_at ? { 'fr.time': clockTime(page.visited_at) } : {}),
            ...(page.weather ? { 'fr.weather': page.weather } : {}),
            'fr.observations': notes + recorded,
          }} />
        ) : (
          <IssueForm key={page.id} kind="meeting_notes" prefill={{
            'mn.date': day,
            ...(page.visited_at ? { 'mn.time': clockTime(page.visited_at) } : {}),
            ...(page.title ? { 'mn.title': page.title } : {}),
            'mn.notes': notes,
          }} />
        )}
      </article>
    )
  }

  return (
    <>
      <article className={`nb-paper nb-page nb-turn-${turn}`}>
        <div className="nb-holes" aria-hidden="true" />

        <header className="nb-head">
          {cover && <div className="nb-cover"><Thumb project={project} path={cover} /></div>}
          <div className="nb-head-text">
            <h1>{longDay(page.visited_on)}</h1>
            <div className="nb-head-fields">
              <input type="date" value={page.visited_on} aria-label="Day"
                onChange={(e) => { if (e.target.value) change({ visited_on: e.target.value }) }} />
              <input type="time" value={(page.visited_at ?? '').slice(0, 5)} aria-label="Time"
                onChange={(e) => change({ visited_at: e.target.value ? `${e.target.value}:00` : null })} />
              {visit && (
                <input className="nb-weather" defaultValue={page.weather ?? ''} placeholder="Weather" aria-label="Weather"
                  onBlur={(e) => { if (e.target.value !== (page.weather ?? '')) change({ weather: e.target.value.trim() || null }) }} />
              )}
            </div>
            <input className="nb-title" defaultValue={page.title ?? ''} aria-label="What this page is about"
              placeholder={visit ? 'What the visit was for' : 'Which meeting'}
              onBlur={(e) => { if (e.target.value !== (page.title ?? '')) change({ title: e.target.value.trim() || null }) }} />
          </div>
        </header>

        <div className="nb-body">
          <section className="nb-notes" aria-label="Notes">
            {sections.map((s, n) => (
              <div className="nb-section" key={n}>
                <input className="nb-heading" value={s.heading} aria-label="Category"
                  onChange={(e) => editSection(n, { heading: e.target.value })} onBlur={() => saveNotes()} />
                <Lines value={s.body} label={`Notes under ${s.heading}`} placeholder="Write here…"
                  onChange={(v) => editSection(n, { body: v })} onDone={() => saveNotes()} />
              </div>
            ))}
            <button className="nb-add" onClick={() => setSections((all) => [...all, { heading: 'New category', body: '' }])}>+ Category</button>
          </section>

          <aside className="nb-side">
            <section className="nb-sketch">
              <h2>Sketch</h2>
              <button className="pad-thumb nb-pad" onClick={() => void draw()} aria-label="Open the sketch">
                <PadStill marks={marks} rule={pad?.rule ?? 'grid'} ink={pad?.rule_ink ?? 40} />
                {!marks.length && <span className="pad-thumb-empty muted small">Tap to draw or write by hand</span>}
              </button>
            </section>

            {visit && (
              <section>
                <h2>Photos</h2>
                <Photos project={project} paths={page.photos} about={page.title || 'Site visit'} editable
                  cover={cover} onCover={(p) => change({ cover_photo: p })}
                  onChange={(photos) => change({ photos })} onTrouble={onTrouble} />
              </section>
            )}

            {visit && (
              <section>
                <h2>Observations</h2>
                {!seen.length ? <p className="muted small">None on this day yet.</p> : (
                  <ul className="nb-seen">
                    {seen.map((o) => (
                      <li key={o.id}>
                        {o.photos[0] && <span className="nb-seen-thumb"><Thumb project={project} path={o.photos[0]} /></span>}
                        <span><span className="mono muted">{nameOf(o, types)}</span> {o.title}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </aside>
        </div>

        <footer className="nb-foot">
          <button className="primary" onClick={() => { saveNotes(); setExporting(true) }}>{BOOK[page.kind].exportAs}</button>
          <button className="link danger-link" onClick={() => {
            if (!window.confirm('Tear this page out? Its sketch, photographs and observations are kept.')) return
            removeVisit(page.id).then(onRemoved).catch((e) => onTrouble(message(e)))
          }}>Tear out this page</button>
        </footer>
      </article>

      {visit && (
        <div className="nb-shutter">
          {naming ? (
            <form className="nb-naming" onSubmit={(e) => { e.preventDefault(); void keepObservation() }}>
              <span className="nb-naming-thumb"><Thumb project={project} path={naming.path} /></span>
              <input autoFocus value={naming.text} placeholder="What does it show?" enterKeyHint="done"
                onChange={(e) => setNaming({ ...naming, text: e.target.value })} />
              <button className="primary">{naming.text.trim() ? 'Keep' : 'Just the photo'}</button>
            </form>
          ) : (
            <>
              {/* One switch, then the camera: the choice is made before the photograph, with a
                  thumb, and stays where it was left for the next one. */}
              <div className={`nb-slide ${shot}`} role="radiogroup" aria-label="What the photograph is">
                <button role="radio" aria-checked={shot === 'documentation'} onClick={() => setShot('documentation')}>Documentation</button>
                <button role="radio" aria-checked={shot === 'observation'} onClick={() => setShot('observation')}>Observation</button>
              </div>
              <button className="nb-camera" disabled={working} onClick={() => camera.current?.click()}
                aria-label={`Take a photograph as ${shot}`}>
                {working ? <span className="nb-camera-wait" /> : (
                  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 8h3l1.6-2.4h6.8L17 8h3v11H4V8Z" /><circle cx="12" cy="13.2" r="3.4" />
                  </svg>
                )}
              </button>
            </>
          )}
          <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void taken(e.target.files)} />
        </div>
      )}
    </>
  )
}

// ---------- The shelf ----------

/** The two books, closed. Opening one is the way into everything in field notes. */
export function Shelf({ project }: { project: Project | null }) {
  const navigate = useNavigate()
  const book = (kind: VisitKind, to: string, line: string) => (
    <button className={`nb-book nb-book-${kind}`} onClick={() => navigate(to)} disabled={!project}>
      <span className="nb-book-band" aria-hidden="true" />
      <span className="nb-book-label">
        <span className="nb-book-name">{BOOK[kind].title}</span>
        <span className="nb-book-job">{project ? `${project.number} · ${project.name}` : 'Choose a project'}</span>
      </span>
      <span className="nb-book-line">{line}</span>
    </button>
  )
  return (
    <div className="nb-shelf">
      {book('visit', '/field-notes/reports', 'Site visits — notes, sketches, photographs, observations')}
      {book('meeting', '/field-notes/meetings', 'Meetings — notes and sketches, nothing else on the page')}
    </div>
  )
}
