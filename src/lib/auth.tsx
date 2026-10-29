import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { EmailOtpType, Session } from '@supabase/supabase-js'
import { appUrl, supabase } from './supabase'
import { Logo } from '../components/Logo'

interface AuthState {
  session: Session | null
  loading: boolean
  /** True after an invite or password-reset link: the user must choose a password first. */
  needsPassword: boolean
  linkError: string | null
  passwordSet: () => void
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState>({
  session: null, loading: true, needsPassword: false, linkError: null,
  passwordSet: () => {}, signOut: async () => {},
})

const NEEDS_PW_KEY = 'cazen.needsPassword'
const flag = {
  get: () => { try { return sessionStorage.getItem(NEEDS_PW_KEY) === '1' } catch { return false } },
  set: (on: boolean) => { try { if (on) sessionStorage.setItem(NEEDS_PW_KEY, '1'); else sessionStorage.removeItem(NEEDS_PW_KEY) } catch { /* ignore */ } },
}

/**
 * Handle whatever kind of link brought the user here:
 *  - #access_token=…&type=invite|recovery   (Supabase's default invite / reset emails)
 *  - ?token_hash=…&type=invite|recovery     (customised email templates, see docs/SETUP.md)
 *  - ?code=…                                (email sign-in links; handled by the library)
 * Returns the link type, or null when the URL carried no link.
 */
type CapturedLink =
  | { kind: 'tokens'; access_token: string; refresh_token: string; type: string | null }
  | { kind: 'hash'; token_hash: string; type: EmailOtpType }
  | { kind: 'error'; message: string }
  | null

// Runs once when this module loads — before React and the HashRouter read the address —
// so link tokens never reach the router (it would treat "#access_token=…" as a page name).
const captured: CapturedLink = (() => {
  if (typeof window === 'undefined') return null
  const frag = new URLSearchParams(window.location.hash.replace(/^#\/?/, ''))
  const query = new URLSearchParams(window.location.search)
  let link: CapturedLink = null
  if (frag.get('error_description')) {
    link = { kind: 'error', message: frag.get('error_description')! }
  } else if (frag.get('access_token') && frag.get('refresh_token')) {
    link = { kind: 'tokens', access_token: frag.get('access_token')!, refresh_token: frag.get('refresh_token')!, type: frag.get('type') }
  } else if (query.get('token_hash') && query.get('type')) {
    link = { kind: 'hash', token_hash: query.get('token_hash')!, type: query.get('type') as EmailOtpType }
  }
  if (link) window.history.replaceState(null, '', appUrl() + '#/')
  return link
})()

async function consumeAuthLink(): Promise<{ type: string | null; error: string | null }> {
  if (!supabase || !captured) return { type: null, error: null }
  if (captured.kind === 'error') return { type: null, error: captured.message }
  if (captured.kind === 'tokens') {
    const { error } = await supabase.auth.setSession({ access_token: captured.access_token, refresh_token: captured.refresh_token })
    return { type: captured.type, error: error?.message ?? null }
  }
  const { error } = await supabase.auth.verifyOtp({ token_hash: captured.token_hash, type: captured.type })
  return { type: captured.type, error: error ? `${error.message}. The link may have expired; ask for a new one.` : null }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [needsPassword, setNeedsPassword] = useState(flag.get())
  const [linkError, setLinkError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    const requirePassword = () => { flag.set(true); setNeedsPassword(true) }

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') requirePassword()
      if (event === 'SIGNED_OUT') { flag.set(false); setNeedsPassword(false) }
      if (s && window.location.search.includes('code=')) {
        window.history.replaceState(null, '', appUrl() + window.location.hash)
      }
    })

    ;(async () => {
      const link = await consumeAuthLink()
      if (link.error) setLinkError(link.error)
      if (link.type === 'invite' || link.type === 'recovery' || link.type === 'signup') requirePassword()
      const { data } = await supabase.auth.getSession()
      setSession(data.session)
      setLoading(false)
    })()

    return () => sub.subscription.unsubscribe()
  }, [])

  const passwordSet = () => { flag.set(false); setNeedsPassword(false) }
  const signOut = async () => { await supabase?.auth.signOut() }

