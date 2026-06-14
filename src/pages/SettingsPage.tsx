import { useEffect, useState } from 'react'
import { useData } from '../lib/DataContext'
import { resetDB } from '../lib/storage'

function parseList(s: string): string[] {
  return s.split(',').map(x => x.trim()).filter(Boolean)
}
function toListString(arr: string[]): string {
  return (arr ?? []).join(', ')
}

export default function SettingsPage() {
  const { mode, session, refresh, db, write, loading } = useData()

  const [home, setHome] = useState(db.settings.homeAddress)
  const [otherWork, setOtherWork] = useState(db.settings.otherWorkAddress ?? '')
  const [defaultTimezone, setDefaultTimezone] = useState(db.settings.defaultTimezone ?? 'America/New_York')
  const [taxMileageRateCents, setTaxMileageRateCents] = useState(String(db.settings.taxMileageRateCents ?? 72.5))
  const [weeklyGamesEmailEnabled, setWeeklyGamesEmailEnabled] = useState(Boolean(db.settings.weeklyGamesEmailEnabled))
  const [trackedSports, setTrackedSports] = useState(toListString(db.settings.trackedSports))
  const [showGamePlatformChips, setShowGamePlatformChips] = useState(db.settings.showGamePlatformChips !== false)
  const [platforms, setPlatforms] = useState(toListString(db.settings.assigningPlatforms))
  const [leagues, setLeagues] = useState(toListString(db.settings.leagues))
  const [calendarSubscriptionUrl, setCalendarSubscriptionUrl] = useState('')
  const [calendarDownloadUrl, setCalendarDownloadUrl] = useState('')
  const [calendarTokenProtected, setCalendarTokenProtected] = useState(false)
  const [calendarFeedLoading, setCalendarFeedLoading] = useState(false)
  const [calendarFeedSaving, setCalendarFeedSaving] = useState(false)
  const [calendarFeedError, setCalendarFeedError] = useState<string | null>(null)
  const [weeklyEmailSaving, setWeeklyEmailSaving] = useState(false)
  const [weeklyEmailMessage, setWeeklyEmailMessage] = useState<string | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWeeklyGamesEmailEnabled(Boolean(db.settings.weeklyGamesEmailEnabled))
  }, [db.settings.weeklyGamesEmailEnabled])

  async function wipeLocal() {
    if (!confirm('Wipe local cache?')) return
    resetDB()
    location.reload()
  }

  async function pushLocalToCloud() {
    if (mode !== 'supabase') return
    if (!confirm('Overwrite cloud snapshot with your current local cache?')) return
    await write(db, { forceFullReplace: true })
  }

  async function saveSettings() {
    const parsedTaxMileageRateCents = Number(taxMileageRateCents)
    if (!Number.isFinite(parsedTaxMileageRateCents) || parsedTaxMileageRateCents < 0) {
      alert('Enter a mileage rate of 0 or higher.')
      return
    }
    const next = {
      ...db,
      settings: {
        ...db.settings,
        homeAddress: home.trim(),
        otherWorkAddress: otherWork.trim(),
        defaultTimezone: defaultTimezone.trim() || 'America/New_York',
        taxMileageRateCents: parsedTaxMileageRateCents,
        weeklyGamesEmailEnabled,
        trackedSports: parseList(trackedSports),
        showGamePlatformChips,
        assigningPlatforms: parseList(platforms),
        leagues: parseList(leagues).sort(),
      },
    }
    await write(next)
  }

  async function updateWeeklyGamesEmailEnabled(enabled: boolean) {
    setWeeklyGamesEmailEnabled(enabled)
    setWeeklyEmailMessage(null)
    setWeeklyEmailSaving(true)
    try {
      await write({
        ...db,
        settings: {
          ...db.settings,
          weeklyGamesEmailEnabled: enabled,
        },
      })
      setWeeklyEmailMessage(enabled ? 'Weekly Sunday email is on.' : 'Weekly Sunday email is off.')
    } catch (e: any) {
      setWeeklyGamesEmailEnabled(Boolean(db.settings.weeklyGamesEmailEnabled))
      setWeeklyEmailMessage(`Could not save weekly email setting: ${String(e?.message ?? e)}`)
    } finally {
      setWeeklyEmailSaving(false)
    }
  }

  async function calendarApi(path: string, init?: RequestInit) {
    if (!session?.access_token) throw new Error('Not authenticated')
    const res = await fetch(path, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(String(json?.error || res.statusText))
    return json
  }

  async function loadCalendarExportInfo() {
    if (mode !== 'supabase' || !session?.access_token) return
    setCalendarFeedError(null)
    setCalendarFeedLoading(true)
    try {
      const json = await calendarApi('/api/calendar-export-token')
      setCalendarSubscriptionUrl(String(json.subscriptionUrl || ''))
      setCalendarDownloadUrl(String(json.downloadUrl || ''))
      setCalendarTokenProtected(Boolean(json.tokenProtected))
    } catch (e: any) {
      setCalendarFeedError(String(e?.message ?? e))
    } finally {
      setCalendarFeedLoading(false)
    }
  }

  useEffect(() => {
    loadCalendarExportInfo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, session?.access_token])

  async function copyCalendarSubscriptionUrl() {
    if (!calendarSubscriptionUrl) return
    await navigator.clipboard.writeText(calendarSubscriptionUrl)
  }

  async function regenerateCalendarFeedToken() {
    if (mode !== 'supabase' || !session?.access_token) return
    if (!confirm('Regenerate the calendar subscription token? Existing subscribed calendars will stop updating until you re-subscribe with the new URL.')) return
    setCalendarFeedError(null)
    setCalendarFeedSaving(true)
    try {
      const json = await calendarApi('/api/calendar-export-token', {
        method: 'POST',
        body: JSON.stringify({ action: 'regenerate' }),
      })
      setCalendarSubscriptionUrl(String(json.subscriptionUrl || ''))
      setCalendarDownloadUrl(String(json.downloadUrl || ''))
      setCalendarTokenProtected(false)
    } catch (e: any) {
      setCalendarFeedError(String(e?.message ?? e))
    } finally {
      setCalendarFeedSaving(false)
    }
  }

  async function downloadCalendarIcsFile() {
    if (!session?.access_token) return
    setCalendarFeedError(null)
    setCalendarFeedSaving(true)
    try {
      const res = await fetch('/api/calendar/download.ics', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || res.statusText)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'whistle-keeper-calendar.ics'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      setCalendarFeedError(String(e?.message ?? e))
    } finally {
      setCalendarFeedSaving(false)
    }
  }

  return (
    <div className="grid">
      <section className="card">
        <h2>Settings</h2>
        <p className="sub">Set your defaults once so new records are faster and more consistent.</p>

        <div className="row">
          <div className="card" style={{flex:1}}>
            <h2>Preferences</h2>

            <div className="field">
              <label>Primary work location (home office)</label>
              <input value={home} onChange={e => setHome(e.target.value)} placeholder="123 Main St, Columbus, OH 43215" />
              <div className="small">This stays the default origin for mileage calculations on each game.</div>
            </div>

            <div className="field">
              <label>Secondary work location (optional)</label>
              <input value={otherWork} onChange={e => setOtherWork(e.target.value)} placeholder="Office, school, or other work address" />
              <div className="small">Use this for another IRS work location you sometimes travel from.</div>
            </div>

            <div className="field">
              <label>Default timezone</label>
              <input value={defaultTimezone} onChange={e => setDefaultTimezone(e.target.value)} placeholder="America/New_York" />
              <div className="small">Use an IANA timezone like <code>America/Chicago</code> or <code>America/Los_Angeles</code>.</div>
            </div>

            <div className="field">
              <label>Standard mileage rate (cents per mile)</label>
              <input type="number" min={0} step="0.1" value={taxMileageRateCents} onChange={e => setTaxMileageRateCents(e.target.value)} />
              <div className="small">Used on the Tax page to estimate a mileage amount for exports. Confirm the right rate for the tax year you are preparing.</div>
            </div>

            <div className="field">
              <label>
                <input
                  type="checkbox"
                  checked={weeklyGamesEmailEnabled}
                  onChange={e => { void updateWeeklyGamesEmailEnabled(e.target.checked) }}
                  disabled={loading || weeklyEmailSaving}
                /> Weekly Sunday game email
              </label>
              <div className="small">Send your Games Next 7 Days schedule to your signed-in email address each Sunday.</div>
              {weeklyEmailSaving ? <div className="small">Saving weekly email preference...</div> : null}
              {weeklyEmailMessage ? <div className="small">{weeklyEmailMessage}</div> : null}
            </div>

            <div className="field">
              <label>Sports to track (comma-separated)</label>
              <input value={trackedSports} onChange={e => setTrackedSports(e.target.value)} placeholder="Soccer, Lacrosse, Basketball, Football" />
              <div className="small">Used for game entry, CSV imports, assignment feeds, and requirements.</div>
            </div>

            <div className="field">
              <label>
                <input
                  type="checkbox"
                  checked={showGamePlatformChips}
                  onChange={e => setShowGamePlatformChips(e.target.checked)}
                /> Show assigning-platform chips on Games
              </label>
              <div className="small">Turn this off when the Games list feels too crowded. Platform confirmations are still saved and editable.</div>
            </div>

            <div className="field">
              <label>Assigning platforms (comma-separated)</label>
              <input value={platforms} onChange={e => setPlatforms(e.target.value)} placeholder="DragonFly, RefQuest, ..." />
              <div className="small">Used as checkboxes on Games and Calendar blocks.</div>
            </div>

            <div className="field">
              <label>League/assignor suggestions (comma-separated)</label>
              <input value={leagues} onChange={e => setLeagues(e.target.value)} placeholder="OCC, USYS, ..." />
              <div className="small">Used as suggestions in the League field on Games. You can still type anything.</div>
            </div>

            <div className="btnbar">
              <button className="btn primary" onClick={saveSettings} disabled={loading}>Save settings</button>
              <button className="btn" onClick={refresh} disabled={loading || mode !== 'supabase'}>Refresh from cloud</button>
              <button className="btn" onClick={pushLocalToCloud} disabled={loading || mode !== 'supabase' || !session}>Replace cloud with local</button>
            </div>

            {mode === 'supabase' && session ? (
              <div className="card" style={{ marginTop: 16 }}>
                <h2>Calendar Export</h2>
                <div className="field">
                  <label>Subscription URL</label>
                  <input value={calendarSubscriptionUrl} readOnly placeholder={calendarFeedLoading ? 'Loading...' : 'Not available'} />
                  <div className="small">Use this private ICS URL with Apple Calendar, Google Calendar, or Outlook subscriptions.</div>
                  {calendarTokenProtected && !calendarSubscriptionUrl ? (
                    <div className="small">Your existing subscription token is protected and cannot be displayed again. Regenerate the token when you need to copy a new subscription URL.</div>
                  ) : null}
                </div>
                <div className="btnbar">
                  <button className="btn" onClick={copyCalendarSubscriptionUrl} disabled={calendarFeedLoading || calendarFeedSaving || !calendarSubscriptionUrl}>
                    Copy Calendar Subscription URL
                  </button>
                  <button className="btn" onClick={downloadCalendarIcsFile} disabled={calendarFeedLoading || calendarFeedSaving}>
                    Download ICS File
                  </button>
                  <button className="btn danger" onClick={regenerateCalendarFeedToken} disabled={calendarFeedLoading || calendarFeedSaving}>
                    Regenerate Calendar Feed Token
                  </button>
                </div>
                {calendarFeedError ? <p className="small"><span className="pill bad">{calendarFeedError}</span></p> : null}
                {calendarDownloadUrl ? <p className="small">Authenticated download endpoint: <code>{calendarDownloadUrl}</code></p> : null}
              </div>
            ) : null}

            <div className="footer-note">
              Mileage lookup is available when the Maps integration has been configured.
            </div>
          </div>

          <div className="card" style={{flex:1}}>
            <h2>Local cache</h2>
            <p className="small">Wiping local cache will not delete cloud data.</p>
            <button className="btn danger" onClick={wipeLocal}>Wipe local cache</button>
          </div>
        </div>

        <div className="footer-note">
          Replacing cloud data is a full overwrite and should be used only when you want local data to become the source of truth.
        </div>
      </section>
    </div>
  )
}
