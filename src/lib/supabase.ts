import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** True once .env / GitHub secrets have real Supabase keys. */
export const isConfigured = Boolean(url && anonKey)

// PKCE puts the sign-in code in ?code=…, which works alongside the HashRouter's #/route.
export const supabase = isConfigured
  ? createClient(url!, anonKey!, { auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true } })
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
