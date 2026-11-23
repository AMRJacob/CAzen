import { useEffect, useMemo, useState } from 'react'
import { canLinkPages, nameOf, type Observation, type ObservationType } from '../lib/observations'
import { listVisits, shortDay, type SiteVisit } from '../lib/visits'
import { onPage } from '../lib/obsPages'

/**
 * Where an observation is listed (Jacob, 11/23: one observation, added to more than one
 * document). The field-notes page it was made on, if any; further pages it has been put on; and
 * the punch list — by its type, or by hand. One observation in each: edits and closing are shared.
 */
export function ObsPlaces({ project, types, typeId, madeOn, alsoOn, onPunch, onChange }: {
  project: { id: string }
  types: ObservationType[]
  typeId: string | null
  /** The page it was (or is being) made on. */
  madeOn: string | null
  alsoOn: string[]
  onPunch: boolean
  onChange: (next: { alsoOn: string[]; onPunch: boolean }) => void
}) {
  const [pages, setPages] = useState<SiteVisit[]>([])
  useEffect(() => { listVisits(project.id, 'visit').then(setPages).catch(() => setPages([])) }, [project.id])
  if (!canLinkPages()) return null
  const byType = !!typeId && types.some((t) => t.id === typeId && t.is_punch)
  const label = (p: SiteVisit) => `${shortDay(p.visited_on)}${p.title ? ` · ${p.title}` : ''}`
  const made = pages.find((p) => p.id === madeOn)
  const more = alsoOn.map((id) => pages.find((p) => p.id === id)).filter((p): p is SiteVisit => !!p && p.id !== madeOn)
  const free = pages.filter((p) => p.id !== madeOn && !alsoOn.includes(p.id))
  return (
    <div className="obs-places" aria-label="Where it is listed">
      <span className="obs-places-h">On</span>
      {made && <span className="chip obs-place" title="The page it was made on">{label(made)}</span>}
      {more.map((p) => (
        <span key={p.id} className="chip obs-place">
          {label(p)}
          <button type="button" className="obs-place-x" aria-label={`Take off ${label(p)}`}
            onClick={() => onChange({ alsoOn: alsoOn.filter((x) => x !== p.id), onPunch })}>×</button>
        </span>
      ))}
      {byType
        ? <span className="chip obs-place on" title="Its type puts it there; change the type to take it off">Punch list · by type</span>
        : <button type="button" className={`chip obs-place${onPunch ? ' on' : ''}`} aria-pressed={onPunch}
            onClick={() => onChange({ alsoOn, onPunch: !onPunch })}>{onPunch ? 'Punch list ×' : '+ Punch list'}</button>}
      {free.length > 0 && (
        <select className="obs-place-add" value="" aria-label="Add to a field-notes page"
          onChange={(e) => { if (e.target.value) onChange({ alsoOn: [...alsoOn, e.target.value], onPunch }) }}>
          <option value="">+ Field-notes page…</option>
          {free.map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}
        </select>
      )}
    </div>
  )
}

/**
 * Choosing observations already on the project to add somewhere — a field-notes page, the punch
 * list, an agenda. Open ones first, newest first; searchable by number, words, trade or area.
 */
export function ObsPicker({ title, all, types, skip, onAdd, onClose }: {
  title: string
  all: Observation[]
  types: ObservationType[]
  /** Already there, so not offered. */
  skip: (o: Observation) => boolean
  onAdd: (picked: Observation[]) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [closed, setClosed] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const list = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return all
      .filter((o) => !skip(o) && (closed || o.status !== 'closed'))
      .filter((o) => {
        const hay = `${nameOf(o, types)} ${o.title} ${o.trade ?? ''} ${o.area ?? ''} ${o.detail ?? ''}`.toLowerCase()
        return words.every((w) => hay.includes(w))
      })
      .sort((a, b) => (a.status === 'closed' ? 1 : 0) - (b.status === 'closed' ? 1 : 0) || b.created_at.localeCompare(a.created_at))
  }, [all, q, closed, skip, types])
  const flip = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  return (
    <div className="take-ask" onClick={onClose}>
      <div className="take-card obs-picker" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <div className="obs-picker-top">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search number, words, trade, area" autoFocus />
          <label className="small"><input type="checkbox" checked={closed} onChange={(e) => setClosed(e.target.checked)} /> Include closed</label>
        </div>
        <ul className="obs-picker-list">
          {list.map((o) => (
            <li key={o.id}>
              <label>
                <input type="checkbox" checked={picked.has(o.id)} onChange={() => flip(o.id)} />
                <span className="mono obs-no">{nameOf(o, types)}</span>
                <span className="obs-picker-t">{o.title}</span>
                <span className="muted small">{[o.area, o.status === 'closed' ? 'closed' : null].filter(Boolean).join(' · ')}</span>
              </label>
            </li>
          ))}
          {!list.length && <li className="muted small">Nothing else to add.</li>}
        </ul>
        <div className="actions">
          <button className="primary" disabled={!picked.size} onClick={() => onAdd(all.filter((o) => picked.has(o.id)))}>
            Add {picked.size || ''}
          </button>
          <button className="link" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

export { onPage }
