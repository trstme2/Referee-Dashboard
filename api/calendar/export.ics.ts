import type { VercelRequest, VercelResponse } from '@vercel/node'
import { checkRateLimit, createServiceSupabase, setApiSecurityHeaders } from '../auth-utils.js'
import { buildIcsCalendar, isCalendarExportToken, loadCalendarExportDataForUser } from '../calendar-export-utils.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setApiSecurityHeaders(res, 'private, no-store')

  try {
    if (req.method !== 'GET') return res.status(405).send('Method not allowed')

    const token = String(req.query.token || '').trim()
    if (!token) return res.status(401).send('Missing calendar export token')
    if (!isCalendarExportToken(token)) return res.status(404).send('Calendar feed not found')

    const rate = checkRateLimit(req, 'calendar-export-public', { limit: 120, windowMs: 5 * 60 * 1000 })
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfterSeconds))
      return res.status(429).send('Too many requests. Please try again shortly.')
    }

    const client = createServiceSupabase()
    const { data: settings, error: settingsError } = await client
      .from('user_settings')
      .select('user_id')
      .eq('calendar_export_token', token)
      .maybeSingle()
    if (settingsError) return res.status(503).send('Calendar feed is temporarily unavailable')
    if (!settings?.user_id) return res.status(404).send('Calendar feed not found')

    const exportData = await loadCalendarExportDataForUser(client, String(settings.user_id))
    const ics = buildIcsCalendar({ userId: String(settings.user_id), ...exportData })

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
    res.setHeader('Content-Disposition', 'inline; filename="whistle-keeper-calendar.ics"')
    return res.status(200).send(ics)
  } catch {
    return res.status(500).send('Calendar feed is temporarily unavailable')
  }
}
