import { db } from './supabase'

/**
 * Where a project's files live.
 *
 *  - "cloud": CAzen's Supabase storage (the original setup). Paths look like "{project}/sheets/…".
 *  - "folder": a folder the user picked on their own computer, such as the project's CA folder on a
 *    mapped shared drive. CAzen builds its own subfolders there. Paths are stored relative to that
 *    folder with a "folder:" prefix, e.g. "folder:CAzen/02 Drawings/2026-02-10 Addendum 1/A-101 First Floor Plan.pdf",
 *    so they work for anyone who has the same folder mapped.
 *
 * Folder access uses the browser's File System Access API (desktop Chrome and Edge). The folder
 * itself can't be saved in the database, so each browser remembers its own connection (IndexedDB).
 */
export type StorageMode = 'cloud' | 'folder'

const FOLDER = 'folder:'
export const isFolderPath = (p: string | null | undefined) => !!p?.startsWith(FOLDER)

/** CAzen's own folder inside the project folder, and its sections. Names are as they appear in Explorer. */
export const ROOT = 'CAzen'
export const SECTIONS = {
  contract: '01 Contract',
  drawings: '02 Drawings',
  manual: '03 Project Manual',
  submittals: '04 Submittals',
  rfis: '05 RFIs',
  asis: '06 ASIs',
  prs: '07 Proposal Requests',
  ccds: '08 CCDs',
  fieldReports: '09 Field Reports',
  punch: '10 Punch List',
  payApps: '11 Pay Applications',
} as const

