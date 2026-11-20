import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mark } from './Logo'
import { NotePad, PadStill } from './NotePad'
import { ObservationForm } from './ObservationForm'
import { NoteBoard } from './NoteBoard'
import { tearOut } from '../lib/tearOut'
import IssueForm from '../pages/IssueForm'
import { usDate as usDateOf } from '../lib/templates/fields'
import { getPad, listMarks, newPad, type NotePad as Pad, type PadMark } from '../lib/pads'
import {
  listObservations, listTypes, nameOf, onDay, photosOf, STATUS_LABELS,
  type Observation, type ObservationType,
} from '../lib/observations'
import { keepPhoto, photoUrl } from '../lib/photos'
import {
  canHoldLocation, clockTime, coverOf, longDay, setVisit, shortDay, startVisit,
  type SiteVisit, type VisitKind,
} from '../lib/visits'
import { addPerson, asLine, linesOf, listPeople, listPeopleElsewhere, nameIn, type Person } from '../lib/people'
import { metresBetween, placeAt, weatherAt } from '../lib/weather'
import { readPref } from '../lib/prefs'
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
  const [paper] = useState<Paper>(() => readPref<Paper>(paperKey(kind), 'lines'))
  const [error, setError] = useState<string | null>(null)
  /** A page about to be taken out, with the observations made on it. */
  const [tear, setTear] = useState<{ page: SiteVisit; own: Observation[] } | null>(null)
  const [tearObs, setTearObs] = useState(false)
  async function tearNow() {
    if (!tear) return
    const { page: gone, own } = tear
    setTear(null)
    try {
      await tearOut(project, gone, tearObs ? own : [])
      if (tearObs) setObservations((all) => all.filter((o) => !own.some((x) => x.id === o.id)))
      onPages(pages.filter((x) => x.id !== gone.id))
      if (at === gone.id) go(null, 'back')
    } catch (e) { setError(message(e)) }
    setTearObs(false)
  }
  /** The page a right-click on the contents is asking about, and where the menu goes. */
  const [tearing, setTearing] = useState<{ id: string; x: number; y: number } | null>(null)
  useEffect(() => {
    if (!tearing) return
    const away = (e: Event) => { if (!(e.target as HTMLElement | null)?.closest?.('.nb-tear')) setTearing(null) }
    window.addEventListener('pointerdown', away, true)
    return () => window.removeEventListener('pointerdown', away, true)
  }, [tearing])
  const [observations, setObservations] = useState<Observation[]>([])
  const [types, setTypes] = useState<ObservationType[]>([])
  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 7000)
    return () => clearTimeout(t)
  }, [error])

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
      if (e.key === 'Escape') { if (at) go(null, 'back'); else navigate('/project') }
      if (!page) return
      // Pages run newest first, so "next" in the book is the older one.
      if (e.key === 'ArrowRight' && i < pages.length - 1) go(pages[i + 1].id, 'fwd')
      if (e.key === 'ArrowLeft') go(i > 0 ? pages[i - 1].id : null, 'back')
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })

  /** The open page's own ways of adding to itself, for the corner menu to call. */
  const adds = useRef<PageAdds>({})
  const turnBar = (
    <BookMenu
      visit={kind === 'visit'} adds={adds}
      onNew={() => void newPage()}
      // Out of a page is back to the book's contents; the contents page has its own way out.
      onClose={() => go(null, 'back')} />
  )

  return (
    <div className={`nb nb-${kind} nb-rule-${paper}`}>
      {tear && (
        <div className="take-ask nb-tearout" role="dialog" aria-label="Tear out this page" onClick={() => setTear(null)}>
          <div className="take-card" onClick={(e) => e.stopPropagation()}>
            <h3>Tear out {shortDay(tear.page.visited_on)}{tear.page.title ? ` · ${tear.page.title}` : ''}?</h3>
            <p className="muted small">
              The page goes, and with it {[
                tear.page.pad_id ? 'its sketch' : '',
                tear.page.photos.length ? `its ${tear.page.photos.length} ${tear.page.photos.length === 1 ? 'photograph' : 'photographs'}` : '',
              ].filter(Boolean).join(' and ') || 'its notes'} — they are not kept anywhere else. This cannot be undone.
            </p>
            {tear.own.length > 0 && (
              <label className="nb-tear-obs">
                <input type="checkbox" checked={tearObs} onChange={(e) => setTearObs(e.target.checked)} />
                <span>Also delete the {tear.own.length} {tear.own.length === 1 ? 'observation' : 'observations'} made on this page
                  <span className="muted small"> — left unticked, {tear.own.length === 1 ? 'it stays' : 'they stay'} on the Observations list</span></span>
              </label>
            )}
            <div className="take-choices">
              <button className="take-remove" onClick={() => void tearNow()}><strong>Tear it out</strong></button>
            </div>
            <button className="link" onClick={() => { setTear(null); setTearObs(false) }}>Keep the page</button>
          </div>
        </div>
      )}
      {/* At the foot of the page, out of the way of the bar and the way out; it goes when
          touched, and by itself after a few seconds. */}
      {error && <button className="notice error nb-error" onClick={() => setError(null)} title="Dismiss">{error}<span aria-hidden="true"> ×</span></button>}
      {page ? (
        <Page key={page.id} turn={turn} project={project} page={page} bar={turnBar} adds={adds}
          until={nextStart(pages, page)}
          earlier={pages.filter((x) => x.id !== page.id).flatMap((x) => linesOf(x.names))}
          observations={observations} types={types}
          onObserved={(o) => setObservations((all) => [o, ...all.filter((x) => x.id !== o.id)])}
          onChanged={(v) => onPages(pages.map((x) => (x.id === v.id ? v : x)))}
          onTear={(pg, own) => setTear({ page: pg, own })}
          onTrouble={setError} />
      ) : (
        <article key="contents" className={`nb-paper nb-contents nb-turn-${turn}`}>
          {/* The contents page has its own way to a new page and to every page, so the corner menu
              had one thing left to offer here: the way out. It gets a plain button instead. */}
          <button className="nb-exit" onClick={() => navigate('/project')} aria-label={`Close ${BOOK[kind].title.toLowerCase()}`} title="Close">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
          <h1>{BOOK[kind].title}</h1>
          <p className="nb-sub">{project.number} · {project.name}</p>
          <button className="nb-today" onClick={() => void newPage()}>
            <span className="nb-today-plus" aria-hidden="true">+</span>
            <span>
              <strong>New page</strong>
              <span className="nb-today-day">{longDay(new Date().toISOString().slice(0, 10))}</span>
            </span>
          </button>
          {/* On a phone the corner mark is the way to a new page and the way out; the button and
              the × above are for a desk. */}
          <BookMenu contents visit={false} onNew={() => void newPage()} onClose={() => navigate('/project')} />
          {pages.length > 0 && <h2>Pages</h2>}
          <ol className="nb-toc">
            {pages.map((p, n) => {
              const seen = kind === 'visit' ? onDay(observations, p.visited_on) : []
              const photos = p.photos.length + photosOf(seen).length
              return (
                <li key={p.id}>
                  <button onClick={() => go(p.id, 'fwd')}
                    // A right-click on a page in the contents offers to take it out of the book.
                    onContextMenu={(e) => { e.preventDefault(); setTearing({ id: p.id, x: e.clientX, y: e.clientY }) }}>
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
          {tearing && (() => {
            const p = pages.find((x) => x.id === tearing.id)
            if (!p) return null
            return (
              <div className="padctx nb-tear" role="menu" style={{ left: Math.min(tearing.x, window.innerWidth - 250), top: Math.min(tearing.y, window.innerHeight - 110) }}>
                <span className="nb-tear-say">{shortDay(p.visited_on)} · {p.title || (kind === 'meeting' ? 'Meeting' : 'Site visit')}</span>
                <button role="menuitem" onClick={() => { setTearing(null); go(p.id, 'fwd') }}>Open</button>
                <button role="menuitem" className="danger" onClick={() => {
                  setTearing(null)
                  const from = startOf(p), to = nextStart(pages, p)
                  const made = (o: Observation) => Date.parse(o.created_at) || Date.parse(`${o.observed_on}T12:00:00`)
                  setTear({ page: p, own: kind === 'visit' ? observations.filter((o) => made(o) >= from && (to === null || made(o) < to)) : [] })
                }}>Delete this page</button>
              </div>
            )
          })()}
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
/** What a page offers to add to itself; the corner menu calls these. Absent where a page has no such part. */
interface PageAdds { note?: () => void; sketch?: () => void; photo?: () => void; observation?: () => void }

function BookMenu({ onNew, onClose, adds, visit, contents }: {
  /** On the book's contents page: nothing to add to, only a new page or the way out. */
  contents?: boolean
  /** A site visit has photographs and observations; a meeting does not. */
  visit: boolean
  onNew: () => void
  onClose: () => void
  /** The page's own ways of adding to itself, read when the menu is used. */
  adds?: React.RefObject<PageAdds>
}) {

  const [open, setOpen] = useState(false)
  const timer = useRef<number | null>(null)
  const rest = useCallback((ms: number) => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOpen(false), ms)
  }, [])
  useEffect(() => { if (open) rest(4200); return () => { if (timer.current !== null) window.clearTimeout(timer.current) } }, [open, rest])
  // With the mark gone while the menu is open, a touch anywhere else is what puts it away.
  const nav = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => { if (!nav.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])
  const I = (d: React.ReactNode) => (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
  )
  const spot = (label: string, icon: React.ReactNode, act: (() => void) | undefined, stay = false) => (
    <button className="nb-menu-spot" disabled={!act} onClick={() => { act?.(); if (stay) rest(2600); else setOpen(false) }}>
      {icon}<span>{label}</span>
    </button>
  )
  return (
    <nav ref={nav} className={`nb-menu${contents ? ' nb-menu-contents' : ''}${open ? ' open' : ''}`} aria-label="The book" onPointerDown={() => { if (open) rest(4200) }}>
      <button className="nb-menu-mark" aria-expanded={open} aria-label={open ? 'Hide the menu' : 'Show the menu'} onClick={() => setOpen(!open)}>
        <Mark size={30} />
      </button>
      <div className="nb-menu-bar" {...(open ? {} : { inert: '' as unknown as boolean })}>
        {/* What can be added to this page, where the thumb already is. The parts a page does
            not have — a meeting has no photographs or observations — are not offered. */}
        {!contents && <>
        {spot('Note', I(<><path d="M5 5h14v10H9l-4 4V5Z" /><path d="M9 9h6M9 12h4" /></>), () => adds?.current?.note?.())}
        {spot('Sketch', I(<><path d="M4 20l4-1L19 8l-3-3L5 16l-1 4Z" /><path d="M14 7l3 3" /></>), () => adds?.current?.sketch?.())}
        {visit && spot('Photo', I(<><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7l1.5-3h5L16 7" /><circle cx="12" cy="13.5" r="3.2" /></>), () => adds?.current?.photo?.())}
        {visit && spot('Observation', I(<><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" /><circle cx="12" cy="12" r="2.6" /></>), () => adds?.current?.observation?.())}
        </>}
        {spot('New page', I(<><path d="M6 3h9l4 4v14H6V3Z" /><path d="M12 10v7M8.5 13.5h7" /></>), onNew)}
        {spot(contents ? 'Exit' : 'Close', I(<path d="M6 6l12 12M18 6 6 18" />), onClose)}
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
function Page({ project, page, turn, bar, adds, until, earlier, observations, types, onObserved, onChanged, onTear, onTrouble }: {
  project: Project
  page: SiteVisit
  turn: 'fwd' | 'back'
  bar: React.ReactNode
  adds: React.RefObject<PageAdds>
  /** When the next page of this book was started, if there is one: what was seen after that is its. */
  until: number | null
  /** Attendee lines from the book's other pages. */
  earlier: string[]
  observations: Observation[]
  types: ObservationType[]
  onObserved: (o: Observation) => void
  onChanged: (v: SiteVisit) => void
  /** Asked to take this page out: the book asks what goes with it. */
  onTear: (page: SiteVisit, own: Observation[]) => void
  onTrouble: (m: string) => void
}) {
  const visit = page.kind === 'visit'
  const [notes, setNotes] = useState(page.notes ?? '')
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
      // Said only when it was asked for by hand: a page that looks the weather up for itself
      // and cannot simply leaves the line empty.
      else if (lat == null && byHand) onTrouble('No location to look the weather up for: the phone would not give one and the project has none set.')
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

  // What the corner menu can add to this page. Set after every render, so the menu always
  // calls the page as it is now; cleared when the page is put away.
  const root = useRef<HTMLElement | null>(null)
  useEffect(() => {
    adds.current = {
      note: () => { const el = root.current?.querySelector<HTMLInputElement>('.nbd-type input'); el?.scrollIntoView({ block: 'center' }); el?.focus() },
      sketch: () => { void draw() },
      photo: visit ? () => camera.current?.click() : undefined,
      observation: visit ? () => setObserving('new') : undefined,
    }
  })
  useEffect(() => () => { adds.current = {} }, [adds])

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
  // On the page itself: what was seen while this page was the one being written, and then —
  // under a line — what was seen before it and is still open.
  const began = startOf(page)
  const madeAt = (o: Observation) => { const t = Date.parse(o.created_at); return Number.isNaN(t) ? Date.parse(`${o.observed_on}T12:00:00`) : t }
  const own = visit ? observations.filter((o) => madeAt(o) >= began && (until === null || madeAt(o) < until)).sort((a, b) => madeAt(a) - madeAt(b)) : []
  const before = visit ? observations.filter((o) => madeAt(o) < began && o.status !== 'closed').sort((a, b) => madeAt(b) - madeAt(a)) : []
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
          <IssueForm key={page.id} kind="field_report" sheetKey={page.id}
            photos={[
              ...page.photos.map((path) => ({ path, label: label(path) })),
              ...seen.flatMap((o) => o.photos.map((path) => ({ path, label: o.title }))),
            ]}
            prefill={{
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
    <article ref={root} className={`nb-paper nb-page nb-turn-${turn}`}>
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
            onTear(page, own)
          }}>Tear out</button>
        </div>
      </section>

      {bar}
      <Names projectId={project.id} names={page.names} earlier={earlier} onChange={(names) => change({ names })} onTrouble={onTrouble} />

      <section className="nb-z nb-z-notes">
        <div className="nb-z-top"><h2>Notes</h2></div>
        {/* Typed, then dragged where it belongs. The numbered outline is on the report's page. */}
        <NoteBoard notes={notes} onChange={(next) => { setNotes(next); change({ notes: next }) }} />
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
            <h2>Observations{own.length ? ` · ${own.length}` : ''}</h2>
            <button className="primary-lite" onClick={() => setObserving('new')}>New observation</button>
          </div>
          {!own.length && <p className="nb-none">None on this page yet.</p>}
          {(own.length > 0 || before.length > 0) && (
            <ul className="nb-seen">
              {own.map((o) => (
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
              {/* What was seen before this page was started and is not yet closed: on the page
                  so it can be walked and followed up, under a line so it is not taken for new. */}
              {before.length > 0 && <li className="nb-seen-rule" role="separator">Previous observations · {before.length}</li>}
              {before.map((o) => (
                <li key={o.id} className="nb-seen-old">
                  <button onClick={() => setObserving(o)}>
                    {o.photos[0] && <span className="nb-seen-thumb"><Thumb project={project} path={o.photos[0]} /></span>}
                    <span className="nb-seen-text">
                      <span><span className="mono muted">{nameOf(o, types)}</span> {o.title}</span>
                      <span className="muted small">{[shortDay(o.observed_on), STATUS_LABELS[o.status], o.area, o.trade].filter(Boolean).join(' · ')}</span>
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

/** When a page was started, as a moment: its day and its time, or the start of its day. */
function startOf(v: SiteVisit): number {
  const t = Date.parse(`${v.visited_on}T${v.visited_at ?? '00:00:00'}`)
  return Number.isNaN(t) ? 0 : t
}
/** The start of the page that follows this one in the book, if any. */
function nextStart(pages: SiteVisit[], page: SiteVisit): number | null {
  const mine = startOf(page)
  const later = pages.filter((p) => p.id !== page.id).map(startOf).filter((t) => t > mine)
  return later.length ? Math.min(...later) : null
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
