import { db } from './supabase'

/**
 * Where a project's files live.
 *
 *  - "r2": CAzen's file storage in Cloudflare R2 (the prototype's main store, works on phones too).
 *    Paths look like "r2:{project}/CAzen/02 Drawings/…/A-101 First Floor Plan.pdf": the same layout
 *    as the project folder, so a copy can be kept there. The bucket is private; the browser gets
 *    15-minute links from the "files" Edge Function, which checks project membership.
 *  - "cloud": CAzen's Supabase storage (the original setup). Paths look like "{project}/sheets/…".
 *  - "folder": a folder the user picked on their own computer, such as the project's CA folder on a
 *    mapped shared drive. CAzen builds its own subfolders there. Paths are stored relative to that
 *    folder with a "folder:" prefix, e.g. "folder:CAzen/02 Drawings/2026-02-10 Addendum 1/A-101 First Floor Plan.pdf",
 *    so they work for anyone who has the same folder mapped.
 *
 * Folder access uses the browser's File System Access API (desktop Chrome and Edge). The folder
 * itself can't be saved in the database, so each browser remembers its own connection (IndexedDB).
 */
export type StorageMode = 'cloud' | 'folder' | 'r2'

const FOLDER = 'folder:'
const R2 = 'r2:'
export const isFolderPath = (p: string | null | undefined) => !!p?.startsWith(FOLDER)
export const isR2Path = (p: string | null | undefined) => !!p?.startsWith(R2)

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

// --- R2 links from the "files" Edge Function ---
async function fileLink(action: 'put' | 'get', projectId: string, key: string): Promise<{ url: string; key?: string }> {
  const { data, error } = await db().functions.invoke('files', { body: { action, project_id: projectId, key } })
  if (error) {
    let msg = error.message
    try {
      const ctx = (error as { context?: Response }).context
      const b = ctx ? await ctx.json() : null
      if (b?.error) msg = b.error
    } catch { /* keep the generic message */ }
    throw new Error(msg)
  }
  return data as { url: string; key?: string }
}

/** Is CAzen's Cloudflare storage set up (the R2 secrets are in Supabase)? */
export async function r2Ready(): Promise<boolean> {
  try {
    const { data, error } = await db().functions.invoke('files', { body: { action: 'status' } })
    return !error && !!(data as { configured?: boolean })?.configured
  } catch { return false }
}

/** "CAzen", then the cleaned folder names, then the cleaned file name. */
function relParts(folder: { dirs: string[]; name: string }): string[] {
  const dot = folder.name.lastIndexOf('.')
  const stem = safeName(dot > 0 ? folder.name.slice(0, dot) : folder.name)
  const ext = dot > 0 ? folder.name.slice(dot) : ''
  return [ROOT, ...folder.dirs.map((d) => safeName(d)), stem + ext]
}

