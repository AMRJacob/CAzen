import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { db } from './supabase'
import { useAuth } from './auth'
import type { Firm, FirmRole } from './types'
import { Logo } from '../components/Logo'

const KEY = 'cazen.currentFirm'
const saved = { get: () => { try { return localStorage.getItem(KEY) } catch { return null } },
                set: (v: string) => { try { localStorage.setItem(KEY, v) } catch { /* ignore */ } } }

interface FirmState {
  firms: Firm[]
  firm: Firm | null
  role: FirmRole | null
  isAdmin: boolean
  select: (id: string) => void
  reload: () => Promise<void>
}

const FirmContext = createContext<FirmState>({
  firms: [], firm: null, role: null, isAdmin: false, select: () => {}, reload: async () => {},
})

/** Loads the signed-in user's firms. With none yet, shows first-run firm setup instead of the app. */
export function FirmProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [firms, setFirms] = useState<Firm[]>([])
  const [roles, setRoles] = useState<Record<string, FirmRole>>({})
  const [currentId, setCurrentId] = useState<string | null>(saved.get())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    // One firm per CAzen site: joining is automatic for anyone invited after setup.
    await db().rpc('join_firm')
    const [f, m] = await Promise.all([
      db().from('firms').select('*').order('name'),
      db().from('firm_members').select('firm_id, role').eq('user_id', session!.user.id),
    ])
    if (f.error) setError(f.error.message)
    else {
      setFirms(f.data as Firm[])
      setRoles(Object.fromEntries((m.data ?? []).map((r) => [r.firm_id, r.role as FirmRole])))
    }
    setLoading(false)
  }, [session])

  useEffect(() => { reload() }, [reload])

  const select = (id: string) => { setCurrentId(id); saved.set(id) }
  const firm = firms.find((f) => f.id === currentId) ?? firms[0] ?? null
  const role = firm ? roles[firm.id] ?? null : null

  if (loading) return <div className="signin"><p className="muted">Loading…</p></div>
  if (error) return <div className="signin"><div className="notice error">{error}</div></div>
  if (!firm) return <FirmSetup onCreated={async (f) => { select(f.id); await reload() }} />

  return (
    <FirmContext.Provider value={{ firms, firm, role, isAdmin: role === 'owner' || role === 'admin', select, reload }}>
      {children}
    </FirmContext.Provider>
  )
}

export const useFirm = () => useContext(FirmContext)

function FirmSetup({ onCreated }: { onCreated: (f: Firm) => void }) {
  const { signOut } = useAuth()
  const [f, setF] = useState({ name: '', address: '', city: '', phone: '', website: '' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { data, error } = await db().rpc('create_firm', {
      p_name: f.name.trim(),
      p_address_line1: f.address.trim() || null,
      p_city_state_zip: f.city.trim() || null,
      p_phone: f.phone.trim() || null,
      p_website: f.website.trim() || null,
    })
    setBusy(false)
    if (error) setError(error.message)
    else onCreated(data as Firm)
  }

  return (
    <div className="signin">
      <form className="card wide-card" onSubmit={submit}>
        <Logo />
        <h2 className="flush">Set up your firm</h2>
        <p className="muted">You’re the first one here. This sets up CAzen for your firm and appears on every document it produces. Everything can be changed later in Settings, including a full rebrand.</p>
        <label>Firm name<input required value={f.name} onChange={set('name')} placeholder="Studio name, Architects" /></label>
        <label>Street address<input value={f.address} onChange={set('address')} /></label>
        <label>City, state ZIP<input value={f.city} onChange={set('city')} /></label>
        <div className="two">
          <label>Phone<input value={f.phone} onChange={set('phone')} /></label>
          <label>Website<input value={f.website} onChange={set('website')} /></label>
        </div>
        <button className="primary" disabled={busy || !f.name.trim()}>{busy ? 'Creating…' : 'Create firm'}</button>
        <button type="button" className="link" onClick={signOut}>Sign out</button>
        {error && <div className="notice error">{error}</div>}
      </form>
    </div>
  )
}
