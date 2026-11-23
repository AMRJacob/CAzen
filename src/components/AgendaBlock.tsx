import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useSoon } from './PageGrid'
import { ObsPicker } from './ObsPlaces'
import { agendaOutline, pickUp, type Agenda, type AgendaItem } from '../lib/agenda'
import { agendaOf, type Widget } from '../lib/pageLayout'
import { canLinkPages, editObservation, nameOf, type Observation, type ObservationType } from '../lib/observations'
import { onPage, startOf } from '../lib/obsPages'
import { listVisits, shortDay, type SiteVisit } from '../lib/visits'
import { message } from '../lib/errors'
import { useFirm } from '../lib/firm'
import { useProject } from '../lib/project'
import { loadBrand } from '../lib/brand'
import { loadLayouts } from '../lib/templates/store'
import { AGENDA } from '../lib/templates/defaults'
import { firmValues, usDate } from '../lib/templates/fields'
import { renderForm } from '../lib/templates/render'

/**
 * A meeting agenda on a notebook page (Jacob, 11/23: a block in either book, picked up from an
 * earlier page to check what is resolved, with a PDF on the firm's letterhead).
 *
 * Old business is carried from the page it is picked up from — its notes, and its own agenda's
 * unresolved items. Observations to review are the open ones on that page and on its agenda, and
 * any added from the project's pool; ticking one resolved closes the observation itself, wherever
 * else it is listed. New business is typed here.
 */
