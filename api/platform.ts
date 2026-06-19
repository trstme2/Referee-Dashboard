import type { VercelRequest, VercelResponse } from '@vercel/node'
import { checkRateLimit, createAuthedSupabase, createServiceSupabase, getBearerToken, sendRateLimited, setApiSecurityHeaders, toJsonBody } from '../src/server/auth-utils.js'
import { logApiDone, logApiError, logApiStart } from '../src/server/observability.js'
import { ensurePlatformProfile, isAdminRole, isMissingPlatformTableError, recordAppEvent, requireAdminProfile, sanitizeEventMetadata } from '../src/server/platform-auth.js'

const allowedEventTypes = new Set([
  'account_exported',
  'api_error',
  'app_data_reset',
  'assigning_platform_help_clicked',
  'assigning_platform_selected',
  'calendar_export_downloaded',
  'calendar_feed_add_cancelled',
  'calendar_feed_add_started',
  'calendar_feed_added',
  'calendar_feed_url_pasted',
  'calendar_feed_validation_failed',
  'calendar_feed_token_regenerated',
  'client_error',
  'feed_created',
  'feed_deleted',
  'game_created',
  'expense_created',
  'onboarding_completed',
  'platform_other_entered',
  'readiness_group_created',
  'sync_completed',
  'sync_failed',
  'tax_export_downloaded',
  'weekly_email_disabled',
  'weekly_email_enabled',
])

function countBy<T extends string>(rows: Array<Record<T, string | null | undefined>>, key: T) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const value = String(row[key] || 'unknown')
    acc[value] = (acc[value] ?? 0) + 1
    return acc
  }, {})
}

function isRecent(value: string | null | undefined, days: number) {
  if (!value) return false
  const time = new Date(value).getTime()
  if (Number.isNaN(time)) return false
  return time >= Date.now() - days * 24 * 60 * 60 * 1000
}

function optionalTableError(error: any, table: string): boolean {
  const code = String(error?.code ?? '')
  const message = String(error?.message ?? error ?? '')
  return code === '42P01' || code === 'PGRST205' || message.includes(table)
}

function uniqueUsers(rows: any[]) {
  return new Set(rows.map((row) => row.user_id).filter(Boolean)).size
}

function pct(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0
}

