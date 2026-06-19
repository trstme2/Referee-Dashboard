import { Link } from 'react-router-dom'
import { useState } from 'react'
import { useData } from '../lib/DataContext'
import { createFreshDB, resetDB } from '../lib/storage'
import { supabaseConfigured } from '../lib/supabaseClient'
import { deleteCalendarFeeds, deleteOwnAppEvents, deleteSyncHistory, evidencePaths, exportAccountData, purgeCloudRows, removeStorageFiles } from '../lib/accountLifecycle'
import { recordPlatformEvent } from '../lib/platformEvents'

const dataInventory = [
  {
    label: 'Assignments and calendar blocks',
    examples: 'Games, availability blocks, platform confirmations, locations, pay, mileage, calendar links.',
    location: 'Private app database rows tied to your signed-in user id.',
    control: 'Refresh from cloud, export JSON, reset app data, or delete the account.',
  },
  {
    label: 'Expenses and tax-time records',
    examples: 'Expense date, amount, category, deductible review marker, mileage, receipts, and notes.',
    location: 'Database rows plus private receipt files when uploaded.',
    control: 'Export record metadata; reset/delete removes saved receipt files tracked by the app.',
  },
  {
    label: 'Requirements',
    examples: 'Requirement definitions, due dates, status, completion notes, and evidence file references.',
    location: 'Database rows plus private evidence files when uploaded.',
    control: 'Export record metadata; reset/delete removes saved evidence files tracked by the app.',
  },
  {
    label: 'Sync configuration and history',
    examples: 'Saved feed metadata, masked feed URLs, queued sync jobs, sync status, attempts, duration, and recent errors.',
    location: 'Server API plus Supabase tables protected by user ownership rules.',
    control: 'Disable/delete feeds from Sync; export, reset, and delete include sync history.',
  },
  {
    label: 'Settings and preferences',
    examples: 'Home address, other work address, tracked sports, assigning platforms, leagues, timezone, email preference.',
    location: 'User settings row tied to your signed-in user id.',
    control: 'Edit in Settings, export with account data, or remove through reset/delete.',
  },
  {
    label: 'Profile and product events',
    examples: 'Role, subscription tier/status, last-seen timestamp, and coarse usage events such as account export.',
    location: 'Platform tables used for entitlement checks and aggregate product health metrics.',
    control: 'Included in account export. Reset clears app events but keeps role/subscription profile; delete account removes both.',
  },
]

function countSavedFiles(db: ReturnType<typeof useData>['db']) {
  const paths = evidencePaths(db)
  return paths.expenseReceipts.length + paths.requirementEvidence.length
}

