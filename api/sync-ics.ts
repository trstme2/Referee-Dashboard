import type { VercelRequest, VercelResponse } from '@vercel/node'
import ical from 'node-ical'
import { createHash } from 'node:crypto'
import { checkRateLimit, createAuthedSupabase, getBearerToken, sendRateLimited, setApiSecurityHeaders, toJsonBody } from '../src/server/auth-utils.js'
import { fetchCalendarFeedText } from '../src/server/feed-fetch.js'
import { revealFeedUrl } from '../src/server/personal-data-security.js'
import { blockSlotKey, cleanupDragonFlyBlockTitle, dateKeysTouched, dedupeFeedBlocks } from '../src/server/sync-ics-utils.js'

export type Feed = {
  id: string
  user_id: string
  platform: string
  name: string
  feed_url: string
  enabled: boolean
  sport: string | null
  default_league: string | null
  import_start_date: string | null
}

type SyncDiagnostic = {
  feedName: string
  action: 'matched-existing' | 'matched-manual' | 'created-new' | 'ambiguous'
  summary: string
  score?: number
  competingScore?: number
  reason?: string
}

const APP_TIMEZONE = 'America/New_York'

function stableFeedKey(feed: Feed): string {
  const feedUrl = revealFeedUrl(feed.feed_url)
  return createHash('sha256')
    .update(`${feed.platform}:${feedUrl.trim().toLowerCase()}`)
    .digest('hex')
    .slice(0, 16)
}

function sourceRefs(feed: Feed, uid: string): { externalRef: string; legacyExternalRef: string } {
  return {
    externalRef: `${feed.platform}:feed:${stableFeedKey(feed)}:${uid}`,
    legacyExternalRef: `${feed.platform}:${feed.id}:${uid}`,
  }
}

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

function inferSport(feedSport: Feed['sport'], text: string): string {
  if (feedSport?.trim()) return feedSport.trim()
  if (/\blacrosse\b|\blax\b/i.test(text)) return 'Lacrosse'
  if (/\bbasketball\b|\bhoops\b|\bbb\b/i.test(text)) return 'Basketball'
  if (/\bfootball\b|\bgridiron\b/i.test(text)) return 'Football'
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

function inferRole(platform: Feed['platform'], sport: string, text: string): string | null {
  if (platform === 'RefQuest' && sport === 'Lacrosse') {
    if (/head umpire/i.test(text)) return 'Lead'
    if (/umpire\s*(1|2)\b/i.test(text)) return 'Ref'
  }
  return null
}

function cleanupDragonFlyTeamName(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\.$/, '')
    .trim()
}

function parseDragonFlySummary(summary: string, sport: string) {
  const raw = String(summary || '').replace(/\s+/g, ' ').trim()
  if (!raw) return { role: null as string | null, awayTeam: null as string | null, homeTeam: null as string | null, levelDetail: null as string | null }

  const roleMatch = raw.match(/^([^:]+):\s*(.+)$/)
  const roleRaw = roleMatch ? roleMatch[1].trim() : ''
  const remainder = roleMatch ? roleMatch[2].trim() : raw

  const parenMatch = remainder.match(/\(([^)]+)\)/)
  const detailsRaw = parenMatch ? parenMatch[1].trim() : ''
  const matchupRaw = parenMatch ? remainder.slice(0, parenMatch.index).trim() : remainder
  const teams = matchupRaw.match(/(.+?)\s+vs\s+(.+)$/i)

  const normalizedRole = (() => {
    const u = roleRaw.toUpperCase()
    if (sport === 'Lacrosse') {
      if (u === 'REFEREE') return 'Lead'
      if (u === 'UMPIRE' || u === 'FIELD JUDGE') return 'Ref'
    }
    return roleRaw || null
  })()

  const normalizedLevelDetail = (() => {
    const s = detailsRaw.replace(/\.\s*$/, '').trim()
    if (!s) return null
    if (sport === 'Lacrosse') {
      return s.replace(/\bBoys?\s+Lacrosse\b/i, '').replace(/\bGirls?\s+Lacrosse\b/i, '').replace(/\bLacrosse\b/i, '').trim() || s
    }
    if (sport === 'Soccer') {
      return s.replace(/\bBoys?\s+Soccer\b/i, '').replace(/\bGirls?\s+Soccer\b/i, '').replace(/\bSoccer\b/i, '').trim() || s
    }
    return s
  })()

  return {
    role: normalizedRole,
    awayTeam: teams ? cleanupDragonFlyTeamName(teams[1]) : null,
    homeTeam: teams ? cleanupDragonFlyTeamName(teams[2]) : null,
    levelDetail: normalizedLevelDetail,
  }
}

