import type { VercelRequest, VercelResponse } from '@vercel/node'
import { checkRateLimit, createAuthedSupabase, getBearerToken, setApiSecurityHeaders } from '../../src/server/auth-utils.js'
import { buildIcsCalendar, loadCalendarExportDataForUser } from '../../src/server/calendar-export-utils.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setApiSecurityHeaders(res, 'private, no-store')

  try {
    if (req.method !== 'GET') return res.status(405).send('Method not allowed')
    const rate = checkRateLimit(req, 'calendar-download-authenticated', { limit: 60, windowMs: 60 * 1000 })
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfterSeconds))
      return res.status(429).send('Too many requests. Please try again shortly.')
    }

    const token = getBearerToken(req)
    if (!token) return res.status(401).send('Missing bearer token')

    const client = createAuthedSupabase(token)
    const { data: authData, error: authError } = await client.auth.getUser()
    if (authError || !authData?.user) return res.status(401).send('Invalid auth token')

    const exportData = await loadCalendarExportDataForUser(client, authData.user.id)
    const ics = buildIcsCalendar({ userId: authData.user.id, ...exportData })

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="whistle-keeper-calendar.ics"')
    return res.status(200).send(ics)
  } catch (e: any) {
    return res.status(500).send(String(e?.message || e || 'Unknown error'))
  }
}
