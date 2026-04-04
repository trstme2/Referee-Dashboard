import { randomBytes } from 'node:crypto'

const APP_TIMEZONE = 'America/New_York'
const DEFAULT_GAME_START = '17:00'
const DEFAULT_GAME_DURATION_HOURS = 2
const DEFAULT_HOME_ADDRESS = '399 S. Columbia Ave, Bexley, OH 43209'

type GameRow = {
  id: string
  sport: string
  competition_level: string
  league: string | null
  level_detail: string | null
  game_date: string
  start_time: string | null
  location_address: string
  roundtrip_miles: number | null
  role: string | null
  game_fee: number | null
  notes: string | null
  home_team: string | null
  away_team: string | null
  updated_at: string
  created_at: string
  status: string
}

type CalendarEventRow = {
  id: string
  event_type: string
  title: string
  start_ts: string
  end_ts: string
  all_day: boolean
  timezone: string | null
  location_address: string | null
  notes: string | null
  updated_at: string
  created_at: string
  status: string
  linked_game_id: string | null
}

type ExportEvent = {
  uid: string
  summary: string
  description: string
  location?: string
  dtstamp: string
  startUtc?: string
  endUtc?: string
  allDayStart?: string
  allDayEndExclusive?: string
}

function toDateOnly(value: string): string {
  return String(value).slice(0, 10)
}

function parseDateOnly(value: string): Date {
  return new Date(`${toDateOnly(value)}T00:00:00.000Z`)
}

function addDays(dateOnly: string, days: number): string {
  const d = parseDateOnly(dateOnly)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function timePart(value: string | null | undefined): string {
  const raw = String(value || '').slice(0, 5)
  return /^\d{2}:\d{2}$/.test(raw) ? raw : DEFAULT_GAME_START
}

function gameStartIso(gameDate: string, startTime: string | null | undefined): string {
  return new Date(`${toDateOnly(gameDate)}T${timePart(startTime)}:00`).toISOString()
}

function gameEndIso(gameDate: string, startTime: string | null | undefined): string {
  const start = new Date(gameStartIso(gameDate, startTime))
  start.setHours(start.getHours() + DEFAULT_GAME_DURATION_HOURS)
  return start.toISOString()
}

function toUtcStamp(value: string): string {
  const d = new Date(value)
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mi = String(d.getUTCMinutes()).padStart(2, '0')
  const ss = String(d.getUTCSeconds()).padStart(2, '0')
  return `${yyyy}${mm}${dd}T${hh}${mi}${ss}Z`
}

function toDateStamp(value: string): string {
  const dateOnly = toDateOnly(value)
  return dateOnly.replace(/-/g, '')
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
}

function foldLine(line: string): string {
  if (line.length <= 75) return line
  const chunks: string[] = []
  let rest = line
  while (rest.length > 75) {
    chunks.push(rest.slice(0, 75))
    rest = rest.slice(75)
  }
  chunks.push(rest)
  return chunks.join('\r\n ')
}

function formatMoney(value: number | null): string | null {
  if (value == null || !Number.isFinite(Number(value))) return null
  return `$${Number(value).toFixed(2)}`
}

function compactParts(parts: Array<string | null | undefined>): string {
  return parts.map(x => String(x || '').trim()).filter(Boolean).join(' | ')
}

function buildGameSummary(game: GameRow): string {
  const matchup = game.home_team && game.away_team
    ? `${game.home_team} vs ${game.away_team}`
    : game.league || `${game.sport} Game`
  return compactParts([game.sport, matchup])
}

function buildGameDescription(game: GameRow): string {
  const lines = [
    game.league ? `League: ${game.league}` : null,
    game.role ? `Role: ${game.role}` : null,
    game.competition_level ? `Competition: ${game.competition_level}` : null,
    game.level_detail ? `Level detail: ${game.level_detail}` : null,
    game.game_fee != null ? `Fee: ${formatMoney(game.game_fee)}` : null,
    game.roundtrip_miles != null ? `Roundtrip miles: ${Number(game.roundtrip_miles).toFixed(1)}` : null,
    game.notes ? `Notes: ${game.notes}` : null,
  ].filter(Boolean)
  return lines.join('\n')
}

function buildCalendarDescription(event: CalendarEventRow): string {
  return event.notes?.trim() || ''
}

function toGameExportEvent(game: GameRow, userId: string): ExportEvent {
  return {
    uid: `game-${game.id}@${userId}.referee-dashboard`,
    summary: buildGameSummary(game),
    description: buildGameDescription(game),
    location: game.location_address || undefined,
    dtstamp: toUtcStamp(game.updated_at || game.created_at || new Date().toISOString()),
    startUtc: toUtcStamp(gameStartIso(game.game_date, game.start_time)),
    endUtc: toUtcStamp(gameEndIso(game.game_date, game.start_time)),
  }
}

function toCalendarExportEvent(event: CalendarEventRow, userId: string): ExportEvent {
  const startDateOnly = toDateOnly(event.start_ts)
  const endDateOnly = toDateOnly(event.end_ts)
  return {
    uid: `event-${event.id}@${userId}.referee-dashboard`,
    summary: event.title || event.event_type || 'Calendar Event',
    description: buildCalendarDescription(event),
    location: event.location_address || undefined,
    dtstamp: toUtcStamp(event.updated_at || event.created_at || new Date().toISOString()),
    startUtc: event.all_day ? undefined : toUtcStamp(event.start_ts),
    endUtc: event.all_day ? undefined : toUtcStamp(event.end_ts),
    allDayStart: event.all_day ? toDateStamp(startDateOnly) : undefined,
    allDayEndExclusive: event.all_day ? toDateStamp(addDays(endDateOnly, 1)) : undefined,
  }
}

function serializeEvent(event: ExportEvent): string[] {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${escapeIcsText(event.uid)}`,
    `DTSTAMP:${event.dtstamp}`,
    event.allDayStart ? `DTSTART;VALUE=DATE:${event.allDayStart}` : `DTSTART:${event.startUtc}`,
    event.allDayEndExclusive ? `DTEND;VALUE=DATE:${event.allDayEndExclusive}` : `DTEND:${event.endUtc}`,
    `SUMMARY:${escapeIcsText(event.summary)}`,
    `DESCRIPTION:${escapeIcsText(event.description || '')}`,
    event.location ? `LOCATION:${escapeIcsText(event.location)}` : null,
    'END:VEVENT',
  ].filter(Boolean) as string[]
  return lines.map(foldLine)
}

export function buildIcsCalendar(params: { userId: string; games: GameRow[]; calendarEvents: CalendarEventRow[] }) {
  const events = [
    ...params.games.filter(g => g.status !== 'Canceled').map(g => toGameExportEvent(g, params.userId)),
    ...params.calendarEvents
      .filter(e => e.status !== 'Canceled' && !e.linked_game_id)
      .map(e => toCalendarExportEvent(e, params.userId)),
  ].sort((a, b) => {
    const aKey = a.allDayStart ?? a.startUtc ?? ''
    const bKey = b.allDayStart ?? b.startUtc ?? ''
    return aKey.localeCompare(bKey)
  })

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Referee Dashboard//Calendar Export//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText('Referee Dashboard')}`,
    `X-WR-TIMEZONE:${APP_TIMEZONE}`,
    ...events.flatMap(serializeEvent),
    'END:VCALENDAR',
  ]

  return `${lines.join('\r\n')}\r\n`
}

