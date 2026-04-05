import { randomBytes } from 'node:crypto'

const FALLBACK_TIMEZONE = 'America/New_York'
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
  timezone: string | null
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
  timezone?: string
  startLocal?: string
  endLocal?: string
  allDayStart?: string
  allDayEndExclusive?: string
}

type TimeZoneTransition = {
  stamp: string
  offsetFrom: string
  offsetTo: string
  name: string
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

function localDateTimeStamp(dateOnly: string, time: string): string {
  return `${toDateStamp(dateOnly)}T${time.replace(':', '')}00`
}

function gameStartLocal(gameDate: string, startTime: string | null | undefined): string {
  return localDateTimeStamp(toDateOnly(gameDate), timePart(startTime))
}

function gameEndLocal(gameDate: string, startTime: string | null | undefined): string {
  const [hourString, minuteString] = timePart(startTime).split(':')
  const totalMinutes = Number(hourString) * 60 + Number(minuteString) + DEFAULT_GAME_DURATION_HOURS * 60
  const endDate = addDays(toDateOnly(gameDate), Math.floor(totalMinutes / (24 * 60)))
  const endMinutes = totalMinutes % (24 * 60)
  const endHour = String(Math.floor(endMinutes / 60)).padStart(2, '0')
  const endMinute = String(endMinutes % 60).padStart(2, '0')
  return localDateTimeStamp(endDate, `${endHour}:${endMinute}`)
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

function localStampFromIso(value: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(value))
  const get = (type: string) => String(parts.find((p) => p.type === type)?.value || '')
  return `${get('year')}${get('month')}${get('day')}T${get('hour')}${get('minute')}${get('second')}`
}

function resolveTimezone(value: string | null | undefined, defaultTimezone: string): string {
  return String(value || defaultTimezone || FALLBACK_TIMEZONE)
}

function offsetString(timeZone: string, date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const raw = String(parts.find(p => p.type === 'timeZoneName')?.value || 'GMT+0')
  const match = raw.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/i)
  if (!match) return '+0000'
  const sign = match[1] === '-' ? '-' : '+'
  const hours = String(Number(match[2])).padStart(2, '0')
  const minutes = String(Number(match[3] || '0')).padStart(2, '0')
  return `${sign}${hours}${minutes}`
}

function timeZoneAbbreviation(timeZone: string, date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  return String(parts.find(p => p.type === 'timeZoneName')?.value || timeZone)
}

function localYmdHm(timeZone: string, date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0)
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  }
}

function transitionStamp(timeZone: string, date: Date): string {
  const local = localYmdHm(timeZone, date)
  return `${String(local.year).padStart(4, '0')}${String(local.month).padStart(2, '0')}${String(local.day).padStart(2, '0')}T${String(local.hour).padStart(2, '0')}${String(local.minute).padStart(2, '0')}00`
}

function sameLocalMinute(a: Date, b: Date, timeZone: string): boolean {
  const aa = localYmdHm(timeZone, a)
  const bb = localYmdHm(timeZone, b)
  return aa.year === bb.year && aa.month === bb.month && aa.day === bb.day && aa.hour === bb.hour && aa.minute === bb.minute
}

function findTransition(timeZone: string, start: Date, end: Date, offsetFrom: string, offsetTo: string): Date {
  let lo = start
  let hi = end
  while (hi.getTime() - lo.getTime() > 60_000) {
    const mid = new Date(Math.floor((lo.getTime() + hi.getTime()) / 2))
    const midOffset = offsetString(timeZone, mid)
    if (midOffset === offsetFrom) lo = mid
    else hi = mid
  }
  let probe = new Date(lo.getTime())
  while (probe <= end && offsetString(timeZone, probe) === offsetFrom) {
    probe = new Date(probe.getTime() + 60_000)
  }
  return probe <= end ? probe : hi
}

