import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { SheetSpot } from './SheetSpot'
import { byTrade, listCustomTags, markOf, markOfTag, type Tag } from '../lib/tags'
import { TagMark } from './TagMark'
import { useFirm } from '../lib/firm'
import { listPeople } from '../lib/people'

/**
 * Who it was talked over with, kept as the last line of the detail — "Discussed with: …" — so
 * it travels with the observation into a report without the observation needing another field.
 */
const WITH = /\n?^Discussed with:\s*(.*)$/im
const splitDetail = (d: string | null | undefined) => {
  const m = (d ?? '').match(WITH)
  return { detail: (d ?? '').replace(WITH, '').trimEnd(), discussed: m?.[1]?.trim() ?? '' }
}
const joinDetail = (detail: string, discussed: string) =>
  [detail.trim(), discussed.trim() ? `Discussed with: ${discussed.trim()}` : ''].filter(Boolean).join('\n') || null
import { Photos } from './Photos'
import { today } from '../lib/dates'
import { message } from '../lib/errors'
import {
  buildObservation, editObservation, saveObservation, STATUS_LABELS,
  type Observation, type ObservationStatus, type ObservationType,
} from '../lib/observations'
import type { ProjectStore } from '../lib/files'
import { readPref, writePref } from '../lib/prefs'

/** The type last used on this device: a punch walk is forty of the same kind in a row. */
const LAST_TYPE = 'cazen.pref.lastObservationType'