  return (
    <AuthContext.Provider value={{ session, loading, needsPassword, linkError, passwordSet, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

type Mode = 'password' | 'link' | 'forgot'

export function SignIn() {
  const { linkError } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<Mode>('password')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(linkError)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError(null)
    setMessage(null)
    let err: { message: string } | null = null
    if (mode === 'password') {
      err = (await supabase.auth.signInWithPassword({ email, password })).error
    } else if (mode === 'link') {
      err = (await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: appUrl() } })).error
      if (!err) setMessage(`Sign-in link sent to ${email}. Open it on this device.`)
    } else {
      err = (await supabase.auth.resetPasswordForEmail(email, { redirectTo: appUrl() })).error
      if (!err) setMessage(`If ${email} has an account, a reset link is on its way. Open it on this device.`)
    }
    setBusy(false)
    if (err) setError(err.message === 'Invalid login credentials' ? 'Email or password is wrong.' : err.message)
  }

  const label = { password: 'Sign in', link: 'Email me a sign-in link', forgot: 'Send reset link' }[mode]

  return (
    <div className="signin">
      <form className="card" onSubmit={submit}>
        <Logo />
        <p className="muted">
          {mode === 'forgot' ? 'Enter your email and we’ll send a link to choose a new password.' : 'Sign in with the email you were invited with.'}
        </p>
        <label>Email<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        {mode === 'password' && (
          <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        )}
        <button className="primary" disabled={busy}>{busy ? 'Working…' : label}</button>
        <div className="signin-links">
          {mode !== 'password' && <button type="button" className="link" onClick={() => setMode('password')}>Sign in with password</button>}
          {mode !== 'forgot' && <button type="button" className="link" onClick={() => setMode('forgot')}>Forgot password?</button>}
          {mode !== 'link' && <button type="button" className="link" onClick={() => setMode('link')}>Email me a link</button>}
        </div>
        {message && <div className="notice">{message}</div>}
        {error && <div className="notice error">{error}</div>}
      </form>
    </div>
  )
}

/** Shown after an invite or reset link, before the rest of the app. */
export function CreatePassword() {
  const { session, passwordSet, signOut } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const tooShort = password.length > 0 && password.length < 8
  const mismatch = confirm.length > 0 && confirm !== password

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase!.auth.updateUser({ password })
    setBusy(false)
    if (error) setError(error.message)
    else passwordSet()
  }

  return (
    <div className="signin">
      <form className="card" onSubmit={save}>
        <Logo />
        <h2 className="flush">Create your password</h2>
        <p className="muted">You’ll use it with <strong>{session?.user.email}</strong> to sign in from now on.</p>
        <label>Password
          <input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label>Confirm password
          <input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        {tooShort && <span className="small bad-text">At least 8 characters.</span>}
        {mismatch && <span className="small bad-text">Passwords don’t match.</span>}
        <button className="primary" disabled={busy || password.length < 8 || confirm !== password}>
          {busy ? 'Saving…' : 'Save password and continue'}
        </button>
        <button type="button" className="link" onClick={signOut}>Not you? Sign out</button>
        {error && <div className="notice error">{error}</div>}
      </form>
    </div>
  )
}

/** Change password from the Projects page. */
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
      <input type="password" autoComplete="new-password" minLength={8} placeholder="New password (8+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button disabled={password.length < 8}>Change password</button>
      {msg && <span className="muted">{msg}</span>}
    </form>
  )
}

/** The name printed in "Reviewed by", "Issued by" and similar fields. */
export function SignerName() {
  const { session } = useAuth()
  const initial = (session?.user.user_metadata?.full_name as string | undefined) ?? ''
  const [name, setName] = useState(initial)
  const [msg, setMsg] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase!.auth.updateUser({ data: { full_name: name.trim() } })
    setMsg(error ? error.message : 'Saved. New forms will use it.')
  }

  return (
    <form className="inline-form" onSubmit={save}>
      <input placeholder="e.g. Jacob Seither, AIA" value={name} onChange={(e) => setName(e.target.value)} />
      <button disabled={name.trim() === initial}>Save name</button>
      {msg && <span className="muted small">{msg}</span>}
    </form>
  )
}
