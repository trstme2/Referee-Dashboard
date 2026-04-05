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
  const [platforms, setPlatforms] = useState(toListString(db.settings.assigningPlatforms))
  const [leagues, setLeagues] = useState(toListString(db.settings.leagues))
  const [calendarSubscriptionUrl, setCalendarSubscriptionUrl] = useState('')
  const [calendarDownloadUrl, setCalendarDownloadUrl] = useState('')
  const [calendarFeedLoading, setCalendarFeedLoading] = useState(false)
  const [calendarFeedSaving, setCalendarFeedSaving] = useState(false)
  const [calendarFeedError, setCalendarFeedError] = useState<string | null>(null)

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
    const next = {
      ...db,
      settings: {
        homeAddress: home.trim() || db.settings.homeAddress,
        otherWorkAddress: otherWork.trim(),
        defaultTimezone: defaultTimezone.trim() || 'America/New_York',
        assigningPlatforms: parseList(platforms),
        leagues: parseList(leagues).sort(),
      },
    }
    await write(next)
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
      a.download = 'referee-dashboard-calendar.ics'
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
        <p className="sub">Stuff you change once, not every time you add a game.</p>

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
              <button className="btn" onClick={pushLocalToCloud} disabled={loading || mode !== 'supabase' || !session}>Push local -&gt; cloud</button>
            </div>

            {mode === 'supabase' && session ? (
              <div className="card" style={{ marginTop: 16 }}>
                <h2>Calendar Export</h2>
                <div className="field">
                  <label>Subscription URL</label>
                  <input value={calendarSubscriptionUrl} readOnly placeholder={calendarFeedLoading ? 'Loading...' : 'Not available'} />
                  <div className="small">Use this private ICS URL with Apple Calendar, Google Calendar, or Outlook subscriptions.</div>
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
              Distance uses <code>/api/distance</code> and requires <code>GOOGLE_MAPS_API_KEY</code> in Vercel env vars.
            </div>
          </div>

          <div className="card" style={{flex:1}}>
            <h2>Local cache</h2>
            <p className="small">Wiping local cache will not delete cloud data.</p>
            <button className="btn danger" onClick={wipeLocal}>Wipe local cache</button>
          </div>
        </div>

        <div className="footer-note">
          Default sync is incremental upserts/deletes. Use Push local to cloud only when you want a full overwrite.
        </div>
      </section>
    </div>
  )
}
