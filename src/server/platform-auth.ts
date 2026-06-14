import type { User } from '@supabase/supabase-js'

export type PlatformRole = 'user' | 'support' | 'admin' | 'owner'
export type SubscriptionTier = 'free' | 'pro' | 'premium'
export type SubscriptionStatus = 'free' | 'trialing' | 'active' | 'past_due' | 'canceled'

export type PlatformProfile = {
  userId: string
  email?: string
  role: PlatformRole
  subscriptionTier: SubscriptionTier
  subscriptionStatus: SubscriptionStatus
  createdAt?: string
  updatedAt?: string
  lastSeenAt?: string
}

const adminRoles = new Set<PlatformRole>(['admin', 'owner'])

export function isAdminRole(role: string | null | undefined): role is 'admin' | 'owner' {
  return role === 'admin' || role === 'owner'
}

export function isMissingPlatformTableError(error: any): boolean {
  const code = String(error?.code ?? '')
  const message = String(error?.message ?? error ?? '')
  return code === '42P01' || code === 'PGRST205' || message.includes('user_profiles') || message.includes('app_events')
}

function rowToProfile(row: any): PlatformProfile {
  return {
    userId: row.user_id,
    email: row.email ?? undefined,
    role: (row.role ?? 'user') as PlatformRole,
    subscriptionTier: (row.subscription_tier ?? 'free') as SubscriptionTier,
    subscriptionStatus: (row.subscription_status ?? 'free') as SubscriptionStatus,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    lastSeenAt: row.last_seen_at ?? undefined,
  }
}

export async function ensurePlatformProfile(serviceClient: any, user: User): Promise<PlatformProfile> {
  const now = new Date().toISOString()
  const payload = {
    user_id: user.id,
    email: user.email ?? null,
    updated_at: now,
    last_seen_at: now,
  }

  const { data, error } = await serviceClient
    .from('user_profiles')
    .upsert(payload, { onConflict: 'user_id' })
    .select('user_id,email,role,subscription_tier,subscription_status,created_at,updated_at,last_seen_at')
    .single()

  if (error) throw error
  return rowToProfile(data)
}

export async function requireAdminProfile(serviceClient: any, user: User): Promise<PlatformProfile> {
  const profile = await ensurePlatformProfile(serviceClient, user)
  if (!adminRoles.has(profile.role)) {
    const err = new Error('Admin access required')
    ;(err as any).statusCode = 403
    throw err
  }
  return profile
}

export function sanitizeEventMetadata(input: unknown): Record<string, string | number | boolean | null> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const out: Record<string, string | number | boolean | null> = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>).slice(0, 12)) {
    if (!/^[a-zA-Z0-9_.-]{1,48}$/.test(key)) continue
    if (typeof value === 'string') out[key] = value.slice(0, 160)
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value
    else if (typeof value === 'boolean' || value === null) out[key] = value
  }
  return out
}

export async function recordAppEvent(
  serviceClient: any,
  userId: string,
  eventType: string,
  eventSource = 'app',
  metadata: Record<string, string | number | boolean | null> = {}
): Promise<void> {
  const { error } = await serviceClient
    .from('app_events')
    .insert([{
      user_id: userId,
      event_type: eventType,
      event_source: eventSource,
      metadata,
    }])
  if (error) throw error
}
