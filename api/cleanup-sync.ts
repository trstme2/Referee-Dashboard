import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createAuthedSupabase, getBearerToken, toJsonBody } from './auth-utils.js'

function normText(s: string | null | undefined): string {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
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
  samples: Array<{ key: string; keepGameId: string; deleteGameIds: string[] }>
}

function buildPlan(games: any[], events: any[]): CleanupPlan {
  const externalRefByEventId = new Map<string, string | null>(events.map((e: any) => [String(e.id), e.external_ref ?? null]))
  const eventById = new Map<string, any>(events.map((e: any) => [String(e.id), e]))
  const groups = new Map<string, any[]>()

  for (const g of games) {
    const startKey = g.start_time ? String(g.start_time).slice(0, 5) : ''
    const key = startKey
      ? [
          g.game_date || '',
          startKey,
          g.sport || '',
        ].join('|')
      : [
          g.game_date || '',
          '',
          g.sport || '',
          g.competition_level || '',
          normText(g.location_address),
        ].join('|')
    groups.set(key, [...(groups.get(key) ?? []), g])
  }

  const deleteGames = new Set<string>()
  const relinks: Array<{ eventId: string; keeperGameId: string }> = []
  const deleteEvents = new Set<string>()
  const samples: Array<{ key: string; keepGameId: string; deleteGameIds: string[] }> = []
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
    for (const g of toDelete) {
      const gid = String(g.id)
      deleteGames.add(gid)
      deleteIds.push(gid)

      const evId = g.calendar_event_id ? String(g.calendar_event_id) : null
      if (!evId) continue
      const ev = eventById.get(evId)
      if (!ev) continue
      const keeperEventId = keeper.calendar_event_id ? String(keeper.calendar_event_id) : null
      const synced = isSyncedRef(ev.external_ref)
      if (!keeperEventId) {
        relinks.push({ eventId: evId, keeperGameId: String(keeper.id) })
      } else if (synced) {
        deleteEvents.add(evId)
      }
    }

    samples.push({ key, keepGameId: String(keeper.id), deleteGameIds: deleteIds })
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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const token = getBearerToken(req)
    if (!token) return res.status(401).json({ error: 'Missing bearer token' })
    const client = createAuthedSupabase(token)
    const { data: authData, error: authErr } = await client.auth.getUser()
    if (authErr || !authData?.user) return res.status(401).json({ error: 'Invalid auth token' })
    const userId = authData.user.id

    const body = toJsonBody(req)
    const apply = Boolean(body.apply)

    const { data: games, error: gErr } = await client.from('games').select('*').eq('user_id', userId)
    if (gErr) return res.status(400).json({ error: `games lookup: ${gErr.message}` })
    const { data: events, error: eErr } = await client
      .from('calendar_events')
      .select('id,user_id,external_ref,linked_game_id')
      .eq('user_id', userId)
    if (eErr) return res.status(400).json({ error: `calendar_events lookup: ${eErr.message}` })

    const plan = buildPlan(games ?? [], events ?? [])
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
