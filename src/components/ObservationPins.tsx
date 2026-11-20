import { listCustomTags, markOf, type Mark, type Tag } from '../lib/tags'
import { TagMark } from './TagMark'
import { useFirm } from '../lib/firm'
import { useCallback, useEffect, useState } from 'react'
import { ObservationForm } from './ObservationForm'
import { listObservations, listTypes, nameOf, spotsOn, watchObservations, type Observation, type ObservationType } from '../lib/observations'
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
  const { firm } = useFirm()
  const [custom, setCustom] = useState<Tag[]>([])
  const firmId = firm?.id
  useEffect(() => { if (firmId) listCustomTags(firmId).then(setCustom).catch(() => setCustom([])) }, [firmId])
  /** An observation with no trade still gets a mark: round, in the colour of where it stands. */
  const plain = (o: Observation): Mark => ({
    shape: 'circle', text: types.find((t) => t.id === o.type_id)?.code ?? '',
    colour: o.status === 'closed' ? '#5f7a61' : o.status === 'in_progress' ? '#b06a00' : '#c0392b',
  })

  const [placingMark, setPlacingMark] = useState<Mark | null>(null)

  const load = useCallback(() => {
    listObservations(project.id)
      .then((list) => setAll(list.filter((o) => spotsOn(o, sheetId).length > 0)))
      .catch(() => setAll([]))
  }, [project.id, sheetId])
  useEffect(() => { load() }, [load])
  useEffect(() => { listTypes().then(setTypes).catch(() => setTypes([])) }, [])

  useEffect(() => {
    try {
      return watchObservations(project.id, {
        added: (o) => { if (spotsOn(o, sheetId).length) setAll((l) => (l.some((x) => x.id === o.id) ? l : [...l, o])) },
        // An observation may gain or lose a place on this sheet when it is changed.
        changed: () => load(),
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

      {/* On the sheet an observation is a dot, so thirty of them do not bury the drawing. Under
          the pointer it opens into its mark and number; held there a moment longer, into what
          was seen. A touch has no hover, and opens the observation itself. */}
      {all.flatMap((o) => spotsOn(o, sheetId).map((at, n) => (
        <button key={`${o.id}-${n}`} className={`obs-dot${o.status === 'closed' ? ' closed' : ''}`}
          style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%` }}
          aria-label={[nameOf(o, types), o.trade, o.title].filter(Boolean).join(' — ')}
          onClick={() => setOpen(o)}>
          <span className="obs-dot-mark"><TagMark mark={markOf(o.trade, o.title, custom) ?? plain(o)} size={30} /></span>
          <span className="obs-dot-no">{nameOf(o, types)}</span>
          <span className="obs-dot-said">{o.trade && <b>{o.trade}</b>}{o.title}</span>
        </button>
      )))}

      {placing && (
        // The tag being placed is the tag it will be: the mark of the kind chosen on the form,
        // and a plain dot until a kind is chosen.
        <span className="obs-placing" style={{ left: `${placing.x * 100}%`, top: `${placing.y * 100}%` }}>
          {placingMark ? <TagMark mark={placingMark} size={30} /> : <span className="spot-pin-dot" />}
        </span>
      )}

      {(placing || open) && (
        <div className="obs-pin-sheet" role="dialog">
          <ObservationForm
            project={project}
            types={types}
            existing={open ?? undefined}
            pin={placing ? { sheetId, revisionId, region: placing } : null}
            onMark={placing ? setPlacingMark : undefined}
            onSaved={() => { setPlacing(null); setOpen(null); onDonePinning(); load() }}
            onCancel={() => { setPlacing(null); setOpen(null); onDonePinning() }}
            onTrouble={(m) => onTrouble(message(m))} />
        </div>
      )}
    </>
  )
}