function collectTransitions(timeZone: string, years: number[]): TimeZoneTransition[] {
  const transitions: TimeZoneTransition[] = []
  for (const year of years) {
    let cursor = new Date(Date.UTC(year, 0, 1, 0, 0, 0))
    const limit = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0))
    let prevOffset = offsetString(timeZone, cursor)
    while (cursor < limit) {
      const next = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
      const nextOffset = offsetString(timeZone, next)
      if (nextOffset !== prevOffset) {
        const transition = findTransition(timeZone, cursor, next, prevOffset, nextOffset)
        const previousMinute = new Date(transition.getTime() - 60_000)
        const transitionLocal = transitionStamp(timeZone, transition)
        const previousLocal = transitionStamp(timeZone, previousMinute)
        transitions.push({
          stamp: sameLocalMinute(transition, previousMinute, timeZone) ? previousLocal : transitionLocal,
          offsetFrom: prevOffset,
          offsetTo: nextOffset,
          name: timeZoneAbbreviation(timeZone, transition),
        })
        prevOffset = nextOffset
      }
      cursor = next
    }
  }
  return transitions
}

function vtimezoneBlock(timeZone: string): string[] {
  const currentYear = new Date().getUTCFullYear()
  const transitions = collectTransitions(timeZone, [currentYear - 1, currentYear, currentYear + 1, currentYear + 2])
  if (!transitions.length) {
    const now = new Date()
    const offset = offsetString(timeZone, now)
    const name = timeZoneAbbreviation(timeZone, now)
    return [
      'BEGIN:VTIMEZONE',
      `TZID:${escapeIcsText(timeZone)}`,
      'BEGIN:STANDARD',
      `DTSTART:${transitionStamp(timeZone, now)}`,
      `TZOFFSETFROM:${offset}`,
      `TZOFFSETTO:${offset}`,
      `TZNAME:${escapeIcsText(name)}`,
      'END:STANDARD',
      'END:VTIMEZONE',
    ].map(foldLine)
  }

  const sections = transitions.map((transition, index) => {
    const kind = Number(transition.offsetTo) > Number(transition.offsetFrom) ? 'DAYLIGHT' : 'STANDARD'
    return [
      `BEGIN:${kind}`,
      `DTSTART:${transition.stamp}`,
      `TZOFFSETFROM:${transition.offsetFrom}`,
      `TZOFFSETTO:${transition.offsetTo}`,
      `TZNAME:${escapeIcsText(transition.name)}`,
      `COMMENT:Generated transition ${index + 1}`,
      `END:${kind}`,
    ].map(foldLine)
  })

  return [
    foldLine('BEGIN:VTIMEZONE'),
    foldLine(`TZID:${escapeIcsText(timeZone)}`),
    ...sections.flat(),
    foldLine('END:VTIMEZONE'),
  ]
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

function toGameExportEvent(game: GameRow, userId: string, defaultTimezone: string): ExportEvent {
  const timezone = resolveTimezone(game.timezone, defaultTimezone)
  return {
    uid: `game-${game.id}@${userId}.referee-dashboard`,
    summary: buildGameSummary(game),
    description: buildGameDescription(game),
    location: game.location_address || undefined,
    dtstamp: toUtcStamp(game.updated_at || game.created_at || new Date().toISOString()),
    timezone,
    startLocal: gameStartLocal(game.game_date, game.start_time),
    endLocal: gameEndLocal(game.game_date, game.start_time),
  }
}

function toCalendarExportEvent(event: CalendarEventRow, userId: string, defaultTimezone: string): ExportEvent {
  const startDateOnly = toDateOnly(event.start_ts)
  const endDateOnly = toDateOnly(event.end_ts)
  const timezone = resolveTimezone(event.timezone, defaultTimezone)
  return {
    uid: `event-${event.id}@${userId}.referee-dashboard`,
    summary: event.title || event.event_type || 'Calendar Event',
    description: buildCalendarDescription(event),
    location: event.location_address || undefined,
    dtstamp: toUtcStamp(event.updated_at || event.created_at || new Date().toISOString()),
    timezone: event.all_day ? undefined : timezone,
    startLocal: event.all_day ? undefined : localStampFromIso(event.start_ts, timezone),
    endLocal: event.all_day ? undefined : localStampFromIso(event.end_ts, timezone),
    allDayStart: event.all_day ? toDateStamp(startDateOnly) : undefined,
    allDayEndExclusive: event.all_day ? toDateStamp(addDays(endDateOnly, 1)) : undefined,
  }
}

function serializeEvent(event: ExportEvent): string[] {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${escapeIcsText(event.uid)}`,
    `DTSTAMP:${event.dtstamp}`,
    event.allDayStart ? `DTSTART;VALUE=DATE:${event.allDayStart}` : `DTSTART;TZID=${escapeIcsText(event.timezone || FALLBACK_TIMEZONE)}:${event.startLocal}`,
    event.allDayEndExclusive ? `DTEND;VALUE=DATE:${event.allDayEndExclusive}` : `DTEND;TZID=${escapeIcsText(event.timezone || FALLBACK_TIMEZONE)}:${event.endLocal}`,
    `SUMMARY:${escapeIcsText(event.summary)}`,
    `DESCRIPTION:${escapeIcsText(event.description || '')}`,
    event.location ? `LOCATION:${escapeIcsText(event.location)}` : null,
    'END:VEVENT',
  ].filter(Boolean) as string[]
  return lines.map(foldLine)
}

export function buildIcsCalendar(params: { userId: string; defaultTimezone?: string | null; games: GameRow[]; calendarEvents: CalendarEventRow[] }) {
  const defaultTimezone = resolveTimezone(params.defaultTimezone, FALLBACK_TIMEZONE)
  const events = [
    ...params.games.filter(g => g.status !== 'Canceled').map(g => toGameExportEvent(g, params.userId, defaultTimezone)),
    ...params.calendarEvents
      .filter(e => e.status !== 'Canceled' && !e.linked_game_id)
      .map(e => toCalendarExportEvent(e, params.userId, defaultTimezone)),
  ].sort((a, b) => {
    const aKey = a.allDayStart ?? a.startLocal ?? ''
    const bKey = b.allDayStart ?? b.startLocal ?? ''
    return aKey.localeCompare(bKey)
  })
  const timeZones = Array.from(new Set(events.map(event => event.timezone).filter(Boolean) as string[])).sort()

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Referee Dashboard//Calendar Export//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText('Referee Dashboard')}`,
    `X-WR-TIMEZONE:${escapeIcsText(defaultTimezone)}`,
    ...timeZones.flatMap(vtimezoneBlock),
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
      default_timezone: FALLBACK_TIMEZONE,
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
        default_timezone: FALLBACK_TIMEZONE,
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
  const [{ data: games, error: gamesError }, { data: events, error: eventsError }, { data: settings, error: settingsError }] = await Promise.all([
    client
      .from('games')
      .select('id,sport,competition_level,league,level_detail,game_date,start_time,timezone,location_address,roundtrip_miles,role,game_fee,notes,home_team,away_team,updated_at,created_at,status')
      .eq('user_id', userId)
      .order('game_date', { ascending: true })
      .order('start_time', { ascending: true }),
    client
      .from('calendar_events')
      .select('id,event_type,title,start_ts,end_ts,all_day,timezone,location_address,notes,updated_at,created_at,status,linked_game_id')
      .eq('user_id', userId)
      .order('start_ts', { ascending: true }),
    client
      .from('user_settings')
      .select('default_timezone')
      .eq('user_id', userId)
      .maybeSingle(),
  ])

  if (gamesError) throw new Error(`games: ${gamesError.message}`)
  if (eventsError) throw new Error(`calendar_events: ${eventsError.message}`)
  if (settingsError) throw new Error(`user_settings: ${settingsError.message}`)

  return {
    defaultTimezone: settings?.default_timezone ?? FALLBACK_TIMEZONE,
    games: (games ?? []) as GameRow[],
    calendarEvents: (events ?? []) as CalendarEventRow[],
  }
}
