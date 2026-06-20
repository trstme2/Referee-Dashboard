import type { VercelRequest, VercelResponse } from '@vercel/node'
import { checkRateLimit, createAuthedSupabase, createServiceSupabase, getBearerToken, sendRateLimited, setApiSecurityHeaders, toJsonBody } from '../src/server/auth-utils.js'
import { logApiDone, logApiError, logApiStart } from '../src/server/observability.js'
import { ensurePlatformProfile, isAdminRole, isMissingPlatformTableError, recordAppEvent, requireAdminProfile, sanitizeEventMetadata } from '../src/server/platform-auth.js'
import { upsertUserSettingsCompat } from '../src/lib/userSettingsCompat.js'
import { validateBetaAccessRequest } from '../src/lib/betaAccess.js'

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

function sanitizeUserSettingsPayload(payload: any, userId: string) {
  if (!payload || typeof payload !== 'object') throw new Error('Settings payload is required')
  return {
    user_id: userId,
    home_address: String(payload.home_address ?? '').trim(),
    home_address_place_id: payload.home_address_place_id ? String(payload.home_address_place_id) : null,
    home_address_latitude: payload.home_address_latitude == null ? null : Number(payload.home_address_latitude),
    home_address_longitude: payload.home_address_longitude == null ? null : Number(payload.home_address_longitude),
    other_work_address: payload.other_work_address ? String(payload.other_work_address).trim() : null,
    other_work_address_place_id: payload.other_work_address_place_id ? String(payload.other_work_address_place_id) : null,
    other_work_address_latitude: payload.other_work_address_latitude == null ? null : Number(payload.other_work_address_latitude),
    other_work_address_longitude: payload.other_work_address_longitude == null ? null : Number(payload.other_work_address_longitude),
    default_timezone: String(payload.default_timezone || 'America/New_York').trim() || 'America/New_York',
    tax_mileage_rate_cents: payload.tax_mileage_rate_cents == null ? null : Number(payload.tax_mileage_rate_cents),
    weekly_games_email_enabled: Boolean(payload.weekly_games_email_enabled),
    onboarding_completed_at: payload.onboarding_completed_at ? String(payload.onboarding_completed_at) : null,
    tracked_sports: Array.isArray(payload.tracked_sports) ? payload.tracked_sports.map((value: unknown) => String(value)).filter(Boolean) : [],
    show_game_platform_chips: payload.show_game_platform_chips !== false,
    assigning_platforms: Array.isArray(payload.assigning_platforms) ? payload.assigning_platforms.map((value: unknown) => String(value)).filter(Boolean) : [],
    leagues: Array.isArray(payload.leagues) ? payload.leagues.map((value: unknown) => String(value)).filter(Boolean) : [],
    updated_at: payload.updated_at ? String(payload.updated_at) : new Date().toISOString(),
  }
}

function requestOrigin(req: VercelRequest) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim()
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim()
  if (!host) return process.env.SITE_URL || process.env.VERCEL_URL || ''
  return `${proto}://${host}`
}

function isMissingBetaAccessTableError(error: any): boolean {
  const code = String(error?.code ?? '')
  const message = String(error?.message ?? error ?? '')
  return code === '42P01' || code === 'PGRST205' || message.includes('beta_access_requests')
}

function rowToBetaAccessRequest(row: any) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    region: row.region,
    sports: Array.isArray(row.sports) ? row.sports : [],
    platforms: Array.isArray(row.platforms) ? row.platforms : [],
    devicePreference: row.device_preference,
    notes: row.notes ?? '',
    status: row.status,
    adminNotes: row.admin_notes ?? '',
    reviewedBy: row.reviewed_by ?? null,
    reviewedAt: row.reviewed_at ?? null,
    invitedAt: row.invited_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function submitBetaAccessRequest(serviceClient: any, input: any) {
  const validation = validateBetaAccessRequest(input)
  if (!validation.ok) {
    const err = new Error(validation.errors.join(' '))
    ;(err as any).statusCode = 400
    throw err
  }

  const value = validation.value
  const now = new Date().toISOString()
  const { data, error } = await serviceClient
    .from('beta_access_requests')
    .upsert({
      email: value.email,
      email_normalized: value.emailNormalized,
      full_name: value.fullName,
      region: value.region,
      sports: value.sports,
      platforms: value.platforms,
      device_preference: value.devicePreference,
      notes: value.notes,
      updated_at: now,
    }, { onConflict: 'email_normalized' })
    .select('id,status,created_at,updated_at')
    .single()

  if (error) throw error
  return data
}

