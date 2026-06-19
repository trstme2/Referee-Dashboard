import type { VercelRequest, VercelResponse } from '@vercel/node'
import { checkRateLimit, createAuthedSupabase, createServiceSupabase, getBearerToken, sendRateLimited, setApiSecurityHeaders } from '../src/server/auth-utils.js'

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
    await serviceClient.from('calendar_sync_jobs').delete().eq('user_id', authData.user.id)
    await serviceClient.from('app_events').delete().eq('user_id', authData.user.id)
    await serviceClient.from('user_profiles').delete().eq('user_id', authData.user.id)
    const { error } = await serviceClient.auth.admin.deleteUser(authData.user.id)
    if (error) return res.status(500).json({ error: 'Could not delete account' })

    return res.status(200).json({ ok: true })
  } catch {
    return res.status(500).json({ error: 'Could not delete account' })
  }
}
