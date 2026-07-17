import type { VercelRequest, VercelResponse } from '@vercel/node'
import { deleteAccountData } from '../src/server/account-lifecycle.js'
import { checkDurableRateLimit, checkRateLimit, createAuthedSupabase, createServiceSupabase, getBearerToken, sendRateLimited, setApiSecurityHeaders, toJsonBody } from '../src/server/auth-utils.js'

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
    const userId = authData.user.id
    const action = toJsonBody(req)?.action === 'reset' ? 'reset' : 'delete'
    const rateBucket = action === 'reset' ? 'account-reset' : 'account-delete'
    const durableRate = await checkDurableRateLimit(req, rateBucket, { limit: 3, windowMs: 60 * 60 * 1000 }, userId)
    if (!durableRate.allowed) return sendRateLimited(res, durableRate.retryAfterSeconds)
    const serviceClient = createServiceSupabase()

    try {
      const result = await deleteAccountData(serviceClient, userId, { includeProfile: action === 'delete' })
      if (action === 'reset') return res.status(200).json({ ok: true, deletedFiles: result.deletedFiles })
    } catch (e: any) {
      console.error('Account row deletion failed', { userId, error: String(e?.message ?? e) })
      return res.status(500).json({ error: 'Could not delete account data' })
    }

    const { error: signOutError } = await authedClient.auth.signOut({ scope: 'global' })
    if (signOutError) console.warn('Could not revoke account sessions before deletion', { userId, error: signOutError.message })

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
