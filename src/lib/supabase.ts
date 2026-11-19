import { createClient, type Session } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** True once .env / GitHub secrets have real Supabase keys. */
export const isConfigured = Boolean(url && anonKey)

// PKCE puts sign-in codes in ?code=…, which works alongside the HashRouter's #/route.
// Invite and recovery links from the Supabase dashboard arrive as #access_token=… instead;
// auth.tsx handles those itself, so automatic detection of that format is turned off here.
export const supabase = isConfigured
  ? createClient(url!, anonKey!, {
      auth: { flowType: 'pkce', detectSessionInUrl: () => false, persistSession: true },
    })
  : null

/** Use inside screens that only render once signed in. */
export function db() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

/** The app's own address, used as the return link in sign-in emails. */
export function appUrl() {
  return window.location.origin + window.location.pathname
}

/**
 * The session as it was last saved on this device, read without asking the server anything.
 *
 * The library won't hand a session over until it has refreshed it, and with no signal it keeps
 * trying for half a minute before giving up and answering "nobody". Somebody who signed in at
 * their desk this morning is still that person in a basement at two, so the saved session is
 * what the app opens on, and the library's answer replaces it when it arrives.
 */
export function storedSession(): Session | null {
  if (!url) return null
  try {
    const raw = localStorage.getItem(`sb-${new URL(url).hostname.split('.')[0]}-auth-token`)
    if (!raw) return null
    const s = JSON.parse(raw) as Session
    return s?.user?.id && s.access_token ? s : null
  } catch { return null }
}

/**
 * Who is signed in, from the session this device already holds.
 *
 * Not `auth.getUser()`: that asks the server, and when the server doesn't answer — a slow
 * connection, no connection — it comes back with nobody. A row then went in with no author,
 * and a row with no author is one its author can never remove, because the database lets only
 * the person who made a markup take it away.
 */
export async function whoAmI(): Promise<string | null> {
  try {
    const { data } = await db().auth.getSession()
    return data.session?.user.id ?? storedSession()?.user.id ?? null
  } catch { return storedSession()?.user.id ?? null }
}
