import { useCallback, useEffect, useState } from 'react'
import { db } from '../lib/supabase'
import { useProject } from '../lib/project'
import { chooseFolder, copyToFolder, folderStatus, folderSupported, r2Ready, reconnectFolder, ROOT } from '../lib/files'
import { projectFilePaths } from '../lib/sheets'
import { backedUpToday, backupProject } from '../lib/projectData'
import type { Project } from '../lib/types'

/**
 * Where this project's files are saved, and the project folder on this computer.
 *
 *  - CAzen file storage (Cloudflare R2): the main store; opens anywhere, phones included. When the
 *    project folder is connected on this computer, every new file is also copied there, and
 *    "Copy to project folder" catches up on anything saved elsewhere.
 *  - Project folder only (the proof of concept) and starter storage (Supabase) remain for
 *    projects already set up that way.
 */
export function ProjectFolder({ project, compact = false }: { project: Project; compact?: boolean }) {
  const { reload } = useProject()
  const [status, setStatus] = useState<'none' | 'ask' | 'ready' | null>(null)
  const [r2, setR2] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const mode = project.storage ?? 'cloud'

  const check = useCallback(() => { folderStatus(project.id).then(setStatus) }, [project.id])
  useEffect(() => { check() }, [check])
  useEffect(() => { r2Ready().then(setR2) }, [])

  // Once a day per computer, with the project folder connected: save the project data there.
  const [backedUp, setBackedUp] = useState(backedUpToday(project.id))
  useEffect(() => {
    if (status !== 'ready' || backedUp || mode === 'cloud') return
    backupProject(project).then(() => setBackedUp(true)).catch(() => { /* try again next visit */ })
  }, [status, backedUp, mode, project])

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setNote(null)
    try { await fn() } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setNote(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false); check() }
  }

  const setStorage = (patch: Partial<Project>) => run(async () => {
    const { error } = await db().from('projects').update(patch).eq('id', project.id)
    if (error) throw error
    await reload()
  })

  // Connect (or change) the project folder; the first time, remember its name on the project.
  const pick = (thenStorage?: Project['storage']) => run(async () => {
    const h = await chooseFolder(project.id)
    if (project.folder_name && h.name !== project.folder_name) {
      setNote(`You picked “${h.name}”, but this project was set up with “${project.folder_name}”. If that’s the wrong folder, choose again.`)
    }
    const patch: Partial<Project> = {}
    if (!project.folder_name) patch.folder_name = h.name
    if (thenStorage && thenStorage !== mode) patch.storage = thenStorage
    if (Object.keys(patch).length) {
      const { error } = await db().from('projects').update(patch).eq('id', project.id)
      if (error) throw error
      await reload()
    }
  })

  const backfill = () => run(async () => {
    const paths = await projectFilePaths(project.id)
    const r = await copyToFolder(project, paths, (d, t) => setNote(`Copying ${d} of ${t}…`))
    setNote(r.total === 0
      ? 'Nothing to copy yet.'
      : `Copied ${r.copied} ${r.copied === 1 ? 'file' : 'files'}; ${r.already} already there${r.failed ? `; ${r.failed} couldn’t be copied` : ''}.`)
  })

  const folderName = project.folder_name ? <strong>{project.folder_name}</strong> : 'the project folder'

  // --- CAzen file storage (R2) ---
  if (mode === 'r2') {
    if (compact) {
      return r2 === false
        ? <div className="folder-bar warn">CAzen file storage isn’t set up yet, so files can’t be saved. See Drawings for details.</div>
        : null
    }
    return (
      <div className={`folder-bar ${r2 === false ? 'warn' : ''}`}>
        {r2 === false
          ? <span>CAzen file storage isn’t set up yet: the Cloudflare details still need adding in Supabase (see the setup guide).</span>
          : <span>Files are saved in CAzen file storage, so they open on your phone too.</span>}
        {folderSupported && (
          status === 'ready' ? (
            <>
              <span className="muted">Copies also go to {folderName}\{ROOT} on this computer{backedUp ? '; project data backed up today' : ''}.</span>
              <button onClick={backfill} disabled={busy}>Copy to project folder</button>
              <button className="link" onClick={() => pick()} disabled={busy}>Change folder</button>
            </>
          ) : status === 'ask' ? (
            <button onClick={() => run(async () => { await reconnectFolder(project.id) })} disabled={busy}>Allow copies to {project.folder_name ?? 'the project folder'}</button>
          ) : (
            <button onClick={() => pick()} disabled={busy}>Keep copies in the project folder</button>
          )
        )}
        {note && <span className="small">{note}</span>}
      </div>
    )
  }

  const toR2 = r2 ? <button className="primary-lite" onClick={() => setStorage({ storage: 'r2' })} disabled={busy}>Use CAzen file storage</button> : null
  const toR2Note = r2 ? <span className="muted small">New files will open anywhere, including your phone. Files saved so far stay where they are.</span> : null

  // --- Starter storage (Supabase) ---
  if (mode !== 'folder') {
    if (compact) return null
    return (
      <div className="folder-bar">
        <span>Files are saved in CAzen’s starter storage (1 GB).</span>
        {toR2}{toR2Note}
        {!r2 && folderSupported && <button onClick={() => pick('folder')} disabled={busy}>Save to a project folder instead</button>}
        {note && <span className="bad-text small">{note}</span>}
      </div>
    )
  }

  // --- Project folder only (archived projects, and the proof of concept) ---
  const isArchived = project.status === 'archived'
  if (!folderSupported) {
    return (
      <div className="folder-bar warn">
        {isArchived ? 'This project is archived. ' : ''}Its files are in the folder “{project.folder_name}” on your office computers. Open CAzen in Chrome or Edge on one of them to view{isArchived ? '' : ' or save'} files.
      </div>
    )
  }
  return (
    <div className={`folder-bar ${status === 'ready' ? '' : 'warn'}`}>
      {status === 'ready' ? (
        <span>{isArchived ? <>Archived: files open from {folderName}\{ROOT} on this computer.</> : <>Saving to {folderName}\{ROOT} on this computer.</>}</span>
      ) : status === 'ask' ? (
        <span>Files are in {folderName}. Allow CAzen to use it again on this computer.</span>
      ) : (
        <span>This project saves to the folder {folderName}. Connect the same folder on this computer.</span>
      )}
      {status === 'ask' && <button className="primary-lite" onClick={() => run(async () => { await reconnectFolder(project.id) })} disabled={busy}>Allow</button>}
      {status === 'none' && <button className="primary-lite" onClick={() => pick()} disabled={busy}>Connect folder</button>}
      {!compact && status !== 'none' && <button className="link" onClick={() => pick()} disabled={busy}>Change folder</button>}
      {!compact && !isArchived && toR2}
      {note && <span className="bad-text small">{note}</span>}
    </div>
  )
}
