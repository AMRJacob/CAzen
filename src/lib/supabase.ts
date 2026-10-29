import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** True once .env has real Supabase keys; the UI shows a setup notice until then. */
export const isConfigured = Boolean(url && anonKey)

export const supabase = isConfigured
  ? createClient(url!, anonKey!)
  : null
