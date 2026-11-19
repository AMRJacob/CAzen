/**
 * The copy of a project that lives on this device.
 *
 * The rule that makes the rest of the app simple: **the screen reads from here.** Online or off,
 * the viewer, the markups and the punch list render out of this store. The network has two jobs
 * and no others — fill it, and drain the outbox. There is no "offline mode" to be in or out of,
 * which is what lets a change made with no signal and a change made with four bars take exactly
 * the same path through the app.
 *
 * IndexedDB rather than the Cache API for the drawings: CAzen's files come from R2 behind
 * 15-minute signed URLs, so the URL is different every time and nothing keyed by URL would ever
 * hit. These are keyed by the file path the database holds, which doesn't change.
 *
 * Nothing here is shared between people or devices. It is a copy, and the project on the server
 * stays the record.
 */

const DB = 'cazen'
const VERSION = 3

/** What a device can hold for a project. Rows mirror the server; files are the drawings. */
export type Store =
  | 'projects' | 'sheets' | 'revisions' | 'issuances' | 'markups' | 'observations' | 'observationTypes'
  | 'sheetText' | 'files' | 'outbox' | 'meta'
  | 'visits' | 'pads' | 'padMarks' | 'people'

const ROW_STORES: Store[] = [
  'projects', 'sheets', 'revisions', 'issuances', 'markups', 'observations', 'observationTypes', 'sheetText',
]

/**
 * The notebooks: pages, the pads drawn on, every mark on them, and who was there.
 *
 * Kept apart from the rows above because they are not something a project is "taken" to the
 * field with and given back afterwards. A page written on this device is here whether or not the
 * drawings were ever downloaded, and letting go of the drawings does not let go of it.
 */
const NOTE_STORES: Store[] = ['visits', 'pads', 'padMarks', 'people']

/** Stores from an earlier shape of the app, dropped on the way past. */
const GONE = ['punch', 'punchCategories']

let open: Promise<IDBDatabase> | null = null

export function db(): Promise<IDBDatabase> {
  if (open) return open
  open = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION)
    req.onupgradeneeded = () => {
      const d = req.result
      for (const name of GONE) if (d.objectStoreNames.contains(name)) d.deleteObjectStore(name)
      for (const name of ROW_STORES) {
        if (d.objectStoreNames.contains(name)) continue
        const s = d.createObjectStore(name, { keyPath: 'id' })
        // Everything is fetched and cleared a project at a time.
        s.createIndex('project', 'project_id')
      }
      for (const name of NOTE_STORES) {
        if (d.objectStoreNames.contains(name)) continue
        const s = d.createObjectStore(name, { keyPath: 'id' })
        s.createIndex('project', 'project_id')
        // A pad's marks are asked for by pad, and there can be thousands of them in a project.
        if (name === 'padMarks') s.createIndex('pad', 'pad_id')
      }
      if (!d.objectStoreNames.contains('files')) {
        d.createObjectStore('files', { keyPath: 'path' }).createIndex('project', 'project_id')
      }
      if (!d.objectStoreNames.contains('outbox')) {
        d.createObjectStore('outbox', { keyPath: 'id' }).createIndex('project', 'project_id')
      }
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'key' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('This browser would not open local storage.'))
    req.onblocked = () => reject(new Error('CAzen is open in another tab; close it and try again.'))
  })
  return open
}

const done = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

const settled = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('Local write was rolled back.'))
  })

export async function get<T>(store: Store, key: IDBValidKey): Promise<T | undefined> {
  const d = await db()
  return done<T>(d.transaction(store).objectStore(store).get(key) as IDBRequest<T>)
}

export async function all<T>(store: Store, projectId?: string): Promise<T[]> {
  const d = await db()
  const s = d.transaction(store).objectStore(store)
  const src = projectId ? s.index('project') : s
  return done<T[]>((projectId ? src.getAll(projectId) : src.getAll()) as IDBRequest<T[]>)
}

