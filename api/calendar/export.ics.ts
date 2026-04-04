import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createServiceSupabase } from '../auth-utils.js'
import { buildIcsCalendar, loadCalendarExportDataForUser } from '../calendar-export-utils.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'GET') return res.status(405).send('Method not allowed')

    const token = String(req.query.token || '').trim()
    if (!token) return res.status(401).send('Missing calendar export token')

    const client = createServiceSupabase()
    const { data: settings, error: settingsError } = await client
      .from('user_settings')
      .select('user_id, calendar_export_token')
      .eq('calendar_export_token', token)
      .maybeSingle()
    if (settingsError) return res.status(400).send(settingsError.message)
    if (!settings?.user_id) return res.status(404).send('Calendar feed not found')

    const exportData = await loadCalendarExportDataForUser(client, String(settings.user_id))
    const ics = buildIcsCalendar({ userId: String(settings.user_id), ...exportData })

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
    res.setHeader('Cache-Control', 'private, max-age=300')
    return res.status(200).send(ics)
  } catch (e: any) {
    return res.status(500).send(String(e?.message || e || 'Unknown error'))
  }
}
