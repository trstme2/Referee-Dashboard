import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createServiceSupabase, cronAuthorized, setApiSecurityHeaders } from '../src/server/auth-utils.js'
import { enqueueFeedSyncJobs, processDueSyncJobs } from '../src/server/sync-jobs.js'
import { recordSyncFailure, syncFeed, type Feed } from './sync-ics.js'

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

    const feedRows = (feeds ?? []) as Feed[]
    const enqueued = await enqueueFeedSyncJobs(client, feedRows, 'scheduled')

    const summaries: FeedSummary[] = []
    let queueUnavailable = enqueued.queueUnavailable

    if (queueUnavailable) {
      for (const feed of feedRows) {
        try {
          const result = await syncFeed(client, feed, { trigger: 'scheduled' })
          summaries.push({
            userId: feed.user_id,
            name: result.feedName,
            ...result,
          })
        } catch (e: any) {
          const result = await recordSyncFailure(client, feed, 'scheduled', e)
          summaries.push({
            userId: feed.user_id,
            name: feed.name,
            ...result,
          })
        }
      }
    } else {
      const processed = await processDueSyncJobs(
        client,
        async (feed, trigger) => {
          try {
            return await syncFeed(client, feed as Feed, { trigger })
          } catch (e: any) {
            return await recordSyncFailure(client, feed as Feed, trigger, e)
          }
        },
        {
          maxJobs: 10,
          maxRuntimeMs: 45_000,
          leaseOwner: 'scheduled-sync',
        }
      )
      queueUnavailable = processed.queueUnavailable
      for (const result of processed.feedResults) {
        summaries.push({
          userId: '',
          name: result.feedName,
          ...result,
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
      jobsQueued: enqueued.jobs.length,
      jobsProcessed: summaries.length,
      queueUnavailable,
      errors,
      summaries,
    })
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message ?? e ?? 'Unknown error') })
  }
}