/** Write into the project folder at parts (CAzen/…/file). Never overwrites; returns the parts actually used. */
async function writeToFolder(base: FileSystemDirectoryHandle, parts: string[], bytes: Uint8Array, renameIfTaken = true): Promise<string[] | null> {
  let dir = base
  for (const d of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(d, { create: true })
  const file = parts[parts.length - 1]
  const dot = file.lastIndexOf('.')
  const stem = dot > 0 ? file.slice(0, dot) : file, ext = dot > 0 ? file.slice(dot) : ''
  let name = file
  if (await exists(dir, name)) {
    if (!renameIfTaken) return null
    for (let i = 2; await exists(dir, name); i++) name = `${stem} (${i})${ext}`
  }
  const fh = await dir.getFileHandle(name, { create: true })
  const w = await fh.createWritable()
  await w.write(bytes as BlobPart)
  await w.close()
  return [...parts.slice(0, -1), name]
}

/** The connected project folder, only if it's usable right now without asking. */
async function folderIfReady(projectId: string): Promise<FileSystemDirectoryHandle | null> {
  return (await folderStatus(projectId)) === 'ready' ? rememberedFolder(projectId) : null
}

/**
 * Save a file and return the path to keep in the database. Never overwrites: if the name is
 * taken, " (2)", " (3)"… is added.
 *  cloudPath: where it goes in the original Supabase storage.
 *  folder:    subfolders under CAzen\ and the file name, for R2 and the project folder.
 * With R2, a copy also goes into the project folder when it's connected on this computer.
 */
export async function putFile(project: ProjectStore, bytes: Uint8Array, cloudPath: string, folder: { dirs: string[]; name: string }, type = 'application/pdf'): Promise<string> {
  if (project.storage === 'folder') {
    const base = await readyFolder(project.id, project.folder_name ?? null)
    const used = await writeToFolder(base, relParts(folder), bytes)
    return FOLDER + used!.join('/')
  }
  if (project.storage === 'r2') {
    const { url, key } = await fileLink('put', project.id, `${project.id}/${relParts(folder).join('/')}`)
    const res = await fetch(url, { method: 'PUT', body: bytes as BlobPart, headers: { 'Content-Type': type } })
    if (!res.ok) throw new Error(`Upload to CAzen file storage failed (${res.status}).`)
    const finalKey = key!
    // Best effort: keep the office copy in step. A failure here never loses the upload.
    try {
      const base = await folderIfReady(project.id)
      if (base) await writeToFolder(base, finalKey.slice(project.id.length + 1).split('/'), bytes, false)
    } catch { /* the "Copy to project folder" button catches up later */ }
    return R2 + finalKey
  }
  const up = await db().storage.from('documents').upload(cloudPath, new Blob([bytes as BlobPart], { type }), { upsert: false })
  if (up.error) throw up.error
  return cloudPath
}

async function exists(dir: FileSystemDirectoryHandle, name: string) {
  try { await dir.getFileHandle(name); return true } catch { return false }
}

async function readFromFolder(base: FileSystemDirectoryHandle, parts: string[]): Promise<Uint8Array | null> {
  try {
    let dir = base
    for (const d of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(d)
    const f = await (await dir.getFileHandle(parts[parts.length - 1])).getFile()
    return new Uint8Array(await f.arrayBuffer())
  } catch { return null }
}

/** Read a stored file, wherever it lives. R2 files come from the office copy when it's there (faster). */
export async function readFile(project: ProjectStore, path: string): Promise<Uint8Array> {
  if (isR2Path(path)) {
    const key = path.slice(R2.length)
    const base = await folderIfReady(project.id).catch(() => null)
    if (base) {
      const local = await readFromFolder(base, key.slice(project.id.length + 1).split('/'))
      if (local) return local
    }
    const { url } = await fileLink('get', project.id, key)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Couldn’t download the file from CAzen file storage (${res.status}).`)
    return new Uint8Array(await res.arrayBuffer())
  }
  if (!isFolderPath(path)) {
    const { data, error } = await db().storage.from('documents').download(path)
    if (error) throw error
    return new Uint8Array(await data.arrayBuffer())
  }
  const base = await readyFolder(project.id, project.folder_name ?? null)
  const parts = path.slice(FOLDER.length).split('/')
  const bytes = await readFromFolder(base, parts)
  if (!bytes) throw new Error(`Can’t find “${parts[parts.length - 1]}” in ${parts.slice(0, -1).join('\\')}. It may have been moved, renamed or deleted in Explorer.`)
  return bytes
}

/** Open a stored PDF in a new tab. */
export async function openFile(project: ProjectStore, path: string) {
  // Open the tab first, inside the click, so pop-up blockers allow it.
  const tab = window.open('', '_blank')
  const go = (url: string) => { if (tab) tab.location.href = url; else window.open(url, '_blank', 'noopener') }
  try {
    if (isR2Path(path)) { go((await fileLink('get', project.id, path.slice(R2.length))).url); return }
    if (!isFolderPath(path)) {
      const { data, error } = await db().storage.from('documents').createSignedUrl(path, 600)
      if (error) throw error
      go(data.signedUrl)
      return
    }
    const bytes = await readFile(project, path)
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
    go(url)
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (e) {
    tab?.close()
    throw e
  }
}

/**
 * Copy every R2 file of the project into the connected project folder, skipping ones already
 * there. Never deletes or overwrites anything in the folder.
 */
export async function copyToFolder(project: ProjectStore, paths: string[], onProgress?: (done: number, total: number) => void) {
  const base = await readyFolder(project.id, project.folder_name ?? null)
  const r2 = [...new Set(paths.filter(isR2Path))]
  let copied = 0, already = 0, failed = 0, done = 0
  for (const p of r2) {
    const key = p.slice(R2.length)
    const parts = key.slice(project.id.length + 1).split('/')
    try {
      if (await readFromFolder(base, parts)) already++
      else {
        const { url } = await fileLink('get', project.id, key)
        const res = await fetch(url)
        if (!res.ok) throw new Error(String(res.status))
        await writeToFolder(base, parts, new Uint8Array(await res.arrayBuffer()), false)
        copied++
      }
    } catch { failed++ }
    onProgress?.(++done, r2.length)
  }
  return { copied, already, failed, total: r2.length }
}

/** Where a stored file is, in words, for tooltips. */
export function describePath(path: string) {
  if (isFolderPath(path)) return path.slice(FOLDER.length).split('/').join('\\')
  if (isR2Path(path)) return 'CAzen file storage: ' + path.slice(R2.length).split('/').slice(1).join('\\')
  return 'CAzen starter storage'
}
