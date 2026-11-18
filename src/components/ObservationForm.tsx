import { useState } from 'react'
import { Photos } from './Photos'
import { today } from '../lib/dates'
import { message } from '../lib/errors'
import {
  buildObservation, editObservation, saveObservation, STATUS_LABELS,
  type Observation, type ObservationStatus, type ObservationType,
} from '../lib/observations'
import type { ProjectStore } from '../lib/files'

/**
 * Writing an observation down.
 *
 * Kept short on purpose: standing in a building holding a phone, the only fields anybody
 * fills in are what it is and what kind of thing it is. Everything else is there when it
 * matters and out of the way when it doesn't.
 */
export function ObservationForm({ project, types, existing, pin, onSaved, onCancel, onTrouble }: {
  project: ProjectStore
  types: ObservationType[]
  existing?: Observation
  /** Where on a sheet it was raised, when it was raised from one. */
  pin?: { sheetId: string; revisionId: string; region: { x: number; y: number } } | null
  onSaved: (o: Observation) => void
  onCancel: () => void
  onTrouble: (m: string) => void
}) {
  const [typeId, setTypeId] = useState(existing?.type_id ?? types[0]?.id ?? null)
  const [title, setTitle] = useState(existing?.title ?? '')
  const [detail, setDetail] = useState(existing?.detail ?? '')
  const [area, setArea] = useState(existing?.area ?? '')
  const [trade, setTrade] = useState(existing?.trade ?? '')
  const [status, setStatus] = useState<ObservationStatus>(existing?.status ?? 'open')
  const [observedOn, setObservedOn] = useState(existing?.observed_on ?? today())
  const [dueOn, setDueOn] = useState(existing?.due_on ?? '')
  const [photos, setPhotos] = useState<string[]>(existing?.photos ?? [])
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(false)

  async function save() {
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
        onSaved(row)
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
        <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus
          placeholder="Sealant missing at the head of the storefront" />
      </label>

      <label className="stack">More, if it needs it
        <textarea rows={3} value={detail} onChange={(e) => setDetail(e.target.value)} />
      </label>

      <Photos project={project} paths={photos} about={title.trim() || 'Observation'}
        editable onChange={setPhotos} onTrouble={onTrouble} />

      {!more ? (
        <button type="button" className="link" onClick={() => setMore(true)}>Where, who and when</button>
      ) : (
        <div className="obs-more">
          <label className="stack">Area
            <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Level 2, east" />
          </label>
          <label className="stack">Trade
            <input value={trade} onChange={(e) => setTrade(e.target.value)} placeholder="Glazing" />
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
        <button className="link" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
