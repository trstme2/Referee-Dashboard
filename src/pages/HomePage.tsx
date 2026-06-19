import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '../lib/DataContext'
import {
  displayNameForUser,
  getAttentionNeeded,
  getNextAssignment,
  getReadinessSummary,
  getSyncHealthSummary,
  getUpcomingAssignments,
  getWeekSummary,
  mapsHrefForAddress,
} from '../lib/mobileDashboard'
import { upsertGameIn } from '../lib/mutate'
import { getOnboardingProgress } from '../lib/onboarding'
import type { CalendarFeed, CalendarFeedSyncRun, Game } from '../lib/types'
import { formatMoney } from '../lib/utils'
import '../styles/mobileDashboard.css'

function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function statusTone(status: Game['status']): 'ok' | 'warn' | 'bad' | 'info' {
  if (status === 'Paid / Complete') return 'ok'
  if (status === 'Played') return 'warn'
  if (status === 'Canceled') return 'bad'
  return 'info'
}

function formatGameDate(dateYmd: string): string {
  return new Date(`${dateYmd}T00:00:00`).toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function formatGameDateTime(game: Game): string {
  const date = formatGameDate(game.gameDate)
  if (!game.startTime) return date
  const time = new Date(`${game.gameDate}T${game.startTime}:00`).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
  return `${date} at ${time}`
}

export default function HomePage() {
  const { db, mode, loading, session, write, error } = useData()
  const onboarding = useMemo(() => getOnboardingProgress(db), [db])
  const [feeds, setFeeds] = useState<CalendarFeed[]>([])
  const [syncHistory, setSyncHistory] = useState<CalendarFeedSyncRun[]>([])
  const [syncHealthLoading, setSyncHealthLoading] = useState(false)
  const [syncHealthError, setSyncHealthError] = useState<string | null>(null)
  const [markingGameId, setMarkingGameId] = useState<string | null>(null)

  useEffect(() => {
    const token = session?.access_token
    if (mode !== 'supabase' || !token) return

    let active = true

    async function loadSyncHealth() {
      setSyncHealthLoading(true)
      setSyncHealthError(null)
      try {
        const headers = { Authorization: `Bearer ${token}` }
        const [feedsRes, historyRes] = await Promise.all([
          fetch('/api/calendar-feeds', { headers }),
          fetch('/api/sync-ics?history=1&limit=10', { headers }),
        ])

        const feedsJson = await feedsRes.json().catch(() => ({}))
        const historyJson = await historyRes.json().catch(() => ({}))

        if (!active) return

        if (!feedsRes.ok) {
          throw new Error(String(feedsJson?.error || feedsRes.statusText || 'Could not load calendar feeds'))
        }
        if (!historyRes.ok) {
          throw new Error(String(historyJson?.error || historyRes.statusText || 'Could not load sync history'))
        }

        setFeeds((feedsJson.feeds ?? []) as CalendarFeed[])
        setSyncHistory((historyJson.history ?? []) as CalendarFeedSyncRun[])
      } catch (e: any) {
        if (!active) return
        setSyncHealthError(String(e?.message ?? e))
        setFeeds([])
        setSyncHistory([])
      } finally {
        if (active) setSyncHealthLoading(false)
      }
    }

    void loadSyncHealth()
    return () => {
      active = false
    }
  }, [mode, session?.access_token])

  const activeFeeds = useMemo(
    () => (mode === 'supabase' && session?.access_token ? feeds : []),
    [mode, session?.access_token, feeds]
  )
  const activeSyncHistory = useMemo(
    () => (mode === 'supabase' && session?.access_token ? syncHistory : []),
    [mode, session?.access_token, syncHistory]
  )
  const activeSyncHealthError = useMemo(
    () => (mode === 'supabase' && session?.access_token ? syncHealthError : null),
    [mode, session?.access_token, syncHealthError]
  )

  const now = useMemo(() => new Date(), [])
  const greeting = useMemo(() => greetingForHour(now.getHours()), [now])
  const todayLabel = useMemo(
    () =>
      now.toLocaleDateString([], {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      }),
    [now]
  )
  const displayName = useMemo(() => displayNameForUser(session?.user), [session?.user])

  const nextAssignment = useMemo(() => getNextAssignment(db, now), [db, now])
  const upcomingAssignments = useMemo(() => getUpcomingAssignments(db, now, 4), [db, now])
  const weekSummary = useMemo(() => getWeekSummary(db, now), [db, now])
  const readinessSummary = useMemo(() => getReadinessSummary(db, now, 4), [db, now])
  const syncHealth = useMemo(
    () => getSyncHealthSummary(activeFeeds, activeSyncHistory, now),
    [activeFeeds, activeSyncHistory, now]
  )
  const attentionItems = useMemo(
    () =>
      getAttentionNeeded({
        db,
        onboardingIncomplete: !onboarding.isComplete,
        feeds: activeFeeds,
        syncHistory: activeSyncHistory,
        syncError: activeSyncHealthError,
        appError: error,
        today: now,
      }),
    [db, onboarding.isComplete, activeFeeds, activeSyncHistory, activeSyncHealthError, error, now]
  )
  const recentCompleted = useMemo(() => {
    return [...db.games]
      .filter((game) => game.status === 'Played' || game.status === 'Paid / Complete')
      .sort((a, b) => {
        const ak = `${a.gameDate} ${a.startTime ?? '99:99'}`
        const bk = `${b.gameDate} ${b.startTime ?? '99:99'}`
        return ak < bk ? 1 : ak > bk ? -1 : 0
      })
      .slice(0, 3)
  }, [db.games])

  async function markGameComplete(game: Game) {
    setMarkingGameId(game.id)
    try {
      await write(
        upsertGameIn(db, {
          ...game,
          id: game.id,
          status: 'Played',
        })
      )
    } finally {
      setMarkingGameId(null)
    }
  }

  const secondaryAssignments =
    upcomingAssignments.length > 0
      ? upcomingAssignments
      : recentCompleted.map((game) => ({
          game,
          title: game.homeTeam && game.awayTeam ? `${game.homeTeam} vs ${game.awayTeam}` : game.sport,
          competitionLabel: [game.competitionLevel, game.levelDetail, game.league].filter(Boolean).join(' | '),
          sourceLabel: 'Saved in Whistle Keeper',
          locationLabel: game.locationAddress,
          roleLabel: game.role ?? null,
          fee: game.gameFee ?? null,
          canAddMileage: false,
          canMarkComplete: false,
        }))

  return (
    <div className="dashboard-page">
      {!onboarding.isComplete && (
        <section className="setup-banner">
          <div>
            <span className="landing-eyebrow">Setup in progress</span>
            <h2>Finish your Whistle Keeper foundation.</h2>
            <p className="small">
              {onboarding.complete} of {onboarding.total} setup areas are ready.
            </p>
          </div>
          <Link className="btn primary" to="/onboarding">
            Continue setup
          </Link>
        </section>
      )}

      <section className="card dashboard-header-card accent-frame">
        <div className="dashboard-header-row">
          <div>
            <span className="landing-eyebrow">{todayLabel}</span>
            <h2>
              {greeting}
              {displayName ? `, ${displayName}` : ''}.
            </h2>
            <p className="sub">
              Your mobile-first referee dashboard for the next assignment, this week, readiness, and sync health.
            </p>
          </div>
          <div className="dashboard-header-pills">
            {mode === 'supabase' && session?.user?.email ? <span className="pill ok">{session.user.email}</span> : null}
            {loading ? <span className="pill warn">Refreshing</span> : null}
            {!loading ? <span className={`pill ${syncHealth.tone}`}>{syncHealth.title}</span> : null}
          </div>
        </div>
      </section>

      <div className="dashboard-primary-grid">
        <section className="card dashboard-next-card">
          <div className="page-section-head">
            <div>
              <h2>Next Assignment</h2>
              <p className="sub">The next game that needs your attention.</p>
            </div>
            {nextAssignment ? (
              <span className={`pill ${statusTone(nextAssignment.game.status)}`}>{nextAssignment.game.status}</span>
            ) : null}
          </div>

          {nextAssignment ? (
            <>
              <div className="dashboard-next-main">
                <div>
                  <div className="dashboard-next-kicker">{nextAssignment.title}</div>
                  <h3>{nextAssignment.competitionLabel || nextAssignment.game.sport}</h3>
                  <p>{formatGameDateTime(nextAssignment.game)}</p>
                </div>
                {nextAssignment.fee != null ? (
                  <div className="dashboard-next-fee">{formatMoney(nextAssignment.fee)}</div>
                ) : null}
              </div>

              <div className="dashboard-detail-grid">
                <div>
                  <span>Date</span>
                  <strong>{formatGameDate(nextAssignment.game.gameDate)}</strong>
                </div>
                <div>
                  <span>Time</span>
                  <strong>
                    {nextAssignment.game.startTime
                      ? formatGameDateTime(nextAssignment.game).split(' at ')[1]
                      : 'Time not set'}
                  </strong>
                </div>
                <div>
                  <span>Role</span>
                  <strong>{nextAssignment.roleLabel ?? 'Role not set'}</strong>
                </div>
                <div>
                  <span>Source</span>
                  <strong>{nextAssignment.sourceLabel}</strong>
                </div>
                <div className="is-wide">
                  <span>Location</span>
                  <strong>{nextAssignment.locationLabel}</strong>
                </div>
              </div>

              <div className="btnbar dashboard-next-actions">
                <Link className="btn primary" to="/games">
                  View details
                </Link>
                {nextAssignment.locationLabel ? (
                  <a
                    className="btn"
                    href={mapsHrefForAddress(nextAssignment.locationLabel)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Directions
                  </a>
                ) : null}
                {nextAssignment.canAddMileage ? (
                  <Link className="btn" to="/games">
                    Add mileage
                  </Link>
                ) : null}
                {nextAssignment.canMarkComplete ? (
                  <button
                    className="btn"
                    onClick={() => void markGameComplete(nextAssignment.game)}
                    disabled={markingGameId === nextAssignment.game.id}
                  >
                    {markingGameId === nextAssignment.game.id ? 'Updating...' : 'Mark complete'}
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <div className="empty-state">
              <h3>No upcoming assignments yet</h3>
              <p>
                Start with a calendar feed or add a game manually so Whistle Keeper has something to organize for you.
              </p>
              <div className="btnbar">
                <Link className="btn primary" to="/sync">
                  Add calendar feed
                </Link>
                <Link className="btn" to="/games">
                  Add assignment
                </Link>
              </div>
            </div>
          )}
        </section>

        <div className="dashboard-side-stack">
          <section className="card">
            <div className="page-section-head">
              <div>
                <h2>This Week</h2>
                <p className="sub">A quick read on the next 7 days.</p>
              </div>
            </div>
            <div className="dashboard-stat-grid">
              <div className="dashboard-mini-stat">
                <span>Assignments</span>
                <strong>{weekSummary.assignments}</strong>
              </div>
              <div className="dashboard-mini-stat">
                <span>Estimated pay</span>
                <strong>{formatMoney(weekSummary.estimatedEarnings)}</strong>
              </div>
              <div className="dashboard-mini-stat">
                <span>Mileage</span>
                <strong>{weekSummary.mileage.toFixed(1)} mi</strong>
              </div>
              <div className="dashboard-mini-stat">
                <span>Sports</span>
                <strong>{weekSummary.sportsCount}</strong>
              </div>
            </div>
            {weekSummary.pendingItems > 0 ? (
              <p className="small dashboard-inline-note">
                <span className="pill warn">
                  {weekSummary.pendingItems} pending detail{weekSummary.pendingItems === 1 ? '' : 's'}
                </span>
                Some games this week are still missing a start time, role, or fee.
              </p>
            ) : (
              <p className="small dashboard-inline-note">No obvious detail gaps in this week's assignments.</p>
            )}
          </section>

          <section className="card">
            <div className="page-section-head">
              <div>
                <h2>Readiness</h2>
                <p className="sub">Season and certification progress at a glance.</p>
              </div>
              <Link className="btn compact" to="/requirements">
                Open
              </Link>
            </div>
            {readinessSummary.length ? (
              <div className="dashboard-readiness-list">
                {readinessSummary.map((item) => (
                  <div key={item.id} className="dashboard-readiness-item">
                    <div>
                      <strong>{item.title}</strong>
                      <span>{item.subtitle}</span>
                    </div>
                    <span className={`pill ${item.tone}`}>{item.statusLabel}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <h3>No readiness tracking yet</h3>
                <p>
                  Add requirements so Whistle Keeper can tell you what still needs to happen before the season gets busy.
                </p>
                <div className="btnbar">
                  <Link className="btn primary" to="/requirements">
                    Add requirements
                  </Link>
                </div>
              </div>
            )}
          </section>

          <section className="card">
            <div className="page-section-head">
              <div>
                <h2>Sync Health</h2>
                <p className="sub">Feed freshness and recent sync behavior.</p>
              </div>
              <Link className="btn compact" to="/sync">
                Manage
              </Link>
            </div>
            <div className="dashboard-sync-card">
              <span className={`pill ${syncHealth.tone}`}>{syncHealth.title}</span>
              <p>{syncHealth.detail}</p>
              {syncHealthLoading ? <p className="small">Checking recent feed health...</p> : null}
              {activeSyncHealthError ? <p className="small">Open Sync to retry the feed status check.</p> : null}
            </div>
          </section>
        </div>
      </div>

      {attentionItems.length > 0 ? (
        <section className="card">
          <div className="page-section-head">
            <div>
              <h2>Attention Needed</h2>
              <p className="sub">Only the items that actually need a follow-up right now.</p>
            </div>
          </div>
          <div className="dashboard-attention-list">
            {attentionItems.map((item) =>
              item.href ? (
                <Link key={item.id} to={item.href} className={`dashboard-attention-item is-${item.tone}`}>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </Link>
              ) : (
                <div key={item.id} className={`dashboard-attention-item is-${item.tone}`}>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </div>
              )
            )}
          </div>
        </section>
      ) : null}

      <section className="card">
        <div className="page-section-head">
          <div>
            <h2>{upcomingAssignments.length ? 'Upcoming Assignments' : 'Recent Assignments'}</h2>
            <p className="sub">
              {upcomingAssignments.length
                ? 'A short list instead of a giant dashboard table.'
                : 'Your latest played or completed games.'}
            </p>
          </div>
          <Link className="btn compact" to="/games">
            Open games
          </Link>
        </div>

        <div className="dashboard-assignment-list">
          {secondaryAssignments.map((item) => (
            <article key={item.game.id} className="dashboard-assignment-card">
              <div className="dashboard-assignment-head">
                <div>
                  <div className="dashboard-assignment-date">{formatGameDateTime(item.game)}</div>
                  <div className="dashboard-assignment-title">{item.title}</div>
                </div>
                <span className={`pill ${statusTone(item.game.status)}`}>{item.game.status}</span>
              </div>
              <div className="dashboard-assignment-meta">
                <span>{item.competitionLabel || item.game.sport}</span>
                {item.roleLabel ? <span>{item.roleLabel}</span> : null}
                <span>{item.sourceLabel}</span>
                {item.fee != null ? <span>{formatMoney(item.fee)}</span> : null}
              </div>
              <p>{item.locationLabel}</p>
            </article>
          ))}

          {secondaryAssignments.length === 0 ? (
            <div className="empty-state">
              <h3>No assignments yet</h3>
              <p>
                Once you add a game or connect a feed, your upcoming schedule will show up here in a mobile-friendly list.
              </p>
              <div className="btnbar">
                <Link className="btn primary" to="/games">
                  Add assignment
                </Link>
                <Link className="btn" to="/sync">
                  Connect feed
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="card">
        <div className="page-section-head">
          <div>
            <h2>Quick Actions</h2>
            <p className="sub">The paths you are most likely to need from your phone.</p>
          </div>
        </div>
        <div className="dashboard-action-grid">
          <Link className="dashboard-action-tile" to="/sync">
            <strong>Add calendar feed</strong>
            <span>Pull assignments in automatically.</span>
          </Link>
          <Link className="dashboard-action-tile" to="/games">
            <strong>Add assignment</strong>
            <span>Enter a game manually.</span>
          </Link>
          <Link className="dashboard-action-tile" to="/requirements">
            <strong>Add requirement</strong>
            <span>Track tests, clinics, and meetings.</span>
          </Link>
          <Link className="dashboard-action-tile" to="/games">
            <strong>Add mileage</strong>
            <span>Fill in missing travel details.</span>
          </Link>
          <Link className="dashboard-action-tile" to="/expenses">
            <strong>Add expense</strong>
            <span>Capture a cost while it is fresh.</span>
          </Link>
          <Link className="dashboard-action-tile" to="/calendar">
            <strong>View calendar</strong>
            <span>See games, blocks, and travel together.</span>
          </Link>
          <Link className="dashboard-action-tile" to="/requirements">
            <strong>View requirements</strong>
            <span>See what still needs attention.</span>
          </Link>
        </div>
      </section>
    </div>
  )
}
