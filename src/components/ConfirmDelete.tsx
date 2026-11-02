import { useState } from 'react'

/**
 * An inline "are you sure" for deleting: says exactly what goes, optionally asks for a typed
 * confirmation (e.g. the project number), and offers to remove the project-folder copies too.
 */
export function ConfirmDelete({ what, detail, typeToConfirm, folderOption, busyLabel = 'Deleting…', onConfirm, onCancel }: {
  what: string
  detail?: string
  typeToConfirm?: string
  /** Show "Also remove the copies in the project folder". */
  folderOption?: boolean
  busyLabel?: string
  onConfirm: (alsoFolder: boolean) => Promise<void>
  onCancel: () => void
}) {
  const [typed, setTyped] = useState('')
  const [alsoFolder, setAlsoFolder] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ok = !typeToConfirm || typed.trim() === typeToConfirm

  async function go() {
    setBusy(true)
    setError(null)
    try { await onConfirm(alsoFolder) } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div className="confirm-delete" role="alertdialog" aria-label={`Delete ${what}`}>
      <p><strong>Delete {what}?</strong> {detail} This can’t be undone.</p>
      {typeToConfirm && (
        <label className="small">Type <span className="mono">{typeToConfirm}</span> to confirm
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
        </label>
      )}
      {folderOption && (
        <label className="check small"><input type="checkbox" checked={alsoFolder} onChange={(e) => setAlsoFolder(e.target.checked)} /> Also remove the copies in the project folder on this computer</label>
      )}
      <div className="confirm-actions">
        <button className="danger" onClick={go} disabled={!ok || busy}>{busy ? busyLabel : 'Delete'}</button>
        <button onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
      {error && <div className="notice error">{error}</div>}
    </div>
  )
}
