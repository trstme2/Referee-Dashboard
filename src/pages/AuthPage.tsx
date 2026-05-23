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
          <h2>Offline mode</h2>
          <p className="small">Cloud sign-in is not available in this environment.</p>
        </section>
      </div>
    )
  }

  if (!supabaseConfigured) {
    return (
      <div className="grid">
        <section className="card">
          <h2>Cloud sign-in unavailable</h2>
          <p className="small">Complete the Whistle Keeper cloud configuration to enable sign-in.</p>
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
            For custom domains, add this site to the approved sign-in redirect list.
          </div>
        </section>
      </div>
    )
  }

  async function sendLink() {
    setErr(null)
    setMsg(null)
    const e = email.trim()
    if (!e) return setErr('Enter an email.')
    setSending(true)
    try {
      if (!supabase) throw new Error('Supabase client missing')
      const { error } = await supabase.auth.signInWithOtp({
        email: e,
        options: { emailRedirectTo: `${window.location.origin}/auth` },
      })
      if (error) throw error
      setMsg('Sign-in link sent. Check your email.')
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
        <p className="sub">Secure email sign-in for your Whistle Keeper account.</p>

        <div className="row">
          <div className="field" style={{ flex: 2 }}>
            <label>Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>&nbsp;</label>
            <button className="btn primary" onClick={sendLink} disabled={sending}>
              {sending ? 'Sending...' : 'Send sign-in link'}
            </button>
          </div>
        </div>

        {msg && <p className="small"><span className="pill ok">{msg}</span></p>}
        {err && <p className="small"><span className="pill bad">{err}</span></p>}

        <div className="footer-note">
          Use your current app address as an approved sign-in redirect URL.
        </div>
      </section>
    </div>
  )
}
