import { useEffect, useState } from 'react'
import { useProject } from '../lib/project'
import { chooseFolder, folderStatus, folderSupported, reconnectFolder, ROOT, SECTIONS } from '../lib/files'
import { backupProject } from '../lib/projectData'
import { archiveProject, deleteProject } from '../lib/sheets'
import { ConfirmDelete } from './ConfirmDelete'
import type { Project } from '../lib/types'

/**
 * Keeping a project safe and finishing it: back up its records to the project folder, archive it
 * (everything to the project folder, then off the cloud), or delete it. Archive and delete are
 * for firm admins; the database enforces that too.
 */
export function ProjectAdmin({ project, isAdmin }: { project: Project; isAdmin: boolean }) {
  const { reload, select } = useProject()
  const [status, setStatus] = useState<'none' | 'ask' | 'ready' | null>(null)
  const [panel, setPanel] = useState<'archive' | 'delete' | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const archived = project.status === 'archived'

  useEffect(() => { folderStatus(project.id).then(setStatus) }, [project.id])

  async function connect() {
    try {
      if (status === 'ask') await reconnectFolder(project.id)
      else await chooseFolder(project.id)
    } catch { /* cancelled */ }
    setStatus(await folderStatus(project.id))
  }

  async function run(fn: () => Promise<string>) {
    setBusy(true)
    setError(null)
    setMsg(null)
    try { setMsg(await fn()) } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  const backup = () => run(async () => `Saved to ${project.folder_name ?? 'the project folder'}\\${await backupProject(project)}.`)

  const archive = () => run(async () => {
    const r = await archiveProject(project, setMsg)
    await reload()
    setPanel(null)
    return `Archived. ${r.copied + r.alreadyThere} files are in ${project.folder_name ?? 'the project folder'}\\${ROOT}, with the project data in ${SECTIONS.data}; ${r.removedFromCloud} removed from the cloud${r.failedToRemove ? ` (${r.failedToRemove} couldn’t be removed; they show in Settings → File storage)` : ''}. The project stays listed, and opens from the folder on office computers.`
  })

  const needsFolder = !folderSupported
    ? <p className="muted small">Backing up and archiving use the project folder, so they need Chrome or Edge on an office computer.</p>
    : status !== 'ready'
      ? <p className="small">Connect the project folder first: <button className="link" onClick={connect}>{status === 'ask' ? `Allow ${project.folder_name ?? 'the folder'}` : 'Choose the project folder'}</button></p>
      : null

  return (
    <div className="project-admin">
      <div className="pa-row">
        <div>
          <strong>Back up</strong>
          <p className="muted small">Saves this project’s records (sheets, revisions, forms, links, and the firm’s templates) as one file in {ROOT}\{SECTIONS.data}. Supabase’s free plan doesn’t back up the database, so this is your copy.</p>
        </div>
        <button onClick={backup} disabled={busy || status !== 'ready'}>Back up now</button>
      </div>
      {isAdmin && !archived && (
        <div className="pa-row">
          <div>
            <strong>Archive</strong>
            <p className="muted small">For a finished project: copies every file and the project data into the project folder, checks each copy, then removes the files from the cloud to free space. The project stays listed and opens from the folder on office computers.</p>
          </div>
          <button onClick={() => setPanel(panel === 'archive' ? null : 'archive')} disabled={busy}>Archive…</button>
        </div>
      )}
      {panel === 'archive' && (
        <div className="confirm-delete">
          <p><strong>Archive {project.number} {project.name}?</strong> Files are only removed from the cloud after every one is confirmed in the project folder. Opening them from a phone won’t work afterwards.</p>
          {needsFolder}
          <div className="confirm-actions">
            <button className="primary-lite" onClick={archive} disabled={busy || status !== 'ready'}>{busy ? 'Archiving…' : 'Archive project'}</button>
            <button onClick={() => setPanel(null)} disabled={busy}>Cancel</button>
          </div>
        </div>
      )}
      {isAdmin && (
        <div className="pa-row">
          <div>
            <strong>Delete</strong>
            <p className="muted small">Removes the project, its records and its cloud files for good. Copies in the project folder are left alone.</p>
          </div>
          <button className="danger-outline" onClick={() => setPanel(panel === 'delete' ? null : 'delete')} disabled={busy}>Delete…</button>
        </div>
      )}
      {panel === 'delete' && (
        <ConfirmDelete
          what={`${project.number} ${project.name}`}
          detail="Every sheet, revision, issued form and cloud file of this project goes. Back it up or archive it first if you may need it."
          typeToConfirm={project.number}
          onCancel={() => setPanel(null)}
          onConfirm={async () => {
            const r = await deleteProject(project)
            select(null)
            await reload()
            setPanel(null)
            setMsg(`Deleted. ${r.deleted} cloud files removed.`)
          }}
        />
      )}
      {!panel && needsFolder && status !== 'ready' && folderSupported && <div className="small">{needsFolder}</div>}
      {msg && <div className="notice">{msg}</div>}
      {error && <div className="notice error">{error}</div>}
    </div>
  )
}