function average(rows: any[], key: string) {
  const values = rows.map((row) => Number(row[key])).filter((value) => Number.isFinite(value))
  if (!values.length) return 0
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

async function loadAdminMetrics(serviceClient: any) {
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const [profilesRes, eventsRes, syncRes, feedsRes, gamesRes, expensesRes, requirementsRes, jobsRes] = await Promise.all([
    serviceClient
      .from('user_profiles')
      .select('user_id,role,subscription_tier,subscription_status,created_at,last_seen_at')
      .limit(20000),
    serviceClient
      .from('app_events')
      .select('user_id,event_type,event_source,created_at')
      .gte('created_at', since30)
      .limit(20000),
    serviceClient
      .from('calendar_feed_sync_runs')
      .select('user_id,status,created_at,started_at,duration_ms,attempts')
      .gte('created_at', since7)
      .limit(20000),
    serviceClient
      .from('calendar_feeds')
      .select('user_id,enabled,last_synced_at')
      .limit(20000),
    serviceClient
      .from('games')
      .select('user_id')
      .limit(20000),
    serviceClient
      .from('expenses')
      .select('user_id')
      .limit(20000),
    serviceClient
      .from('requirement_instances')
      .select('user_id')
      .limit(20000),
    serviceClient
      .from('calendar_sync_jobs')
      .select('user_id,status,created_at,run_after,attempts,last_error')
      .limit(20000),
  ])

  for (const result of [profilesRes, eventsRes, syncRes, feedsRes, gamesRes, expensesRes, requirementsRes]) {
    if (result.error) throw result.error
  }
  const jobsUnavailable = Boolean(jobsRes.error && optionalTableError(jobsRes.error, 'calendar_sync_jobs'))
  if (jobsRes.error && !jobsUnavailable) throw jobsRes.error

  const profiles = profilesRes.data ?? []
  const events = eventsRes.data ?? []
  const syncRuns = syncRes.data ?? []
  const feeds = feedsRes.data ?? []
  const games = gamesRes.data ?? []
  const expenses = expensesRes.data ?? []
  const requirements = requirementsRes.data ?? []
  const jobs = jobsUnavailable ? [] : (jobsRes.data ?? [])
  const feedUsers = new Set(feeds.map((feed: any) => feed.user_id).filter(Boolean))
  const enabledFeeds = feeds.filter((feed: any) => feed.enabled !== false)
  const successfulSyncRuns = syncRuns.filter((run: any) => run.status === 'success')
  const failedSyncRuns = syncRuns.filter((run: any) => run.status === 'failed')
  const partialSyncRuns = syncRuns.filter((run: any) => run.status === 'partial')
  const usersWithActivity = new Set([
    ...games.map((row: any) => row.user_id),
    ...expenses.map((row: any) => row.user_id),
    ...requirements.map((row: any) => row.user_id),
    ...feeds.map((row: any) => row.user_id),
  ].filter(Boolean))
  const pageViews7d = events.filter((event: any) => event.event_type === 'page_view' && event.created_at >= since7)
  const clientErrors7d = events.filter((event: any) => event.event_type === 'client_error' && event.created_at >= since7)
  const apiErrors7d = events.filter((event: any) => event.event_type === 'api_error' && event.created_at >= since7)
  const workflowEvents30d = events.filter((event: any) => !['page_view', 'client_error', 'api_error'].includes(event.event_type))

  return {
    generatedAt: new Date().toISOString(),
    users: {
      total: profiles.length,
      active1d: profiles.filter((profile: any) => isRecent(profile.last_seen_at, 1)).length,
      active7d: profiles.filter((profile: any) => isRecent(profile.last_seen_at, 7)).length,
      active30d: profiles.filter((profile: any) => isRecent(profile.last_seen_at, 30)).length,
      new30d: profiles.filter((profile: any) => isRecent(profile.created_at, 30)).length,
      admins: profiles.filter((profile: any) => isAdminRole(profile.role)).length,
      byRole: countBy(profiles, 'role'),
      byTier: countBy(profiles, 'subscription_tier'),
      bySubscriptionStatus: countBy(profiles, 'subscription_status'),
    },
    feeds: {
      total: feeds.length,
      enabled: enabledFeeds.length,
      usersWithFeeds: feedUsers.size,
      usersWithRecentlySyncedFeeds: uniqueUsers(feeds.filter((feed: any) => feed.last_synced_at && feed.last_synced_at >= since7)),
    },
    sync: {
      runs7d: syncRuns.length,
      successRate7d: pct(successfulSyncRuns.length, syncRuns.length),
      failed7d: failedSyncRuns.length,
      partial7d: partialSyncRuns.length,
      averageDurationMs7d: average(syncRuns, 'duration_ms'),
      averageAttempts7d: average(syncRuns, 'attempts'),
      byStatus7d: countBy(syncRuns, 'status'),
    },
    syncJobs: {
      unavailable: jobsUnavailable,
      total: jobs.length,
      due: jobs.filter((job: any) => ['queued', 'retry'].includes(job.status) && (!job.run_after || job.run_after <= new Date().toISOString())).length,
      byStatus: countBy(jobs, 'status'),
    },
    activation: {
      usersWithFeeds: feedUsers.size,
      usersWithGames: uniqueUsers(games),
      usersWithExpenses: uniqueUsers(expenses),
      usersWithRequirements: uniqueUsers(requirements),
      usersWithAnyCoreData: usersWithActivity.size,
      coreActivationRate: pct(usersWithActivity.size, profiles.length),
    },
    events: {
      total30d: events.length,
      usersWithEvents30d: uniqueUsers(events),
      pageViews7d: pageViews7d.length,
      clientErrors7d: clientErrors7d.length,
      apiErrors7d: apiErrors7d.length,
      workflowEvents30d: workflowEvents30d.length,
      taxExports30d: events.filter((event: any) => event.event_type === 'tax_export_downloaded').length,
      accountExports30d: events.filter((event: any) => event.event_type === 'account_exported').length,
      byType30d: countBy(events, 'event_type'),
      bySource30d: countBy(events, 'event_source'),
    },
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const route = '/api/platform'
  const requestStartedAtMs = Date.now()
  setApiSecurityHeaders(res)
  logApiStart(route, req, { action: String(req.query.action || '') })

  if (req.method !== 'GET' && req.method !== 'POST') {
    logApiDone(route, requestStartedAtMs, { status: 405 })
    return res.status(405).json({ error: 'Method not allowed' })
  }
  try {
    const rate = checkRateLimit(req, 'platform', { limit: 120, windowMs: 60 * 1000 })
    if (!rate.allowed) {
      logApiDone(route, requestStartedAtMs, { status: 429 })
      return sendRateLimited(res, rate.retryAfterSeconds)
    }

    const token = getBearerToken(req)
    if (!token) {
      logApiDone(route, requestStartedAtMs, { status: 401 })
      return res.status(401).json({ error: 'Missing bearer token' })
    }

    const authedClient = createAuthedSupabase(token)
    const { data: authData, error: authError } = await authedClient.auth.getUser()
    if (authError || !authData?.user) {
      logApiDone(route, requestStartedAtMs, { status: 401 })
      return res.status(401).json({ error: 'Invalid auth token' })
    }

    const serviceClient = createServiceSupabase()
    const action = String(req.query.action || (req.method === 'GET' ? 'me' : 'event'))

    if (req.method === 'GET' && action === 'me') {
      const profile = await ensurePlatformProfile(serviceClient, authData.user)
      logApiDone(route, requestStartedAtMs, { status: 200, action: 'me' })
      return res.status(200).json({
        profile,
        entitlements: {
          isAdmin: isAdminRole(profile.role),
          canUsePaidFeatures: profile.subscriptionTier !== 'free' && ['trialing', 'active'].includes(profile.subscriptionStatus),
        },
      })
    }

    if (req.method === 'GET' && action === 'metrics') {
      const profile = await requireAdminProfile(serviceClient, authData.user)
      const metrics = await loadAdminMetrics(serviceClient)
      logApiDone(route, requestStartedAtMs, { status: 200, action: 'metrics' })
      return res.status(200).json({ profile, metrics })
    }

    if (req.method === 'POST' && action === 'event') {
      const eventRate = checkRateLimit(req, 'platform-events', { limit: 240, windowMs: 10 * 60 * 1000 })
      if (!eventRate.allowed) {
        logApiDone(route, requestStartedAtMs, { status: 429, action: 'event' })
        return sendRateLimited(res, eventRate.retryAfterSeconds)
      }

      const profile = await ensurePlatformProfile(serviceClient, authData.user)
      const body = toJsonBody(req)
      const eventType = String(body.eventType || '').trim()
      if (!allowedEventTypes.has(eventType)) {
        logApiDone(route, requestStartedAtMs, { status: 400, action: 'event' })
        return res.status(400).json({ error: 'Unsupported event type' })
      }
      const metadata = sanitizeEventMetadata(body.metadata)
      await recordAppEvent(serviceClient, profile.userId, eventType, 'app', metadata)
      logApiDone(route, requestStartedAtMs, { status: 200, action: 'event', eventType })
      return res.status(200).json({ ok: true })
    }

    logApiDone(route, requestStartedAtMs, { status: 404 })
    return res.status(404).json({ error: 'Unknown platform action' })
  } catch (e: any) {
    if (isMissingPlatformTableError(e)) {
      logApiError(route, requestStartedAtMs, e, { status: 503 })
      return res.status(503).json({ error: 'Platform role tables are not installed. Run supabase/schema.sql or the user profiles/app events manual patch.' })
    }
    const status = Number(e?.statusCode || 500)
    logApiError(route, requestStartedAtMs, e, { status })
    return res.status(status).json({ error: String(e?.message || e || 'Unknown error') })
  }
}
