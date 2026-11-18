/**
 * What went wrong, in words.
 *
 * Supabase hands back a plain object rather than an Error, so String() on it produces the useless
 * "[object Object]" — which is worse than no message, because it hides a real failure behind
 * something that looks like a rendering bug.
 */
export function message(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object') {
    const o = e as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown }
    const parts = [o.message, o.details, o.hint].filter(Boolean).map(String)
    if (parts.length) return parts.join(' — ')
    if (o.code) return `Error ${String(o.code)}`
  }
  return String(e)
}

/** True when the database doesn't have a table yet, which means a migration hasn't been run. */
export function isMissingTable(e: unknown): boolean {
  const o = e as { code?: unknown; message?: unknown } | null
  if (!o || typeof o !== 'object') return false
  return o.code === '42P01' || /does not exist|schema cache/i.test(String(o.message ?? ''))
}
