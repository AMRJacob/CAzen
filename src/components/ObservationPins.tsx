import { colourOf } from '../lib/tags'
import { useCallback, useEffect, useState } from 'react'
import { ObservationForm } from './ObservationForm'
import { listObservations, listTypes, nameOf, watchObservations, type Observation, type ObservationType } from '../lib/observations'
import { message } from '../lib/errors'
import type { ProjectStore } from '../lib/files'

/**
 * Observations pinned to a drawing.
 *
 * The thing you are standing in front of is on a sheet, and the sheet is what you have open.
 * Putting the observation where the problem is costs one tap and saves a paragraph of "at the
 * northeast corner of the mechanical room, above the door" — and anybody opening the sheet
 * later sees it where it happened.
 */
export function ObservationPins({ project, sheetId, revisionId, pinning, onDonePinning, onTrouble }: {
  project: ProjectStore
  sheetId: string
  revisionId: string
  /** True while the next tap on the sheet should place a pin. */
  pinning: boolean
  onDonePinning: () => void
  onTrouble: (m: string) => void
}) {
  const [all, setAll] = useState<Observation[]>([])
  const [types, setTypes] = useState<ObservationType[]>([])
  const [placing, setPlacing] = useState<{ x: number; y: number } | null>(null)
  const [open, setOpen] = useState<Observation | null>(null)

  const load = useCallback(() => {
    listObservations(project.id)
      .then((list) => setAll(list.filter((o) => o.sheet_id === sheetId && o.region)))
      .catch(() => setAll([]))
  }, [project.id, sheetId])
  useEffect(() => { load() }, [load])
  useEffect(() => { listTypes().then(setTypes).catch(() => setTypes([])) }, [])

  useEffect(() => {
    try {
      return watchObservations(project.id, {
        added: (o) => { if (o.sheet_id === sheetId && o.region) setAll((l) => (l.some((x) => x.id === o.id) ? l : [...l, o])) },
        changed: (o) => setAll((l) => l.map((x) => (x.id === o.id ? { ...x, ...o } : x))),
        removed: (id) => setAll((l) => l.filter((x) => x.id !== id)),
      })
    } catch { return }
  }, [project.id, sheetId])

  return (
    <>
      {/* While pinning, the whole sheet is the target. */}
      {pinning && !placing && (
        <button className="obs-pin-catcher" aria-label="Put the observation where it was seen"
          onClick={(e) => {
            const box = (e.currentTarget as HTMLElement).getBoundingClientRect()
            setPlacing({ x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height })
          }} />
      )}

      {all.map((o) => (
        <button key={o.id} className={`obs-pin obs-pin-${o.status}${o.trade ? ' obs-pin-trade' : ''}`}
          style={{ left: `${(o.region?.x ?? 0) * 100}%`, top: `${(o.region?.y ?? 0) * 100}%`, ...(colourOf(o.trade) ? { background: colourOf(o.trade)! } : {}) }}
          title={[o.trade, o.title].filter(Boolean).join(' — ')}
          onClick={() => setOpen(o)}>
          <span>{nameOf(o, types)}</span>
        </button>
      ))}

      {placing && (
        <span className="obs-pin obs-pin-new" style={{ left: `${placing.x * 100}%`, top: `${placing.y * 100}%` }}>
          <span>+</span>
        </span>
      )}

      {(placing || open) && (
        <div className="obs-pin-sheet" role="dialog">
          <ObservationForm
            project={project}
            types={types}
            existing={open ?? undefined}
            pin={placing ? { sheetId, revisionId, region: placing } : null}
            onSaved={() => { setPlacing(null); setOpen(null); onDonePinning(); load() }}
            onCancel={() => { setPlacing(null); setOpen(null); onDonePinning() }}
            onTrouble={(m) => onTrouble(message(m))} />
        </div>
      )}
    </>
  )
}
