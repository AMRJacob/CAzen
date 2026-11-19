import { all, put, remove, type Store } from './store'
import { offlineish, unsentIds } from './outbox'

/**
 * A list read the way the notebooks read everything: from the server when it answers, from this
 * device when it doesn't, and never forgetting what was written here and hasn't been sent.
 *
 * What comes back from the server is the record, with one exception — a row this device has
 * changed and not yet told the server about. The server's copy of that row is the old one, and
 * a row removed here is still there. So those are taken from this device, whichever way the
 * request went, and the result is written back so that the next read with no signal finds it.
 */
export async function localFirst<T extends { id: string }>(o: {
  store: Store
  /** What is already held that this list would contain. */
  here: () => Promise<T[]>
  theirs: () => Promise<T[]>
  sort?: (a: T, b: T) => number
}): Promise<T[]> {
  const here = await o.here().catch(() => [] as T[])
  const order = (rows: T[]) => (o.sort ? rows.sort(o.sort) : rows)
  if (!navigator.onLine) return order(here)

  let theirs: T[]
  try {
    // With a copy in hand, a request that hangs on one bar of signal is not worth waiting out.
    theirs = here.length ? await Promise.race([o.theirs(), late<T[]>(6000)]) : await o.theirs()
  } catch (e) {
    if (offlineish(e)) return order(here)
    throw e
  }

  const unsent = await unsentIds().catch(() => new Set<string>())
  const merged = [...theirs.filter((r) => !unsent.has(r.id)), ...here.filter((r) => unsent.has(r.id))]
  const keep = new Set(merged.map((r) => r.id))
  try {
    for (const r of here) if (!keep.has(r.id)) await remove(o.store, r.id)
    await put(o.store, merged)
  } catch { /* a device that won't keep a copy still shows what the server said */ }
  return order(merged)
}

const late = <T,>(ms: number) =>
  new Promise<T>((_, reject) => setTimeout(() => reject(new Error('The request timed out.')), ms))

/** One row, by the same rule. */
export async function localFirstOne<T extends { id: string }>(store: Store, id: string, here: T | undefined, theirs: () => Promise<T>): Promise<T> {
  const unsent = await unsentIds().catch(() => new Set<string>())
  if (here && (unsent.has(id) || !navigator.onLine)) return here
  try {
    const row = here ? await Promise.race([theirs(), late<T>(6000)]) : await theirs()
    await put(store, row).catch(() => {})
    return row
  } catch (e) {
    if (here && offlineish(e)) return here
    throw e
  }
}

export { all as localAll }
