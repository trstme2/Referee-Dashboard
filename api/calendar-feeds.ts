import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createAuthedSupabase, getBearerToken, maskUrl, toJsonBody } from './auth-utils'

type FeedPlatform = 'RefQuest' | 'DragonFly'
type FeedSport = 'Soccer' | 'Lacrosse' | null

function isValidPlatform(x: unknown): x is FeedPlatform {
  return x === 'RefQuest' || x === 'DragonFly'
}

function normalizeSport(x: unknown): FeedSport {
  if (x === 'Soccer' || x === 'Lacrosse') return x
  return null
}

function mustUrl(s: unknown): string {
  const raw = String(s || '').trim()
  if (!raw) throw new Error('feedUrl is required')
  try {
    const u = new URL(raw)
    if (!/^https?:$/.test(u.protocol)) throw new Error('feedUrl must be http(s)')
    return u.toString()
  } catch {
    throw new Error('feedUrl must be a valid URL')
  }
}

async function enforcePlatformLimit(client: any, userId: string, platform: FeedPlatform, excludeId?: string) {
  const { data, error } = await client
    .from('calendar_feeds')
    .select('id, platform')
    .eq('user_id', userId)
    .eq('platform', platform)
  if (error) throw new Error(`calendar_feeds: ${error.message}`)
  const count = (data ?? []).filter((x: any) => x.id !== excludeId).length
  if (platform === 'DragonFly' && count >= 1) throw new Error('DragonFly supports only 1 feed URL')
  if (platform === 'RefQuest' && count >= 8) throw new Error('RefQuest supports at most 8 feed URLs')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const token = getBearerToken(req)
    if (!token) return res.status(401).json({ error: 'Missing bearer token' })
    const client = createAuthedSupabase(token)
    const { data: authData, error: authErr } = await client.auth.getUser()
    if (authErr || !authData?.user) return res.status(401).json({ error: 'Invalid auth token' })
    const userId = authData.user.id

    if (req.method === 'GET') {
      const { data, error } = await client
        .from('calendar_feeds')
        .select('id,user_id,platform,name,feed_url,enabled,sport,default_league,last_synced_at,created_at,updated_at')
        .eq('user_id', userId)
        .order('platform', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) return res.status(400).json({ error: error.message })
      const feeds = (data ?? []).map((f: any) => ({
        id: f.id,
        platform: f.platform,
        name: f.name,
        enabled: Boolean(f.enabled),
        sport: f.sport ?? null,
        defaultLeague: f.default_league ?? null,
        lastSyncedAt: f.last_synced_at ?? null,
        createdAt: f.created_at,
        updatedAt: f.updated_at,
        maskedFeedUrl: maskUrl(String(f.feed_url || '')),
      }))
      return res.status(200).json({ feeds })
    }

    if (req.method === 'POST') {
      const body = toJsonBody(req)
      const platform = body.platform
      if (!isValidPlatform(platform)) return res.status(400).json({ error: 'platform must be RefQuest or DragonFly' })
      await enforcePlatformLimit(client, userId, platform)

      const name = String(body.name || '').trim()
      if (!name) return res.status(400).json({ error: 'name is required' })
      const feedUrl = mustUrl(body.feedUrl)
      const enabled = body.enabled == null ? true : Boolean(body.enabled)
      const sport = normalizeSport(body.sport)
      const defaultLeague = String(body.defaultLeague || '').trim() || null

      const { data, error } = await client
        .from('calendar_feeds')
        .insert([{
          user_id: userId,
          platform,
          name,
          feed_url: feedUrl,
          enabled,
          sport,
          default_league: defaultLeague,
        }])
        .select('id,platform,name,feed_url,enabled,sport,default_league,last_synced_at,created_at,updated_at')
        .single()
      if (error) return res.status(400).json({ error: error.message })
      return res.status(200).json({
        feed: {
          id: data.id,
          platform: data.platform,
          name: data.name,
          enabled: Boolean(data.enabled),
          sport: data.sport ?? null,
          defaultLeague: data.default_league ?? null,
          lastSyncedAt: data.last_synced_at ?? null,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          maskedFeedUrl: maskUrl(String(data.feed_url || '')),
        },
      })
    }

    if (req.method === 'PUT') {
      const body = toJsonBody(req)
      const id = String(body.id || '').trim()
      if (!id) return res.status(400).json({ error: 'id is required' })

      const { data: existing, error: exErr } = await client
        .from('calendar_feeds')
        .select('id,platform')
        .eq('user_id', userId)
        .eq('id', id)
        .maybeSingle()
      if (exErr) return res.status(400).json({ error: exErr.message })
      if (!existing) return res.status(404).json({ error: 'Feed not found' })

      const nextPlatform = body.platform ?? existing.platform
      if (!isValidPlatform(nextPlatform)) return res.status(400).json({ error: 'platform must be RefQuest or DragonFly' })
      await enforcePlatformLimit(client, userId, nextPlatform, id)

      const updates: any = { updated_at: new Date().toISOString(), platform: nextPlatform }
      if (body.name != null) {
        const name = String(body.name).trim()
        if (!name) return res.status(400).json({ error: 'name cannot be blank' })
        updates.name = name
      }
      if (body.feedUrl != null) updates.feed_url = mustUrl(body.feedUrl)
      if (body.enabled != null) updates.enabled = Boolean(body.enabled)
      if (body.sport !== undefined) updates.sport = normalizeSport(body.sport)
      if (body.defaultLeague !== undefined) updates.default_league = String(body.defaultLeague || '').trim() || null

      const { data, error } = await client
        .from('calendar_feeds')
        .update(updates)
        .eq('user_id', userId)
        .eq('id', id)
        .select('id,platform,name,feed_url,enabled,sport,default_league,last_synced_at,created_at,updated_at')
        .single()
      if (error) return res.status(400).json({ error: error.message })
      return res.status(200).json({
        feed: {
          id: data.id,
          platform: data.platform,
          name: data.name,
          enabled: Boolean(data.enabled),
          sport: data.sport ?? null,
          defaultLeague: data.default_league ?? null,
          lastSyncedAt: data.last_synced_at ?? null,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          maskedFeedUrl: maskUrl(String(data.feed_url || '')),
        },
      })
    }

    if (req.method === 'DELETE') {
      const id = String((req.query.id as string) || '').trim()
      if (!id) return res.status(400).json({ error: 'id query param is required' })
      const { error } = await client.from('calendar_feeds').delete().eq('user_id', userId).eq('id', id)
      if (error) return res.status(400).json({ error: error.message })
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message || e || 'Unknown error') })
  }
}
