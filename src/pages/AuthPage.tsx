import { useState } from 'react'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'
import { useData } from '../lib/DataContext'
import { createFreshDB, resetDB } from '../lib/storage'
import { EXPENSE_RECEIPT_BUCKET, REQUIREMENT_EVIDENCE_BUCKET } from '../lib/documents'
import type { DB } from '../lib/types'

const ACCOUNT_TABLE_DELETE_ORDER = [
  'csv_import_rows',
  'csv_imports',
  'requirement_activities',
  'requirement_instances',
  'requirement_definitions',
  'expenses',
  'calendar_events',
  'games',
  'calendar_feed_sync_runs',
  'calendar_feeds',
  'user_settings',
] as const

const OPTIONAL_ACCOUNT_TABLES = new Set<string>(['calendar_feed_sync_runs'])

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function evidencePaths(db: DB) {
  return {
    expenseReceipts: db.expenses.map((expense) => expense.receiptStoragePath).filter((path): path is string => Boolean(path)),
    requirementEvidence: db.requirementActivities.map((activity) => activity.evidenceStoragePath).filter((path): path is string => Boolean(path)),
  }
}

function isMissingOptionalTableError(error: any, table: string) {
  const code = String(error?.code ?? '')
  const message = String(error?.message ?? error ?? '')
  if (code === '42P01' || code === 'PGRST205') return true
  if (message.includes('Could not find the table')) return true
  if (message.includes(table) && (message.includes('does not exist') || message.includes('schema cache'))) return true
  return false
}

export default function AuthPage() {
  const { mode, session, refresh, db, write, signOut, loading } = useData()
  const [email, setEmail] = useState('')
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

    async function calendarFeedsForExport() {
      if (!activeSession.access_token) return []
      const res = await fetch('/api/calendar-feeds', {
        headers: {
          Authorization: `Bearer ${activeSession.access_token}`,
          'Content-Type': 'application/json',
        },
      })
      if (!res.ok) return []
      const json = await res.json().catch(() => ({}))
      return json.feeds ?? []
    }

    async function syncHistoryForExport() {
      if (!activeSession.access_token) return []
      const res = await fetch('/api/sync-ics?history=1&limit=50', {
        headers: {
          Authorization: `Bearer ${activeSession.access_token}`,
          'Content-Type': 'application/json',
        },
      })
      if (!res.ok) return []
      const json = await res.json().catch(() => ({}))
      return json.history ?? []
    }

    async function exportAccountData() {
      setErr(null)
      setMsg(null)
      setAccountBusy(true)
      try {
        const exportData = {
          exportedAt: new Date().toISOString(),
          exportType: 'whistle-keeper-account-data',
          user: {
            id: activeSession.user.id,
            email: activeSession.user.email,
          },
          note: 'Receipt and requirement evidence files are not embedded in this JSON export. File paths and filenames are included where saved.',
          data: db,
          calendarFeeds: await calendarFeedsForExport(),
          syncHistory: await syncHistoryForExport(),
          fileReferences: evidencePaths(db),
        }
        downloadJson(`whistle-keeper-account-data-${new Date().toISOString().slice(0, 10)}.json`, exportData)
        setMsg('Account data export downloaded.')
      } catch (e: any) {
        setErr(String(e?.message ?? e))
      } finally {
        setAccountBusy(false)
      }
    }

    async function removeStorageFiles() {
      if (!supabase) throw new Error('Supabase client missing')
      const paths = evidencePaths(db)
      if (paths.expenseReceipts.length) {
        const { error } = await supabase.storage.from(EXPENSE_RECEIPT_BUCKET).remove(paths.expenseReceipts)
        if (error) throw new Error(`Delete expense receipts: ${error.message}`)
      }
      if (paths.requirementEvidence.length) {
        const { error } = await supabase.storage.from(REQUIREMENT_EVIDENCE_BUCKET).remove(paths.requirementEvidence)
        if (error) throw new Error(`Delete requirement evidence: ${error.message}`)
      }
    }

    async function deleteSyncHistory() {
      if (!supabase) throw new Error('Supabase client missing')
      const { error } = await supabase.from('calendar_feed_sync_runs').delete().eq('user_id', activeSession.user.id)
      if (error && !isMissingOptionalTableError(error, 'calendar_feed_sync_runs')) {
        throw new Error(`Delete sync history: ${error.message}`)
      }
    }

    async function deleteCalendarFeeds() {
      if (!supabase) throw new Error('Supabase client missing')
      const { error } = await supabase.from('calendar_feeds').delete().eq('user_id', activeSession.user.id)
      if (error) throw new Error(`Delete calendar feeds: ${error.message}`)
    }

    async function purgeCloudRows() {
      if (!supabase) throw new Error('Supabase client missing')
      for (const table of ACCOUNT_TABLE_DELETE_ORDER) {
        const { error } = await supabase.from(table).delete().eq('user_id', activeSession.user.id)
        if (error && OPTIONAL_ACCOUNT_TABLES.has(table) && isMissingOptionalTableError(error, table)) continue
        if (error) throw new Error(`Delete ${table}: ${error.message}`)
      }
    }

    async function resetAppData() {
      const ok = prompt('This will delete your games, expenses, feeds, requirements, imports, receipts, and evidence files, then reset Whistle Keeper to a fresh account. Type RESET to continue.')
      if (ok !== 'RESET') return
      setErr(null)
      setMsg(null)
      setAccountBusy(true)
      try {
        await removeStorageFiles()
        await deleteSyncHistory()
        await deleteCalendarFeeds()
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
        await removeStorageFiles()
        await purgeCloudRows()
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
