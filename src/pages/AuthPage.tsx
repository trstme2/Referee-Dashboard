import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'
import { useData } from '../lib/DataContext'
import { createFreshDB, resetDB } from '../lib/storage'
import { deleteCalendarFeeds, deleteOwnAppEvents, deleteSyncHistory, exportAccountData as downloadAccountExport, purgeCloudRows, removeStorageFiles } from '../lib/accountLifecycle'
import logo from '../assets/logo.png'

export default function AuthPage() {
  const { mode, session, refresh, db, write, signOut, loading } = useData()
  const initialEmail = useMemo(() => new URLSearchParams(window.location.search).get('email') ?? '', [])
  const [email, setEmail] = useState(initialEmail)
  const [submittedEmail, setSubmittedEmail] = useState('')
  const [authStep, setAuthStep] = useState<'form' | 'check-email'>('form')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [accountBusy, setAccountBusy] = useState(false)

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
    const activeSession = session

    async function exportAccountData() {
      setErr(null)
      setMsg(null)
      setAccountBusy(true)
      try {
        await downloadAccountExport(db, activeSession.user, activeSession.access_token)
        setMsg('Account data export downloaded.')
      } catch (e: any) {
        setErr(String(e?.message ?? e))
      } finally {
        setAccountBusy(false)
      }
    }

    async function resetAppData() {
      const ok = prompt('This will delete your games, expenses, feeds, requirements, imports, receipts, and evidence files, then reset Whistle Keeper to a fresh account. Type RESET to continue.')
      if (ok !== 'RESET') return
      setErr(null)
      setMsg(null)
      setAccountBusy(true)
      try {
        await removeStorageFiles(db)
        await deleteOwnAppEvents(activeSession.user.id)
        await deleteSyncHistory(activeSession.user.id)
        await deleteCalendarFeeds(activeSession.user.id)
        await write(createFreshDB(), { forceFullReplace: true })
        setMsg('App data reset complete. Your account is still active.')
      } catch (e: any) {
        setErr(String(e?.message ?? e))
      } finally {
        setAccountBusy(false)
      }
    }

    async function deleteAccount() {
      const ok = prompt(`This permanently deletes your Whistle Keeper app data and then deletes the signed-in account ${activeSession.user.email}. Type DELETE ACCOUNT to continue.`)
      if (ok !== 'DELETE ACCOUNT') return
      setErr(null)
      setMsg(null)
      setAccountBusy(true)
      try {
        await removeStorageFiles(db)
        await purgeCloudRows(activeSession.user.id)
        const res = await fetch('/api/account-delete', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${activeSession.access_token}`,
            'Content-Type': 'application/json',
          },
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(String(json?.error || res.statusText))
        resetDB()
        await signOut()
        location.href = '/'
      } catch (e: any) {
        setErr(String(e?.message ?? e))
        setAccountBusy(false)
      }
    }

    return (
      <div className="grid">
        <section className="card">
          <h2>Account</h2>
          <p className="sub">Manage sign-in, data export, and account lifecycle for your private Whistle Keeper records.</p>
          <p className="small">Signed in as <span className="pill ok">{activeSession.user.email}</span></p>
          <div className="btnbar">
            <button className="btn primary" onClick={refresh} disabled={loading || accountBusy}>Refresh from cloud</button>
            <button className="btn" onClick={exportAccountData} disabled={loading || accountBusy}>Export account data</button>
            <Link className="btn" to="/privacy">Data & Privacy</Link>
          </div>
          {msg && <p className="small"><span className="pill ok">{msg}</span></p>}
          {err && <p className="small"><span className="pill bad">{err}</span></p>}
          <div className="footer-note">
            The JSON export includes app records and file references. It does not bundle receipt/evidence file binaries.
          </div>
        </section>

        <section className="card account-lifecycle-card">
          <h2>Data Lifecycle</h2>
          <p className="sub">Know what is stored, export it, and remove it when needed.</p>
          <div className="account-lifecycle-grid">
            <div>
              <div className="expanded-label">What Whistle Keeper stores</div>
              <p>Assignments, calendar blocks, expenses, receipt/evidence file references, requirement activity, import history, sync history, settings, and saved feed metadata.</p>
            </div>
            <div>
              <div className="expanded-label">Private files</div>
              <p>Receipt and requirement evidence uploads live in private Supabase Storage under your user id. Reset and delete flows remove those saved files.</p>
            </div>
            <div>
              <div className="expanded-label">Calendar/feed secrets</div>
              <p>Saved feed URLs are masked in the app and encrypted at rest when the deployment has `FEED_URL_ENCRYPTION_KEY` configured.</p>
            </div>
          </div>
          <div className="btnbar" style={{ marginTop: 14 }}>
            <button className="btn danger" onClick={resetAppData} disabled={loading || accountBusy}>Reset app data</button>
            <button className="btn danger" onClick={deleteAccount} disabled={loading || accountBusy}>Delete account</button>
          </div>
          {accountBusy ? <p className="small">Working on account data...</p> : null}
          <div className="footer-note">
            Reset keeps your sign-in account and returns the app to a fresh state. Delete account removes app data first, then deletes the Supabase auth user.
          </div>
        </section>
      </div>
    )
  }

  async function sendLink(emailOverride?: string) {
    setErr(null)
    setMsg(null)
    const e = (emailOverride ?? email).trim()
    if (!e) return setErr('Enter an email address.')
    setSending(true)
    try {
      if (!supabase) throw new Error('Supabase client missing')
      const { error } = await supabase.auth.signInWithOtp({
        email: e,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      })
      if (error) throw error
      setSubmittedEmail(e)
      setAuthStep('check-email')
      setMsg('Whistle Keeper sent your secure sign-in link.')
    } catch {
      setErr('We could not send that sign-in link. Check the email address and try again.')
    } finally {
      setSending(false)
    }
  }

  if (authStep === 'check-email') {
    return (
      <div className="auth-shell">
        <section className="card auth-card check-email-card">
          <div className="auth-brand-lockup">
            <img src={logo} alt="Whistle Keeper logo" />
            <div>
              <span className="pill ok">Email sent</span>
              <h2>Check your email</h2>
            </div>
          </div>
          <p>
            Whistle Keeper sent a secure sign-in link to <strong>{submittedEmail}</strong>.
            Open the newest email from Whistle Keeper on this device to finish signing in.
          </p>
          <div className="auth-instructions">
            <div>
              <strong>Did not get it?</strong>
              <span>Check spam or promotions, then resend the link.</span>
            </div>
            <div>
              <strong>Opened an old link?</strong>
              <span>Magic links can expire or be used only once. The newest email is the one that counts.</span>
            </div>
          </div>
          <div className="btnbar">
            <button className="btn primary" onClick={() => sendLink(submittedEmail)} disabled={sending}>
              {sending ? 'Sending...' : 'Resend link'}
            </button>
            <button
              className="btn"
              onClick={() => {
                setAuthStep('form')
                setMsg(null)
                setErr(null)
              }}
              disabled={sending}
            >
              Change email
            </button>
          </div>
          {msg && <p className="small"><span className="pill ok">{msg}</span></p>}
          {err && <p className="small"><span className="pill bad">{err}</span></p>}
        </section>
      </div>
    )
  }

  return (
    <div className="auth-shell">
      <section className="card auth-card auth-login-card">
        <div className="auth-brand-lockup">
          <img src={logo} alt="Whistle Keeper logo" />
          <div>
            <span className="pill ok">Passwordless sign-in</span>
            <h2>Welcome to Whistle Keeper</h2>
          </div>
        </div>
        <p className="auth-lede">
          Sign in with your email to manage assignments, mileage, expenses, readiness, and tax-time records.
          Your secure link will come from Whistle Keeper.
        </p>

        <div className="auth-form">
          <div className="field">
            <label>Email address</label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') void sendLink()
              }}
              placeholder="you@example.com"
            />
          </div>
          <button className="btn primary auth-submit" onClick={() => sendLink()} disabled={sending}>
            {sending ? 'Sending...' : 'Email me a secure link'}
          </button>
        </div>

        {msg && <p className="small"><span className="pill ok">{msg}</span></p>}
        {err && <p className="small"><span className="pill bad">{err}</span></p>}

        <div className="footer-note">
          Whistle Keeper uses Supabase Auth passwordless email login. No password is stored or required.
        </div>
      </section>
    </div>
  )
}
