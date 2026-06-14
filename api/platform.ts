import type { VercelRequest, VercelResponse } from '@vercel/node'
import { checkRateLimit, createAuthedSupabase, createServiceSupabase, getBearerToken, sendRateLimited, setApiSecurityHeaders, toJsonBody } from '../src/server/auth-utils.js'
import { ensurePlatformProfile, isAdminRole, isMissingPlatformTableError, recordAppEvent, requireAdminProfile, sanitizeEventMetadata } from '../src/server/platform-auth.js'

const allowedEventTypes = new Set([
  'account_exported',
  'feed_created',
  'feed_deleted',
  'game_created',
  'expense_created',
  'onboarding_completed',
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

async function loadAdminMetrics(serviceClient: any) {
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [profilesRes, eventsRes, syncRes, feedsRes] = await Promise.all([
    serviceClient
      .from('user_profiles')
      .select('role,subscription_tier,subscription_status,created_at,last_seen_at')
      .limit(20000),
    serviceClient
      .from('app_events')
      .select('event_type,event_source,created_at')
      .gte('created_at', since30)
      .limit(20000),
    serviceClient
      .from('calendar_feed_sync_runs')
      .select('status,created_at')
      .gte('created_at', since7)
      .limit(20000),
    serviceClient
      .from('calendar_feeds')
      .select('user_id,enabled')
      .limit(20000),
  ])

  for (const result of [profilesRes, eventsRes, syncRes, feedsRes]) {
    if (result.error) throw result.error
  }

  const profiles = profilesRes.data ?? []
  const events = eventsRes.data ?? []
  const syncRuns = syncRes.data ?? []
  const feeds = feedsRes.data ?? []
  const feedUsers = new Set(feeds.map((feed: any) => feed.user_id).filter(Boolean))
  const enabledFeeds = feeds.filter((feed: any) => feed.enabled !== false)

  return {
    generatedAt: new Date().toISOString(),
    users: {
      total: profiles.length,
      active7d: profiles.filter((profile: any) => isRecent(profile.last_seen_at, 7)).length,
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
    },
    sync: {
      runs7d: syncRuns.length,
      byStatus7d: countBy(syncRuns, 'status'),
    },
    events: {
      total30d: events.length,
      byType30d: countBy(events, 'event_type'),
      bySource30d: countBy(events, 'event_source'),
    },
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setApiSecurityHeaders(res)

  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const rate = checkRateLimit(req, 'platform', { limit: 120, windowMs: 60 * 1000 })
    if (!rate.allowed) return sendRateLimited(res, rate.retryAfterSeconds)

    const token = getBearerToken(req)
    if (!token) return res.status(401).json({ error: 'Missing bearer token' })

    const authedClient = createAuthedSupabase(token)
    const { data: authData, error: authError } = await authedClient.auth.getUser()
    if (authError || !authData?.user) return res.status(401).json({ error: 'Invalid auth token' })

    const serviceClient = createServiceSupabase()
    const action = String(req.query.action || (req.method === 'GET' ? 'me' : 'event'))

    if (req.method === 'GET' && action === 'me') {
      const profile = await ensurePlatformProfile(serviceClient, authData.user)
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
      return res.status(200).json({ profile, metrics })
    }

    if (req.method === 'POST' && action === 'event') {
      const eventRate = checkRateLimit(req, 'platform-events', { limit: 240, windowMs: 10 * 60 * 1000 })
      if (!eventRate.allowed) return sendRateLimited(res, eventRate.retryAfterSeconds)

      const profile = await ensurePlatformProfile(serviceClient, authData.user)
      const body = toJsonBody(req)
      const eventType = String(body.eventType || '').trim()
      if (!allowedEventTypes.has(eventType)) return res.status(400).json({ error: 'Unsupported event type' })
      const metadata = sanitizeEventMetadata(body.metadata)
      await recordAppEvent(serviceClient, profile.userId, eventType, 'app', metadata)
      return res.status(200).json({ ok: true })
    }

    return res.status(404).json({ error: 'Unknown platform action' })
  } catch (e: any) {
    if (isMissingPlatformTableError(e)) {
      return res.status(503).json({ error: 'Platform role tables are not installed. Run supabase/schema.sql or the user profiles/app events manual patch.' })
    }
    const status = Number(e?.statusCode || 500)
    return res.status(status).json({ error: String(e?.message || e || 'Unknown error') })
  }
}
