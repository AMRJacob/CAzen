import { db as sb } from '../supabase'
import { all, fileFromCache, put, remove, type Store } from './store'
import { sendFile, type StorageMode } from '../files'

/**
 * Changes made on this device that the server hasn't taken yet.
 *
 * Every write goes two places at once: into the local copy, so the screen is right immediately,
 * and into this queue. When there's signal the queue drains; when there isn't it waits. That is
 * the whole of "offline" — there is no second code path for it, and a change made at a desk takes
 * the same route as one made standing in a stairwell with no bars.
 *
 * Two rules keep a replay safe. Every row carries an id this device generated, so an insert that
 * already landed is a no-op rather than a duplicate. And a punch number is never sent from here:
 * numbers are the server's to hand out, so an item made in the field arrives without one and is
 * numbered on arrival. Until then it is a real item with a real record that simply can't be
 * quoted by number yet.
 */

/** Sent on the window when the server would not carry out something this device had already shown as done. */
export const REFUSED_EVENT = 'cazen:refused'

export type Job =
  | { kind: 'markup.add'; row: Record<string, unknown> }
  | { kind: 'markup.edit'; id: string; patch: Record<string, unknown> }
  | { kind: 'markup.remove'; id: string }
  | { kind: 'observation.add'; row: Record<string, unknown> }
  | { kind: 'observation.edit'; id: string; patch: Record<string, unknown> }
  | { kind: 'sheet.scale'; id: string; scale: unknown }
  // The notebooks. One shape for every table, because there is nothing to say about a page, a
  // pad, a mark or a person that isn't "this row", "this much of it changed" or "it has gone".
  | { kind: 'row.put'; table: NoteTable; row: Record<string, unknown> }
  | { kind: 'row.patch'; table: NoteTable; id: string; patch: Record<string, unknown> }
  | { kind: 'row.remove'; table: NoteTable; ids: string[] }
  // A file already sitting in this device's copy, to be sent to the path the rows point at.
  | { kind: 'file.put'; path: string; storage: StorageMode | null; type: string }

export type NoteTable = 'site_visits' | 'note_pads' | 'pad_marks' | 'project_people'

export interface Queued {
  id: string; project_id: string; at: number; tries: number
  last_error?: string
  /** When it was last attempted, so something storage refuses isn't asked for every few seconds. */
  tried_at?: number
  job: Job
}

const uuid = () =>
  (crypto.randomUUID?.() ??
    `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`)

/** Put a change in the queue. Callers have already applied it to the local copy. */
export async function queue(projectId: string, job: Job): Promise<void> {
  if (job.kind === 'row.patch' && await folded(job)) { void drain(); return }
  await put('outbox', { id: uuid(), project_id: projectId, at: stamp(), tries: 0, job } satisfies Queued)
  void drain()
}

/** Strictly rising, so two changes made in the same millisecond still go out in the order made. */
let lastStamp = 0
const stamp = () => (lastStamp = Math.max(Date.now(), lastStamp + 1))

/** The job on its way to the server this instant. It can no longer be added to. */
let sending: string | null = null

/**
 * Typing a paragraph with no signal would otherwise queue a change a second for an afternoon.
 * A change to a row is folded into the one before it when that one is to the same row and is the
 * newest thing waiting — only then, because anything queued in between may be something the
 * later change depends on, and order is the one promise this queue makes.
 */
async function folded(job: Extract<Job, { kind: 'row.patch' }>): Promise<boolean> {
  const waiting = (await all<Queued>('outbox').catch(() => [] as Queued[])).sort((a, b) => a.at - b.at)
  const last = waiting[waiting.length - 1]
  if (!last || last.id === sending) return false
  const j = last.job
  if (j.kind !== 'row.patch' || j.table !== job.table || j.id !== job.id) return false
  await put('outbox', { ...last, job: { ...j, patch: { ...j.patch, ...job.patch } } } satisfies Queued)
  // If it began to go while this was being written there is no telling which version went. Say
  // so, and the change is queued again on its own: sending the same change twice costs nothing.
  if (sending === last.id) return false
  return true
}

