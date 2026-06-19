import { useEffect, useMemo, useState } from 'react'
import CalendarFeedSetupForm, { type CalendarFeedSetupSubmitValue, type CalendarFeedSetupValue } from '../components/CalendarFeedSetupForm'
import HelpTip from '../components/HelpTip'
import { assigningPlatformConfidenceLabel, assigningPlatformGuideIdForPlatformValue, getAssigningPlatformGuide } from '../lib/assigningPlatformGuides'
import { useData } from '../lib/DataContext'
import { recordPlatformEvent } from '../lib/platformEvents'
import { trackedSportsFor } from '../lib/preferences'
import type { CalendarFeed, CalendarFeedSyncRun, CalendarSyncJob, Sport, SyncIcsResult } from '../lib/types'

type FeedForm = CalendarFeedSetupValue & {
  id: string
  enabled: boolean
  defaultLeague: string
  importStartDate: string
}

function emptyForm(): FeedForm {
  return {
    id: '',
    guideId: 'dragonfly',
    platform: 'DragonFly',
    otherPlatformName: '',
    name: 'DragonFly assignments',
    feedUrl: '',
    enabled: true,
    sport: '',
    defaultLeague: '',
    importStartDate: '',
  }
}

export default function SyncPage() {
  const { mode, session, refresh, db, write } = useData()
  const [feeds, setFeeds] = useState<CalendarFeed[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [form, setForm] = useState<FeedForm>(() => emptyForm())
  const [result, setResult] = useState<SyncIcsResult | null>(null)
  const [cleanupResult, setCleanupResult] = useState<any>(null)
  const [syncHistory, setSyncHistory] = useState<CalendarFeedSyncRun[]>([])
  const [syncJobs, setSyncJobs] = useState<CalendarSyncJob[]>([])
  const [syncHistoryNote, setSyncHistoryNote] = useState<string | null>(null)
  const [selectedCleanupKeys, setSelectedCleanupKeys] = useState<string[]>([])
  const [cleaning, setCleaning] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [healthNow, setHealthNow] = useState(Date.now)

  const token = session?.access_token ?? null
  const sportOptions = useMemo(() => trackedSportsFor(db.settings.trackedSports, db.games.map(g => g.sport)), [db.settings.trackedSports, db.games])

  const feedCounts = useMemo(() => ({
    DragonFly: feeds.filter(f => f.platform === 'DragonFly').length,
    RefQuest: feeds.filter(f => f.platform === 'RefQuest').length,
    Other: feeds.filter(f => f.platform !== 'DragonFly' && f.platform !== 'RefQuest').length,
  }), [feeds])
  const feedResultById = useMemo(() => new Map((result?.feedResults ?? []).map((feedResult) => [feedResult.feedId, feedResult])), [result])

  const cleanupReview = useMemo(() => {
    if (!cleanupResult?.samples?.length) return []

    const gameById = new Map(db.games.map((g) => [g.id, g]))
    const eventById = new Map(db.calendarEvents.map((e) => [e.id, e]))

    return cleanupResult.samples.map((sample: any) => {
      const keeper = gameById.get(sample.keepGameId) ?? sample.keepGame
      const deletions = (sample.deleteGames ?? []).map((snap: any) => {
        const game = gameById.get(snap.id) ?? snap
        const eventId = game?.calendarEventId ?? snap.calendarEventId
        const event = eventId ? eventById.get(eventId) : undefined
        return {
          id: snap.id,
          game,
          event,
          externalRef: snap.externalRef ?? event?.externalRef,
        }
      })
      if (!sample.deleteGames?.length) {
        for (const id of sample.deleteGameIds ?? []) {
          const game = gameById.get(id)
          const event = game?.calendarEventId ? eventById.get(game.calendarEventId) : undefined
          deletions.push({ id, game, event, externalRef: event?.externalRef })
        }
      }
      const relinks = (cleanupResult.relinks ?? []).filter((r: any) => r.keeperGameId === sample.keepGameId)
      return { sample, keeper, deletions, relinks, selected: selectedCleanupKeys.includes(sample.key) }
    })
  }, [cleanupResult, db.games, db.calendarEvents, selectedCleanupKeys])

  const selectedCleanupCount = selectedCleanupKeys.length

  function formatDuration(ms?: number) {
    if (ms == null) return ''
    if (ms < 1000) return `${ms} ms`
    return `${(ms / 1000).toFixed(1)} sec`
  }

  function feedHealth(feed: CalendarFeed) {
    const latest = feedResultById.get(feed.id)
    if (latest) {
      if (latest.status === 'success') return { label: `Synced just now (${latest.attempts} attempt${latest.attempts === 1 ? '' : 's'})`, cls: 'ok' }
      if (latest.status === 'partial') return { label: 'Synced with warnings', cls: 'warn' }
      return { label: `Failed just now (${latest.attempts || 1} attempt${latest.attempts === 1 ? '' : 's'})`, cls: 'bad' }
    }
    if (!feed.enabled) return { label: 'Paused', cls: '' }
    if (!feed.lastSyncedAt) return { label: 'Needs first sync', cls: 'warn' }
    const ageMs = healthNow - new Date(feed.lastSyncedAt).getTime()
    if (ageMs > 48 * 60 * 60 * 1000) return { label: 'Stale', cls: 'warn' }
    return { label: 'Healthy', cls: 'ok' }
  }

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
      setHealthNow(Date.now())
      await loadSyncHistory()
    } catch (e: any) {
      setErr(String(e?.message ?? e))
    } finally {
      setLoading(false)
    }
  }

  async function loadSyncHistory() {
    if (!token) return
    try {
      const json = await api('/api/sync-ics?history=1&limit=25')
      setSyncHistory((json.history ?? []) as CalendarFeedSyncRun[])
      setSyncJobs((json.jobs ?? []) as CalendarSyncJob[])
      setSyncHistoryNote(json.historyUnavailable || json.queueUnavailable ? String(json.historyUnavailable || json.queueUnavailable) : null)
    } catch (e: any) {
      setSyncHistory([])
      setSyncJobs([])
      setSyncHistoryNote(`Could not load sync history: ${String(e?.message ?? e)}`)
    }
  }

  useEffect(() => {
    loadFeeds()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  function editFeed(f: CalendarFeed) {
    const guideId = assigningPlatformGuideIdForPlatformValue(f.platform)
    setFormError(null)
    setForm({
      id: f.id,
      guideId,
      platform: f.platform,
      otherPlatformName: guideId === 'other' ? f.platform : '',
      name: f.name,
      feedUrl: '',
      enabled: Boolean(f.enabled),
      sport: (f.sport as '' | Sport | undefined) || '',
      defaultLeague: f.defaultLeague ?? '',
      importStartDate: f.importStartDate ?? '',
    })
  }

  function resetForm() {
    const baseline = emptyForm()
    const hasUnsavedDraft = Boolean(
      form.id ||
      form.feedUrl.trim() ||
      form.otherPlatformName.trim() ||
      form.sport ||
      form.defaultLeague.trim() ||
      form.importStartDate ||
      form.enabled !== baseline.enabled ||
      form.name.trim() !== baseline.name
    )
    if (hasUnsavedDraft && !saving) {
      void recordPlatformEvent(session?.access_token, 'calendar_feed_add_cancelled', {
        source: 'sync_page',
        platformId: form.guideId,
        usedOther: form.guideId === 'other',
      })
    }
    setFormError(null)
    setForm(emptyForm())
  }

  async function saveFeed(submitted: CalendarFeedSetupSubmitValue) {
    setFormError(null)
    setSaving(true)
    try {
      const isNew = !form.id
      const platform = submitted.resolvedPlatform.trim()
      if (!platform) throw new Error('Platform is required')
      let syncSummary: SyncIcsResult | null = null
      const followUpNotes: string[] = []

      if (form.id) {
        await api('/api/calendar-feeds', {
          method: 'PUT',
          body: JSON.stringify({
            id: form.id,
            platform,
            name: submitted.name.trim(),
            feedUrl: submitted.normalizedFeedUrl || undefined,
            enabled: submitted.enabled,
            sport: submitted.sport || null,
            defaultLeague: submitted.defaultLeague?.trim() || null,
            importStartDate: submitted.importStartDate || null,
          }),
        })
      } else {
        const created = await api('/api/calendar-feeds', {
          method: 'POST',
          body: JSON.stringify({
            platform,
            name: submitted.name.trim(),
            feedUrl: submitted.normalizedFeedUrl,
            enabled: submitted.enabled,
            sport: submitted.sport || null,
            defaultLeague: submitted.defaultLeague?.trim() || null,
            importStartDate: submitted.importStartDate || null,
          }),
        })
        if (created?.feed?.id) {
          try {
            syncSummary = await api('/api/sync-ics', {
              method: 'POST',
              body: JSON.stringify({ feedId: String(created.feed.id) }),
            }) as SyncIcsResult
            setResult(syncSummary)
          } catch (e: any) {
            followUpNotes.push(`Immediate sync needs review: ${String(e?.message ?? e)}`)
          }
        }
      }
      if (isNew) {
        void recordPlatformEvent(session?.access_token, 'feed_created', {
          platform,
          sport: submitted.sport || 'unspecified',
          source: 'sync_page',
        })
        void recordPlatformEvent(session?.access_token, 'calendar_feed_added', {
          source: 'sync_page',
          platformId: submitted.guideId,
          confidenceLabel: assigningPlatformConfidenceLabel(getAssigningPlatformGuide(submitted.guideId).confidence),
          urlScheme: submitted.urlScheme ?? 'unknown',
          usedOther: submitted.guideId === 'other',
        })
      }
      if (!db.settings.assigningPlatforms.some(p => p.toLowerCase() === platform.toLowerCase())) {
        try {
          await write({
            ...db,
            settings: {
              ...db.settings,
              assigningPlatforms: [...db.settings.assigningPlatforms, platform].sort((a, b) => a.localeCompare(b)),
            },
          })
        } catch (e: any) {
          followUpNotes.push(`Platform list update needs review: ${String(e?.message ?? e)}`)
        }
      }
      setForm(emptyForm())
      try {
        await refresh()
        await loadFeeds()
      } catch (e: any) {
        followUpNotes.push(`Refresh needs review: ${String(e?.message ?? e)}`)
      }
      if (followUpNotes.length) {
        setFormError(followUpNotes.join(' '))
      }
    } catch (e: any) {
      setFormError(String(e?.message ?? e))
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
      void recordPlatformEvent(session?.access_token, 'feed_deleted', {
        source: 'sync_page',
      })
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
      const result = json as SyncIcsResult
      const failed = (result.errors?.length ?? 0) > 0 || (result.jobsFailed ?? 0) > 0
      void recordPlatformEvent(session?.access_token, failed ? 'sync_failed' : 'sync_completed', {
        scope: feedId ? 'single_feed' : 'all_feeds',
        jobsQueued: result.jobsQueued ?? 0,
        jobsCompleted: result.jobsCompleted ?? 0,
        jobsFailed: result.jobsFailed ?? 0,
        createdGames: result.createdGames ?? 0,
        updatedGames: result.updatedGames ?? 0,
        errorCount: result.errors?.length ?? 0,
      })
      await refresh()
      await loadFeeds()
    } catch (e: any) {
      setErr(String(e?.message ?? e))
      void recordPlatformEvent(session?.access_token, 'sync_failed', {
        scope: feedId ? 'single_feed' : 'all_feeds',
        errorCount: 1,
      })
    } finally {
      setSyncing(false)
    }
  }

  async function runCleanup(apply: boolean) {
    setErr(null)
    setCleaning(true)
    try {
      if (apply && !selectedCleanupKeys.length) {
        throw new Error('Select at least one duplicate group to apply cleanup.')
      }
      if (apply && !confirm('Apply cleanup to the selected duplicate groups? This will permanently delete only the selected games/events.')) {
        setCleaning(false)
        return
      }
      const json = await api('/api/cleanup-sync', {
        method: 'POST',
        body: JSON.stringify(apply ? { apply, selectedKeys: selectedCleanupKeys } : { apply }),
      })
      setCleanupResult(json)
      setSelectedCleanupKeys((json.samples ?? []).map((sample: any) => sample.key))
      await refresh()
      await loadFeeds()
    } catch (e: any) {
      setErr(String(e?.message ?? e))
    } finally {
      setCleaning(false)
    }
  }

  function describeGame(game: any) {
    if (!game) return 'Game details unavailable'
    const teams = game.homeTeam || game.awayTeam ? `${game.homeTeam || 'TBD'} vs ${game.awayTeam || 'TBD'}` : null
    const detail = game.levelDetail || game.competitionLevel || game.sport || 'Assignment'
    const place = game.locationAddress || 'No location saved'
    return [
      game.gameDate || '',
      game.startTime || '',
      teams || detail,
      place,
    ].filter(Boolean).join(' | ')
  }

  if (mode !== 'supabase') {
    return (
      <div className="grid">
        <section className="card">
          <h2>Calendar Feed Sync</h2>
          <p className="small">Feed sync is available when cloud sync is enabled.</p>
        </section>
      </div>
    )
  }

  return (
    <div className="grid cols2 sync-page">
      <section className="card">
        <h2>Assignment Feeds</h2>
        <p className="sub">
          DragonFly: <span className="pill">{feedCounts.DragonFly}/1</span> | RefQuest: <span className="pill">{feedCounts.RefQuest}/8</span> | Other: <span className="pill">{feedCounts.Other}</span>
        </p>

        <div className="btnbar" style={{ marginBottom: 10 }}>
          <button className="btn primary" onClick={() => syncNow()} disabled={syncing || loading}>
            {syncing ? 'Syncing...' : 'Sync All'}
          </button>
          <button className="btn" onClick={() => runCleanup(false)} disabled={cleaning || syncing || loading}>
            {cleaning ? 'Working...' : 'Preview Cleanup'}
          </button>
          <button className="btn danger" onClick={() => runCleanup(true)} disabled={cleaning || syncing || loading || !selectedCleanupKeys.length}>
            Apply Selected Cleanup
          </button>
          <button className="btn" onClick={loadFeeds} disabled={loading}>Refresh feeds</button>
        </div>

        <div className="sync-feed-card-list">
          {feeds.map(f => {
            const health = feedHealth(f)
            return (
              <article key={f.id} className="sync-feed-card">
                <div className="sync-feed-card-head">
                  <div>
                    <strong>{f.name}</strong>
                    <span>{f.platform} | {f.sport || 'Any sport'}{f.defaultLeague ? ` | ${f.defaultLeague}` : ''}</span>
                  </div>
                  <span className={`pill ${health.cls}`}>{health.label}</span>
                </div>
                <div className="sync-feed-card-grid">
                  <div>
                    <span>Feed URL</span>
                    <strong>{f.maskedFeedUrl || '(hidden)'}</strong>
                  </div>
                  <div>
                    <span>Enabled</span>
                    <strong>{f.enabled ? 'Yes' : 'No'}</strong>
                  </div>
                  <div>
                    <span>Last synced</span>
                    <strong>{f.lastSyncedAt ? new Date(f.lastSyncedAt).toLocaleString() : 'Never'}</strong>
                  </div>
                  <div>
                    <span>Import start</span>
                    <strong>{f.importStartDate || 'Any date'}</strong>
                  </div>
                </div>
                <div className="btnbar sync-feed-card-actions">
                  <button className="btn compact" onClick={() => editFeed(f)}>Edit</button>
                  <button className="btn compact" onClick={() => syncNow(f.id)} disabled={syncing}>Sync Now</button>
                  <button className="btn compact danger" onClick={() => deleteFeed(f.id)}>Delete</button>
                </div>
              </article>
            )
          })}
          {feeds.length === 0 && (
            <div className="empty-state centered">
              <h3>No feeds configured</h3>
              <p>Add your first assigning-platform calendar feed to start syncing assignments.</p>
            </div>
          )}
        </div>

        <table className="table sync-feed-table">
          <thead>
            <tr>
              <th>Name</th><th>Platform</th><th>Feed URL</th><th>Enabled</th><th>Sync health</th><th>Last synced</th><th></th>
            </tr>
          </thead>
          <tbody>
            {feeds.map(f => {
              const health = feedHealth(f)
              return (
                <tr key={f.id}>
                  <td>
                    <div>{f.name}</div>
                    <div className="small">
                      {f.sport || 'Any sport'}
                      {f.defaultLeague ? ` | ${f.defaultLeague}` : ''}
                      {f.importStartDate ? ` | from ${f.importStartDate}` : ''}
                    </div>
                  </td>
                  <td>{f.platform}</td>
                  <td className="small">{f.maskedFeedUrl || '(hidden)'}</td>
                  <td>{f.enabled ? <span className="pill ok">Yes</span> : <span className="pill">No</span>}</td>
                  <td className="small"><span className={`pill ${health.cls}`}>{health.label}</span></td>
                  <td className="small">{f.lastSyncedAt ? new Date(f.lastSyncedAt).toLocaleString() : 'Never'}</td>
                  <td>
                    <div className="btnbar">
                      <button className="btn" onClick={() => editFeed(f)}>Edit</button>
                      <button className="btn" onClick={() => syncNow(f.id)} disabled={syncing}>Sync Now</button>
                      <button className="btn danger" onClick={() => deleteFeed(f.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {feeds.length === 0 && <tr><td colSpan={7} className="small">No feeds configured.</td></tr>}
          </tbody>
        </table>

        {result && (
          <div className="card" style={{ marginTop: 10 }}>
            <h2>Last Sync Result</h2>
            <p className="small">
              {result.feedsSynced != null ? `${result.feedsSynced} feed${result.feedsSynced === 1 ? '' : 's'} checked` : 'Sync complete'}
              {result.durationMs != null ? ` in ${formatDuration(result.durationMs)}` : ''}. Events: +{result.createdEvents} created, {result.updatedEvents} updated | Games: +{result.createdGames} created, {result.updatedGames} updated
              {result.jobsQueued != null ? ` | Jobs: ${result.jobsCompleted ?? 0} done, ${result.jobsRequeued ?? 0} retrying, ${result.jobsFailed ?? 0} failed` : ''}
            </p>
            {Number(result.autoMileageUpdatedGames ?? 0) > 0 ? (
              <p className="small"><span className="pill ok">Auto-filled mileage for {Number(result.autoMileageUpdatedGames)} game{Number(result.autoMileageUpdatedGames) === 1 ? '' : 's'} with mappable addresses.</span></p>
            ) : null}
            {result.queueUnavailable ? <p className="small"><span className="pill warn">{result.queueUnavailable}</span></p> : null}
            {result.queueErrors?.length ? (
              <div>
                {result.queueErrors.map((x, i) => <p key={i} className="small"><span className="pill bad">{x}</span></p>)}
              </div>
            ) : null}
            {result.feedResults?.length ? (
              <div style={{ marginTop: 8 }}>
                {result.feedResults.map((feedResult) => (
                  <p key={feedResult.feedId} className="small">
                    <span className={`pill ${feedResult.status === 'success' ? 'ok' : feedResult.status === 'partial' ? 'warn' : 'bad'}`}>
                      {feedResult.status}
                    </span>{' '}
                    {feedResult.feedName}: {feedResult.createdGames} games created, {feedResult.updatedGames} games updated, {feedResult.createdEvents} events created, {feedResult.updatedEvents} events updated
                    {feedResult.durationMs != null ? ` in ${formatDuration(feedResult.durationMs)}` : ''}
                    {feedResult.attempts ? ` (${feedResult.attempts} attempt${feedResult.attempts === 1 ? '' : 's'})` : ''}
                  </p>
                ))}
              </div>
            ) : null}
            {result.diagnostics ? (
              <div style={{ marginTop: 8 }}>
                <p className="small">
                  Existing synced matches: {result.diagnostics.existingRefMatches} | Manual matches: {result.diagnostics.manualMatches} | New games created: {result.diagnostics.createdFromFeed} | Ambiguous cases skipped: {result.diagnostics.ambiguousCandidates}
                </p>
                {result.diagnostics.samples?.length ? (
                  <div>
                    {result.diagnostics.samples.map((sample, i) => (
                      <p key={`${sample.feedName}-${sample.action}-${i}`} className="small">
                        <span className={`pill ${
                          sample.action === 'matched-existing' || sample.action === 'matched-manual'
                            ? 'ok'
                            : sample.action === 'ambiguous'
                              ? 'warn'
                              : ''
                        }`}>
                          {sample.action}
                        </span>{' '}
                        {sample.summary}
                        {sample.score != null ? ` | score ${sample.score}` : ''}
                        {sample.competingScore != null ? ` | next ${sample.competingScore}` : ''}
                        {sample.reason ? ` | ${sample.reason}` : ''}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {result.errors?.length > 0 && (
              <div>
                {result.errors.map((x, i) => <p key={i} className="small"><span className="pill bad">{x}</span></p>)}
              </div>
            )}
          </div>
        )}

        <div className="card sync-history-card" style={{ marginTop: 10 }}>
          <div className="page-section-head">
            <div>
              <h2>Sync History</h2>
              <p className="sub">Recent feed runs are stored so you can see background and manual sync health over time.</p>
            </div>
            <button className="btn" onClick={loadSyncHistory} disabled={loading || syncing}>Refresh history</button>
          </div>
          {syncHistoryNote ? <p className="small"><span className="pill warn">{syncHistoryNote}</span></p> : null}
          {syncJobs.length ? (
            <div className="sync-job-list">
              {syncJobs.slice(0, 8).map((job) => (
                <article key={job.id} className="sync-job-card">
                  <div>
                    <strong>{job.feedName}</strong>
                    <span>{job.platform} | {job.trigger} | {job.attempts}/{job.maxAttempts} attempts</span>
                  </div>
                  <span className={`pill ${
                    job.status === 'succeeded' ? 'ok' :
                      job.status === 'partial' || job.status === 'queued' ? 'warn' :
                        job.status === 'failed' ? 'bad' : 'info'
                  }`}>{job.status}</span>
                  {job.lastError ? <p className="small">{job.lastError}</p> : null}
                </article>
              ))}
            </div>
          ) : null}
          {syncHistory.length ? (
            <>
              <div className="sync-history-card-list">
                {syncHistory.map((run) => (
                  <article key={run.id} className="sync-history-mobile-card">
                    <div className="sync-feed-card-head">
                      <div>
                        <strong>{run.feedName}</strong>
                        <span>{run.platform} | {new Date(run.startedAt).toLocaleString()}</span>
                      </div>
                      <span className={`pill ${run.status === 'success' ? 'ok' : run.status === 'partial' ? 'warn' : 'bad'}`}>{run.status}</span>
                    </div>
                    <div className="sync-feed-card-grid">
                      <div>
                        <span>Trigger</span>
                        <strong>{run.trigger}</strong>
                      </div>
                      <div>
                        <span>Games</span>
                        <strong>+{run.createdGames}/{run.updatedGames}</strong>
                      </div>
                      <div>
                        <span>Events</span>
                        <strong>+{run.createdEvents}/{run.updatedEvents}</strong>
                      </div>
                      <div>
                        <span>Duration</span>
                        <strong>{formatDuration(run.durationMs)}{run.attempts ? ` | ${run.attempts} attempt${run.attempts === 1 ? '' : 's'}` : ''}</strong>
                      </div>
                    </div>
                    {run.errors?.length ? (
                      <p className="small"><span className="pill bad">{run.errors.slice(0, 2).join(' | ')}</span></p>
                    ) : null}
                  </article>
                ))}
              </div>
              <div className="table-wrap sync-history-table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Started</th><th>Feed</th><th>Type</th><th>Status</th><th>Changes</th><th>Duration</th><th>Errors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {syncHistory.map((run) => (
                      <tr key={run.id}>
                        <td className="small">{new Date(run.startedAt).toLocaleString()}</td>
                        <td>
                          <div>{run.feedName}</div>
                          <div className="small">{run.platform}</div>
                        </td>
                        <td className="small">{run.trigger}</td>
                        <td><span className={`pill ${run.status === 'success' ? 'ok' : run.status === 'partial' ? 'warn' : 'bad'}`}>{run.status}</span></td>
                        <td className="small">
                          Games +{run.createdGames}/{run.updatedGames} | Events +{run.createdEvents}/{run.updatedEvents}
                        </td>
                        <td className="small">{formatDuration(run.durationMs)}{run.attempts ? ` | ${run.attempts} attempt${run.attempts === 1 ? '' : 's'}` : ''}</td>
                        <td className="small">{run.errors?.length ? run.errors.slice(0, 2).join(' | ') : 'None'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="empty-state centered">
              <h3>No sync history yet</h3>
              <p>Run a manual sync or wait for scheduled sync after the history table is added in Supabase.</p>
            </div>
          )}
        </div>

        {cleanupResult && (
          <div className="card" style={{ marginTop: 10 }}>
            <h2>Cleanup Result ({cleanupResult.mode})</h2>
            <p className="small">
              Duplicate groups: {cleanupResult.duplicateGroups} | Delete games: {cleanupResult.deleteGames?.length ?? 0} | Delete events: {cleanupResult.deleteEvents?.length ?? 0}
            </p>
            {cleanupResult.mode === 'dry-run' ? (
              <p className="small">
                Selected groups: {selectedCleanupCount} of {cleanupResult.samples?.length ?? 0}
              </p>
            ) : null}
            {cleanupResult.mode === 'dry-run' && cleanupResult.samples?.length ? (
              <div className="btnbar" style={{ marginBottom: 8 }}>
                <button className="btn" onClick={() => setSelectedCleanupKeys((cleanupResult.samples ?? []).map((s: any) => s.key))}>
                  Select all
                </button>
                <button className="btn" onClick={() => setSelectedCleanupKeys([])}>
                  Clear all
                </button>
              </div>
            ) : null}
            {cleanupResult.relinks?.length ? <p className="small">Relinks: {cleanupResult.relinks.length}</p> : null}
            {cleanupReview.length > 0 && (
              <div>
                {cleanupReview.map((entry: any, i: number) => (
                  <div key={i} className="card" style={{ marginTop: 8, padding: 10 }}>
                    {cleanupResult.mode === 'dry-run' ? (
                      <label className="small" style={{ display: 'block', marginBottom: 8, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={entry.selected}
                          onChange={() => setSelectedCleanupKeys((prev) =>
                            prev.includes(entry.sample.key)
                              ? prev.filter((key) => key !== entry.sample.key)
                              : [...prev, entry.sample.key]
                          )}
                          style={{ marginRight: 8 }}
                        />
                        Include this duplicate group in cleanup
                      </label>
                    ) : null}
                    <p className="small">
                      <span className="pill ok">Keep</span>{' '}
                      {entry.keeper ? describeGame(entry.keeper) : entry.sample.keepGameId}
                    </p>
                    {entry.deletions.map((d: any) => (
                      <p key={d.id} className="small">
                        <span className="pill bad">Delete</span>{' '}
                        {d.game ? describeGame(d.game) : d.id}
                        {d.externalRef ? ` | synced event ${d.externalRef}` : ''}
                      </p>
                    ))}
                    {entry.relinks.map((r: any) => (
                      <p key={r.eventId} className="small">
                        <span className="pill warn">Relink</span> Event {r.eventId} will be attached to the kept game.
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            )}
            {cleanupResult.errors?.length > 0 && (
              <div>
                {cleanupResult.errors.map((x: string, i: number) => <p key={i} className="small"><span className="pill bad">{x}</span></p>)}
              </div>
            )}
          </div>
        )}

        {err && <p className="small"><span className="pill bad">{err}</span></p>}
      </section>

      <section className="card">
        <h2>{form.id ? 'Edit feed' : 'Add feed'}</h2>
        <p className="small">Feed URLs are stored securely and hidden after they are saved.</p>
        <div className="sync-help-row">
          <HelpTip title="How to get a feed from your assignor">
            <p>Whistle Keeper reads iCal feeds from your assigning platform. Look for calendar export, schedule sync, or subscribe options in DragonFly, RefQuest, Arbiter, Assignr, and similar tools.</p>
            <p>If your assignor gives you a calendar link, paste it here. Sync only reads the feed. It does not write anything back to the assignor.</p>
          </HelpTip>
          <HelpTip label="What gets merged?" title="Why some details still need a quick edit">
            <p>Calendar feeds usually bring date, time, and a summary. Pay, exact venue, roundtrip mileage, and league labels are often incomplete.</p>
            <p>Add those details in the game editor after sync. When the same assignment syncs again, Whistle Keeper tries to preserve your manual fee, location, and mileage edits.</p>
          </HelpTip>
        </div>
        <CalendarFeedSetupForm
          accessToken={session?.access_token}
          mode="full"
          source="sync_page"
          value={form}
          sportOptions={sportOptions}
          submitting={saving}
          submitLabel={form.id ? 'Update feed' : 'Add feed'}
          feedUrlOptional={Boolean(form.id)}
          showAdvancedFields
          inlineError={formError}
          onChange={(next) => setForm((current) => ({
            ...current,
            ...next,
            id: current.id,
            enabled: next.enabled ?? current.enabled,
            defaultLeague: next.defaultLeague ?? '',
            importStartDate: next.importStartDate ?? '',
          }))}
          onSubmit={saveFeed}
          secondaryAction={<button className="btn" onClick={resetForm} disabled={saving}>New</button>}
        />
      </section>
    </div>
  )
}
