import { useEffect, useMemo, useState } from 'react'
import { useData } from '../lib/DataContext'
import type { CalendarFeed, FeedPlatform, Sport, SyncIcsResult } from '../lib/types'

type FeedForm = {
  id: string
  platform: FeedPlatform
  name: string
  feedUrl: string
  enabled: boolean
  sport: '' | Sport
  defaultLeague: string
}

function emptyForm(): FeedForm {
  return {
    id: '',
    platform: 'DragonFly',
    name: '',
    feedUrl: '',
    enabled: true,
    sport: '',
    defaultLeague: '',
  }
}

export default function SyncPage() {
  const { mode, session, refresh } = useData()
  const [feeds, setFeeds] = useState<CalendarFeed[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [form, setForm] = useState<FeedForm>(() => emptyForm())
  const [result, setResult] = useState<SyncIcsResult | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const token = session?.access_token ?? null

  const feedCounts = useMemo(() => ({
    DragonFly: feeds.filter(f => f.platform === 'DragonFly').length,
    RefQuest: feeds.filter(f => f.platform === 'RefQuest').length,
  }), [feeds])

  async function api(path: string, init?: RequestInit) {
    if (!token) throw new Error('Not authenticated')
    const res = await fetch(path, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(String(json?.error || res.statusText))
    return json
  }

  async function loadFeeds() {
    if (!token) return
    setErr(null)
    setLoading(true)
    try {
      const json = await api('/api/calendar-feeds')
      setFeeds((json.feeds ?? []) as CalendarFeed[])
    } catch (e: any) {
      setErr(String(e?.message ?? e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadFeeds()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  function editFeed(f: CalendarFeed) {
    setForm({
      id: f.id,
      platform: f.platform,
      name: f.name,
      feedUrl: '',
      enabled: Boolean(f.enabled),
      sport: (f.sport as '' | Sport | undefined) || '',
      defaultLeague: f.defaultLeague ?? '',
    })
  }

  async function saveFeed() {
    setErr(null)
    setSaving(true)
    try {
      if (!form.name.trim()) throw new Error('Name is required')
      if (!form.id && !form.feedUrl.trim()) throw new Error('Feed URL is required')

      if (form.id) {
        await api('/api/calendar-feeds', {
          method: 'PUT',
          body: JSON.stringify({
            id: form.id,
            platform: form.platform,
            name: form.name.trim(),
            feedUrl: form.feedUrl.trim() || undefined,
            enabled: form.enabled,
            sport: form.sport || null,
            defaultLeague: form.defaultLeague.trim() || null,
          }),
        })
      } else {
        await api('/api/calendar-feeds', {
          method: 'POST',
          body: JSON.stringify({
            platform: form.platform,
            name: form.name.trim(),
            feedUrl: form.feedUrl.trim(),
            enabled: form.enabled,
            sport: form.sport || null,
            defaultLeague: form.defaultLeague.trim() || null,
          }),
        })
      }
      setForm(emptyForm())
      await loadFeeds()
    } catch (e: any) {
      setErr(String(e?.message ?? e))
    } finally {
      setSaving(false)
    }
  }

  async function deleteFeed(id: string) {
    if (!confirm('Delete this feed?')) return
    setErr(null)
    try {
      await api(`/api/calendar-feeds?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (form.id === id) setForm(emptyForm())
      await loadFeeds()
    } catch (e: any) {
      setErr(String(e?.message ?? e))
    }
  }

  async function syncNow(feedId?: string) {
    setErr(null)
    setResult(null)
    setSyncing(true)
    try {
      const json = await api('/api/sync-ics', {
        method: 'POST',
        body: JSON.stringify(feedId ? { feedId } : {}),
      })
      setResult(json as SyncIcsResult)
      await refresh()
      await loadFeeds()
    } catch (e: any) {
      setErr(String(e?.message ?? e))
    } finally {
      setSyncing(false)
    }
  }

  if (mode !== 'supabase') {
    return (
      <div className="grid">
        <section className="card">
          <h2>Calendar Feed Sync</h2>
          <p className="small">Sync is available only in Supabase mode.</p>
        </section>
      </div>
    )
  }

  return (
    <div className="grid cols2">
      <section className="card">
        <h2>Calendar Feeds</h2>
        <p className="sub">
          DragonFly: <span className="pill">{feedCounts.DragonFly}/1</span> | RefQuest: <span className="pill">{feedCounts.RefQuest}/8</span>
        </p>

        <div className="btnbar" style={{ marginBottom: 10 }}>
          <button className="btn primary" onClick={() => syncNow()} disabled={syncing || loading}>
            {syncing ? 'Syncing...' : 'Sync All'}
          </button>
          <button className="btn" onClick={loadFeeds} disabled={loading}>Refresh feeds</button>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>Name</th><th>Platform</th><th>Feed URL</th><th>Enabled</th><th>Last synced</th><th></th>
            </tr>
          </thead>
          <tbody>
            {feeds.map(f => (
              <tr key={f.id}>
                <td>
                  <div>{f.name}</div>
                  <div className="small">{f.sport || 'Any sport'}{f.defaultLeague ? ` | ${f.defaultLeague}` : ''}</div>
                </td>
                <td>{f.platform}</td>
                <td className="small">{f.maskedFeedUrl || '(hidden)'}</td>
                <td>{f.enabled ? <span className="pill ok">Yes</span> : <span className="pill">No</span>}</td>
                <td className="small">{f.lastSyncedAt ? new Date(f.lastSyncedAt).toLocaleString() : 'Never'}</td>
                <td>
                  <div className="btnbar">
                    <button className="btn" onClick={() => editFeed(f)}>Edit</button>
                    <button className="btn" onClick={() => syncNow(f.id)} disabled={syncing}>Sync Now</button>
                    <button className="btn danger" onClick={() => deleteFeed(f.id)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {feeds.length === 0 && <tr><td colSpan={6} className="small">No feeds configured.</td></tr>}
          </tbody>
        </table>

        {result && (
          <div className="card" style={{ marginTop: 10 }}>
            <h2>Last Sync Result</h2>
            <p className="small">
              Events: +{result.createdEvents} created, {result.updatedEvents} updated | Games: +{result.createdGames} created, {result.updatedGames} updated
            </p>
            {result.errors?.length > 0 && (
              <div>
                {result.errors.map((x, i) => <p key={i} className="small"><span className="pill bad">{x}</span></p>)}
              </div>
            )}
          </div>
        )}

        {err && <p className="small"><span className="pill bad">{err}</span></p>}
      </section>

      <section className="card">
        <h2>{form.id ? 'Edit feed' : 'Add feed'}</h2>
        <p className="small">Feed URLs are stored server-side in Supabase and are not returned to the browser.</p>

        <div className="field">
          <label>Platform</label>
          <select value={form.platform} onChange={e => setForm({ ...form, platform: e.target.value as FeedPlatform })}>
            <option value="DragonFly">DragonFly</option>
            <option value="RefQuest">RefQuest</option>
          </select>
        </div>

        <div className="field">
          <label>Name</label>
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g., RefQuest - Assignor A" />
        </div>

        <div className="field">
          <label>{form.id ? 'Replace feed URL (optional)' : 'Feed URL'}</label>
          <input
            value={form.feedUrl}
            onChange={e => setForm({ ...form, feedUrl: e.target.value })}
            placeholder="https://.../calendar.ics"
          />
        </div>

        <div className="row">
          <div className="field">
            <label>Sport (optional)</label>
            <select value={form.sport} onChange={e => setForm({ ...form, sport: (e.target.value as '' | Sport) })}>
              <option value="">Auto-detect</option>
              <option value="Soccer">Soccer</option>
              <option value="Lacrosse">Lacrosse</option>
            </select>
          </div>
          <div className="field">
            <label>Default league (optional)</label>
            <input value={form.defaultLeague} onChange={e => setForm({ ...form, defaultLeague: e.target.value })} />
          </div>
        </div>

        <div className="field">
          <label>Enabled</label>
          <select value={form.enabled ? 'Yes' : 'No'} onChange={e => setForm({ ...form, enabled: e.target.value === 'Yes' })}>
            <option>Yes</option>
            <option>No</option>
          </select>
        </div>

        <div className="btnbar">
          <button className="btn primary" onClick={saveFeed} disabled={saving}>
            {saving ? 'Saving...' : (form.id ? 'Update feed' : 'Add feed')}
          </button>
          <button className="btn" onClick={() => setForm(emptyForm())} disabled={saving}>New</button>
        </div>
      </section>
    </div>
  )
}