const distinct = (list: (string | null | undefined)[]) =>
  [...new Set(list.map((x) => (x ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))

/**
 * Writing an observation down.
 *
 * Kept short on purpose: standing in a building holding a phone, the only fields anybody
 * fills in are what it is and what kind of thing it is. Everything else is there when it
 * matters and out of the way when it doesn't.
 */
export function ObservationForm({ project, types, existing, pin, known, day, onSaved, onCancel, onTrouble }: {
  /** The day it was seen, when it is being added to a visit that has one. */
  day?: string
  project: ProjectStore
  types: ObservationType[]
  existing?: Observation
  /** Where on a sheet it was raised, when it was raised from one. */
  pin?: { sheetId: string; revisionId: string; region: { x: number; y: number } } | null
  /** What is already on the project, so an area or a trade typed once is offered afterwards. */
  known?: Observation[] | null
  /** `another` is true when the form has stayed open for the next one. */
  onSaved: (o: Observation, another?: boolean) => void
  onCancel: () => void
  onTrouble: (m: string) => void
}) {
  const [typeId, setTypeId] = useState(() => {
    if (existing) return existing.type_id ?? null
    const last = readPref<string | null>(LAST_TYPE, null)
    return types.some((t) => t.id === last) ? last : types[0]?.id ?? null
  })
  const [title, setTitle] = useState(existing?.title ?? '')
  const [detail, setDetail] = useState(() => splitDetail(existing?.detail).detail)
  const [discussed, setDiscussed] = useState(() => splitDetail(existing?.detail).discussed)
  const [people, setPeople] = useState<string[]>([])
  useEffect(() => { listPeople(project.id).then((p) => setPeople(p.map((x) => x.name))).catch(() => setPeople([])) }, [project.id])
  const [area, setArea] = useState(existing?.area ?? '')
  const [trade, setTrade] = useState(existing?.trade ?? '')
  const [status, setStatus] = useState<ObservationStatus>(existing?.status ?? 'open')
  const [observedOn, setObservedOn] = useState(existing?.observed_on ?? day ?? today())
  const [dueOn, setDueOn] = useState(existing?.due_on ?? '')
  const [photos, setPhotos] = useState<string[]>(existing?.photos ?? [])
  const [more, setMore] = useState(!!(existing?.area || existing?.trade || existing?.due_on))
  // Where on the drawings it is: given by the sheet it was raised from, already on the
  // observation, or chosen here with "Tag to drawing".
  const [spot, setSpot] = useState<{ sheetId: string; revisionId: string; region: { x: number; y: number }; number?: string; thumb?: string } | null>(
    pin ?? (existing?.sheet_id && existing.region ? { sheetId: existing.sheet_id, revisionId: existing.revision_id ?? '', region: existing.region } : null))
  const [spotting, setSpotting] = useState(false)
  const [tagging, setTagging] = useState(false)
  const [tagTrade, setTagTrade] = useState<string | null>(null)
  const { firm } = useFirm()
  const [custom, setCustom] = useState<Tag[]>([])
  useEffect(() => { if (firm) listCustomTags(firm.id).then(setCustom).catch(() => setCustom([])) }, [firm])
  const groups = useMemo(() => byTrade(custom), [custom])
  const mark = markOf(trade, title, custom)
  const [busy, setBusy] = useState(false)
  const [kept, setKept] = useState(0)
  const titleBox = useRef<HTMLInputElement | null>(null)
  const listId = useId()
  const areas = useMemo(() => distinct((known ?? []).map((o) => o.area)), [known])
  const trades = useMemo(() => distinct((known ?? []).map((o) => o.trade)), [known])

  async function save(another = false) {
    if (!title.trim() || busy) return
    setBusy(true)
    try {
      const patch = {
        type_id: typeId, title: title.trim(), detail: joinDetail(detail, discussed),
        area: area.trim() || null, trade: trade.trim() || null,
        status, observed_on: observedOn, due_on: dueOn || null, photos,
        sheet_id: spot?.sheetId ?? null, revision_id: spot?.revisionId || null, region: spot?.region ?? null,
      }
      if (existing) {
        onSaved(await editObservation(existing, patch))
      } else {
        const row = buildObservation({
          projectId: project.id,
          typeId,
          title: patch.title,
          detail: patch.detail,
          area: patch.area,
          trade: patch.trade,
          status,
          observedOn,
          dueOn: patch.due_on,
          photos,
          sheetId: spot?.sheetId ?? null,
          revisionId: spot?.revisionId || null,
          region: spot?.region ?? null,
        })
        await saveObservation(row)
        if (typeId) writePref(LAST_TYPE, typeId)
        onSaved(row, another)
        if (another) {
          // The next one on a walk is usually the same kind of thing in the same room, so the
          // type, the area, the trade and the day stay; what was seen starts empty.
          setTitle(''); setDetail(''); setPhotos([]); setDueOn(''); setStatus('open')
          setKept((n) => n + 1)
          titleBox.current?.focus()
        }
      }
    } catch (e) { onTrouble(message(e)) } finally { setBusy(false) }
  }

  return (
    <div className="card obs-form">
      {/* The heading is the observation: it says what was seen as it is typed, and can be
          clicked and typed into itself. Under it, the day, and who it was talked over with. */}
      <header className="obs-head">
        <input className="obs-name" value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder={existing ? 'Observation' : 'New observation'} aria-label="Name — click to edit" title="Click to edit" />
        <div className="obs-head-row">
          <input type="date" value={observedOn} onChange={(e) => setObservedOn(e.target.value)} aria-label="Date" />
          <input value={discussed} onChange={(e) => setDiscussed(e.target.value)} placeholder="Discussed with (optional)"
            aria-label="Discussed with" list={`${listId}-people`} />
          <datalist id={`${listId}-people`}>{people.map((n) => <option key={n} value={n} />)}</datalist>
        </div>
      </header>

      <div className="obs-types">
        {types.map((t) => (
          <button key={t.id} type="button" className={`chip${typeId === t.id ? ' on' : ''}`}
            onClick={() => setTypeId(t.id)}>{t.name}</button>
        ))}
        <button type="button" className="chip obs-tag-open" onClick={() => setTagging(!tagging)}>
          {mark && <TagMark mark={mark} size={18} />}
          {trade || 'Trade tag'}
        </button>
      </div>
      {tagging && (
        <div className="obs-tags">
          <div className="obs-tag-trades">
            {groups.map((g) => (
              <button key={g.trade} type="button" className={`chip${(tagTrade ?? trade) === g.trade ? ' on' : ''}`} onClick={() => setTagTrade(g.trade)}>
                <TagMark mark={g.mark} size={18} />{g.trade}
              </button>
            ))}
          </div>
          {groups.filter((g) => g.trade === (tagTrade ?? trade)).map((g) => (
            <div key={g.trade} className="obs-tag-issues">
              {g.tags.map((t) => (
                <button key={t.label} type="button" className="chip" style={{ borderColor: g.colour }}
                  onClick={() => {
                    setTrade(g.trade)
                    // The tag is what was seen until somebody says more; it never overwrites what was typed.
                    if (!title.trim()) setTitle(t.label)
                    else if (!title.toLowerCase().includes(t.label.toLowerCase())) setTitle(`${t.label} — ${title.trim()}`)
                    setTagging(false)
                    titleBox.current?.focus()
                  }}><TagMark mark={markOfTag(g, t)} size={16} />{t.label}</button>
              ))}
              <button type="button" className="chip" onClick={() => { setTrade(g.trade); setTagging(false) }}>Just {g.trade}</button>
            </div>
          ))}
        </div>
      )}

      <label className="stack">What was seen
        <input ref={titleBox} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus
          enterKeyHint="done" autoCapitalize="sentences"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); void save(!existing && !pin && kept > 0) } }}
          placeholder="Sealant missing at the head of the storefront" />
      </label>

      <label className="stack">More, if it needs it
        <textarea rows={3} value={detail} onChange={(e) => setDetail(e.target.value)} />
      </label>

      <div className="obs-attach">
        <div>
          <span className="obs-attach-label">Photos</span>
          <Photos project={project} paths={photos} about={title.trim() || 'Observation'}
            editable onChange={setPhotos} onTrouble={onTrouble} />
        </div>
        <div>
          <span className="obs-attach-label">Tag to drawing</span>
          <div className="photo-strip">
            {spot && (
              <button type="button" className="photo obs-spot" onClick={() => setSpotting(true)} title="Move it">
                {spot.thumb ? <img src={spot.thumb} alt="" /> : <span className="obs-spot-pin" aria-hidden="true" />}
                <span className="obs-spot-no">{spot.number ?? 'On a sheet'}</span>
              </button>
            )}
            {!spot && (
              <button type="button" className="photo photo-add" onClick={() => setSpotting(true)}>
                <span aria-hidden="true">+</span>
                <span className="small">Drawing</span>
              </button>
            )}
            {spot && !pin && <button type="button" className="link" onClick={() => setSpot(null)}>Take off</button>}
          </div>
        </div>
      </div>

      {!more ? (
        <button type="button" className="link" onClick={() => setMore(true)}>
          Where, who and when{area || trade ? ` — ${[area, trade].filter(Boolean).join(', ')}` : ''}
        </button>
      ) : (
        <div className="obs-more">
          <label className="stack">Area
            <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Level 2, east" list={`${listId}-areas`} />
            <datalist id={`${listId}-areas`}>{areas.map((a) => <option key={a} value={a} />)}</datalist>
          </label>
          <label className="stack">Trade
            <input value={trade} onChange={(e) => setTrade(e.target.value)} placeholder="Glazing" list={`${listId}-trades`} />
            <datalist id={`${listId}-trades`}>{trades.map((a) => <option key={a} value={a} />)}</datalist>
          </label>
          <label className="stack">Wanted by
            <input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
          </label>
          <label className="stack">Status
            <select value={status} onChange={(e) => setStatus(e.target.value as ObservationStatus)}>
              {(Object.keys(STATUS_LABELS) as ObservationStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {pin && <p className="muted small">Pinned to the sheet it was raised from.</p>}
      {spotting && (
        <SheetSpot project={project} mark={mark} start={spot ? { sheetId: spot.sheetId, region: spot.region } : null}
          onPick={(s) => { setSpot(s); setSpotting(false) }} onClose={() => setSpotting(false)} />
      )}

      <div className="actions">
        <button className="primary" disabled={!title.trim() || busy} onClick={() => void save()}>
          {busy ? 'Keeping…' : existing ? 'Save' : 'Keep it'}
        </button>
        {!existing && !pin && (
          <button disabled={!title.trim() || busy} onClick={() => void save(true)}>Keep and add another</button>
        )}
        <button className="link" onClick={onCancel}>{kept > 0 ? 'Done' : 'Cancel'}</button>
        {kept > 0 && <span className="muted small" role="status">{kept} kept</span>}
      </div>
    </div>
  )
}
