import { useEffect, useState } from 'react'
import { folderStatus } from '../lib/files'
import { message } from '../lib/errors'

/**
 * An inline "are you sure" for deleting: says exactly what goes, optionally asks for a typed
 * confirmation (e.g. the project number), and offers to remove the project-folder copies too.
 */
export function ConfirmDelete({ what, detail, typeToConfirm, folderOption, projectId, busyLabel = 'Deleting…', onConfirm, onCancel }: {
  what: string
  detail?: string
  typeToConfirm?: string
  /** Offer to delete the copies in the project's folder on this computer as well. */
  folderOption?: boolean
  /** With it, the offer is made only where this computer has that project's folder linked. */
  projectId?: string
  busyLabel?: string
  onConfirm: (alsoFolder: boolean) => Promise<void>
  onCancel: () => void
}) {
  const [typed, setTyped] = useState('')
  const [alsoFolder, setAlsoFolder] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // CAzen keeps a second copy of each PDF in the project's own folder on an office computer,
  // where one has been linked. A computer with no such folder has nothing to be asked about.
  const [linked, setLinked] = useState(!projectId)
  useEffect(() => { if (projectId) folderStatus(projectId).then((s) => setLinked(s !== 'none')).catch(() => setLinked(false)) }, [projectId])
  const offer = !!folderOption && linked
  const ok = !typeToConfirm || typed.trim() === typeToConfirm

  async function go() {
    setBusy(true)
    setError(null)
    try { await onConfirm(offer && alsoFolder) } catch (e) {
      setError(message(e))
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
      {offer && (
        <label className="check small">
          <input type="checkbox" checked={alsoFolder} onChange={(e) => setAlsoFolder(e.target.checked)} />
          <span>Also delete the PDF copies saved in this project’s folder on this computer. <span className="muted">The files in CAzen are deleted either way; unticked, the copies in the folder are left where they are.</span></span>
        </label>
      )}
      <div className="confirm-actions">
        <button className="danger" onClick={go} disabled={!ok || busy}>{busy ? busyLabel : 'Delete'}</button>
        <button onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
      {error && <div className="notice error">{error}</div>}
    </div>
  )
}
