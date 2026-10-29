import { useState } from 'react'
import { cleanOrder, DEFAULT_DISCIPLINES, type Discipline } from '../lib/disciplines'

/**
 * Edit the order disciplines appear in a set: drag rows (or use the arrows), edit codes and names,
 * add or remove disciplines. Calls onSave with the cleaned list.
 */
export function DisciplineOrderEditor({ value, onSave, onCancel, saveLabel = 'Save order', disabled, extra }: {
  value: Discipline[]
  onSave: (list: Discipline[]) => Promise<void> | void
  onCancel?: () => void
  saveLabel?: string
  disabled?: boolean
  extra?: React.ReactNode
}) {
  const [list, setList] = useState<Discipline[]>(value)
  const [drag, setDrag] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const move = (from: number, to: number) => {
    if (to < 0 || to >= list.length || from === to) return
    const next = [...list]
    const [row] = next.splice(from, 1)
    next.splice(to, 0, row)
    setList(next)
  }
  const edit = (i: number, patch: Partial<Discipline>) => setList(list.map((d, j) => (j === i ? { ...d, ...patch } : d)))

  async function save() {
    setBusy(true)
    setNote(null)
    try {
      const cleaned = cleanOrder(list)
      await onSave(cleaned)
      setList(cleaned)
      setNote('Saved.')
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const codes = list.map((d) => d.code.trim().toUpperCase())
  return (
    <div className="disc-editor">
      <ol className="disc-list">
        {list.map((d, i) => (
          <li
            key={i}
            className={`${drag === i ? 'dragging' : ''} ${over === i && drag !== null && drag !== i ? (drag < i ? 'over-below' : 'over-above') : ''}`}
            draggable={!disabled}
            onDragStart={(e) => { setDrag(i); e.dataTransfer.effectAllowed = 'move' }}
            onDragOver={(e) => { e.preventDefault(); setOver(i) }}
            onDragLeave={() => setOver((o) => (o === i ? null : o))}
            onDrop={(e) => { e.preventDefault(); if (drag !== null) move(drag, i); setDrag(null); setOver(null) }}
            onDragEnd={() => { setDrag(null); setOver(null) }}
          >
            <span className="disc-grip" aria-hidden="true">⋮⋮</span>
            <span className="disc-pos">{i + 1}</span>
            <input className={`disc-code mono ${codes.indexOf(codes[i]) !== i && codes[i] ? 'bad' : ''}`} value={d.code} disabled={disabled}
              aria-label="Letters" maxLength={3} onChange={(e) => edit(i, { code: e.target.value.toUpperCase() })} />
            <input className="disc-name" value={d.name} disabled={disabled} aria-label="Discipline" onChange={(e) => edit(i, { name: e.target.value })} />
            <span className="disc-moves">
              <button type="button" className="icon" disabled={disabled || i === 0} onClick={() => move(i, i - 1)} aria-label={`Move ${d.code} up`}>↑</button>
              <button type="button" className="icon" disabled={disabled || i === list.length - 1} onClick={() => move(i, i + 1)} aria-label={`Move ${d.code} down`}>↓</button>
              <button type="button" className="icon" disabled={disabled} onClick={() => setList(list.filter((_, j) => j !== i))} aria-label={`Remove ${d.code}`}>×</button>
            </span>
          </li>
        ))}
      </ol>
      {!disabled && (
        <div className="actions">
          <button type="button" onClick={() => setList([...list, { code: '', name: '' }])}>Add discipline</button>
          <button type="button" className="link" onClick={() => setList(DEFAULT_DISCIPLINES)}>Standard order</button>
          <span className="grow" />
          {extra}
          {onCancel && <button type="button" onClick={onCancel}>Cancel</button>}
          <button type="button" className="primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : saveLabel}</button>
        </div>
      )}
      {note && <p className="muted small">{note}</p>}
    </div>
  )
}
