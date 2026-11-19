import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mark } from './Logo'
import { NotePad, PadStill } from './NotePad'
import { ObservationForm } from './ObservationForm'
import { OutlineTools } from './OutlineTools'
import IssueForm from '../pages/IssueForm'
import { usDate as usDateOf } from '../lib/templates/fields'
import { getPad, listMarks, newPad, type NotePad as Pad, type PadMark } from '../lib/pads'
import {
  listObservations, listTypes, nameOf, onDay, photosOf, STATUS_LABELS,
  type Observation, type ObservationType,
} from '../lib/observations'
import { keepPhoto, photoUrl } from '../lib/photos'
import {
  canHoldLocation, clockTime, coverOf, longDay, removeVisit, setVisit, shortDay, startVisit,
  type SiteVisit, type VisitKind,
} from '../lib/visits'
import { addPerson, asLine, linesOf, listPeople, listPeopleElsewhere, nameIn, type Person } from '../lib/people'
import { catchAll, fileNote, guessCategory, headingsOf, unfileNote } from '../lib/noteSort'
import { metresBetween, placeAt, weatherAt } from '../lib/weather'
import { readPref, writePref } from '../lib/prefs'
import { useAuth } from '../lib/auth'
import { useFirm } from '../lib/firm'
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

/** What the writing lines look like, as on the sketch pads: ruled, squared, dotted or plain. */
const PAPERS = ['lines', 'grid', 'dots', 'blank'] as const
type Paper = typeof PAPERS[number]
const PAPER_NAME: Record<Paper, string> = { lines: 'Ruled', grid: 'Grid', dots: 'Dots', blank: 'Blank' }
const paperKey = (kind: VisitKind) => `cazen.pref.notebookPaper.${kind}`

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
  const [paper, setPaper] = useState<Paper>(() => readPref<Paper>(paperKey(kind), 'lines'))
  const nextPaper = () => { const n = PAPERS[(PAPERS.indexOf(paper) + 1) % PAPERS.length]; setPaper(n); writePref(paperKey(kind), n) }
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
      const v = await startVisit(project.id, kind, pages[0]?.names ?? null,
        kind === 'visit' ? (project.address ? `Job site\n${project.address}` : 'Job site') : pages[0]?.location ?? null)
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

  const turnBar = (
    <BookMenu
      count={page ? `${pages.length - i} of ${pages.length}` : null}
      onNew={() => void newPage()}
      paper={PAPER_NAME[paper]} onPaper={nextPaper}
      onContents={page ? () => go(null, 'back') : undefined}
      onBack={page ? () => go(i > 0 ? pages[i - 1].id : null, 'back') : undefined}
      onForward={page && i < pages.length - 1 ? () => go(pages[i + 1].id, 'fwd') : undefined}
      onClose={() => navigate('/field-notes')} />
  )

  return (
    <div className={`nb nb-${kind} nb-rule-${paper}`}>
      {error && <div className="notice error nb-error">{error}</div>}
      {page ? (
        <Page key={page.id} turn={turn} project={project} page={page} bar={turnBar}
          earlier={pages.filter((x) => x.id !== page.id).flatMap((x) => linesOf(x.names))}
          observations={observations} types={types}
          onObserved={(o) => setObservations((all) => [o, ...all.filter((x) => x.id !== o.id)])}
          onChanged={(v) => onPages(pages.map((x) => (x.id === v.id ? v : x)))}
          onRemoved={() => { onPages(pages.filter((x) => x.id !== page.id)); go(null, 'back') }}
          onTrouble={setError} />
      ) : (
        <article key="contents" className={`nb-paper nb-contents nb-turn-${turn}`}>
          {turnBar}
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
  )
}

// ---------- The corner menu ----------

/**
 * Getting around the book, from the corner — the same mark and the same gesture as the phone's
 * own menu: closed it is the ensō and costs the page nothing; open it is a row of what can be
 * done from here, a new page first. It puts itself away once something is chosen, or after a
 * few seconds of not being used.
 */
function BookMenu({ count, onNew, onContents, onBack, onForward, onClose, paper, onPaper }: {
  count: string | null
  /** The paper in use, and the way to the next kind. */
  paper: string
  onPaper: () => void
  onNew: () => void
  onContents?: () => void
  onBack?: () => void
  onForward?: () => void
  onClose: () => void
}) {
  const [open, setOpen] = useState(false)
  const timer = useRef<number | null>(null)
  const rest = useCallback((ms: number) => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOpen(false), ms)
  }, [])
  useEffect(() => { if (open) rest(4200); return () => { if (timer.current !== null) window.clearTimeout(timer.current) } }, [open, rest])
  const I = (d: React.ReactNode) => (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
  )
  const spot = (label: string, icon: React.ReactNode, act: (() => void) | undefined, stay = false) => (
    <button className="nb-menu-spot" disabled={!act} onClick={() => { act?.(); if (stay) rest(2600); else setOpen(false) }}>
      {icon}<span>{label}</span>
    </button>
  )
  return (
    <nav className={`nb-menu${open ? ' open' : ''}`} aria-label="The book" onPointerDown={() => { if (open) rest(4200) }}>
      <button className="nb-menu-mark" aria-expanded={open} aria-label={open ? 'Hide the menu' : 'Show the menu'} onClick={() => setOpen(!open)}>
        <Mark size={30} />
      </button>
      <div className="nb-menu-bar" {...(open ? {} : { inert: '' as unknown as boolean })}>
        {spot('New page', I(<><path d="M6 3h9l4 4v14H6V3Z" /><path d="M12 10v7M8.5 13.5h7" /></>), onNew)}
        {spot('Contents', I(<><path d="M5 6h14M5 12h14M5 18h9" /></>), onContents)}
        {spot('Back', I(<path d="M15 6l-6 6 6 6" />), onBack, true)}
        {count && <span className="nb-menu-count">{count}</span>}
        {spot('Forward', I(<path d="M9 6l6 6-6 6" />), onForward, true)}
        {spot(paper, I(<><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M7 8h10M7 12h10M7 16h10" /></>), onPaper, true)}
        {spot('Close', I(<path d="M6 6l12 12M18 6 6 18" />), onClose)}
      </div>
    </nav>
  )
}

// ---------- One page ----------

/**
 * A day's page, laid out the way Jacob drew it: the day and the weather top left, who was there
 * top right, and beneath them three columns — typed notes, the sketch, and on the right the
 * photographs above the observations. A meeting's page is the same sheet without the right-hand
 * column. Everything is on the one page; nothing is behind a tab.
 */
function Page({ project, page, turn, bar, earlier, observations, types, onObserved, onChanged, onRemoved, onTrouble }: {
  project: Project
  page: SiteVisit
  turn: 'fwd' | 'back'
  bar: React.ReactNode
  /** Attendee lines from the book's other pages. */
  earlier: string[]
  observations: Observation[]
  types: ObservationType[]
  onObserved: (o: Observation) => void
  onChanged: (v: SiteVisit) => void
  onRemoved: () => void
  onTrouble: (m: string) => void
}) {
  const visit = page.kind === 'visit'
  const [notes, setNotes] = useState(page.notes ?? '')
  const notesBox = useRef<HTMLTextAreaElement | null>(null)
  const [pad, setPadRow] = useState<Pad | null>(null)
  const [marks, setMarks] = useState<PadMark[]>([])
  const [drawing, setDrawing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [working, setWorking] = useState(false)
  /** The photograph open in the gallery, and whether its label is waiting to be typed. */
  const [viewing, setViewing] = useState<{ path: string; fresh: boolean } | null>(null)
  /** The observation being written or changed, in the same form the sheets and the list use. */
  const [observing, setObserving] = useState<Observation | 'new' | null>(null)
  /** The shape of the sketch's frame, so the still fills it instead of sitting in a letterbox. */
  const frame = useRef<HTMLButtonElement | null>(null)
  const [shape, setShape] = useState(1.3)
  useEffect(() => {
    const el = frame.current
    if (!el) return
    const see = () => { if (el.clientWidth > 0) setShape(el.clientHeight / el.clientWidth) }
    see()
    const ro = new ResizeObserver(see)
    ro.observe(el)
    return () => ro.disconnect()
    // The frame is taken away while the pad or the export is open, and is a new one after.
  }, [drawing, exporting])
  const camera = useRef<HTMLInputElement | null>(null)
  const library = useRef<HTMLInputElement | null>(null)

  const change = useCallback((patch: Partial<SiteVisit>) => {
    onChanged({ ...page, ...patch })
    setVisit(page.id, patch).catch((e) => onTrouble(message(e)))
  }, [page, onChanged, onTrouble])

  const padId = page.pad_id
  useEffect(() => {
    if (!padId || drawing) return
    let gone = false
    getPad(padId).then((p) => { if (!gone) setPadRow(p) }).catch(() => {})
    listMarks(padId).then((m) => { if (!gone) setMarks(m.filter((x) => x.page === 1)) }).catch(() => {})
    return () => { gone = true }
  }, [padId, drawing])

  /**
   * The weather, from where the phone is standing — or, where it won't say, from where the
   * project is. Asked once, for a page that has none; the field stays the user's to overwrite.
   */
  const [asking, setAsking] = useState(false)
  const lookUpWeather = useCallback(async (byHand = false) => {
    setAsking(true)
    try {
      const here = await new Promise<{ lat: number; lon: number } | null>((done) => {
        if (!navigator.geolocation) { done(null); return }
        navigator.geolocation.getCurrentPosition(
          (p) => done({ lat: p.coords.latitude, lon: p.coords.longitude }),
          () => done(null),
          { timeout: 6000, maximumAge: 10 * 60_000 })
      })
      const lat = here?.lat ?? project.latitude, lon = here?.lon ?? project.longitude
      const when = new Date(`${page.visited_on}T${page.visited_at ?? '12:00:00'}`)
      const found = await weatherAt(lat, lon, when)
      if (found) change({ weather: found })
      else if (lat == null) onTrouble('No location to look the weather up for: the phone would not give one and the project has none set.')
      // Asked for by hand and nothing came back: say so, so it isn't a button that does nothing.
      else if (byHand) onTrouble('The weather service had no observation for here at that time. It covers the United States and the last six days.')
    } finally { setAsking(false) }
  }, [project.latitude, project.longitude, page.visited_on, page.visited_at, change, onTrouble])
  /**
   * Where the phone is, in words. Standing on the job it says so — the project's own address —
   * and anywhere else it is looked up.
   */
  const [locating, setLocating] = useState(false)
  async function locate() {
    setLocating(true)
    try {
      const here = await new Promise<{ lat: number; lon: number } | null>((done) => {
        if (!navigator.geolocation) { done(null); return }
        navigator.geolocation.getCurrentPosition(
          (p) => done({ lat: p.coords.latitude, lon: p.coords.longitude }), () => done(null),
          { timeout: 8000, maximumAge: 60_000, enableHighAccuracy: true })
      })
      if (!here) { onTrouble('This device would not say where it is. Location has to be allowed for CAzen in the browser’s settings.'); return }
      const atJob = project.latitude != null && project.longitude != null
        && metresBetween(here, { lat: project.latitude, lon: project.longitude }) < 400
      const said = atJob ? (project.address ? `Job site\n${project.address}` : 'Job site')
        : await placeAt(here.lat, here.lon) ?? `${here.lat.toFixed(5)}, ${here.lon.toFixed(5)}`
      change({ location: said })
    } finally { setLocating(false) }
  }

  const askedWeather = useRef(false)
  useEffect(() => {
    if (!visit || page.weather || askedWeather.current) return
    askedWeather.current = true
    void lookUpWeather()
  }, [visit, page.weather, lookUpWeather])

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
    const list = Array.from(files ?? [])
    if (camera.current) camera.current.value = ''
    if (library.current) library.current.value = ''
    if (!list.length) return
    setWorking(true)
    const kept: string[] = []
    for (const file of list) {
      try { kept.push(await keepPhoto(project, file, page.title || 'Site visit', page.photos.length + kept.length + 1)) }
      catch (e) { onTrouble(message(e)) }
    }
    setWorking(false)
    if (!kept.length) return
    change({ photos: [...page.photos, ...kept] })
    // One photograph just taken is asked what it shows, there and then. A handful brought in
    // from the library are not each interrupted for.
    if (kept.length === 1) setViewing({ path: kept[0], fresh: true })
  }

  const label = (path: string) => page.photo_labels?.[path] ?? ''
  const setLabel = (path: string, text: string) => {
    const next = { ...(page.photo_labels ?? {}) }
    if (text.trim()) next[path] = text.trim(); else delete next[path]
    change({ photo_labels: next })
  }

  const seen = visit ? onDay(observations, page.visited_on) : []
  const cover = visit ? coverOf(page, photosOf(seen)) : null

  if (drawing && pad) {
    return <NotePad pad={pad} onChanged={setPadRow} onClose={() => setDrawing(false)} onTrouble={onTrouble} />
  }

  if (exporting) {
    const recorded = seen.length
      ? `\n${(notes.match(/^\d+\.\s/gm)?.length ?? 0) + 1}. Observations recorded\n` + seen.map((o, n) => `  ${String.fromCharCode(97 + (n % 26))}. ${nameOf(o, types)} ${o.title}${o.area ? ` (${o.area})` : ''}`).join('\n')
      : ''
    const day = usDateOf(new Date(`${page.visited_on}T12:00:00`))
    const who = page.names?.trim() ? page.names.trim() : null
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
            ...(page.location ? { 'fr.location': page.location.replace(/, /g, '\n') } : {}),
            ...(who ? { 'fr.participants': who } : {}),
            'fr.observations': notes + recorded,
          }} />
        ) : (
          <IssueForm key={page.id} kind="meeting_notes" prefill={{
            'mn.date': day,
            ...(page.visited_at ? { 'mn.time': clockTime(page.visited_at) } : {}),
            ...(page.title ? { 'mn.title': page.title } : {}),
            ...(page.location ? { 'mn.location': page.location.replace(/, /g, '\n') } : {}),
            ...(who ? { 'mn.participants': who } : {}),
            'mn.notes': notes,
          }} />
        )}
      </article>
    )
  }

  const at = viewing ? page.photos.indexOf(viewing.path) : -1

  return (
    <article className={`nb-paper nb-page nb-turn-${turn}`}>
      <section className="nb-z nb-z-head">
        <h1>{longDay(page.visited_on)}</h1>
        <div className="nb-head-fields">
          <input type="date" value={page.visited_on} aria-label="Day"
            onChange={(e) => { if (e.target.value) change({ visited_on: e.target.value }) }} />
          <input type="time" value={(page.visited_at ?? '').slice(0, 5)} aria-label="Time"
            onChange={(e) => change({ visited_at: e.target.value ? `${e.target.value}:00` : null })} />
          {visit && (
            <input key={page.weather ?? ''} className="nb-weather" defaultValue={page.weather ?? ''} aria-label="Weather"
              placeholder={asking ? 'Looking up the weather…' : 'Weather'}
              onBlur={(e) => { if (e.target.value !== (page.weather ?? '')) change({ weather: e.target.value.trim() || null }) }} />
          )}
          {visit && <button className="link nb-weather-again" disabled={asking} onClick={() => void lookUpWeather(true)} title="Look the weather up from where you are">↻</button>}
        </div>
        {canHoldLocation() && (
          <div className="nb-head-fields nb-where">
            <input key={page.location ?? ''} className="nb-location" defaultValue={(page.location ?? '').replace(/\n/g, ', ')} aria-label="Location"
              placeholder={locating ? 'Finding where you are…' : 'Location'}
              onBlur={(e) => { const v = e.target.value.trim(); if (v !== (page.location ?? '').replace(/\n/g, ', ')) change({ location: v || null }) }} />
            <button className="link nb-weather-again" disabled={locating} onClick={() => void locate()} title="Use where you are" aria-label="Use where you are">⌖</button>
          </div>
        )}
        <input className="nb-title" defaultValue={page.title ?? ''} aria-label="What this page is about"
          placeholder={visit ? 'What the visit was for' : 'Which meeting'}
          onBlur={(e) => { if (e.target.value !== (page.title ?? '')) change({ title: e.target.value.trim() || null }) }} />
        <div className="nb-head-actions">
          <button className="primary-lite" onClick={() => { if (notes !== (page.notes ?? '')) change({ notes }); setExporting(true) }}>{BOOK[page.kind].exportAs}</button>
          <button className="link danger-link" onClick={() => {
            if (!window.confirm('Tear this page out? Its sketch, photographs and observations are kept.')) return
            removeVisit(page.id).then(onRemoved).catch((e) => onTrouble(message(e)))
          }}>Tear out</button>
        </div>
      </section>

      {bar}
      <Names projectId={project.id} names={page.names} earlier={earlier} onChange={(names) => change({ names })} onTrouble={onTrouble} />

      <section className="nb-z nb-z-notes">
        <QuickNote notes={notes} onFiled={(next) => { setNotes(next); change({ notes: next }) }} />
        <div className="nb-z-top"><h2>Notes</h2><OutlineTools textarea={notesBox} value={notes} onChange={setNotes} /></div>
        <textarea ref={notesBox} className="nb-write nb-outline nb-ruled" value={notes} aria-label="Notes, organised"
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => { if (notes !== (page.notes ?? '')) change({ notes }) }} />
      </section>

      <section className="nb-z nb-z-sketch">
        <div className="nb-z-top"><h2>Sketch</h2><button className="link" onClick={() => void draw()}>{marks.length ? 'Open' : 'Start'}</button></div>
        <button ref={frame} className="nb-pad" onClick={() => void draw()} aria-label="Open the sketch pad">
          <PadStill marks={marks} rule={pad?.rule ?? 'blank'} ink={pad?.rule_ink ?? 40} ratio={shape} />
          {!marks.length && <span className="nb-pad-empty">Tap to draw or write by hand</span>}
        </button>
      </section>

      {visit && (
        <section className="nb-z nb-z-photos">
          <div className="nb-z-top">
            <h2>Documentation photos{page.photos.length ? ` · ${page.photos.length}` : ''}</h2>
            <span className="nb-z-do">
              <button className="link" disabled={working} onClick={() => library.current?.click()}>Library</button>
              <button className="primary-lite" disabled={working} onClick={() => camera.current?.click()}>{working ? 'Keeping…' : 'Take a photo'}</button>
            </span>
          </div>
          {!page.photos.length ? <p className="nb-none">None yet.</p> : (
            <div className="nb-gallery">
              {page.photos.map((p) => (
                <button key={p} className={`nb-shot${cover === p ? ' cover' : ''}`} onClick={() => setViewing({ path: p, fresh: false })}
                  aria-label={label(p) || 'Photograph'}>
                  <Thumb project={project} path={p} />
                  {label(p) && <span className="nb-shot-label">{label(p)}</span>}
                </button>
              ))}
            </div>
          )}
          <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void taken(e.target.files)} />
          <input ref={library} type="file" accept="image/*" multiple hidden onChange={(e) => void taken(e.target.files)} />
        </section>
      )}

      {visit && (
        <section className="nb-z nb-z-seen">
          <div className="nb-z-top">
            <h2>Observations{seen.length ? ` · ${seen.length}` : ''}</h2>
            <button className="primary-lite" onClick={() => setObserving('new')}>New observation</button>
          </div>
          {!seen.length ? <p className="nb-none">None on this day yet.</p> : (
            <ul className="nb-seen">
              {seen.map((o) => (
                <li key={o.id}>
                  <button onClick={() => setObserving(o)}>
                    {o.photos[0] && <span className="nb-seen-thumb"><Thumb project={project} path={o.photos[0]} /></span>}
                    <span className="nb-seen-text">
                      <span><span className="mono muted">{nameOf(o, types)}</span> {o.title}</span>
                      <span className="muted small">{[STATUS_LABELS[o.status], o.area, o.trade].filter(Boolean).join(' · ')}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {viewing && at >= 0 && (
        <div className="nb-light" role="dialog" aria-label="Photograph" onClick={() => setViewing(null)}>
          <div className="nb-light-in" onClick={(e) => e.stopPropagation()}>
            <div className="nb-light-img"><Thumb project={project} path={viewing.path} /></div>
            <div className="nb-light-row">
              <button disabled={at <= 0} onClick={() => setViewing({ path: page.photos[at - 1], fresh: false })} aria-label="Previous photograph">‹</button>
              <input key={viewing.path} autoFocus={viewing.fresh} defaultValue={label(viewing.path)} placeholder="What does it show?"
                aria-label="Label" enterKeyHint="done"
                onKeyDown={(e) => { if (e.key === 'Enter') { setLabel(viewing.path, e.currentTarget.value); setViewing(null) } }}
                onBlur={(e) => { if (e.target.value.trim() !== label(viewing.path)) setLabel(viewing.path, e.target.value) }} />
              <button disabled={at >= page.photos.length - 1} onClick={() => setViewing({ path: page.photos[at + 1], fresh: false })} aria-label="Next photograph">›</button>
            </div>
            <div className="nb-light-row nb-light-foot">
              <span>{at + 1} of {page.photos.length}</span>
              <button className={cover === viewing.path ? 'on' : ''} onClick={() => change({ cover_photo: viewing.path })}>{cover === viewing.path ? 'Cover' : 'Make cover'}</button>
              <button onClick={() => {
                const next = { ...(page.photo_labels ?? {}) }; delete next[viewing.path]
                change({ photos: page.photos.filter((x) => x !== viewing.path), photo_labels: next }); setViewing(null)
              }}>Remove</button>
              <button onClick={() => setViewing(null)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {observing && (
        <div className="nb-light nb-sheet" role="dialog" aria-label="Observation" onClick={() => setObserving(null)}>
          <div className="nb-sheet-in" onClick={(e) => e.stopPropagation()}>
            <ObservationForm project={project} types={types} known={observations} day={page.visited_on}
              existing={observing === 'new' ? undefined : observing}
              onSaved={(o, another) => { onObserved(o); if (!another) setObserving(null) }}
              onCancel={() => setObserving(null)} onTrouble={onTrouble} />
          </div>
        </div>
      )}
    </article>
  )
}

// ---------- Typing as it comes ----------

/**
 * A note, typed the way it is thought of — and filed where it belongs.
 *
 * Walking a site, things are noticed in the order they are passed, not the order a report lists
 * them. So there is one place to type, always the same, and the page's categories beside it.
 * As the words go in, the category they point at lights up; Enter keeps the note under it. A
 * different category can be tapped before Enter, or after — the last note moves. Nothing has to
 * be decided first, and nothing has to be tidied afterwards.
 */
function QuickNote({ notes, onFiled }: { notes: string; onFiled: (next: string) => void }) {
  const headings = headingsOf(notes)
  const [text, setText] = useState('')
  const [picked, setPicked] = useState<number | null>(null)
  const [last, setLast] = useState<{ heading: number; text: string } | null>(null)
  const box = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const el = box.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`
  }, [text])

  const guessed = guessCategory(text, headings)
  // Words that point nowhere go under the catch-all, not under whatever was used last.
  const active = Math.min(picked ?? (guessed >= 0 ? guessed : catchAll(headings)), Math.max(0, headings.length - 1))

  function keep() {
    const said = text.trim()
    if (!said) return
    onFiled(fileNote(notes, active, said))
    setLast({ heading: active, text: said })
    setText('')
    setPicked(null)
    box.current?.focus()
  }

  function choose(i: number) {
    // With words in the box the tap says where they will go; with none, it moves the last note.
    if (text.trim() || !last) { setPicked(i); box.current?.focus(); return }
    if (i === last.heading) return
    onFiled(fileNote(unfileNote(notes, last.heading, last.text), i, last.text))
    setLast({ ...last, heading: i })
  }

  return (
    <div className="nb-quick">
      <textarea ref={box} rows={1} value={text} aria-label="Type a note"
        placeholder="Type it as you see it — Enter files it"
        enterKeyHint="done" autoCapitalize="sentences"
        onChange={(e) => { setText(e.target.value); if (last) setLast(null) }}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); keep() } }} />
      <div className="nb-quick-cats" role="radiogroup" aria-label={text.trim() || !last ? 'File it under' : 'Move the last note to'}>
        <span className="nb-quick-say">{text.trim() ? 'Under' : last ? 'Filed under' : 'Under'}</span>
        {headings.map((h, i) => {
          const on = text.trim() ? i === active : last ? i === last.heading : i === active
          return (
            <button key={i} role="radio" aria-checked={on}
              className={`chip${on ? ' on' : ''}${text.trim() && picked === null && guessed === i ? ' guessed' : ''}`}
              onClick={() => choose(i)}>{h.replace(/\s*\(.*\)\s*$/, '')}</button>
          )
        })}
        {text.trim() && <button className="primary-lite nb-quick-keep" onClick={keep}>Keep</button>}
      </div>
    </div>
  )
}

// ---------- Who was there ----------

/**
 * The attendees on a page, picked rather than typed. "Add name" lists the people already on
 * this project, then anyone written on an earlier page, then people from the firm's other
 * projects; "Add name to list" takes somebody new — name, company, phone, email, what a sign-in
 * sheet asks — who is then there to pick on every page after.
 */
function Names({ projectId, names, earlier, onChange, onTrouble }: {
  projectId: string
  names: string | null
  /** Attendee lines written on this book's other pages. */
  earlier: string[]
  onChange: (names: string | null) => void
  onTrouble: (m: string) => void
}) {
  const [people, setPeople] = useState<Person[]>([])
  const [elsewhere, setElsewhere] = useState<Person[]>([])
  const [picking, setPicking] = useState(false)
  // Whoever is signed in is the one person certain to have been there, so they are always
  // offered — before anybody has been put on the project's list at all.
  const { session } = useAuth()
  const { firm } = useFirm()
  const myName = ((session?.user.user_metadata?.full_name as string | undefined) ?? '').trim() || (session?.user.email ?? '').split('@')[0]
  const me = myName ? { name: myName, company: firm?.name ?? null, phone: firm?.phone ?? null, email: session?.user.email ?? null } : null
  const [adding, setAdding] = useState(false)
  const [fresh, setFresh] = useState({ name: '', company: '', phone: '', email: '' })
  useEffect(() => {
    listPeople(projectId).then(setPeople).catch(() => setPeople([]))
    listPeopleElsewhere(projectId).then(setElsewhere).catch(() => setElsewhere([]))
  }, [projectId])

  const lines = linesOf(names)
  const here = new Set(lines.map((l) => nameIn(l).toLowerCase()))
  const onProject = new Set(people.map((p) => p.name.toLowerCase()))
  const write = (next: string[]) => onChange(next.length ? next.join('\n') : null)
  const toggleLine = (line: string) => write(here.has(nameIn(line).toLowerCase())
    ? lines.filter((l) => nameIn(l).toLowerCase() !== nameIn(line).toLowerCase())
    : [...lines, line])

  // Written on an earlier page but never put on the project's list.
  const typed = [...new Map(earlier.filter((l) => !onProject.has(nameIn(l).toLowerCase())).map((l) => [nameIn(l).toLowerCase(), l])).values()]
  const others = elsewhere.filter((p) => !onProject.has(p.name.toLowerCase()))

  async function keepPerson(p: { name: string; company?: string | null; phone?: string | null; email?: string | null }) {
    try {
      const made = await addPerson(projectId, { name: p.name, company: p.company ?? '', phone: p.phone ?? '', email: p.email ?? '' })
      setPeople((all) => [...all, made].sort((a, b) => a.name.localeCompare(b.name)))
      if (!here.has(made.name.toLowerCase())) write([...lines, asLine(made)])
      return true
    } catch (e) { onTrouble(message(e)); return false }
  }
  const set = (k: keyof typeof fresh) => (e: React.ChangeEvent<HTMLInputElement>) => setFresh({ ...fresh, [k]: e.target.value })
  /** Closing the list keeps a name that was typed and not yet added: typing it was the asking. */
  async function done() {
    if (adding && fresh.name.trim()) {
      if (!(await keepPerson(fresh))) return
      setFresh({ name: '', company: '', phone: '', email: '' })
    }
    setAdding(false)
    setPicking(false)
  }
  const row = (key: string, on: boolean, act: () => void, name: string, rest: (string | null | undefined)[]) => (
    <label key={key} className="nb-person">
      <input type="checkbox" checked={on} onChange={act} />
      <span className="nb-person-name">{name}</span>
      <span className="muted small">{rest.filter(Boolean).join(' · ')}</span>
    </label>
  )

  return (
    <section className="nb-z nb-z-names">
      <div className="nb-z-top">
        <h2>Attendees{lines.length ? ` · ${lines.length}` : ''}</h2>
        <button className="primary-lite" onClick={() => setPicking(true)}>Add name</button>
      </div>
      {/* Its own sheet over the page: the corner of the page the attendees live in is too small
          to choose from, and a button that scrolls out of sight is a button nobody presses. */}
      {picking && (
        <div className="nb-light nb-sheet" role="dialog" aria-label="Attendees" onClick={() => void done()}>
          <div className="nb-sheet-in nb-people-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="pad-head"><h3>Attendees</h3><button className="primary" onClick={() => void done()}>Done</button></div>
            <div className="nb-people">
              {me && !onProject.has(me.name.toLowerCase()) && row('me', here.has(me.name.toLowerCase()), () => { if (here.has(me.name.toLowerCase())) toggleLine(asLine(me)); else void keepPerson(me) }, me.name, ['you', me.company, me.email])}
              {people.length > 0 && <h4>On this project</h4>}
              {people.map((p) => row(p.id, here.has(p.name.toLowerCase()), () => toggleLine(asLine(p)), p.name, [p.company, p.phone, p.email]))}
              {typed.length > 0 && <h4>On earlier pages</h4>}
              {typed.map((l) => row(l, here.has(nameIn(l).toLowerCase()), () => toggleLine(l), nameIn(l), l.split('|').slice(1).map((x) => x.trim())))}
              {others.length > 0 && <h4>From other projects</h4>}
              {others.map((p) => row(p.id, false, () => void keepPerson(p), p.name, [p.company, p.phone, p.email]))}
            </div>
            {adding ? (
              <form className="nb-person-new" onSubmit={async (e) => {
                e.preventDefault()
                if (fresh.name.trim() && await keepPerson(fresh)) setFresh({ name: '', company: '', phone: '', email: '' })
              }}>
                <input autoFocus value={fresh.name} onChange={set('name')} placeholder="Name" aria-label="Name" autoComplete="off" />
                <input value={fresh.company} onChange={set('company')} placeholder="Company" aria-label="Company" autoComplete="off" />
                <input value={fresh.phone} onChange={set('phone')} placeholder="Phone" aria-label="Phone" inputMode="tel" autoComplete="off" />
                <input value={fresh.email} onChange={set('email')} placeholder="Email" aria-label="Email" inputMode="email" autoComplete="off" />
                <button className="primary-lite" disabled={!fresh.name.trim()}>Add to the list</button>
                <span className="muted small">Done keeps it too.</span>
              </form>
            ) : (
              <button className="link nb-person-add" onClick={() => setAdding(true)}>+ Add name to list</button>
            )}
          </div>
        </div>
      )}
      {!lines.length ? <p className="nb-none">Nobody yet.</p> : (
        <ul className="nb-names">
          {lines.map((l) => {
            const [name, company] = l.split('|').map((x) => x.trim())
            return (
              <li key={l}>
                <span><strong>{name}</strong>{company ? <span className="muted"> · {company}</span> : null}</span>
                <button className="link" aria-label={`Take ${name} off this page`} onClick={() => write(lines.filter((x) => x !== l))}>×</button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
