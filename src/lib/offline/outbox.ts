import { db as sb } from '../supabase'
import { all, put, remove, type Store } from './store'

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

export type Job =
  | { kind: 'markup.add'; row: Record<string, unknown> }
  | { kind: 'markup.edit'; id: string; patch: Record<string, unknown> }
  | { kind: 'markup.remove'; id: string }
  | { kind: 'punch.add'; row: Record<string, unknown> }
  | { kind: 'punch.edit'; id: string; patch: Record<string, unknown> }
  | { kind: 'sheet.scale'; id: string; scale: unknown }

export interface Queued { id: string; project_id: string; at: number; tries: number; last_error?: string; job: Job }

const uuid = () =>
  (crypto.randomUUID?.() ??
    `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`)

/** Put a change in the queue. Callers have already applied it to the local copy. */
export async function queue(projectId: string, job: Job): Promise<void> {
  await put('outbox', { id: uuid(), project_id: projectId, at: Date.now(), tries: 0, job } satisfies Queued)
  void drain()
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
    else if ('id' in j) out.add(j.id)
  }
  return out
}

/** Each job, as the one request that carries it out. Errors bubble so drain can decide. */
async function send(job: Job): Promise<void> {
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
    const { error } = await sb().from('sheet_markups').delete().eq('id', job.id)
    if (error) throw error
    return
  }
  if (job.kind === 'punch.add') {
    const { error } = await sb().from('punch_items').upsert(job.row, { onConflict: 'id' })
    if (error) throw error
    // Numbering is a second step on purpose: the item exists even if this half fails, and asking
    // again for an item that already has a number gives back the number it already has. A
    // database without the function yet leaves the item un-numbered rather than losing it.
    const { error: numberError } = await sb().rpc('number_punch_item', { p_item: job.row.id })
    if (numberError && !/number_punch_item|schema cache|does not exist/i.test(numberError.message ?? '')) throw numberError
    return
  }
  if (job.kind === 'punch.edit') {
    const { error } = await sb().from('punch_items').update(job.patch).eq('id', job.id)
    if (error) throw error
    return
  }
  const { error } = await sb().from('sheets').update({ scale: job.scale }).eq('id', job.id)
  if (error) throw error
}

/**
 * Something the server rejected on its own terms — a row that no longer exists, a permission it
 * won't grant. Retrying forever would block everything behind it, so these are dropped and said
 * out loud rather than kept in a queue that never empties.
 */
function permanent(e: unknown): boolean {
  const code = (e as { code?: string })?.code ?? ''
  return ['23503', '42501', 'PGRST116'].includes(code)
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
    const jobs = (await all<Queued>('outbox')).sort((a, b) => a.at - b.at)
    for (const q of jobs) {
      try {
        await send(q.job)
        await remove('outbox', q.id)
        sent++
      } catch (e) {
        if (permanent(e)) {
          await remove('outbox', q.id)
          failed++
          continue
        }
        await put('outbox', { ...q, tries: q.tries + 1, last_error: (e as Error)?.message ?? String(e) })
        break // the network, most likely: keep the rest in order and try again later
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
