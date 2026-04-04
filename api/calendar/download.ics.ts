import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createAuthedSupabase, getBearerToken } from '../auth-utils.js'
import { buildIcsCalendar, loadCalendarExportDataForUser } from '../calendar-export-utils.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'GET') return res.status(405).send('Method not allowed')

    const token = getBearerToken(req)
    if (!token) return res.status(401).send('Missing bearer token')

    const client = createAuthedSupabase(token)
    const { data: authData, error: authError } = await client.auth.getUser()
    if (authError || !authData?.user) return res.status(401).send('Invalid auth token')

    const exportData = await loadCalendarExportDataForUser(client, authData.user.id)
    const ics = buildIcsCalendar({ userId: authData.user.id, ...exportData })

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="referee-dashboard-calendar.ics"')
    res.setHeader('Cache-Control', 'private, no-store')
    return res.status(200).send(ics)
  } catch (e: any) {
    return res.status(500).send(String(e?.message || e || 'Unknown error'))
  }
}