export const pending = (projectId?: string) => all<Queued>('outbox', projectId)

/**
 * The ids of rows this device has changed and the server hasn't been told about.
 *
 * A refresh from the server must not treat these as rows that were deleted elsewhere — they are
 * rows the server has simply never heard of. Without this, drawing something and refreshing
 * loses it.
 */
export async function unsentIds(): Promise<Set<string>> {
  const out = new Set<string>()
  for (const q of await all<Queued>('outbox').catch(() => [] as Queued[])) {
    const j = q.job
    if ('row' in j && typeof j.row.id === 'string') out.add(j.row.id)
    else if ('ids' in j) for (const id of j.ids) out.add(id)
    else if ('id' in j) out.add(j.id)
  }
  return out
}

/**
 * Jobs queued before the punch list became observations are still sitting in outboxes on devices
 * that went to site before the change. They are the same two requests under another name, so they
 * are renamed on the way out rather than stranded in a queue that can never empty.
 */
type AnyJob =
  | Job
  | { kind: 'punch.add'; row: Record<string, unknown> }
  | { kind: 'punch.edit'; id: string; patch: Record<string, unknown> }

function current(job: AnyJob): Job {
  if (job.kind === 'punch.add') return { kind: 'observation.add', row: job.row }
  if (job.kind === 'punch.edit') return { kind: 'observation.edit', id: job.id, patch: job.patch }
  return job
}

/** Each job, as the one request that carries it out. Errors bubble so drain can decide. */
async function send(raw: AnyJob, projectId = ''): Promise<void> {
  const job = current(raw)
  if (job.kind === 'markup.add') {
    // The row carries the id this device made, so a second attempt lands on the same row.
    const { error } = await sb().from('sheet_markups').upsert(job.row, { onConflict: 'id' })
    if (error) throw error
    return
  }
  if (job.kind === 'markup.edit') {
    const { error } = await sb().from('sheet_markups').update(job.patch).eq('id', job.id)
    if (error) throw error
    return
  }
  if (job.kind === 'markup.remove') {
    const { data, error } = await sb().from('sheet_markups').delete().eq('id', job.id).select('id')
    if (error) throw error
    // The database refuses a removal by saying nothing and removing nothing. If the markup is
    // still there afterwards it was refused, and the device that thinks it is gone is told —
    // otherwise it is gone here and present for everybody else, with nothing to say so.
    if (!data?.length) {
      const { data: still } = await sb().from('sheet_markups').select('id').eq('id', job.id).maybeSingle()
      if (still) window.dispatchEvent(new CustomEvent(REFUSED_EVENT, { detail: { table: 'sheet_markups', id: job.id } }))
    }
    return
  }
  if (job.kind === 'observation.add') {
    const { error } = await sb().from('observations').upsert(job.row, { onConflict: 'id' })
    if (error) throw error
    // Numbering is a second step on purpose: the observation exists even if this half fails, and
    // asking again for one that already has a number gives back the number it already has. A
    // database without the function yet leaves it un-numbered rather than losing it.
    const { error: numberError } = await sb().rpc('number_observation', { p_item: job.row.id })
    if (numberError && !/number_observation|schema cache|does not exist/i.test(numberError.message ?? '')) throw numberError
    return
  }
  if (job.kind === 'observation.edit') {
    const { error } = await sb().from('observations').update(job.patch).eq('id', job.id)
    if (error) throw error
    return
  }
  if (job.kind === 'row.put') {
    const { error } = await sb().from(job.table).upsert(job.row, { onConflict: 'id' })
    if (error) throw error
    return
  }
  if (job.kind === 'row.patch') {
    const { error } = await sb().from(job.table).update(job.patch).eq('id', job.id)
    if (error) throw error
    return
  }
  if (job.kind === 'row.remove') {
    const { error } = await sb().from(job.table).delete().in('id', job.ids)
    if (error) throw error
    return
  }
  if (job.kind === 'file.put') {
    const bytes = await fileFromCache(job.path)
    // Nothing to send: the copy was cleared from this device. Asking again will never find it.
    if (!bytes) throw Object.assign(new Error('The photograph is no longer on this device.'), { code: 'GONE' })
    const project = projectId || job.path.replace(/^r2:/, '').split('/')[0]
    await sendFile({ id: project, storage: job.storage }, new Uint8Array(await bytes.arrayBuffer()), job.path, job.type)
    return
  }
  const { error } = await sb().from('sheets').update({ scale: job.scale }).eq('id', job.id)
  if (error) throw error
}

