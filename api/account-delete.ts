import type { VercelRequest, VercelResponse } from '@vercel/node'
import { checkRateLimit, createAuthedSupabase, createServiceSupabase, getBearerToken, sendRateLimited, setApiSecurityHeaders } from '../src/server/auth-utils.js'

const ACCOUNT_DELETE_TABLES = [
  'csv_import_rows',
  'csv_imports',
  'requirement_activities',
  'requirement_instances',
  'requirement_definitions',
  'expenses',
  'calendar_events',
  'games',
  'calendar_sync_jobs',
  'calendar_feed_sync_runs',
  'calendar_feeds',
  'user_settings',
  'app_events',
  'user_profiles',
] as const

const OPTIONAL_TABLES = new Set<string>(['calendar_sync_jobs', 'calendar_feed_sync_runs', 'app_events', 'user_profiles'])

function isMissingOptionalTableError(error: any, table: string) {
  const code = String(error?.code ?? '')
  const message = String(error?.message ?? error ?? '')
  if (code === '42P01' || code === 'PGRST205') return true
  if (message.includes('Could not find the table')) return true
  if (message.includes(table) && (message.includes('does not exist') || message.includes('schema cache'))) return true
  return false
}

async function deleteAccountRows(serviceClient: any, userId: string) {
  for (const table of ACCOUNT_DELETE_TABLES) {
    const { error } = await serviceClient.from(table).delete().eq('user_id', userId)
    if (error && OPTIONAL_TABLES.has(table) && isMissingOptionalTableError(error, table)) continue
    if (error) throw new Error(`${table}: ${error.message}`)
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setApiSecurityHeaders(res)

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const rate = checkRateLimit(req, 'account-delete', { limit: 5, windowMs: 60 * 60 * 1000 })
    if (!rate.allowed) return sendRateLimited(res, rate.retryAfterSeconds)

    const token = getBearerToken(req)
    if (!token) return res.status(401).json({ error: 'Missing bearer token' })

    const authedClient = createAuthedSupabase(token)
    const { data: authData, error: authError } = await authedClient.auth.getUser()
    if (authError || !authData?.user) return res.status(401).json({ error: 'Invalid auth token' })

    const serviceClient = createServiceSupabase()
    const userId = authData.user.id

    try {
      await deleteAccountRows(serviceClient, userId)
    } catch (e: any) {
      console.error('Account row deletion failed', { userId, error: String(e?.message ?? e) })
      return res.status(500).json({ error: 'Could not delete account data' })
    }

    const { error } = await serviceClient.auth.admin.deleteUser(userId, false)
    if (error) {
      console.error('Supabase Auth user deletion failed', { userId, error: error.message })
      return res.status(500).json({
        error: 'App data was deleted, but the sign-in account could not be deleted automatically. Ask an admin to remove the Supabase Auth user.',
      })
    }

    return res.status(200).json({ ok: true })
  } catch (e: any) {
    console.error('Account deletion failed', { error: String(e?.message ?? e) })
    return res.status(500).json({ error: 'Could not delete account' })
  }
}
