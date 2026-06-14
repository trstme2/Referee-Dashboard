import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createServiceSupabase, cronAuthorized, setApiSecurityHeaders } from '../src/server/auth-utils.js'
import { syncFeed, type Feed } from './sync-ics.js'

type FeedSummary = {
  feedId: string
  userId: string
  name: string
  platform: string
  status: 'success' | 'partial' | 'failed'
  attempts: number
  durationMs: number
  startedAt: string
  finishedAt: string
  createdEvents: number
  updatedEvents: number
  createdGames: number
  updatedGames: number
  errors: string[]
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setApiSecurityHeaders(res)

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!cronAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' })

  try {
    const startedAtMs = Date.now()
    const startedAt = new Date(startedAtMs).toISOString()
    const client = createServiceSupabase()
    const { data: feeds, error } = await client
      .from('calendar_feeds')
      .select('*')
      .eq('enabled', true)
      .order('last_synced_at', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true })

    if (error) return res.status(400).json({ error: error.message })

    const summaries: FeedSummary[] = []
    for (const feed of (feeds ?? []) as Feed[]) {
      try {
        const result = await syncFeed(client, feed)
        summaries.push({
          userId: feed.user_id,
          name: result.feedName,
          ...result,
        })
      } catch (e: any) {
        summaries.push({
          feedId: feed.id,
          userId: feed.user_id,
          name: feed.name,
          platform: feed.platform,
          status: 'failed',
          attempts: 0,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          durationMs: 0,
          createdEvents: 0,
          updatedEvents: 0,
          createdGames: 0,
          updatedGames: 0,
          errors: [String(e?.message ?? e)],
        })
      }
    }

    const errors = summaries.flatMap((s) => s.errors)
    const finishedAtMs = Date.now()
    return res.status(errors.length ? 207 : 200).json({
      startedAt,
      finishedAt: new Date(finishedAtMs).toISOString(),
      durationMs: finishedAtMs - startedAtMs,
      feeds: summaries.length,
      succeededFeeds: summaries.filter((s) => s.status === 'success').length,
      partialFeeds: summaries.filter((s) => s.status === 'partial').length,
      failedFeeds: summaries.filter((s) => s.status === 'failed').length,
      createdEvents: summaries.reduce((sum, s) => sum + s.createdEvents, 0),
      updatedEvents: summaries.reduce((sum, s) => sum + s.updatedEvents, 0),
      createdGames: summaries.reduce((sum, s) => sum + s.createdGames, 0),
      updatedGames: summaries.reduce((sum, s) => sum + s.updatedGames, 0),
      errors,
      summaries,
    })
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message ?? e ?? 'Unknown error') })
  }
}
