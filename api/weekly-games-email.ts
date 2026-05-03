import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createServiceSupabase } from './auth-utils.js'

type GameRow = {
  id: string
  sport: string
  competition_level: string
  game_date: string
  start_time: string | null
  timezone: string | null
  location_address: string
  home_team: string | null
  away_team: string | null
  status: string
}

type UserSummary = {
  userId: string
  email: string
  sent: boolean
  games: number
  error?: string
}

type EnabledSetting = {
  user_id: string
  default_timezone: string | null
}

const DEFAULT_TIMEZONE = 'America/New_York'
const RESEND_URL = 'https://api.resend.com/emails'

function addDays(d: Date, days: number): Date {
  const next = new Date(d)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function partsInZone(d: Date, timeZone: string): { y: number; m: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0)
  return { y: get('year'), m: get('month'), day: get('day') }
}

function ymdInZone(d: Date, timeZone: string): string {
  const p = partsInZone(d, timeZone)
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

function formatDate(ymd: string, timeZone: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function formatTime(time: string | null): string {
  if (!time) return '-'
  const [hh, mm] = time.split(':')
  const h = Number(hh)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${mm} ${suffix}`
}

function matchup(g: GameRow): string {
  if (g.home_team && g.away_team) return `${g.home_team} vs ${g.away_team}`
  return `${g.sport} (${g.competition_level})`
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function gamesText(games: GameRow[], timeZone: string): string {
  if (!games.length) return 'No scheduled games in the next 7 days.'
  return games.map((g) => [
    `${formatDate(g.game_date, timeZone)} at ${formatTime(g.start_time)}`,
    matchup(g),
    g.location_address,
  ].join('\n')).join('\n\n')
}

function gamesHtml(games: GameRow[], timeZone: string, appUrl?: string): string {
  const rows = games.length
    ? games.map((g) => `
      <tr>
        <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">${escapeHtml(formatDate(g.game_date, timeZone))}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">${escapeHtml(formatTime(g.start_time))}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(matchup(g))}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(g.location_address)}</td>
      </tr>
    `).join('')
    : '<tr><td colspan="4" style="padding:14px 8px;color:#64748b;">No scheduled games in the next 7 days.</td></tr>'

  const dashboardLink = appUrl
    ? `<p style="margin:20px 0 0;"><a href="${escapeHtml(appUrl)}" style="color:#2563eb;">Open Referee Dashboard</a></p>`
    : ''

  return `<!doctype html>
<html>
  <body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
    <div style="max-width:720px;margin:0 auto;padding:28px 18px;">
      <h1 style="font-size:22px;line-height:1.25;margin:0 0 6px;">Games Next 7 Days</h1>
      <p style="margin:0 0 18px;color:#475569;">Your weekly Sunday referee schedule.</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ffffff;border-collapse:collapse;border:1px solid #e5e7eb;">
        <thead>
          <tr>
            <th align="left" style="padding:10px 8px;border-bottom:1px solid #cbd5e1;">Date</th>
            <th align="left" style="padding:10px 8px;border-bottom:1px solid #cbd5e1;">Time</th>
            <th align="left" style="padding:10px 8px;border-bottom:1px solid #cbd5e1;">Match</th>
            <th align="left" style="padding:10px 8px;border-bottom:1px solid #cbd5e1;">Location</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${dashboardLink}
    </div>
  </body>
</html>`
}

function authorize(req: VercelRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return String(req.headers.authorization || '') === `Bearer ${secret}`
}

function appUrl(): string | undefined {
  const raw = process.env.APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL
  if (!raw) return undefined
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
}

async function sendEmail(input: { to: string; subject: string; text: string; html: string; idempotencyKey: string }) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('Missing RESEND_API_KEY')

  const from = process.env.WEEKLY_EMAIL_FROM || 'Referee Dashboard <onboarding@resend.dev>'
  const replyTo = process.env.WEEKLY_EMAIL_REPLY_TO
  const body = {
    from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
    ...(replyTo ? { reply_to: replyTo } : {}),
  }

  const response = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': input.idempotencyKey,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Resend ${response.status}: ${text}`)
  }
}

async function loadUsers(client: any): Promise<Array<{ id: string; email: string }>> {
  const users: Array<{ id: string; email: string }> = []
  for (let page = 1; page < 100; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`auth.users: ${error.message}`)
    const batch = data?.users ?? []
    for (const user of batch) {
      if (user.email) users.push({ id: user.id, email: user.email })
    }
    if (batch.length < 1000) break
  }
  return users
}

async function loadEnabledSettings(client: any): Promise<EnabledSetting[]> {
  const { data, error } = await client
    .from('user_settings')
    .select('user_id,default_timezone')
    .eq('weekly_games_email_enabled', true)
  if (error) throw new Error(`user_settings: ${error.message}`)
  return (data ?? []) as EnabledSetting[]
}

async function loadGames(client: any, userId: string, startYmd: string, endYmd: string): Promise<GameRow[]> {
  const { data, error } = await client
    .from('games')
    .select('id,sport,competition_level,game_date,start_time,timezone,location_address,home_team,away_team,status')
    .eq('user_id', userId)
    .eq('status', 'Scheduled')
    .gte('game_date', startYmd)
    .lte('game_date', endYmd)
    .order('game_date', { ascending: true })
    .order('start_time', { ascending: true, nullsFirst: false })

  if (error) throw new Error(`games: ${error.message}`)
  return (data ?? []) as GameRow[]
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!authorize(req)) return res.status(401).json({ error: 'Unauthorized' })

  const client = createServiceSupabase()
  const dashboardUrl = appUrl()
  const summaries: UserSummary[] = []
  const enabledSettings = await loadEnabledSettings(client)
  const enabledByUser = new Map(enabledSettings.map((s) => [s.user_id, s]))
  const userEmails = new Map((await loadUsers(client)).map((u) => [u.id, u.email]))

  for (const setting of enabledSettings) {
    const user = { id: setting.user_id, email: userEmails.get(setting.user_id) }
    if (!user.email) {
      summaries.push({ userId: user.id, email: '', sent: false, games: 0, error: 'No email address found for user' })
      continue
    }
    try {
      const timeZone = String(enabledByUser.get(user.id)?.default_timezone || DEFAULT_TIMEZONE)
      const today = ymdInZone(new Date(), timeZone)
      const end = ymdInZone(addDays(new Date(), 7), timeZone)
      const games = await loadGames(client, user.id, today, end)
      const subject = games.length === 1
        ? '1 game in the next 7 days'
        : `${games.length} games in the next 7 days`

      await sendEmail({
        to: user.email,
        subject,
        text: `Games Next 7 Days\n\n${gamesText(games, timeZone)}`,
        html: gamesHtml(games, timeZone, dashboardUrl),
        idempotencyKey: `weekly-games-${user.id}-${today}`,
      })

      summaries.push({ userId: user.id, email: user.email, sent: true, games: games.length })
    } catch (e: any) {
      summaries.push({ userId: user.id, email: user.email, sent: false, games: 0, error: String(e?.message ?? e) })
    }
  }

  const sent = summaries.filter((s) => s.sent).length
  const failed = summaries.length - sent
  return res.status(failed ? 207 : 200).json({ sent, failed, users: summaries })
}