/** No signal, or a request that never got an answer — as against an answer that was "no". */
export function offlineish(e: unknown): boolean {
  if (!navigator.onLine) return true
  const m = (e as { message?: string })?.message ?? String(e)
  return /failed to fetch|networkerror|load failed|send a request|timed out|fetch failed/i.test(m)
}

/**
 * Something the server rejected on its own terms — a row that no longer exists, a permission it
 * won't grant. Retrying forever would block everything behind it, so these are dropped and said
 * out loud rather than kept in a queue that never empties.
 */
function permanent(e: unknown): boolean {
  const code = (e as { code?: string })?.code ?? ''
  return ['23503', '42501', 'PGRST116', 'GONE'].includes(code)
}

let draining: Promise<{ sent: number; failed: number }> | null = null

/**
 * Push what's waiting, oldest first, stopping at the first thing that looks like the network
 * rather than the row — leaving the order intact for the next attempt.
 */
export function drain(): Promise<{ sent: number; failed: number }> {
  if (draining) return draining
  draining = (async () => {
    let sent = 0, failed = 0
    if (!navigator.onLine) return { sent, failed }
    // Round after round until a round finds nothing new. A change queued while a round was
    // under way is not on that round's list, and nothing else was going to come back for it:
    // the last stroke of a quick sketch, or the second half of a two-part change, sat unsent
    // until something unrelated happened to push the queue.
    const tried = new Set<string>()
    let stalled = false
    for (let round = 0; round < 50 && !stalled; round++) {
    const jobs = (await all<Queued>('outbox')).sort((a, b) => a.at - b.at).filter((q) => !tried.has(q.id))
    if (!jobs.length) break
    for (const q of jobs) {
      tried.add(q.id)
      const isFile = q.job.kind === 'file.put'
      // A file storage has refused is asked for again, but not every four seconds.
      if (isFile && q.tries > 0 && Date.now() - (q.tried_at ?? 0) < Math.min(300_000, 15_000 * 2 ** (q.tries - 1))) {
        failed++
        continue
      }
      try {
        sending = q.id
        // The row is read again: a change may have been folded into it since the list was made.
        const now = (await all<Queued>('outbox')).find((x) => x.id === q.id) ?? q
        await send(now.job, q.project_id)
        await remove('outbox', q.id)
        sent++
      } catch (e) {
        if (permanent(e)) {
          await remove('outbox', q.id)
          failed++
          continue
        }
        await put('outbox', { ...q, tries: q.tries + 1, tried_at: Date.now(), last_error: (e as Error)?.message ?? String(e) })
        // A file that storage would not take — full, too large — holds up nothing but itself.
        if (isFile && !offlineish(e)) { failed++; continue }
        stalled = true
        break // the network, most likely: keep the rest in order and try again later
      } finally { sending = null }
    }
    }
    return { sent, failed }
  })()
  try { return draining } finally { void draining.finally(() => { draining = null }) }
}

/** Start draining whenever the device says it is back, and once now. */
export function drainWhenOnline(): () => void {
  const go = () => { void drain() }
  window.addEventListener('online', go)
  go()
  return () => window.removeEventListener('online', go)
}

export const OUTBOX: Store = 'outbox'
