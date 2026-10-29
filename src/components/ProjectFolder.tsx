import { useCallback, useEffect, useState } from 'react'
import { db } from '../lib/supabase'
import { useProject } from '../lib/project'
import { chooseFolder, folderStatus, folderSupported, reconnectFolder, ROOT } from '../lib/files'
import type { Project } from '../lib/types'

/**
 * Where this project's files are saved, and the button to point it at a folder (the project's
 * CA folder on the mapped shared drive). Each computer connects the folder once.
 */
export function ProjectFolder({ project, compact = false }: { project: Project; compact?: boolean }) {
  const { reload } = useProject()
  const [status, setStatus] = useState<'none' | 'ask' | 'ready' | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const inFolder = project.storage === 'folder'

  const check = useCallback(() => { folderStatus(project.id).then(setStatus) }, [project.id])
  useEffect(() => { check() }, [check])

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setNote(null)
    try { await fn() } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setNote(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false); check() }
  }

  const pick = () => run(async () => {
    const h = await chooseFolder(project.id)
    if (inFolder && project.folder_name && h.name !== project.folder_name) {
      setNote(`You picked “${h.name}”, but this project was set up with “${project.folder_name}”. If that’s the wrong folder, choose again.`)
    }
    if (!inFolder || !project.folder_name) {
      const { error } = await db().from('projects').update({ storage: 'folder', folder_name: h.name }).eq('id', project.id)
      if (error) throw error
      await reload()
    }
  })

  const backToCloud = () => run(async () => {
    const { error } = await db().from('projects').update({ storage: 'cloud' }).eq('id', project.id)
    if (error) throw error
    await reload()
  })

  if (!inFolder) {
    if (compact) return null
    return (
      <div className="folder-bar">
        <span>Files are saved in CAzen’s cloud storage.</span>
        {folderSupported
          ? <button onClick={pick} disabled={busy}>Save to a project folder instead</button>
          : <span className="muted small">Saving to a folder needs Chrome or Edge on a computer.</span>}
        {note && <span className="bad-text small">{note}</span>}
      </div>
    )
  }

  if (!folderSupported) {
    return (
      <div className="folder-bar warn">
        This project’s files are in the folder “{project.folder_name}” on your office computers. Open CAzen in Chrome or Edge on one of them to view or save files.
      </div>
    )
  }

  return (
    <div className={`folder-bar ${status === 'ready' ? '' : 'warn'}`}>
      {status === 'ready' ? (
        <span>Saving to <strong>{project.folder_name}\{ROOT}</strong> on this computer.</span>
      ) : status === 'ask' ? (
        <span>Files are in <strong>{project.folder_name}</strong>. Allow CAzen to use it again on this computer.</span>
      ) : (
        <span>This project saves to the folder <strong>{project.folder_name}</strong>. Connect the same folder on this computer.</span>
      )}
      {status === 'ask' && <button className="primary-lite" onClick={() => run(async () => { await reconnectFolder(project.id) })} disabled={busy}>Allow</button>}
      {status === 'none' && <button className="primary-lite" onClick={pick} disabled={busy}>Connect folder</button>}
      {!compact && status !== 'none' && <button className="link" onClick={pick} disabled={busy}>Change folder</button>}
      {!compact && <button className="link" onClick={backToCloud} disabled={busy}>Save new files to the cloud instead</button>}
      {note && <span className="bad-text small">{note}</span>}
    </div>
  )
}