function inferEventType(text: string, allDay: boolean, startTime: string | null, location: string | null): 'Game' | 'Block' | 'Admin' | 'Travel' {
  if (/\btravel\b|\bhotel\b|\bflight\b|\bdrive\b|\bout of town\b/i.test(text)) return 'Travel'
  if (/\bmeeting\b|\bclinic\b|\btraining\b|\badmin\b|\bclass\b/i.test(text)) return 'Admin'
  if (allDay) return 'Block'
  if (/\bblocked\b|\bblock\b|\bunavailable\b|\bnot available\b|\bblackout\b|\bhold\b/i.test(text)) return 'Block'
  if ((startTime === '08:00' || startTime === '08:30') && !location) return 'Block'
  return 'Game'
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

function sameTeam(a: string | null | undefined, b: string | null | undefined): boolean {
  const aa = normText(a)
  const bb = normText(b)
  if (!aa || !bb) return false
  return aa === bb || aa.includes(bb) || bb.includes(aa)
}

function minutesBetween(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null
  const [ah, am] = String(a).slice(0, 5).split(':').map(Number)
  const [bh, bm] = String(b).slice(0, 5).split(':').map(Number)
  if (![ah, am, bh, bm].every(Number.isFinite)) return null
  return Math.abs((ah * 60 + am) - (bh * 60 + bm))
}

function manualCandidateScore(g: any, n: any): number {
  if (String(g.game_date) !== n.gameDate) return 0
  if (g.status === 'Canceled') return 0

  let score = 0
  const gameStart = g.start_time ? String(g.start_time).slice(0, 5) : null
  if (gameStart && n.startTime && gameStart === n.startTime) score += 45
  else if (!gameStart || !n.startTime) score += 10
  else {
    const delta = minutesBetween(gameStart, n.startTime)
    if (delta == null || delta > 30) return 0
    score += delta <= 10 ? 28 : delta <= 20 ? 18 : 10
  }

  if (String(g.sport || '') === n.sport) score += 12
  if (String(g.competition_level || '') === n.competitionLevel) score += 8
  if (sameLocation(g.location_address, n.location)) score += 45

  const homeMatches = sameTeam(g.home_team, n.homeTeam)
  const awayMatches = sameTeam(g.away_team, n.awayTeam)
  if (homeMatches && awayMatches) score += 35
  else if (homeMatches || awayMatches) score += 18

  if (n.levelDetail && normText(g.level_detail) === normText(n.levelDetail)) score += 8
  return score
}

function summarizeNormalizedGame(n: any): string {
  const teams = n.homeTeam || n.awayTeam ? `${n.homeTeam || 'TBD'} vs ${n.awayTeam || 'TBD'}` : null
  return [
    n.gameDate,
    n.startTime,
    teams || n.levelDetail || n.competitionLevel || n.sport,
    n.location || 'No location',
  ].filter(Boolean).join(' | ')
}

function sameExactSlot(g: any, n: any): boolean {
  const gameStart = g.start_time ? String(g.start_time).slice(0, 5) : null
  return (
    String(g.game_date) === n.gameDate &&
    gameStart != null &&
    n.startTime != null &&
    gameStart === n.startTime &&
    String(g.sport || '') === n.sport &&
    String(g.competition_level || '') === n.competitionLevel
  )
}

async function applyBlockConfirmations(client: any, feed: Feed, blockDates: string[], now: string): Promise<number> {
  const dates = Array.from(new Set(blockDates)).filter(Boolean)
  if (!dates.length) return 0

  const { data, error } = await client
    .from('games')
    .select('id,platform_confirmations,status')
    .eq('user_id', feed.user_id)
    .in('game_date', dates)
    .neq('status', 'Canceled')
  if (error) throw new Error(`games block lookup: ${error.message}`)

  let updated = 0
  for (const game of data ?? []) {
    const current = game.platform_confirmations ?? {}
    if (current[feed.platform]) continue
    const { error: updateErr } = await client
      .from('games')
      .update({
        platform_confirmations: {
          ...current,
          [feed.platform]: true,
        },
        updated_at: now,
      })
      .eq('user_id', feed.user_id)
      .eq('id', game.id)
    if (updateErr) throw new Error(`games block update: ${updateErr.message}`)
    updated += 1
  }

  return updated
}

function findManualMatch(dayGames: any[], unusedGameIds: Set<string>, n: any): {
  match: any | null
  topScore?: number
  competingScore?: number
  ambiguous: boolean
} {
  const exactSlotCandidates = dayGames.filter((g: any) =>
    unusedGameIds.has(String(g.id)) &&
    g.status !== 'Canceled' &&
    sameExactSlot(g, n)
  )

  const scored = dayGames
    .filter((g: any) => unusedGameIds.has(String(g.id)))
    .map((g: any) => {
      let score = manualCandidateScore(g, n)
      if (score > 0 && exactSlotCandidates.length === 1 && String(exactSlotCandidates[0].id) === String(g.id)) {
        score += 18
      }
      return { game: g, score }
    })
    .filter((x) => x.score >= (n.location ? 55 : 70))
    .sort((a, b) => b.score - a.score)

  const best = scored[0]
  const second = scored[1]
  if (!best) return { match: null, ambiguous: false }

  const margin = best.score - (second?.score ?? 0)
  const strongEnough = best.score >= (n.location ? 70 : 82)
  const clearlyBest = !second || margin >= 15
  if (strongEnough && clearlyBest) {
    return {
      match: best.game,
      topScore: best.score,
      competingScore: second?.score,
      ambiguous: false,
    }
  }

  return {
    match: null,
    topScore: best.score,
    competingScore: second?.score,
    ambiguous: Boolean(second || best.score >= 60),
  }
}

export async function syncFeed(client: any, feed: Feed) {
  const userDefaultTimezone = await loadUserDefaultTimezone(client, feed.user_id)
  const now = new Date().toISOString()
  let createdEvents = 0
  let updatedEvents = 0
  let createdGames = 0
  let updatedGames = 0
  const errors: string[] = []
  const diagnostics: SyncDiagnostic[] = []

  let raw: string
  try {
    raw = await fetchCalendarFeedText(revealFeedUrl(feed.feed_url))
  } catch (e: any) {
    return { createdEvents, updatedEvents, createdGames, updatedGames, errors: [`${feed.name}: fetch failed: ${String(e?.message || e)}`] }
  }

  let parsed: Record<string, any>
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

  const normalizedRows = icsEvents.map((ev: any) => {
    const rawStart = new Date(ev.start)
    const rawEnd = ev.end ? new Date(ev.end) : new Date(rawStart.getTime() + 2 * 60 * 60 * 1000)
    const start = rawStart
    const end = rawEnd
    const text = eventDesc(ev)
    const sport = inferSport(feed.sport, text)
    const competitionLevel = inferCompetitionLevel(text)
    const dragonFlySummary = feed.platform === 'DragonFly' ? parseDragonFlySummary(String(ev.summary || ''), sport) : null
    const levelDetail = dragonFlySummary?.levelDetail ?? inferLevelDetail(text)
    const role = dragonFlySummary?.role ?? inferRole(feed.platform, sport, text)
    const { externalRef, legacyExternalRef } = sourceRefs(feed, String(ev.uid))
    const allDay = Boolean((ev as any).datetype === 'date')
    const location = trimOrNull(ev.location)
    const startTime = allDay ? null : hhmmInZone(start, userDefaultTimezone)
    const eventType = inferEventType(text, allDay, startTime, location)
    const rawTitle = String(ev.summary || 'Assigned Game')

    return {
      uid: String(ev.uid),
      externalRef,
      legacyExternalRef,
      title: feed.platform === 'DragonFly' && eventType === 'Block' ? cleanupDragonFlyBlockTitle(rawTitle) : rawTitle,
      location,
      notes: trimOrNull(ev.description),
      start,
      end,
      allDay,
      eventType,
      sport,
      competitionLevel,
      levelDetail,
      role,
      awayTeam: dragonFlySummary?.awayTeam ?? null,
      homeTeam: dragonFlySummary?.homeTeam ?? null,
      gameDate: ymdInZone(start, userDefaultTimezone),
      startTime,
    }
  }).filter((n) => !feed.import_start_date || n.gameDate >= feed.import_start_date)
  const normalized = feed.platform === 'DragonFly' ? dedupeFeedBlocks(normalizedRows) : normalizedRows

  if (!normalized.length) {
    await client.from('calendar_feeds').update({ last_synced_at: now, updated_at: now }).eq('id', feed.id).eq('user_id', feed.user_id)
    return { createdEvents, updatedEvents, createdGames, updatedGames, errors }
  }

  const blockDates = normalized
    .filter((n) => n.eventType === 'Block')
    .flatMap((n) => dateKeysTouched(n.start, n.end, userDefaultTimezone))

  const eventDates = Array.from(new Set(normalized.map((n) => n.gameDate)))
  const { data: dayGames, error: dayGamesErr } = await client
    .from('games')
    .select('*')
    .eq('user_id', feed.user_id)
    .in('game_date', eventDates)
  if (dayGamesErr) throw new Error(`games day lookup: ${dayGamesErr.message}`)
  const unusedGameIds = new Set<string>((dayGames ?? []).map((g: any) => String(g.id)))
  const manualMatchByExternalRef = new Map<string, any>()
  const manualMatchMetaByExternalRef = new Map<string, { topScore?: number; competingScore?: number }>()

  for (const n of normalized) {
    if (n.eventType !== 'Game') continue
    const candidate = findManualMatch(dayGames ?? [], unusedGameIds, n)
    if (candidate.match) {
      manualMatchByExternalRef.set(n.externalRef, candidate.match)
      manualMatchMetaByExternalRef.set(n.externalRef, {
        topScore: candidate.topScore,
        competingScore: candidate.competingScore,
      })
      unusedGameIds.delete(String(candidate.match.id))
    } else if (candidate.ambiguous) {
      diagnostics.push({
        feedName: feed.name,
        action: 'ambiguous',
        summary: summarizeNormalizedGame(n),
        score: candidate.topScore,
        competingScore: candidate.competingScore,
        reason: 'Multiple possible existing games looked close, so sync created a new game instead of guessing.',
      })
    }
  }

  const refPrefixes = [`${feed.platform}:feed:${stableFeedKey(feed)}:`, `${feed.platform}:${feed.id}:`]
  const existingEventsById = new Map<string, any>()
  for (const refPrefix of refPrefixes) {
    const { data, error: evLookupErr } = await client
      .from('calendar_events')
      .select('id,event_type,title,start_ts,end_ts,all_day,external_ref,linked_game_id,created_at,timezone,location_address,notes,platform_confirmations')
      .eq('user_id', feed.user_id)
      .like('external_ref', `${refPrefix}%`)
    if (evLookupErr) throw new Error(`calendar_events lookup: ${evLookupErr.message}`)
    for (const event of data ?? []) existingEventsById.set(String(event.id), event)
  }
  const existingEvents = Array.from(existingEventsById.values())
  const existingByRef = new Map<string, any>()
  for (const e of existingEvents ?? []) {
    existingByRef.set(String(e.external_ref), e)
  }
  const refsAlreadySeen = new Set<string>()
  for (const n of normalized) {
    if (existingByRef.has(n.externalRef) || existingByRef.has(n.legacyExternalRef)) {
      refsAlreadySeen.add(n.externalRef)
      diagnostics.push({
        feedName: feed.name,
        action: 'matched-existing',
        summary: summarizeNormalizedGame(n),
        reason: 'Matched an existing synced event by source reference.',
      })
    }
  }

  const calendarRows = normalized.map((n) => {
    const existing = existingByRef.get(n.externalRef) ?? existingByRef.get(n.legacyExternalRef)
    const manualMatch = manualMatchByExternalRef.get(n.externalRef)
    const reusedCalendarEventId = manualMatch?.calendar_event_id ? String(manualMatch.calendar_event_id) : null
    const platformConfirmations = {
      ...(existing?.platform_confirmations ?? manualMatch?.platform_confirmations ?? {}),
      [feed.platform]: true,
    }
    return {
      id: existing?.id ?? reusedCalendarEventId ?? crypto.randomUUID(),
      user_id: feed.user_id,
      event_type: n.eventType,
      title: n.title,
      start_ts: n.start.toISOString(),
      end_ts: n.end.toISOString(),
      all_day: n.allDay,
      timezone: existing?.timezone ?? manualMatch?.timezone ?? userDefaultTimezone,
      location_address: n.location ?? existing?.location_address ?? manualMatch?.location_address ?? null,
      notes: existing?.notes ?? manualMatch?.notes ?? n.notes,
      source: 'Manual',
      external_ref: n.externalRef,
      status: 'Scheduled',
      linked_game_id: n.eventType === 'Game' ? (existing?.linked_game_id ?? null) : null,
      platform_confirmations: platformConfirmations,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    }
  })

  const staleDuplicateBlockEventIds = feed.platform === 'DragonFly'
    ? existingEvents
      .filter((event) => event.event_type === 'Block')
      .filter((event) => {
        const keeper = calendarRows.find((row) => row.event_type === 'Block' && blockSlotKey(row) === blockSlotKey(event))
        return keeper && String(keeper.id) !== String(event.id)
      })
      .map((event) => String(event.id))
    : []

  const { data: upsertedEvents, error: upsertEventsErr } = await client
    .from('calendar_events')
    .upsert(calendarRows, { onConflict: 'id' })
    .select('id,external_ref,linked_game_id')
  if (upsertEventsErr) throw new Error(`calendar_events upsert: ${upsertEventsErr.message}`)

  if (staleDuplicateBlockEventIds.length) {
    const { error: deleteDuplicateBlocksErr } = await client
      .from('calendar_events')
      .delete()
      .eq('user_id', feed.user_id)
      .eq('event_type', 'Block')
      .in('id', staleDuplicateBlockEventIds)
    if (deleteDuplicateBlocksErr) throw new Error(`calendar_events duplicate block cleanup: ${deleteDuplicateBlocksErr.message}`)
  }

  for (const row of calendarRows) {
    if (refsAlreadySeen.has(row.external_ref)) updatedEvents += 1
    else createdEvents += 1
  }

  const eventByRef = new Map<string, any>((upsertedEvents ?? []).map((e: any) => [String(e.external_ref), e]))
  const gameNormalized = normalized.filter((n) => n.eventType === 'Game')
  const eventIds = gameNormalized
    .map((n) => eventByRef.get(n.externalRef)?.id ? String(eventByRef.get(n.externalRef).id) : null)
    .filter(Boolean) as string[]

  let existingGames: any[] = []
  if (eventIds.length) {
    const { data, error: gamesLookupErr } = await client
      .from('games')
      .select('*')
      .eq('user_id', feed.user_id)
      .in('calendar_event_id', eventIds)
    if (gamesLookupErr) throw new Error(`games lookup: ${gamesLookupErr.message}`)
    existingGames = data ?? []
  }
  const gameByEventId = new Map<string, any>((existingGames ?? []).map((g: any) => [String(g.calendar_event_id), g]))
  const existingGameIds = new Set<string>((existingGames ?? []).map((g: any) => String(g.id)))
  for (const g of manualMatchByExternalRef.values()) existingGameIds.add(String(g.id))

  const gameRows = gameNormalized.map((n) => {
    const ev = eventByRef.get(n.externalRef)
    const matchedManual = manualMatchByExternalRef.get(n.externalRef)
    const existing = gameByEventId.get(String(ev.id)) ?? matchedManual
    const platformConfirmations = {
      ...(existing?.platform_confirmations ?? {}),
      [feed.platform]: true,
    }
    return {
      id: existing?.id ?? crypto.randomUUID(),
      user_id: feed.user_id,
      sport: n.sport,
      competition_level: n.competitionLevel,
      league: existing?.league ?? feed.default_league ?? null,
      level_detail: existing?.level_detail ?? n.levelDetail ?? null,
      game_date: n.gameDate,
      start_time: n.startTime ?? existing?.start_time ?? null,
      timezone: existing?.timezone ?? userDefaultTimezone,
      location_address: existing?.location_address || n.location || '',
      distance_miles: existing?.distance_miles ?? null,
      roundtrip_miles: existing?.roundtrip_miles ?? null,
      role: existing?.role ?? n.role ?? null,
      status: existing?.status ?? 'Scheduled',
      game_fee: existing?.game_fee ?? null,
      paid_confirmed: existing?.paid_confirmed ?? false,
      paid_date: existing?.paid_date ?? null,
      pay_expected: existing?.pay_expected ?? null,
      home_team: existing?.home_team || n.homeTeam || null,
      away_team: existing?.away_team || n.awayTeam || null,
      notes: existing?.notes ?? n.notes ?? null,
      platform_confirmations: platformConfirmations,
      calendar_event_id: ev.id,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    }
  })

  let upsertedGames: any[] = []
  if (gameRows.length) {
    const { data, error: gamesUpsertErr } = await client
      .from('games')
      .upsert(gameRows, { onConflict: 'id' })
      .select('id,calendar_event_id')
    if (gamesUpsertErr) throw new Error(`games upsert: ${gamesUpsertErr.message}`)
    upsertedGames = data ?? []
  }

  for (const row of gameRows) {
    const normalizedGame = gameNormalized.find((g) => eventByRef.get(g.externalRef)?.id === row.calendar_event_id)
    if (existingGameIds.has(String(row.id))) {
      updatedGames += 1
      if (normalizedGame && manualMatchByExternalRef.has(normalizedGame.externalRef)) {
        const meta = manualMatchMetaByExternalRef.get(normalizedGame.externalRef)
        diagnostics.push({
          feedName: feed.name,
          action: 'matched-manual',
          summary: summarizeNormalizedGame(normalizedGame),
          score: meta?.topScore,
          competingScore: meta?.competingScore,
          reason: 'Matched an existing manual game with a clear confidence lead.',
        })
      }
    } else {
      createdGames += 1
      if (normalizedGame && !refsAlreadySeen.has(normalizedGame.externalRef)) {
        const wasAlreadyLogged = diagnostics.some((d) =>
          d.feedName === feed.name &&
          d.summary === summarizeNormalizedGame(normalizedGame) &&
          d.action === 'ambiguous'
        )
        if (!wasAlreadyLogged) {
          diagnostics.push({
            feedName: feed.name,
            action: 'created-new',
            summary: summarizeNormalizedGame(normalizedGame),
            reason: 'No confident existing game match was found, so sync created a new game.',
          })
        }
      }
    }
  }

  for (const g of upsertedGames ?? []) {
    const { error } = await client
      .from('calendar_events')
      .update({ linked_game_id: g.id, updated_at: now })
      .eq('user_id', feed.user_id)
      .eq('id', g.calendar_event_id)
    if (error) errors.push(`${feed.name}: link update failed for event ${g.calendar_event_id}: ${error.message}`)
  }

  const gamesUpdatedFromBlocks = await applyBlockConfirmations(client, feed, blockDates, now)
  updatedGames += gamesUpdatedFromBlocks

  const { error: stampErr } = await client
    .from('calendar_feeds')
    .update({ last_synced_at: now, updated_at: now })
    .eq('id', feed.id)
    .eq('user_id', feed.user_id)
  if (stampErr) errors.push(`${feed.name}: last_synced_at update failed: ${stampErr.message}`)

  return {
    createdEvents,
    updatedEvents,
    createdGames,
    updatedGames,
    errors,
    diagnostics: {
      existingRefMatches: diagnostics.filter((d) => d.action === 'matched-existing').length,
      manualMatches: diagnostics.filter((d) => d.action === 'matched-manual').length,
      createdFromFeed: diagnostics.filter((d) => d.action === 'created-new').length,
      ambiguousCandidates: diagnostics.filter((d) => d.action === 'ambiguous').length,
      samples: diagnostics.slice(0, 20),
    },
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setApiSecurityHeaders(res)

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const rate = checkRateLimit(req, 'sync-ics', { limit: 20, windowMs: 10 * 60 * 1000 })
    if (!rate.allowed) return sendRateLimited(res, rate.retryAfterSeconds)

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
    const diagnostics = {
      existingRefMatches: 0,
      manualMatches: 0,
      createdFromFeed: 0,
      ambiguousCandidates: 0,
      samples: [] as SyncDiagnostic[],
    }

    for (const feed of feeds as Feed[]) {
      try {
        const result = await syncFeed(client, feed)
        createdEvents += result.createdEvents
        updatedEvents += result.updatedEvents
        createdGames += result.createdGames
        updatedGames += result.updatedGames
        errors.push(...result.errors)
        diagnostics.existingRefMatches += result.diagnostics?.existingRefMatches ?? 0
        diagnostics.manualMatches += result.diagnostics?.manualMatches ?? 0
        diagnostics.createdFromFeed += result.diagnostics?.createdFromFeed ?? 0
        diagnostics.ambiguousCandidates += result.diagnostics?.ambiguousCandidates ?? 0
        diagnostics.samples.push(...(result.diagnostics?.samples ?? []))
      } catch (e: any) {
        errors.push(`${feed.name}: ${String(e?.message || e)}`)
      }
    }

    return res.status(200).json({
      createdEvents,
      updatedEvents,
      createdGames,
      updatedGames,
      errors,
      diagnostics: {
        ...diagnostics,
        samples: diagnostics.samples.slice(0, 20),
      },
    })
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message || e || 'Unknown error') })
  }
}
