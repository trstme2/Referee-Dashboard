import type { VercelRequest, VercelResponse } from '@vercel/node'
import ical from 'node-ical'
import { createAuthedSupabase, getBearerToken, toJsonBody } from './auth-utils.js'

type Feed = {
  id: string
  user_id: string
  platform: 'RefQuest' | 'DragonFly'
  name: string
  feed_url: string
  enabled: boolean
  sport: 'Soccer' | 'Lacrosse' | null
  default_league: string | null
}

const APP_TIMEZONE = 'America/New_York'

async function loadUserDefaultTimezone(client: any, userId: string): Promise<string> {
  const { data, error } = await client
    .from('user_settings')
    .select('default_timezone')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) return APP_TIMEZONE
  return String(data?.default_timezone || APP_TIMEZONE)
}

function datePartsInZone(d: Date, timeZone: string): { y: number; m: number; day: number; hh: number; mm: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0)
  return {
    y: get('year'),
    m: get('month'),
    day: get('day'),
    hh: get('hour'),
    mm: get('minute'),
  }
}

function ymdInZone(d: Date, timeZone: string): string {
  const p = datePartsInZone(d, timeZone)
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

function hhmmInZone(d: Date, timeZone: string): string {
  const p = datePartsInZone(d, timeZone)
  return `${String(p.hh).padStart(2, '0')}:${String(p.mm).padStart(2, '0')}`
}

function inferSport(feedSport: Feed['sport'], text: string): 'Soccer' | 'Lacrosse' {
  if (feedSport === 'Soccer' || feedSport === 'Lacrosse') return feedSport
  if (/\blacrosse\b|\blax\b/i.test(text)) return 'Lacrosse'
  return 'Soccer'
}

function inferCompetitionLevel(text: string): 'High School' | 'College' | 'Club' {
  if (/\bcollege\b|\bncaa\b|\bnaia\b|\bjuco\b/i.test(text)) return 'College'
  if (/\bvarsity\b|\bjv\b|junior varsity|\bms\b|middle school|\bhs\b|high school/i.test(text)) return 'High School'
  if (/\badult\b|\bu\d{1,2}\b|\bclub\b/i.test(text)) return 'Club'
  return 'High School'
}

function inferLevelDetail(text: string): string | null {
  const u = text.match(/\b(U\d{1,2})\b/i)
  if (u) return u[1].toUpperCase()
  if (/\bvarsity\b/i.test(text)) return 'Varsity'
  if (/\bjv\b|junior varsity/i.test(text)) return 'JV'
  if (/\bms\b|middle school/i.test(text)) return 'MS'
  return null
}

function inferRole(platform: Feed['platform'], sport: 'Soccer' | 'Lacrosse', text: string): string | null {
  if (platform === 'RefQuest' && sport === 'Lacrosse') {
    if (/head umpire/i.test(text)) return 'Lead'
    if (/umpire\s*(1|2)\b/i.test(text)) return 'Ref'
  }
  return null
}

function trimOrNull(x: unknown): string | null {
  const s = String(x || '').trim()
  return s || null
}

function eventDesc(x: any): string {
  const parts = [x.summary, x.description, x.location].filter(Boolean).map(String)
  return parts.join(' | ')
}

function normText(s: string | null | undefined): string {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function sameLocation(a: string | null | undefined, b: string | null | undefined): boolean {
  const aa = normText(a)
  const bb = normText(b)
  if (!aa || !bb) return false
  return aa.includes(bb) || bb.includes(aa)
}

async function syncFeed(client: any, feed: Feed) {
  const userDefaultTimezone = await loadUserDefaultTimezone(client, feed.user_id)
  const now = new Date().toISOString()
  let createdEvents = 0
  let updatedEvents = 0
  let createdGames = 0
  let updatedGames = 0
  const errors: string[] = []

  let raw = ''
  try {
    const resp = await fetch(feed.feed_url)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    raw = await resp.text()
  } catch (e: any) {
    return { createdEvents, updatedEvents, createdGames, updatedGames, errors: [`${feed.name}: fetch failed: ${String(e?.message || e)}`] }
  }

  let parsed: Record<string, any> = {}
  try {
    parsed = ical.parseICS(raw) as Record<string, any>
  } catch (e: any) {
    return { createdEvents, updatedEvents, createdGames, updatedGames, errors: [`${feed.name}: parse failed: ${String(e?.message || e)}`] }
  }

  const icsEvents = Object.values(parsed).filter((x: any) => x?.type === 'VEVENT' && x?.uid && x?.start)
  if (!icsEvents.length) {
    await client.from('calendar_feeds').update({ last_synced_at: now, updated_at: now }).eq('id', feed.id).eq('user_id', feed.user_id)
    return { createdEvents, updatedEvents, createdGames, updatedGames, errors }
  }

  const normalized = icsEvents.map((ev: any) => {
    const rawStart = new Date(ev.start)
    const rawEnd = ev.end ? new Date(ev.end) : new Date(rawStart.getTime() + 2 * 60 * 60 * 1000)
    const start = rawStart
    const end = rawEnd
    const text = eventDesc(ev)
    const sport = inferSport(feed.sport, text)
    const competitionLevel = inferCompetitionLevel(text)
    const levelDetail = inferLevelDetail(text)
    const role = inferRole(feed.platform, sport, text)
    const externalRef = `${feed.platform}:${feed.id}:${String(ev.uid)}`
    const allDay = Boolean((ev as any).datetype === 'date')

    return {
      uid: String(ev.uid),
      externalRef,
      title: String(ev.summary || 'Assigned Game'),
      location: trimOrNull(ev.location),
      notes: trimOrNull(ev.description),
      start,
      end,
      allDay,
      sport,
      competitionLevel,
      levelDetail,
      role,
      gameDate: ymdInZone(start, userDefaultTimezone),
      startTime: allDay ? null : hhmmInZone(start, userDefaultTimezone),
    }
  })

  const eventDates = Array.from(new Set(normalized.map((n) => n.gameDate)))
  const { data: dayGames, error: dayGamesErr } = await client
    .from('games')
    .select('*')
    .eq('user_id', feed.user_id)
    .in('game_date', eventDates)
  if (dayGamesErr) throw new Error(`games day lookup: ${dayGamesErr.message}`)
  const unusedGameIds = new Set((dayGames ?? []).map((g: any) => String(g.id)))
  const manualMatchByExternalRef = new Map<string, any>()

  for (const n of normalized) {
    const candidates = (dayGames ?? []).filter((g: any) => {
      if (!unusedGameIds.has(String(g.id))) return false
      if (String(g.game_date) !== n.gameDate) return false
      if (g.status === 'Canceled') return false
      const sameStart = (g.start_time ? String(g.start_time).slice(0, 5) : null) === n.startTime
      const startClose = sameStart || !g.start_time || !n.startTime
      return startClose && sameLocation(g.location_address, n.location)
    })
    if (candidates.length > 0) {
      const c = candidates[0]
      manualMatchByExternalRef.set(n.externalRef, c)
      unusedGameIds.delete(String(c.id))
    }
  }

  const refPrefix = `${feed.platform}:${feed.id}:`
  const { data: existingEvents, error: evLookupErr } = await client
    .from('calendar_events')
    .select('id,external_ref,linked_game_id,created_at,timezone')
    .eq('user_id', feed.user_id)
    .like('external_ref', `${refPrefix}%`)
  if (evLookupErr) throw new Error(`calendar_events lookup: ${evLookupErr.message}`)
  const existingByRef = new Map<string, any>((existingEvents ?? []).map((e: any) => [String(e.external_ref), e]))

  const calendarRows = normalized.map((n) => {
    const existing = existingByRef.get(n.externalRef)
    const manualMatch = manualMatchByExternalRef.get(n.externalRef)
    const reusedCalendarEventId = manualMatch?.calendar_event_id ? String(manualMatch.calendar_event_id) : null
    return {
      id: existing?.id ?? reusedCalendarEventId ?? crypto.randomUUID(),
      user_id: feed.user_id,
      event_type: 'Game',
      title: n.title,
      start_ts: n.start.toISOString(),
      end_ts: n.end.toISOString(),
      all_day: n.allDay,
      timezone: existing?.timezone ?? manualMatch?.timezone ?? userDefaultTimezone,
      location_address: n.location,
      notes: n.notes,
      source: 'Manual',
      external_ref: n.externalRef,
      status: 'Scheduled',
      linked_game_id: existing?.linked_game_id ?? null,
      platform_confirmations: {},
      created_at: existing?.created_at ?? now,
      updated_at: now,
    }
  })

  const { data: upsertedEvents, error: upsertEventsErr } = await client
    .from('calendar_events')
    .upsert(calendarRows, { onConflict: 'id' })
    .select('id,external_ref,linked_game_id')
  if (upsertEventsErr) throw new Error(`calendar_events upsert: ${upsertEventsErr.message}`)

  for (const row of calendarRows) {
    if (existingByRef.has(row.external_ref)) updatedEvents += 1
    else createdEvents += 1
  }

  const eventByRef = new Map<string, any>((upsertedEvents ?? []).map((e: any) => [String(e.external_ref), e]))
  const eventIds = Array.from(eventByRef.values()).map((e: any) => String(e.id))

  const { data: existingGames, error: gamesLookupErr } = await client
    .from('games')
    .select('*')
    .eq('user_id', feed.user_id)
    .in('calendar_event_id', eventIds)
  if (gamesLookupErr) throw new Error(`games lookup: ${gamesLookupErr.message}`)
  const gameByEventId = new Map<string, any>((existingGames ?? []).map((g: any) => [String(g.calendar_event_id), g]))

  const gameRows = normalized.map((n) => {
    const ev = eventByRef.get(n.externalRef)
    const matchedManual = manualMatchByExternalRef.get(n.externalRef)
    const existing = gameByEventId.get(String(ev.id)) ?? matchedManual
    const keepGameFee = existing?.game_fee ?? null
    const keepPaidConfirmed = existing?.paid_confirmed ?? false
    const keepRoundtripMiles = existing?.roundtrip_miles ?? null
    return {
      id: existing?.id ?? crypto.randomUUID(),
      user_id: feed.user_id,
      sport: n.sport,
      competition_level: n.competitionLevel,
      league: feed.default_league ?? existing?.league ?? null,
      level_detail: n.levelDetail ?? existing?.level_detail ?? null,
      game_date: n.gameDate,
      start_time: n.startTime ?? existing?.start_time ?? null,
      timezone: existing?.timezone ?? userDefaultTimezone,
      location_address: n.location ?? existing?.location_address ?? '',
      distance_miles: existing?.distance_miles ?? null,
      roundtrip_miles: keepRoundtripMiles,
      role: n.role ?? existing?.role ?? null,
      status: existing?.status ?? 'Scheduled',
      game_fee: keepGameFee,
      paid_confirmed: keepPaidConfirmed,
      paid_date: existing?.paid_date ?? null,
      pay_expected: existing?.pay_expected ?? null,
      home_team: existing?.home_team ?? null,
      away_team: existing?.away_team ?? null,
      notes: existing?.notes ?? n.notes ?? null,
      platform_confirmations: existing?.platform_confirmations ?? {},
      calendar_event_id: ev.id,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    }
  })

  const { data: upsertedGames, error: gamesUpsertErr } = await client
    .from('games')
    .upsert(gameRows, { onConflict: 'id' })
    .select('id,calendar_event_id')
  if (gamesUpsertErr) throw new Error(`games upsert: ${gamesUpsertErr.message}`)

  for (const row of gameRows) {
    if (gameByEventId.has(String(row.calendar_event_id))) updatedGames += 1
    else createdGames += 1
  }

  for (const g of upsertedGames ?? []) {
    const { error } = await client
      .from('calendar_events')
      .update({ linked_game_id: g.id, updated_at: now })
      .eq('user_id', feed.user_id)
      .eq('id', g.calendar_event_id)
    if (error) errors.push(`${feed.name}: link update failed for event ${g.calendar_event_id}: ${error.message}`)
  }

  const { error: stampErr } = await client
    .from('calendar_feeds')
    .update({ last_synced_at: now, updated_at: now })
    .eq('id', feed.id)
    .eq('user_id', feed.user_id)
  if (stampErr) errors.push(`${feed.name}: last_synced_at update failed: ${stampErr.message}`)

  return { createdEvents, updatedEvents, createdGames, updatedGames, errors }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const token = getBearerToken(req)
    if (!token) return res.status(401).json({ error: 'Missing bearer token' })
    const client = createAuthedSupabase(token)
    const { data: authData, error: authErr } = await client.auth.getUser()
    if (authErr || !authData?.user) return res.status(401).json({ error: 'Invalid auth token' })
    const userId = authData.user.id

    const body = toJsonBody(req)
    const feedId = String(body.feedId || '').trim() || null

    let query = client.from('calendar_feeds').select('*').eq('user_id', userId)
    if (feedId) query = query.eq('id', feedId)
    else query = query.eq('enabled', true)

    const { data: feeds, error: feedsErr } = await query
    if (feedsErr) return res.status(400).json({ error: feedsErr.message })
    if (!feeds?.length) {
      return res.status(200).json({
        createdEvents: 0,
        updatedEvents: 0,
        createdGames: 0,
        updatedGames: 0,
        errors: [],
      })
    }

    let createdEvents = 0
    let updatedEvents = 0
    let createdGames = 0
    let updatedGames = 0
    const errors: string[] = []

    for (const feed of feeds as Feed[]) {
      try {
        const result = await syncFeed(client, feed)
        createdEvents += result.createdEvents
        updatedEvents += result.updatedEvents
        createdGames += result.createdGames
        updatedGames += result.updatedGames
        errors.push(...result.errors)
      } catch (e: any) {
        errors.push(`${feed.name}: ${String(e?.message || e)}`)
      }
    }

    return res.status(200).json({ createdEvents, updatedEvents, createdGames, updatedGames, errors })
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message || e || 'Unknown error') })
  }
}
