import type { VercelRequest } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'node:crypto'

type HeaderResponse = {
  setHeader(name: string, value: string): void
}

type RateLimitOptions = {
  limit: number
  windowMs: number
}

type RateLimitResult = {
  allowed: boolean
  retryAfterSeconds: number
}

const rateBuckets = new Map<string, { resetAt: number; count: number }>()
const MAX_RATE_BUCKETS = 10_000

function env(name: string): string | undefined {
  return process.env[name]
}

function getSupabaseUrl(): string {
  const url = env('SUPABASE_URL') || env('VITE_SUPABASE_URL')
  if (!url) throw new Error('Missing SUPABASE_URL (or VITE_SUPABASE_URL)')
  return url
}

function getSupabaseAnonKey(): string {
  const key = env('SUPABASE_PUBLISHABLE_KEY') || env('VITE_SUPABASE_PUBLISHABLE_KEY') || env('SUPABASE_ANON_KEY') || env('VITE_SUPABASE_ANON_KEY')
  if (!key) throw new Error('Missing SUPABASE_PUBLISHABLE_KEY (or legacy SUPABASE_ANON_KEY)')
  return key
}

function getSupabaseServiceRoleKey(): string {
  const key = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
  if (!key) throw new Error('Missing SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY)')
  return key
}

export function getBearerToken(req: VercelRequest): string | null {
  const h = String(req.headers.authorization || '')
  if (!h.toLowerCase().startsWith('bearer ')) return null
  return h.slice(7).trim() || null
}

export function setApiSecurityHeaders(res: HeaderResponse, cacheControl = 'no-store') {
  res.setHeader('Cache-Control', cacheControl)
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
}

function clientIp(req: VercelRequest): string {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
  return forwarded || String(req.socket?.remoteAddress || 'unknown')
}

export function checkRateLimit(req: VercelRequest, bucket: string, options: RateLimitOptions): RateLimitResult {
  const now = Date.now()
  const key = `${bucket}:${clientIp(req)}`
  if (rateBuckets.size > MAX_RATE_BUCKETS) {
    for (const [bucketKey, value] of rateBuckets) {
      if (value.resetAt <= now) rateBuckets.delete(bucketKey)
    }
  }

  const existing = rateBuckets.get(key)

  if (!existing || existing.resetAt <= now) {
    rateBuckets.set(key, { resetAt: now + options.windowMs, count: 1 })
    return { allowed: true, retryAfterSeconds: 0 }
  }

  existing.count += 1
  if (existing.count <= options.limit) return { allowed: true, retryAfterSeconds: 0 }

  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  }
}

export function sendRateLimited(res: HeaderResponse & { status(code: number): { json(body: unknown): unknown } }, retryAfterSeconds: number) {
  res.setHeader('Retry-After', String(retryAfterSeconds))
  return res.status(429).json({ error: 'Too many requests. Please try again shortly.' })
}

export function cronAuthorized(req: VercelRequest): boolean {
  const secret = env('CRON_SECRET')
  const supplied = getBearerToken(req)
  if (!secret || !supplied) return false

  const expected = Buffer.from(secret)
  const actual = Buffer.from(supplied)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export function createAuthedSupabase(token: string) {
  return createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}

export function createServiceSupabase() {
  return createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export function toJsonBody(req: VercelRequest): any {
  if (!req.body) return {}
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body)
    } catch {
      return {}
    }
  }
  return req.body
}

export function maskUrl(url: string): string {
  try {
    const u = new URL(url)
    const host = u.hostname
    return `${u.protocol}//${host}/...`
  } catch {
    return 'invalid-url'
  }
}