// --- File System Access API bits TypeScript doesn't describe yet ---
type PermissionMode = { mode: 'read' | 'readwrite' }
interface PermissionedHandle extends FileSystemDirectoryHandle {
  queryPermission(d: PermissionMode): Promise<PermissionState>
  requestPermission(d: PermissionMode): Promise<PermissionState>
}
declare global {
  interface Window { showDirectoryPicker?: (o?: { id?: string; mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle> }
}

export const folderSupported = typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'

export class FolderNotConnected extends Error {
  folderName: string | null
  constructor(folderName: string | null) {
    super(folderName
      ? `This project's files are in the folder “${folderName}”. Connect it on this computer to open or save files.`
      : 'Connect the project folder on this computer to open or save files.')
    this.folderName = folderName
  }
}

// --- Remembered folders, one per project, in this browser ---
function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('cazen', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('folders')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
async function idbGet<T>(key: string): Promise<T | undefined> {
  const d = await idb()
  return new Promise((resolve, reject) => {
    const r = d.transaction('folders').objectStore('folders').get(key)
    r.onsuccess = () => resolve(r.result as T | undefined)
    r.onerror = () => reject(r.error)
  })
}
async function idbSet(key: string, value: unknown) {
  const d = await idb()
  return new Promise<void>((resolve, reject) => {
    const t = d.transaction('folders', 'readwrite')
    t.objectStore('folders').put(value, key)
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
  })
}

// Folders already looked up this session, so every file doesn't re-read IndexedDB.
const live = new Map<string, FileSystemDirectoryHandle>()

export async function rememberedFolder(projectId: string): Promise<FileSystemDirectoryHandle | null> {
  const hit = live.get(projectId)
  if (hit) return hit
  try {
    const h = (await idbGet<FileSystemDirectoryHandle>(projectId)) ?? null
    if (h) live.set(projectId, h)
    return h
  } catch { return null }
}

/** Is the remembered folder usable right now without asking? */
export async function folderStatus(projectId: string): Promise<'none' | 'ask' | 'ready'> {
  const h = (await rememberedFolder(projectId)) as PermissionedHandle | null
  if (!h) return 'none'
  try { return (await h.queryPermission({ mode: 'readwrite' })) === 'granted' ? 'ready' : 'ask' } catch { return 'ask' }
}

/** Ask the browser to let CAzen use the remembered folder again (must follow a click). */
export async function reconnectFolder(projectId: string): Promise<boolean> {
  const h = (await rememberedFolder(projectId)) as PermissionedHandle | null
  if (!h) return false
  return (await h.requestPermission({ mode: 'readwrite' })) === 'granted'
}

/** Pick the project's folder (must follow a click). Creates CAzen's subfolders inside it. */
export async function chooseFolder(projectId: string): Promise<FileSystemDirectoryHandle> {
  if (!window.showDirectoryPicker) throw new Error('This browser can’t open folders. Use Chrome or Edge on a computer.')
  const h = await window.showDirectoryPicker({ id: 'cazen-project', mode: 'readwrite' })
  live.set(projectId, h)
  await idbSet(projectId, h)
  const root = await h.getDirectoryHandle(ROOT, { create: true })
  for (const name of Object.values(SECTIONS)) await root.getDirectoryHandle(name, { create: true })
  return h
}

async function readyFolder(projectId: string, folderName: string | null): Promise<FileSystemDirectoryHandle> {
  const h = (await rememberedFolder(projectId)) as PermissionedHandle | null
  if (!h) throw new FolderNotConnected(folderName)
  let p: PermissionState = 'prompt'
  try { p = await h.queryPermission({ mode: 'readwrite' }) } catch { /* treat as not granted */ }
  if (p !== 'granted') {
    try { p = await h.requestPermission({ mode: 'readwrite' }) } catch { /* needs a click */ }
  }
  if (p !== 'granted') throw new FolderNotConnected(folderName)
  return h
}

/** A name Windows accepts: no \ / : * ? " < > |, no trailing dots or spaces, not too long. */
export function safeName(s: string, max = 120): string {
  const cleaned = s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '')
  return (cleaned || 'Untitled').slice(0, max).trim()
}

export interface ProjectStore {
  id: string
  storage?: StorageMode | null
  folder_name?: string | null
}

/**
 * Save a file and return the path to keep in the database. Never overwrites: if the name is
 * taken, " (2)", " (3)"… is added.
 *  cloudPath: where it goes in cloud storage.
 *  folder:    subfolders under CAzen\ and the file name, for folder storage.
 */
export async function putFile(project: ProjectStore, bytes: Uint8Array, cloudPath: string, folder: { dirs: string[]; name: string }, type = 'application/pdf'): Promise<string> {
  if (project.storage !== 'folder') {
    const up = await db().storage.from('documents').upload(cloudPath, new Blob([bytes as BlobPart], { type }), { upsert: false })
    if (up.error) throw up.error
    return cloudPath
  }
  const base = await readyFolder(project.id, project.folder_name ?? null)
  let dir = await base.getDirectoryHandle(ROOT, { create: true })
  const parts = [ROOT]
  for (const d of folder.dirs) {
    const n = safeName(d)
    dir = await dir.getDirectoryHandle(n, { create: true })
    parts.push(n)
  }
  const dot = folder.name.lastIndexOf('.')
  const stem = safeName(dot > 0 ? folder.name.slice(0, dot) : folder.name)
  const ext = dot > 0 ? folder.name.slice(dot) : ''
  let name = stem + ext
  for (let i = 2; await exists(dir, name); i++) name = `${stem} (${i})${ext}`
  const fh = await dir.getFileHandle(name, { create: true })
  const w = await fh.createWritable()
  await w.write(bytes as BlobPart)
  await w.close()
  return FOLDER + [...parts, name].join('/')
}

async function exists(dir: FileSystemDirectoryHandle, name: string) {
  try { await dir.getFileHandle(name); return true } catch { return false }
}

/** Read a stored file, wherever it lives. */
export async function readFile(project: ProjectStore, path: string): Promise<Uint8Array> {
  if (!isFolderPath(path)) {
    const { data, error } = await db().storage.from('documents').download(path)
    if (error) throw error
    return new Uint8Array(await data.arrayBuffer())
  }
  const base = await readyFolder(project.id, project.folder_name ?? null)
  const parts = path.slice(FOLDER.length).split('/')
  let dir = base
  for (const d of parts.slice(0, -1)) {
    try { dir = await dir.getDirectoryHandle(d) } catch { throw new Error(`Can’t find the folder “${d}” in the project folder. It may have been moved or renamed.`) }
  }
  try {
    const f = await (await dir.getFileHandle(parts[parts.length - 1])).getFile()
    return new Uint8Array(await f.arrayBuffer())
  } catch {
    throw new Error(`Can’t find “${parts[parts.length - 1]}” in ${parts.slice(0, -1).join('\\')}. It may have been moved, renamed or deleted in Explorer.`)
  }
}

/** Open a stored PDF in a new tab. */
export async function openFile(project: ProjectStore, path: string) {
  // Open the tab first, inside the click, so pop-up blockers allow it.
  const tab = window.open('', '_blank')
  try {
    if (!isFolderPath(path)) {
      const { data, error } = await db().storage.from('documents').createSignedUrl(path, 600)
      if (error) throw error
      if (tab) tab.location.href = data.signedUrl
      else window.open(data.signedUrl, '_blank', 'noopener')
      return
    }
    const bytes = await readFile(project, path)
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
    if (tab) tab.location.href = url
    else window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (e) {
    tab?.close()
    throw e
  }
}

/** Where a stored file is, in words, for tooltips: "CAzen\02 Drawings\…\A-101.pdf" or "CAzen cloud". */
export function describePath(path: string) {
  return isFolderPath(path) ? path.slice(FOLDER.length).split('/').join('\\') : 'CAzen cloud storage'
}
