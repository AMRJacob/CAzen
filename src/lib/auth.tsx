import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { appUrl, supabase } from './supabase'

interface AuthState {
  session: Session | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState>({ session: null, loading: true, signOut: async () => {} })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      // Drop the one-time ?code= from the address bar after sign-in.
      if (s && window.location.search.includes('code=')) {
        window.history.replaceState(null, '', appUrl() + window.location.hash)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    await supabase?.auth.signOut()
  }

  return <AuthContext.Provider value={{ session, loading, signOut }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)

export function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'link' | 'password'>('link')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError(null)
    setMessage(null)
    const result =
      mode === 'link'
        ? await supabase.auth.signInWithOtp({
            email,
            options: { shouldCreateUser: false, emailRedirectTo: appUrl() },
          })
        : await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (result.error) setError(result.error.message)
    else if (mode === 'link') setMessage(`Sign-in link sent to ${email}. Open it on this device.`)
  }

  return (
    <div className="signin">
      <form className="card" onSubmit={submit}>
        <div className="brand dark">CA<span>zen</span></div>
        <p className="muted">Sign in with your invited email.</p>
        <label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        {mode === 'password' && (
          <label>Password<input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        )}
        <button className="primary" disabled={busy}>
          {busy ? 'Working…' : mode === 'link' ? 'Email me a sign-in link' : 'Sign in'}
        </button>
        <button type="button" className="link" onClick={() => setMode(mode === 'link' ? 'password' : 'link')}>
          {mode === 'link' ? 'Use a password instead' : 'Email me a link instead'}
        </button>
        {message && <div className="notice">{message}</div>}
        {error && <div className="notice error">{error}</div>}
      </form>
    </div>
  )
}

/** Lets a user who signed in by link set a password for next time. */
export function SetPassword() {
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase!.auth.updateUser({ password })
    setMsg(error ? error.message : 'Password saved.')
    if (!error) setPassword('')
  }

  return (
    <form className="inline-form" onSubmit={save}>
      <input type="password" minLength={8} placeholder="New password (8+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button disabled={password.length < 8}>Set password</button>
      {msg && <span className="muted">{msg}</span>}
    </form>
  )
}