export function AgendaBlock({ title, widget, onSave, page, observations, types, onObserved, onTrouble }: {
  title: string
  widget: Widget | undefined
  onSave: (w: Widget) => void
  page: SiteVisit
  observations: Observation[]
  types: ObservationType[]
  onObserved: (o: Observation) => void
  onTrouble: (m: string) => void
}) {
  const [agenda, setAgenda, flush] = useSoon<Agenda>(agendaOf(widget), (a) => onSave({ title, agenda: a }))
  const { firm } = useFirm()
  const { current } = useProject()

  // Every earlier page in both books, newest first: an agenda is picked up from one of them.
  const [earlier, setEarlier] = useState<SiteVisit[]>([])
  const [visitPages, setVisitPages] = useState<SiteVisit[]>([])
  useEffect(() => {
    let gone = false
    Promise.all([listVisits(page.project_id, 'visit'), listVisits(page.project_id, 'meeting')]).then(([v, m]) => {
      if (gone) return
      setVisitPages(v)
      setEarlier([...v, ...m].filter((p) => p.id !== page.id && startOf(p) < startOf(page)).sort((a, b) => startOf(b) - startOf(a)))
    }).catch(() => {})
    return () => { gone = true }
  }, [page])
  const sameBook = earlier.find((p) => p.kind === page.kind)
  const [source, setSource] = useState<string>('')
  const from = earlier.find((p) => p.id === (source || agenda.from || sameBook?.id)) ?? null
  const label = (p: SiteVisit) => `${p.kind === 'meeting' ? 'Meeting notes' : 'Field notes'} · ${shortDay(p.visited_on)}${p.title ? ` · ${p.title}` : ''}`

  const pick = () => {
    if (!from) return
    const agendas = Object.values(from.widgets ?? {}).filter((w) => 'agenda' in w).map(agendaOf)
    const openObs = observations.filter((o) => o.status !== 'closed' && onPage(o, from.id, visitPages, canLinkPages())).map((o) => o.id)
    setAgenda(pickUp(agenda, { id: from.id, notes: from.notes, agendas, openObs }), true)
  }

  // Items: ticked resolved, typed, taken off, added. A new line takes the cursor before the next key arrives.
  const root = useRef<HTMLElement | null>(null)
  const [focusAt, setFocusAt] = useState<{ part: 'old' | 'fresh'; i: number } | null>(null)
  useLayoutEffect(() => {
    if (!focusAt) return
    root.current?.querySelector(`[data-part="${focusAt.part}"]`)?.querySelectorAll<HTMLInputElement>('input[type="text"]')[focusAt.i]?.focus()
    setFocusAt(null)
  }, [focusAt])
  const items = (part: 'old' | 'fresh', head: string, empty: string) => {
    const set = (next: AgendaItem[], now = false) => setAgenda({ ...agenda, [part]: next }, now)
    const rows = agenda[part]
    return (
      <div className="ag-part">
        <h3>{head}</h3>
        {!rows.length && part === 'old' && <p className="nb-none">{empty}</p>}
        <ul className="nb-check" data-part={part}>
          {rows.map((it, i) => (
            <li key={i} className={it.done ? 'done' : ''}>
              <input type="checkbox" checked={it.done} aria-label="Resolved" title="Resolved"
                onChange={(e) => set(rows.map((x, n) => (n === i ? { ...x, done: e.target.checked } : x)), true)} />
              <input type="text" value={it.text} placeholder="Item" onBlur={flush}
                onChange={(e) => set(rows.map((x, n) => (n === i ? { ...x, text: e.target.value } : x)))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault(); set([...rows.slice(0, i + 1), { text: '', done: false }, ...rows.slice(i + 1)], true)
                    setFocusAt({ part, i: i + 1 })
                  }
                }} />
              <button className="ag-x" aria-label="Take off the agenda" title="Take off the agenda" onClick={() => set(rows.filter((_, n) => n !== i), true)}>×</button>
            </li>
          ))}
        </ul>
        {part === 'fresh' && <button className="link nb-check-add" onClick={() => { set([...rows, { text: '', done: false }], true); setFocusAt({ part, i: rows.length }) }}>+ Add item</button>}
      </div>
    )
  }

  const [picking, setPicking] = useState(false)
  const listed = agenda.obs.map((id) => observations.find((o) => o.id === id)).filter((o): o is Observation => !!o)
  // Shown ticked at once; the observation follows when its change is kept.
  const [ticking, setTicking] = useState<Record<string, boolean>>({})
  const closed = (o: Observation) => ticking[o.id] ?? o.status === 'closed'
  const resolve = async (o: Observation, done: boolean) => {
    setTicking((t) => ({ ...t, [o.id]: done }))
    try { onObserved(await editObservation(o, { status: done ? 'closed' : 'open' })) } catch (e) { onTrouble(message(e)) }
    finally { setTicking((t) => { const n = { ...t }; delete n[o.id]; return n }) }
  }

  // The PDF: the meeting notes' header on the firm's letterhead, and the agenda as an outline.
  const [making, setMaking] = useState(false)
  const pdf = async () => {
    if (!firm) return
    flush()
    setMaking(true)
    try {
      const [brand, layouts] = await Promise.all([loadBrand(firm), loadLayouts(firm.id, ['general'])])
      const at = page.visited_at ? new Date(`2000-01-01T${page.visited_at}`) : null
      const values: Record<string, string> = {
        'project.name': current?.name ?? '', 'project.number': current?.number ?? '', 'project.owner': current?.owner_name ?? '',
        ...firmValues(brand),
        'ag.title': page.title || title,
        'ag.date': usDate(new Date(`${page.visited_on}T12:00:00`)),
        'ag.time': at ? at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '',
        'ag.location': (page.location ?? '').split('\n')[0] ?? '',
        'ag.participants': page.names ?? '',
        'ag.items': agendaOutline(agenda, (id) => {
          const o = observations.find((x) => x.id === id)
          return o ? { name: nameOf(o, types), title: o.title, open: o.status !== 'closed' } : null
        }),
      }
      const bytes = await renderForm({ layout: AGENDA(), letterhead: layouts.general, brand, values })
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `${[current?.number, 'Agenda', page.visited_on].filter(Boolean).join(' ')}.pdf`
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
    } catch (e) { onTrouble(message(e)) } finally { setMaking(false) }
  }

  return (
    <section className="nb-z nb-z-agenda" ref={root}>
      <div className="nb-z-top">
        <h2>{title}</h2>
        <button className="primary-lite" disabled={making} onClick={() => void pdf()}>{making ? 'Making…' : 'Export PDF'}</button>
      </div>
      {earlier.length > 0 && (
        <div className="ag-from">
          <select value={from?.id ?? ''} onChange={(e) => setSource(e.target.value)} aria-label="Pick up from">
            {earlier.map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}
          </select>
          <button className="link" disabled={!from} onClick={pick}>{agenda.from ? 'Pick up again' : 'Pick up from this page'}</button>
        </div>
      )}
      {items('old', 'Old business', earlier.length ? 'Pick up from an earlier page to carry its items here.' : 'No earlier pages to pick up from.')}
      <div className="ag-part">
        <h3>Observations to review{listed.length ? ` · ${listed.filter((o) => !closed(o)).length} open` : ''}</h3>
        <ul className="nb-check">
          {listed.map((o) => (
            <li key={o.id} className={closed(o) ? 'done' : ''}>
              <input type="checkbox" checked={closed(o)} aria-label={`${nameOf(o, types)} resolved`} title="Resolved — closes the observation"
                onChange={(e) => void resolve(o, e.target.checked)} />
              <span className="ag-obs"><span className="mono muted">{nameOf(o, types)}</span> {o.title}</span>
              <button className="ag-x" aria-label="Take off the agenda" title="Take off the agenda"
                onClick={() => setAgenda({ ...agenda, obs: agenda.obs.filter((x) => x !== o.id) }, true)}>×</button>
            </li>
          ))}
        </ul>
        <button className="link nb-check-add" onClick={() => setPicking(true)}>+ Add existing</button>
      </div>
      {items('fresh', 'New business', '')}
      {picking && (
        <ObsPicker title="Add observations to review" all={observations} types={types}
          skip={(o) => agenda.obs.includes(o.id)} onClose={() => setPicking(false)}
          onAdd={(picked) => { setPicking(false); setAgenda({ ...agenda, obs: [...agenda.obs, ...picked.map((o) => o.id)] }, true) }} />
      )}
    </section>
  )
}