export async function ensureCalendarExportToken(client: any, userId: string) {
  const { data: existing, error: readError } = await client
    .from('user_settings')
    .select('user_id, home_address, other_work_address, assigning_platforms, leagues, calendar_export_token')
    .eq('user_id', userId)
    .maybeSingle()
  if (readError) throw new Error(`user_settings: ${readError.message}`)

  if (existing?.calendar_export_token) return String(existing.calendar_export_token)

  const token = randomBytes(32).toString('hex')
  if (existing?.user_id) {
    const { error: updateError } = await client
      .from('user_settings')
      .update({ calendar_export_token: token, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
    if (updateError) throw new Error(`user_settings: ${updateError.message}`)
  } else {
    const payload = {
      user_id: userId,
      home_address: DEFAULT_HOME_ADDRESS,
      assigning_platforms: [],
      leagues: [],
      calendar_export_token: token,
      updated_at: new Date().toISOString(),
    }
    const { error: upsertError } = await client
      .from('user_settings')
      .upsert([payload], { onConflict: 'user_id' })
    if (upsertError) throw new Error(`user_settings: ${upsertError.message}`)
  }
  return token
}

export async function regenerateCalendarExportToken(client: any, userId: string) {
  const token = randomBytes(32).toString('hex')
  const { data: existing, error: readError } = await client
    .from('user_settings')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (readError) throw new Error(`user_settings: ${readError.message}`)

  if (existing?.user_id) {
    const { error } = await client
      .from('user_settings')
      .update({ calendar_export_token: token, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
    if (error) throw new Error(`user_settings: ${error.message}`)
  } else {
    const { error } = await client
      .from('user_settings')
      .insert([{
        user_id: userId,
        home_address: DEFAULT_HOME_ADDRESS,
        assigning_platforms: [],
        leagues: [],
        calendar_export_token: token,
        updated_at: new Date().toISOString(),
      }])
    if (error) throw new Error(`user_settings: ${error.message}`)
  }
  return token
}

export async function loadCalendarExportDataForUser(client: any, userId: string) {
  const [{ data: games, error: gamesError }, { data: events, error: eventsError }] = await Promise.all([
    client
      .from('games')
      .select('id,sport,competition_level,league,level_detail,game_date,start_time,location_address,roundtrip_miles,role,game_fee,notes,home_team,away_team,updated_at,created_at,status')
      .eq('user_id', userId)
      .order('game_date', { ascending: true })
      .order('start_time', { ascending: true }),
    client
      .from('calendar_events')
      .select('id,event_type,title,start_ts,end_ts,all_day,timezone,location_address,notes,updated_at,created_at,status,linked_game_id')
      .eq('user_id', userId)
      .order('start_ts', { ascending: true }),
  ])

  if (gamesError) throw new Error(`games: ${gamesError.message}`)
  if (eventsError) throw new Error(`calendar_events: ${eventsError.message}`)

  return {
    games: (games ?? []) as GameRow[],
    calendarEvents: (events ?? []) as CalendarEventRow[],
  }
}
