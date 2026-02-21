import type { VercelRequest } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

function env(name: string): string | undefined {
  return process.env[name]
}

function getSupabaseUrl(): string {
  const url = env('SUPABASE_URL') || env('VITE_SUPABASE_URL')
  if (!url) throw new Error('Missing SUPABASE_URL (or VITE_SUPABASE_URL)')
  return url
}

function getSupabaseAnonKey(): string {
  const key = env('SUPABASE_ANON_KEY') || env('VITE_SUPABASE_ANON_KEY') || env('VITE_SUPABASE_PUBLISHABLE_KEY')
  if (!key) throw new Error('Missing SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY / VITE_SUPABASE_PUBLISHABLE_KEY)')
  return key
}

export function getBearerToken(req: VercelRequest): string | null {
  const h = String(req.headers.authorization || '')
  if (!h.toLowerCase().startsWith('bearer ')) return null
  return h.slice(7).trim() || null
}

export function createAuthedSupabase(token: string) {
  return createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
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
