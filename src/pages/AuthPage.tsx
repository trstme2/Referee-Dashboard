import { useState } from 'react'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'
import { useData } from '../lib/DataContext'

export default function AuthPage() {
  const { mode, session, refresh } = useData()
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  if (mode !== 'supabase') {
    return (
      <div className="grid">
        <section className="card">
          <h2>Local mode</h2>
          <p className="small">Supabase isn’t configured, so auth is disabled. Set env vars to enable it.</p>
        </section>
      </div>
    )
  }

  if (!supabaseConfigured) {
    return (
      <div className="grid">
        <section className="card">
          <h2>Supabase not configured</h2>
          <p className="small">Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>.</p>
        </section>
      </div>
    )
  }

  if (session) {
    return (
      <div className="grid">
        <section className="card">
          <h2>Signed in</h2>
          <p className="small">User: {session.user.email}</p>
          <div className="btnbar">
            <button className="btn primary" onClick={refresh}>Refresh from cloud</button>
          </div>
          <div className="footer-note">
            Make sure Supabase Auth has your Vercel domain in Redirect URLs and Site URL.
          </div>
        </section>
      </div>
    )
  }

  async function sendLink() {
    setErr(null); setMsg(null)
    const e = email.trim()
    if (!e) return setErr('Enter an email.')
    setSending(true)
    try {
      if (!supabase) throw new Error('Supabase client missing')
      const { error } = await supabase.auth.signInWithOtp({
        email: e,
        options: { emailRedirectTo: window.location.origin }
      })
      if (error) throw error
      setMsg('Magic link sent. Check your email.')
    } catch (ex: any) {
      setErr(String(ex?.message ?? ex))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="grid">
      <section className="card">
        <h2>Sign in</h2>
        <p className="sub">Passwordless login via magic link.</p>

        <div className="row">
          <div className="field" style={{flex: 2}}>
            <label>Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <div className="field" style={{flex: 1}}>
            <label>&nbsp;</label>
            <button className="btn primary" onClick={sendLink} disabled={sending}>
              {sending ? 'Sending…' : 'Send magic link'}
            </button>
          </div>
        </div>

        {msg && <p className="small"><span className="pill ok">{msg}</span></p>}
        {err && <p className="small"><span className="pill bad">{err}</span></p>}

        <div className="footer-note">
          In Supabase: Authentication → URL Configuration. Add your Vercel URLs to Redirect URLs.
        </div>
      </section>
    </div>
  )
}
