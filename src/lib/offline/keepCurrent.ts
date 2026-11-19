import { db as sb } from '../supabase'
import type { ProjectStore } from '../files'
import { all, get, heldAll, put, type Held } from './store'
import { behind, takeToField, type Progress } from './download'
import { drain, pending } from './outbox'

/**
 * Keeping what a device holds the same as the job.
 *
 * A project downloaded three weeks ago and opened at a site meeting is three weeks old, and
 * nobody remembers to refresh a phone before leaving the office. So nobody is asked to: whenever
 * the app is open and has signal, every project it holds is checked against the server and what
 * has changed is brought down — when the app starts, when the signal comes back, when the app is
 * brought to the front, and every quarter of an hour while it is open.
 *
 * It cannot run while the app is closed; a browser gives a web app no way to. What it can do is
 * say so: a copy that has not been checked within `STALE` is shown as not up to date.
 */

/** A copy checked longer ago than this is no longer called current. */
export const STALE = 24 * 60 * 60 * 1000
/** Not asked about again sooner than this, however often the app comes to the front. */
const NOT_AGAIN = 10 * 60 * 1000
/** Rows other people change (markups, observations, notebooks) are pulled again this often. */
const WHOLE = 6 * 60 * 60 * 1000

/** When this copy was last known to match the server. */
export const checkedAt = (h: Held) => h.checked ?? h.at
export const isStale = (h: Held, now = Date.now()) => now - checkedAt(h) > STALE

export const FIELD_EVENT = 'cazen:field'
export interface FieldNews { project_id: string; progress?: Progress; done?: boolean }
const say = (news: FieldNews) => window.dispatchEvent(new CustomEvent<FieldNews>(FIELD_EVENT, { detail: news }))

let running: Promise<void> | null = null

export function keepCurrent(force = false): Promise<void> {
  if (running) return running
  running = (async () => {
    if (!navigator.onLine) return
    // Signed out, every question below comes back empty — which reads as "the job has no sheets".
    const { data } = await sb().auth.getSession()
    if (!data.session) return
    await drain().catch(() => {})
    for (const note of await heldAll().catch(() => [] as Held[])) {
      if (!force && Date.now() - checkedAt(note) < NOT_AGAIN) continue
      try { await one(note) } catch { /* no answer: it stays as it was, and says how old it is */ }
    }
  })().finally(() => { running = null })
  return running
}

async function one(note: Held): Promise<void> {
  const id = note.project_id
  const project = await get<ProjectStore>('projects', id)
  if (!project) return
  // Refreshing replaces this device's rows with the server's. Anything written here that has not
  // gone yet would vanish from the screen, so it goes first or the refresh waits.
  if ((await pending(id)).some((q) => q.job.kind !== 'file.put')) return

  const state = await behind(id)
  if (!state) return
  // An answer with nothing in it, for a project this device holds sheets of, is far more likely
  // a lapsed permission or a half-open connection than a job whose drawings were all deleted.
  const { data: any, error } = await sb().from('sheets').select('id').eq('project_id', id).limit(1)
  if (error) throw error
  if (!any?.length && (await all('sheets', id)).length) return

  if (state.files > 0 || Date.now() - note.at > WHOLE) {
    say({ project_id: id, progress: { done: 0, total: state.files, bytes: 0, what: '' } })
    try {
      const fresh = await takeToField(project, note.scope, (progress) => {
        if (state.files > 0) say({ project_id: id, progress })
      })
      await put('meta', { ...fresh, checked: Date.now() } satisfies Held)
    } finally { say({ project_id: id, done: true }) }
    return
  }
  await put('meta', { ...note, checked: Date.now() } satisfies Held)
  say({ project_id: id, done: true })
}

/** Check now, and again whenever there is a reason to think the answer may have changed. */
export function keepCurrentWhenOnline(): () => void {
  const go = () => { void keepCurrent() }
  const seen = () => { if (document.visibilityState === 'visible') go() }
  window.addEventListener('online', go)
  document.addEventListener('visibilitychange', seen)
  const t = setInterval(go, 15 * 60 * 1000)
  // A moment after start, so the first screen is not competing with it for the connection.
  const first = setTimeout(go, 2500)
  return () => {
    window.removeEventListener('online', go)
    document.removeEventListener('visibilitychange', seen)
    clearInterval(t); clearTimeout(first)
  }
}