async function listBetaAccessRequests(serviceClient: any) {
  const { data, error } = await serviceClient
    .from('beta_access_requests')
    .select('id,full_name,email,region,sports,platforms,device_preference,notes,status,admin_notes,reviewed_by,reviewed_at,invited_at,created_at,updated_at')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) throw error
  return (data ?? []).map(rowToBetaAccessRequest)
}

async function reviewBetaAccessRequest(serviceClient: any, reviewerId: string, body: any, req: VercelRequest) {
  const id = String(body.requestId || '').trim()
  const decision = String(body.decision || '').trim()
  const adminNotes = String(body.adminNotes || '').trim().slice(0, 800)
  if (!id) {
    const err = new Error('Request id is required')
    ;(err as any).statusCode = 400
    throw err
  }
  if (!['invite', 'waitlist', 'reject'].includes(decision)) {
    const err = new Error('Decision must be invite, waitlist, or reject')
    ;(err as any).statusCode = 400
    throw err
  }

  const { data: existing, error: loadError } = await serviceClient
    .from('beta_access_requests')
    .select('id,email,status')
    .eq('id', id)
    .single()
  if (loadError) throw loadError

  const now = new Date().toISOString()
  const updatePayload: Record<string, unknown> = {
    admin_notes: adminNotes,
    reviewed_by: reviewerId,
    reviewed_at: now,
    updated_at: now,
  }

  if (decision === 'invite') {
    const origin = requestOrigin(req)
    const redirectTo = origin ? `${origin}/auth/callback` : undefined
    const { error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(
      existing.email,
      redirectTo ? { redirectTo } : undefined
    )
    if (inviteError) throw inviteError
    updatePayload.status = 'invited'
    updatePayload.invited_at = now
  } else {
    updatePayload.status = decision === 'waitlist' ? 'waitlisted' : 'rejected'
  }

  const { data, error } = await serviceClient
    .from('beta_access_requests')
    .update(updatePayload)
    .eq('id', id)
    .select('id,full_name,email,region,sports,platforms,device_preference,notes,status,admin_notes,reviewed_by,reviewed_at,invited_at,created_at,updated_at')
    .single()

  if (error) throw error
  return rowToBetaAccessRequest(data)
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

    const action = String(req.query.action || (req.method === 'GET' ? 'me' : 'event'))

    if (req.method === 'POST' && action === 'beta-request') {
      const betaRate = checkRateLimit(req, 'beta-access-request', { limit: 8, windowMs: 60 * 60 * 1000 })
      if (!betaRate.allowed) {
        logApiDone(route, requestStartedAtMs, { status: 429, action: 'beta-request' })
        return sendRateLimited(res, betaRate.retryAfterSeconds)
      }
      const serviceClient = createServiceSupabase()
      const body = toJsonBody(req)
      const request = await submitBetaAccessRequest(serviceClient, body.request)
      logApiDone(route, requestStartedAtMs, { status: 200, action: 'beta-request' })
      return res.status(200).json({ ok: true, request: { id: request.id, status: request.status } })
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

    if (req.method === 'GET' && action === 'beta-requests') {
      await requireAdminProfile(serviceClient, authData.user)
      const requests = await listBetaAccessRequests(serviceClient)
      logApiDone(route, requestStartedAtMs, { status: 200, action: 'beta-requests' })
      return res.status(200).json({ requests })
    }

    if (req.method === 'POST' && action === 'beta-request-review') {
      const profile = await requireAdminProfile(serviceClient, authData.user)
      const request = await reviewBetaAccessRequest(serviceClient, profile.userId, toJsonBody(req), req)
      logApiDone(route, requestStartedAtMs, { status: 200, action: 'beta-request-review' })
      return res.status(200).json({ request })
    }

    if (req.method === 'POST' && action === 'user-settings') {
      const body = toJsonBody(req)
      const payload = sanitizeUserSettingsPayload(body.settings, authData.user.id)
      const { error } = await upsertUserSettingsCompat(serviceClient, payload, body.ensureOnly ? { ignoreDuplicates: true } : undefined)
      if (error) throw new Error(`user_settings: ${error.message}`)
      logApiDone(route, requestStartedAtMs, { status: 200, action: 'user-settings' })
      return res.status(200).json({ ok: true })
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
    if (isMissingBetaAccessTableError(e)) {
      logApiError(route, requestStartedAtMs, e, { status: 503 })
      return res.status(503).json({ error: 'Beta access table is not installed. Run the beta access manual patch in Supabase.' })
    }
    const status = Number(e?.statusCode || 500)
    logApiError(route, requestStartedAtMs, e, { status })
    return res.status(status).json({ error: String(e?.message || e || 'Unknown error') })
  }
}
