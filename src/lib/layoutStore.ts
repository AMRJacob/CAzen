import { db, whoAmI } from './supabase'
import { clean, defaultLayout, type Layout, type Screen, type VisitKind } from './pageLayout'

// ---------- Keeping it ----------

/**
 * Kept on the device (so the page opens arranged with no signal, and at once) and in the
 * person's own row on the server (so it follows them to another device of the same kind).
 * Whichever was changed last wins.
 */
interface Kept { layout: Layout; at: number; unsent?: boolean }
const key = (uid: string, kind: VisitKind, screen: Screen) => `cazen.layout.${uid}.${kind}.${screen}`
const readKept = (k: string): Kept | null => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) as Kept : null } catch { return null } }
const writeKept = (k: string, v: Kept) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* private mode: kept for the visit only */ } }

/** The layout on this device, without waiting for anything. */
export async function layoutHere(kind: VisitKind, screen: Screen): Promise<Layout> {
  const uid = await whoAmI()
  const kept = uid ? readKept(key(uid, kind, screen)) : null
  return clean(kept?.layout, kind, screen)
}

/** The layout as the server has it, if it has one newer than this device's; sends this device's if that is newer. */
export async function layoutThere(kind: VisitKind, screen: Screen): Promise<Layout | null> {
  const uid = await whoAmI()
  if (!uid || !navigator.onLine) return null
  const k = key(uid, kind, screen)
  const kept = readKept(k)
  if (kept?.unsent) { await send(uid, kind, screen, kept); return null }
  const { data, error } = await db().from('notebook_layouts').select('layout, updated_at')
    .eq('user_id', uid).eq('kind', kind).eq('device', screen).maybeSingle()
  if (error || !data) return null
  const at = Date.parse((data as { updated_at: string }).updated_at)
  if (kept && kept.at >= at) return null
  const layout = clean((data as { layout: unknown }).layout, kind, screen)
  writeKept(k, { layout, at })
  return layout
}

async function send(uid: string, kind: VisitKind, screen: Screen, kept: Kept): Promise<void> {
  const { error } = await db().from('notebook_layouts').upsert({
    user_id: uid, kind, device: screen, layout: kept.layout, updated_at: new Date(kept.at).toISOString(),
  })
  if (!error) writeKept(key(uid, kind, screen), { ...kept, unsent: false })
}

/** Keep a changed layout: on the device now, on the server when it answers. */
export async function keepLayout(kind: VisitKind, screen: Screen, layout: Layout | null): Promise<void> {
  const uid = await whoAmI()
  if (!uid) return
  const next: Kept = { layout: layout ?? defaultLayout(kind, screen), at: Date.now(), unsent: true }
  writeKept(key(uid, kind, screen), next)
  await send(uid, kind, screen, next).catch(() => {})
}