/** Every mark on one pad. */
export async function marksOfPad<T>(padId: string): Promise<T[]> {
  const d = await db()
  return done<T[]>(d.transaction('padMarks').objectStore('padMarks').index('pad').getAll(padId) as IDBRequest<T[]>)
}

export async function put(store: Store, rows: unknown | unknown[]): Promise<void> {
  const list = Array.isArray(rows) ? rows : [rows]
  if (!list.length) return
  const d = await db()
  const tx = d.transaction(store, 'readwrite')
  const s = tx.objectStore(store)
  for (const r of list) s.put(r)
  return settled(tx)
}

export async function remove(store: Store, key: IDBValidKey): Promise<void> {
  const d = await db()
  const tx = d.transaction(store, 'readwrite')
  tx.objectStore(store).delete(key)
  return settled(tx)
}

/** Replace everything held for one project in one store, so a refresh can't leave orphans. */
export async function replace(store: Store, projectId: string, rows: unknown[]): Promise<void> {
  const d = await db()
  const tx = d.transaction(store, 'readwrite')
  const s = tx.objectStore(store)
  const keys = await done<IDBValidKey[]>(s.index('project').getAllKeys(projectId))
  for (const k of keys) s.delete(k)
  for (const r of rows) s.put(r)
  return settled(tx)
}

// ---------- Files ----------

export interface CachedFile { path: string; project_id: string; bytes: Blob; at: number }

export async function fileFromCache(path: string): Promise<Blob | null> {
  const row = await get<CachedFile>('files', path)
  return row?.bytes ?? null
}

export const cacheFile = (path: string, projectId: string, bytes: Blob) =>
  put('files', { path, project_id: projectId, bytes, at: Date.now() } satisfies CachedFile)

// ---------- What this device is holding ----------

export interface Held {
  key: string               // 'held:<project id>'
  project_id: string
  scope: 'current' | 'all'
  at: number
  files: number
  bytes: number
}

export const heldKey = (projectId: string) => `held:${projectId}`
export const held = (projectId: string) => get<Held>('meta', heldKey(projectId))

export async function heldAll(): Promise<Held[]> {
  const rows = await all<Held & { key: string }>('meta')
  return rows.filter((r) => r.key.startsWith('held:'))
}

/** Give a project's copy back: its rows, its drawings, and the note that it was held. */
export async function release(projectId: string): Promise<void> {
  for (const s of ROW_STORES) await replace(s, projectId, [])
  // A photograph taken on site and not yet uploaded exists nowhere but here. It stays until it
  // has gone, whatever else is given back.
  const waiting = new Set<string>()
  for (const q of await all<{ job?: { kind?: string; path?: string } }>('outbox', projectId).catch(() => [])) {
    if (q.job?.kind === 'file.put' && q.job.path) waiting.add(q.job.path)
  }
  const d = await db()
  const tx = d.transaction('files', 'readwrite')
  const s = tx.objectStore('files')
  const keys = await done<IDBValidKey[]>(s.index('project').getAllKeys(projectId))
  for (const k of keys) if (!waiting.has(String(k))) s.delete(k)
  await settled(tx)
  await remove('meta', heldKey(projectId))
}

/**
 * What the browser says it will let this origin keep, and what is used. Both are estimates and
 * either can be missing, so callers show what they get and don't block on it.
 */
export async function space(): Promise<{ used: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.()
    if (!e || e.quota == null) return null
    return { used: e.usage ?? 0, quota: e.quota }
  } catch { return null }
}

/**
 * Ask the browser to keep this data rather than evict it under pressure. On WebKit the request is
 * granted on heuristics that favour a home-screen web app, so this is a request and never a
 * guarantee — the answer is worth showing, not worth relying on.
 */
export async function askToKeep(): Promise<boolean> {
  try {
    if (await navigator.storage?.persisted?.()) return true
    return (await navigator.storage?.persist?.()) ?? false
  } catch { return false }
}