export default function DataPrivacyPage() {
  const { mode, session, db, write, signOut, refresh, loading } = useData()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const isCloud = mode === 'supabase' && supabaseConfigured
  const activeSession = session
  const savedFileCount = countSavedFiles(db)
  const totalRecords =
    db.games.length +
    db.calendarEvents.length +
    db.expenses.length +
    db.requirementDefinitions.length +
    db.requirementInstances.length +
    db.requirementActivities.length +
    db.csvImports.length +
    db.csvImportRows.length

  async function handleExport() {
    setErr(null)
    setMsg(null)
    setBusy(true)
    try {
      if (isCloud && activeSession) {
        await exportAccountData(db, activeSession.user, activeSession.access_token)
      } else {
        await exportAccountData(db, { id: 'local-browser-profile', email: undefined }, undefined)
      }
      setMsg('Data export downloaded.')
    } catch (e: any) {
      setErr(String(e?.message ?? e))
    } finally {
      setBusy(false)
    }
  }

  async function handleReset() {
    const ok = prompt('This will delete app records, saved feeds, requirements, imports, receipts, and evidence files, then return Whistle Keeper to a fresh state. Type RESET to continue.')
    if (ok !== 'RESET') return
    setErr(null)
    setMsg(null)
    setBusy(true)
    try {
      if (isCloud && activeSession) {
        await removeStorageFiles(db)
        await deleteOwnAppEvents(activeSession.user.id)
        await deleteSyncHistory(activeSession.user.id)
        await deleteCalendarFeeds(activeSession.user.id)
        await write(createFreshDB(), { forceFullReplace: true })
        void recordPlatformEvent(activeSession.access_token, 'app_data_reset', {
          deletedRecords: totalRecords,
          deletedFiles: savedFileCount,
        })
      } else {
        resetDB()
        await write(createFreshDB(), { forceFullReplace: true })
      }
      setMsg('App data reset complete.')
    } catch (e: any) {
      setErr(String(e?.message ?? e))
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteAccount() {
    if (!isCloud || !activeSession) return
    const ok = prompt(`This permanently deletes your Whistle Keeper app data and then deletes the signed-in account ${activeSession.user.email}. Type DELETE ACCOUNT to continue.`)
    if (ok !== 'DELETE ACCOUNT') return
    setErr(null)
    setMsg(null)
    setBusy(true)
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
      resetDB(activeSession.user.id)
      await signOut()
      location.href = '/'
    } catch (e: any) {
      setErr(String(e?.message ?? e))
      setBusy(false)
    }
  }

  return (
    <div className="data-privacy-page">
      <section className="card data-privacy-hero">
        <div>
          <span className="pill ok">Personal data controls</span>
          <h2>Data & Privacy</h2>
          <p>
            Whistle Keeper is a personal referee operations app. It organizes your assignments, expenses,
            requirements, sync feeds, and tax-time records for you; it is not an assignor platform and does
            not sell or share your data inside the product.
          </p>
        </div>
        <div className="privacy-mode-card">
          <span className="small">Current storage mode</span>
          <strong>{isCloud ? 'Cloud account' : 'Local browser data'}</strong>
          <p>{isCloud && activeSession ? activeSession.user.email : 'Data is stored in this browser profile.'}</p>
        </div>
      </section>

      <section className="privacy-status-grid">
        <div className="card privacy-stat-card">
          <span>App records</span>
          <strong>{totalRecords}</strong>
          <p>Games, events, expenses, requirements, activity, and import rows.</p>
        </div>
        <div className="card privacy-stat-card">
          <span>Saved file references</span>
          <strong>{savedFileCount}</strong>
          <p>Receipt and evidence files tracked by the app for reset/delete cleanup.</p>
        </div>
        <div className="card privacy-stat-card">
          <span>Saved feeds</span>
          <strong>{isCloud ? 'Private' : 'Local only'}</strong>
          <p>Feed URLs are masked in the app and encrypted at rest when the deployment key is configured.</p>
        </div>
      </section>

      <section className="card">
        <div className="page-section-head">
          <div>
            <h2>Your Controls</h2>
            <p className="sub">Export, refresh, reset, or delete your Whistle Keeper data from one place.</p>
          </div>
          <div className="btnbar">
            {isCloud && activeSession ? <button className="btn" onClick={refresh} disabled={loading || busy}>Refresh from cloud</button> : null}
            <button className="btn primary" onClick={handleExport} disabled={loading || busy}>Export data</button>
          </div>
        </div>
        <div className="privacy-control-grid">
          <div>
            <div className="expanded-label">Export</div>
            <p>Downloads a JSON file with app records, profile metadata, coarse app events, saved feed metadata, recent sync history, and file references. Receipt and evidence file binaries are not embedded.</p>
          </div>
          <div>
            <div className="expanded-label">Reset app data</div>
            <p>Removes app records, saved feeds, app events, sync history, and tracked receipt/evidence files, while keeping your sign-in account and entitlement profile active.</p>
          </div>
          <div>
            <div className="expanded-label">Delete account</div>
            <p>Cloud mode only. Removes app data first, then deletes the Supabase auth user used to sign in.</p>
          </div>
        </div>
        <div className="btnbar" style={{ marginTop: 14 }}>
          <button className="btn danger" onClick={handleReset} disabled={loading || busy}>Reset app data</button>
          {isCloud && activeSession ? <button className="btn danger" onClick={handleDeleteAccount} disabled={loading || busy}>Delete account</button> : null}
          {busy ? <span className="small">Working on data controls...</span> : null}
        </div>
        {msg ? <p className="small"><span className="pill ok">{msg}</span></p> : null}
        {err ? <p className="small"><span className="pill bad">{err}</span></p> : null}
      </section>

      <section className="card">
        <h2>What Whistle Keeper Stores</h2>
        <p className="sub">A plain-English inventory of the personal records the app uses to help run your referee workflow.</p>
        <div className="table-wrap">
          <table className="table privacy-table">
            <thead>
              <tr>
                <th>Data area</th>
                <th>Examples</th>
                <th>Where it lives</th>
                <th>Your control</th>
              </tr>
            </thead>
            <tbody>
              {dataInventory.map((item) => (
                <tr key={item.label}>
                  <td><strong>{item.label}</strong></td>
                  <td>{item.examples}</td>
                  <td>{item.location}</td>
                  <td>{item.control}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="privacy-two-column">
        <div className="card">
          <h2>Protection Model</h2>
          <div className="privacy-list">
            <p><strong>User isolation:</strong> cloud records are tied to your Supabase auth user id and protected by row-level access rules.</p>
            <p><strong>Private uploads:</strong> receipt and requirement evidence files are stored in private buckets under user-scoped paths.</p>
            <p><strong>Feed secrecy:</strong> saved feed URLs are masked in API responses and encrypted at rest when `FEED_URL_ENCRYPTION_KEY` is configured.</p>
            <p><strong>Admin access:</strong> roles and subscription tiers are checked server-side. The browser cannot promote itself or read global metrics directly.</p>
            <p><strong>Subscription URLs:</strong> outbound calendar feed links should be treated like passwords. You can regenerate the token in <Link to="/settings">Settings</Link>.</p>
          </div>
        </div>

        <div className="card">
          <h2>Boundaries</h2>
          <div className="privacy-list">
            <p><strong>No tax advice:</strong> tax features organize records and review flags. They do not determine deductibility or replace a tax professional.</p>
            <p><strong>No assignor tools:</strong> this app is built for a solo referee coordinating across platforms, not for managing officials.</p>
            <p><strong>Deletion scope:</strong> reset/delete removes data the app knows about. If a file path was manually changed outside the app, it may need separate storage cleanup.</p>
            <p><strong>Email preference:</strong> weekly game email opt-in is stored in Settings and can be turned off there at any time.</p>
          </div>
        </div>
      </section>
    </div>
  )
}
