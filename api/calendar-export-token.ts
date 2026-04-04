import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createAuthedSupabase, getBearerToken, toJsonBody } from './auth-utils.js'
import { ensureCalendarExportToken, regenerateCalendarExportToken } from './calendar-export-utils.js'

function originFromReq(req: VercelRequest): string {
  const proto = String(req.headers['x-forwarded-proto'] || 'https')
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim()
  if (!host) throw new Error('Missing host header')
  return `${proto}://${host}`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const bearer = getBearerToken(req)
    if (!bearer) return res.status(401).json({ error: 'Missing bearer token' })
    const client = createAuthedSupabase(bearer)
    const { data: authData, error: authError } = await client.auth.getUser()
    if (authError || !authData?.user) return res.status(401).json({ error: 'Invalid auth token' })

    const userId = authData.user.id
    const origin = originFromReq(req)

    if (req.method === 'GET') {
      const token = await ensureCalendarExportToken(client, userId)
      return res.status(200).json({
        token,
        subscriptionUrl: `${origin}/api/calendar/export.ics?token=${encodeURIComponent(token)}`,
        downloadUrl: `${origin}/api/calendar/download.ics`,
      })
    }

    if (req.method === 'POST') {
      const body = toJsonBody(req)
      const action = String(body.action || '').trim()
      if (action !== 'regenerate') return res.status(400).json({ error: 'Unsupported action' })
      const token = await regenerateCalendarExportToken(client, userId)
      return res.status(200).json({
        token,
        subscriptionUrl: `${origin}/api/calendar/export.ics?token=${encodeURIComponent(token)}`,
        downloadUrl: `${origin}/api/calendar/download.ics`,
      })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message || e || 'Unknown error') })
  }
}
