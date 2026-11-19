import { useId, useMemo, useRef, useState } from 'react'
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
  const [detail, setDetail] = useState(existing?.detail ?? '')
  const [area, setArea] = useState(existing?.area ?? '')
  const [trade, setTrade] = useState(existing?.trade ?? '')
  const [status, setStatus] = useState<ObservationStatus>(existing?.status ?? 'open')
  const [observedOn, setObservedOn] = useState(existing?.observed_on ?? day ?? today())
  const [dueOn, setDueOn] = useState(existing?.due_on ?? '')
  const [photos, setPhotos] = useState<string[]>(existing?.photos ?? [])
  const [more, setMore] = useState(!!(existing?.area || existing?.trade || existing?.due_on))
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
        type_id: typeId, title: title.trim(), detail: detail.trim() || null,
        area: area.trim() || null, trade: trade.trim() || null,
        status, observed_on: observedOn, due_on: dueOn || null, photos,
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
          sheetId: pin?.sheetId ?? null,
          revisionId: pin?.revisionId ?? null,
          region: pin?.region ?? null,
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
      <div className="obs-types">
        {types.map((t) => (
          <button key={t.id} type="button" className={`chip${typeId === t.id ? ' on' : ''}`}
            onClick={() => setTypeId(t.id)}>{t.name}</button>
        ))}
      </div>

      <label className="stack">What was seen
        <input ref={titleBox} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus
          enterKeyHint="done" autoCapitalize="sentences"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); void save(!existing && !pin && kept > 0) } }}
          placeholder="Sealant missing at the head of the storefront" />
      </label>

      <label className="stack">More, if it needs it
        <textarea rows={3} value={detail} onChange={(e) => setDetail(e.target.value)} />
      </label>

      <Photos project={project} paths={photos} about={title.trim() || 'Observation'}
        editable onChange={setPhotos} onTrouble={onTrouble} />

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
          <label className="stack">Seen on
            <input type="date" value={observedOn} onChange={(e) => setObservedOn(e.target.value)} />
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
