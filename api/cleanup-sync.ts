import type { VercelRequest, VercelResponse } from '@vercel/node'
import { checkRateLimit, createAuthedSupabase, getBearerToken, sendRateLimited, setApiSecurityHeaders, toJsonBody } from '../src/server/auth-utils.js'

function normText(s: string | null | undefined): string {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function timeText(value: unknown): string {
  return value ? String(value).slice(0, 5) : ''
}

function minutesBetween(a: unknown, b: unknown): number | null {
  const aa = timeText(a)
  const bb = timeText(b)
  if (!aa || !bb) return null
  const [ah, am] = aa.split(':').map(Number)
  const [bh, bm] = bb.split(':').map(Number)
  if (![ah, am, bh, bm].every(Number.isFinite)) return null
  return Math.abs((ah * 60 + am) - (bh * 60 + bm))
}

function isSyncedRef(x: unknown): boolean {
  const s = String(x || '')
  return s.startsWith('DragonFly:') || s.startsWith('RefQuest:')
}

function scoreGame(g: any, externalRefByEventId: Map<string, string | null>): number {
  let score = 0
  const evRef = g.calendar_event_id ? externalRefByEventId.get(String(g.calendar_event_id)) : null
  if (!evRef) score += 30 // keep manual entries by default
  if (g.game_fee != null) score += 20
  if (g.paid_confirmed) score += 10
  if (g.roundtrip_miles != null) score += 8
  if (g.distance_miles != null) score += 3
  if (g.notes) score += 2
  if (g.home_team || g.away_team) score += 2
  const updatedAt = Date.parse(String(g.updated_at || ''))
  if (Number.isFinite(updatedAt)) score += updatedAt / 1e15
  return score
}

type CleanupPlan = {
  duplicateGroups: number
  keepCount: number
  deleteGames: string[]
  relinks: Array<{ eventId: string; keeperGameId: string }>
  deleteEvents: string[]
  samples: Array<{
    key: string
    keepGameId: string
    keepGame?: {
      id: string
      gameDate: string
      startTime: string | null
      sport: string | null
      competitionLevel: string | null
      locationAddress: string | null
      homeTeam: string | null
      awayTeam: string | null
      league: string | null
      levelDetail: string | null
      calendarEventId: string | null
    }
    deleteGameIds: string[]
    deleteGames: Array<{
      id: string
      gameDate: string
      startTime: string | null
      sport: string | null
      competitionLevel: string | null
      locationAddress: string | null
      homeTeam: string | null
      awayTeam: string | null
      league: string | null
      levelDetail: string | null
      calendarEventId: string | null
      externalRef: string | null
    }>
    relinks: Array<{ eventId: string; keeperGameId: string }>
    deleteEventIds: string[]
  }>
}

function snapshotGame(g: any, externalRefByEventId: Map<string, string | null>) {
  return {
    id: String(g.id),
    gameDate: String(g.game_date || ''),
    startTime: g.start_time ? String(g.start_time).slice(0, 5) : null,
    sport: g.sport ?? null,
    competitionLevel: g.competition_level ?? null,
    locationAddress: g.location_address ?? null,
    homeTeam: g.home_team ?? null,
    awayTeam: g.away_team ?? null,
    league: g.league ?? null,
    levelDetail: g.level_detail ?? null,
    calendarEventId: g.calendar_event_id ? String(g.calendar_event_id) : null,
    externalRef: g.calendar_event_id ? (externalRefByEventId.get(String(g.calendar_event_id)) ?? null) : null,
  }
}

function sameLocation(a: any, b: any): boolean {
  const aa = normText(a.location_address)
  const bb = normText(b.location_address)
  if (!aa || !bb) return false
  return aa === bb || aa.includes(bb) || bb.includes(aa)
}

function sameTeams(a: any, b: any): boolean {
  const aHome = normText(a.home_team)
  const aAway = normText(a.away_team)
  const bHome = normText(b.home_team)
  const bAway = normText(b.away_team)
  return Boolean(aHome && aAway && bHome && bAway && aHome === bHome && aAway === bAway)
}

function oneTeamMatches(a: any, b: any): boolean {
  const teamsA = [normText(a.home_team), normText(a.away_team)].filter(Boolean)
  const teamsB = new Set([normText(b.home_team), normText(b.away_team)].filter(Boolean))
  return teamsA.some((team) => teamsB.has(team))
}

function duplicateCandidateScore(a: any, b: any): number {
  if (String(a.game_date || '') !== String(b.game_date || '')) return 0
  if (String(a.sport || '') && String(b.sport || '') && String(a.sport) !== String(b.sport)) return 0

  let score = 0
  const delta = minutesBetween(a.start_time, b.start_time)
  const hasTime = delta != null
  if (hasTime) {
    if (delta === 0) score += 30
    else if (delta <= 10) score += 24
    else if (delta <= 20) score += 16
    else if (delta <= 30) score += 10
    else return 0
  } else {
    score += 4
  }

  const locMatch = sameLocation(a, b)
  const fullTeams = sameTeams(a, b)
  const partialTeam = !fullTeams && oneTeamMatches(a, b)
  const missingLocation = !normText(a.location_address) || !normText(b.location_address)

  if (locMatch) score += 24
  else if (missingLocation) score += 8

  if (fullTeams) score += 28
  else if (partialTeam) score += 12

  if (normText(a.level_detail) && normText(a.level_detail) === normText(b.level_detail)) score += 10
  if (String(a.competition_level || '') && String(a.competition_level || '') === String(b.competition_level || '')) score += 8
  if (normText(a.league) && normText(a.league) === normText(b.league)) score += 6

  const corroborated = locMatch || fullTeams || partialTeam || missingLocation
  if (!corroborated) return 0
  return score
}

function buildPlan(games: any[], events: any[]): CleanupPlan {
  const externalRefByEventId = new Map<string, string | null>(events.map((e: any) => [String(e.id), e.external_ref ?? null]))
  const eventById = new Map<string, any>(events.map((e: any) => [String(e.id), e]))
  const groupedIds = new Map<string, Set<string>>()
  const gameById = new Map<string, any>(games.map((g: any) => [String(g.id), g]))

  for (let i = 0; i < games.length; i += 1) {
    const a = games[i]
    const aId = String(a.id)
    if (!groupedIds.has(aId)) groupedIds.set(aId, new Set([aId]))
    for (let j = i + 1; j < games.length; j += 1) {
      const b = games[j]
      const bId = String(b.id)
      const aRef = a.calendar_event_id ? externalRefByEventId.get(String(a.calendar_event_id)) : null
      const bRef = b.calendar_event_id ? externalRefByEventId.get(String(b.calendar_event_id)) : null
      if (!(isSyncedRef(aRef) || isSyncedRef(bRef))) continue

      const score = duplicateCandidateScore(a, b)
      if (score < 42) continue

      const aSet = groupedIds.get(aId) ?? new Set([aId])
      const bSet = groupedIds.get(bId) ?? new Set([bId])
      const merged = new Set<string>([...aSet, ...bSet])
      for (const id of merged) groupedIds.set(id, merged)
    }
  }

  const groups = new Map<string, any[]>()
  const seenGroupIds = new Set<string>()
  for (const g of games) {
    const id = String(g.id)
    const set = groupedIds.get(id)
    if (!set || set.size < 2) continue
    const groupIds = Array.from(set).sort()
    const key = groupIds.join('|')
    if (seenGroupIds.has(key)) continue
    seenGroupIds.add(key)
    groups.set(key, groupIds.map((gid) => gameById.get(gid)).filter(Boolean))
  }

  const deleteGames = new Set<string>()
  const relinks: Array<{ eventId: string; keeperGameId: string }> = []
  const deleteEvents = new Set<string>()
  const samples: CleanupPlan['samples'] = []
  let duplicateGroups = 0
  let keepCount = 0

  for (const [key, list] of groups) {
    if (list.length < 2) continue
    const hasSynced = list.some((g) => {
      const ref = g.calendar_event_id ? externalRefByEventId.get(String(g.calendar_event_id)) : null
      return isSyncedRef(ref)
    })
    if (!hasSynced) continue

    duplicateGroups += 1
    const sorted = [...list].sort((a, b) => scoreGame(b, externalRefByEventId) - scoreGame(a, externalRefByEventId))
    const keeper = sorted[0]
    keepCount += 1
    const toDelete = sorted.slice(1)

    const deleteIds: string[] = []
    const deleteGamesSnapshot: CleanupPlan['samples'][number]['deleteGames'] = []
    const groupRelinks: Array<{ eventId: string; keeperGameId: string }> = []
    const groupDeleteEventIds = new Set<string>()
    for (const g of toDelete) {
      const gid = String(g.id)
      deleteGames.add(gid)
      deleteIds.push(gid)
      deleteGamesSnapshot.push(snapshotGame(g, externalRefByEventId))

      const evId = g.calendar_event_id ? String(g.calendar_event_id) : null
      if (!evId) continue
      const ev = eventById.get(evId)
      if (!ev) continue
      const keeperEventId = keeper.calendar_event_id ? String(keeper.calendar_event_id) : null
      const synced = isSyncedRef(ev.external_ref)
      if (!keeperEventId) {
        const relink = { eventId: evId, keeperGameId: String(keeper.id) }
        relinks.push(relink)
        groupRelinks.push(relink)
      } else if (synced) {
        deleteEvents.add(evId)
        groupDeleteEventIds.add(evId)
      }
    }

    samples.push({
      key,
      keepGameId: String(keeper.id),
      keepGame: snapshotGame(keeper, externalRefByEventId),
      deleteGameIds: deleteIds,
      deleteGames: deleteGamesSnapshot,
      relinks: groupRelinks,
      deleteEventIds: Array.from(groupDeleteEventIds),
    })
  }

  return {
    duplicateGroups,
    keepCount,
    deleteGames: Array.from(deleteGames),
    relinks,
    deleteEvents: Array.from(deleteEvents),
    samples: samples.slice(0, 20),
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setApiSecurityHeaders(res)

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const rate = checkRateLimit(req, 'cleanup-sync', { limit: 30, windowMs: 60 * 1000 })
    if (!rate.allowed) return sendRateLimited(res, rate.retryAfterSeconds)

    const token = getBearerToken(req)
    if (!token) return res.status(401).json({ error: 'Missing bearer token' })
    const client = createAuthedSupabase(token)
    const { data: authData, error: authErr } = await client.auth.getUser()
    if (authErr || !authData?.user) return res.status(401).json({ error: 'Invalid auth token' })
    const userId = authData.user.id

    const body = toJsonBody(req)
    const apply = Boolean(body.apply)
    const selectedKeys = Array.isArray(body.selectedKeys)
      ? body.selectedKeys.map((x: unknown) => String(x || '')).filter(Boolean)
      : null

    const { data: games, error: gErr } = await client.from('games').select('*').eq('user_id', userId)
    if (gErr) return res.status(400).json({ error: `games lookup: ${gErr.message}` })
    const { data: events, error: eErr } = await client
      .from('calendar_events')
      .select('id,user_id,external_ref,linked_game_id')
      .eq('user_id', userId)
    if (eErr) return res.status(400).json({ error: `calendar_events lookup: ${eErr.message}` })

    const fullPlan = buildPlan(games ?? [], events ?? [])
    const selectedSamples = selectedKeys ? fullPlan.samples.filter((s) => selectedKeys.includes(s.key)) : fullPlan.samples
    const plan: CleanupPlan = {
      duplicateGroups: selectedSamples.length,
      keepCount: selectedSamples.length,
      deleteGames: selectedSamples.flatMap((s) => s.deleteGameIds),
      relinks: selectedSamples.flatMap((s) => s.relinks),
      deleteEvents: selectedSamples.flatMap((s) => s.deleteEventIds),
      samples: selectedSamples,
    }
    if (!apply) {
      return res.status(200).json({
        mode: 'dry-run',
        ...plan,
      })
    }

    const errors: string[] = []
    for (const r of plan.relinks) {
      const { error: e1 } = await client
        .from('games')
        .update({ calendar_event_id: r.eventId, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('id', r.keeperGameId)
      if (e1) errors.push(`relink game ${r.keeperGameId}: ${e1.message}`)

      const { error: e2 } = await client
        .from('calendar_events')
        .update({ linked_game_id: r.keeperGameId, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('id', r.eventId)
      if (e2) errors.push(`relink event ${r.eventId}: ${e2.message}`)
    }

    if (plan.deleteEvents.length) {
      const { error } = await client
        .from('calendar_events')
        .delete()
        .eq('user_id', userId)
        .in('id', plan.deleteEvents)
      if (error) errors.push(`delete events: ${error.message}`)
    }

    if (plan.deleteGames.length) {
      const { error } = await client
        .from('games')
        .delete()
        .eq('user_id', userId)
        .in('id', plan.deleteGames)
      if (error) errors.push(`delete games: ${error.message}`)
    }

    return res.status(200).json({
      mode: 'applied',
      ...plan,
      deletedGames: plan.deleteGames.length,
      deletedEvents: plan.deleteEvents.length,
      relinked: plan.relinks.length,
      errors,
    })
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message || e || 'Unknown error') })
  }
}
