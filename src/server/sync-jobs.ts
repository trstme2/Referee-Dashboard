export type SyncJobStatus = 'queued' | 'running' | 'succeeded' | 'partial' | 'failed'
export type SyncJobTrigger = 'manual' | 'scheduled'

export type SyncJobFeed = {
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

export type SyncJobResult = {
  feedId: string
  feedName: string
  platform: string
  status: 'success' | 'partial' | 'failed'
  attempts: number
  startedAt: string
  finishedAt: string
  durationMs: number
  createdEvents: number
  updatedEvents: number
  createdGames: number
  updatedGames: number
  autoMileageUpdatedGames?: number
  staleCanceledEvents?: number
  staleCanceledGames?: number
  errors: string[]
  diagnostics?: unknown
}

export type CalendarSyncJob = {
  id: string
  userId: string
  feedId: string
  feedName: string
  platform: string
  trigger: SyncJobTrigger | string
  status: SyncJobStatus | string
  attempts: number
  maxAttempts: number
  runAfter: string
  leaseExpiresAt?: string
  startedAt?: string
  finishedAt?: string
  lastError?: string
  result?: unknown
  createdAt: string
  updatedAt: string
}

export type ProcessSyncJobsOptions = {
  userId?: string
  maxJobs?: number
  maxRuntimeMs?: number
  leaseMs?: number
  leaseOwner?: string
}

export type ProcessSyncJobsSummary = {
  queueUnavailable?: string
  jobsClaimed: number
  jobsCompleted: number
  jobsRequeued: number
  jobsFailed: number
  feedResults: SyncJobResult[]
  errors: string[]
}

const ACTIVE_JOB_STATUSES = ['queued', 'running'] as const
const FINAL_JOB_STATUSES = ['succeeded', 'partial', 'failed'] as const

export function isSyncJobTableMissing(error: any): boolean {
  const message = String(error?.message ?? error ?? '')
  const code = String(error?.code ?? '')
  return code === '42P01' ||
    code === 'PGRST205' ||
    message.includes('calendar_sync_jobs') ||
    message.includes('Could not find the table')
}

function nowIso() {
  return new Date().toISOString()
}

function addMs(value: string, ms: number) {
  return new Date(new Date(value).getTime() + ms).toISOString()
}

function retryDelayMs(attempts: number) {
  return Math.min(60 * 60 * 1000, Math.max(1, attempts) * 5 * 60 * 1000)
}

function rowToJob(row: any): CalendarSyncJob {
  return {
    id: row.id,
    userId: row.user_id,
    feedId: row.feed_id,
    feedName: row.feed_name,
    platform: row.platform,
    trigger: row.trigger,
    status: row.status,
    attempts: Number(row.attempts ?? 0),
    maxAttempts: Number(row.max_attempts ?? 3),
    runAfter: row.run_after,
    leaseExpiresAt: row.lease_expires_at ?? undefined,
    startedAt: row.started_at ?? undefined,
    finishedAt: row.finished_at ?? undefined,
    lastError: row.last_error ?? undefined,
    result: row.result ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function enqueueFeedSyncJobs(
  client: any,
  feeds: SyncJobFeed[],
  trigger: SyncJobTrigger,
  options: { runAfter?: string; maxAttempts?: number } = {}
): Promise<{ jobs: CalendarSyncJob[]; queueUnavailable?: string }> {
  const eligibleFeeds = feeds.filter(feed => feed?.id && feed?.user_id)
  if (!eligibleFeeds.length) return { jobs: [] }

  const userIds = Array.from(new Set(eligibleFeeds.map(feed => feed.user_id)))
  const feedIds = eligibleFeeds.map(feed => feed.id)

  const existingRes = await client
    .from('calendar_sync_jobs')
    .select('id,user_id,feed_id,feed_name,platform,trigger,status,attempts,max_attempts,run_after,lease_expires_at,started_at,finished_at,last_error,result,created_at,updated_at')
    .in('user_id', userIds)
    .in('feed_id', feedIds)
    .in('status', ACTIVE_JOB_STATUSES)

  if (existingRes.error) {
    if (isSyncJobTableMissing(existingRes.error)) {
      return { jobs: [], queueUnavailable: 'Durable sync job table has not been added yet.' }
    }
    throw existingRes.error
  }

  const existingFeedIds = new Set((existingRes.data ?? []).map((row: any) => String(row.feed_id)))
  const rows = eligibleFeeds
    .filter(feed => !existingFeedIds.has(String(feed.id)))
    .map(feed => ({
      user_id: feed.user_id,
      feed_id: feed.id,
      feed_name: feed.name,
      platform: feed.platform,
      trigger,
      status: 'queued',
      priority: trigger === 'manual' ? 20 : 10,
      attempts: 0,
      max_attempts: options.maxAttempts ?? 3,
      run_after: options.runAfter ?? nowIso(),
    }))

  if (!rows.length) {
    return { jobs: (existingRes.data ?? []).map(rowToJob) }
  }

  const insertRes = await client
    .from('calendar_sync_jobs')
    .insert(rows)
    .select('id,user_id,feed_id,feed_name,platform,trigger,status,attempts,max_attempts,run_after,lease_expires_at,started_at,finished_at,last_error,result,created_at,updated_at')

  if (insertRes.error) {
    if (isSyncJobTableMissing(insertRes.error)) {
      return { jobs: [], queueUnavailable: 'Durable sync job table has not been added yet.' }
    }
    if (String(insertRes.error.code || '') === '23505') {
      const retryRes = await client
        .from('calendar_sync_jobs')
        .select('id,user_id,feed_id,feed_name,platform,trigger,status,attempts,max_attempts,run_after,lease_expires_at,started_at,finished_at,last_error,result,created_at,updated_at')
        .in('user_id', userIds)
        .in('feed_id', feedIds)
        .in('status', ACTIVE_JOB_STATUSES)
      if (!retryRes.error) return { jobs: (retryRes.data ?? []).map(rowToJob) }
    }
    throw insertRes.error
  }

  return {
    jobs: [
      ...(existingRes.data ?? []).map(rowToJob),
      ...(insertRes.data ?? []).map(rowToJob),
    ],
  }
}

export async function loadSyncJobsForUser(client: any, userId: string, limit = 25): Promise<{ jobs: CalendarSyncJob[]; queueUnavailable?: string }> {
  const { data, error } = await client
    .from('calendar_sync_jobs')
    .select('id,user_id,feed_id,feed_name,platform,trigger,status,attempts,max_attempts,run_after,lease_expires_at,started_at,finished_at,last_error,result,created_at,updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    if (isSyncJobTableMissing(error)) return { jobs: [], queueUnavailable: 'Durable sync job table has not been added yet.' }
    throw error
  }

  return { jobs: (data ?? []).map(rowToJob) }
}

async function claimSyncJob(client: any, row: any, leaseOwner: string, leaseMs: number): Promise<any | null> {
  const now = nowIso()
  const leaseExpiresAt = addMs(now, leaseMs)
  const nextAttempts = Number(row.attempts ?? 0) + 1
  const update: Record<string, unknown> = {
    status: 'running',
    attempts: nextAttempts,
    lease_owner: leaseOwner,
    lease_expires_at: leaseExpiresAt,
    updated_at: now,
  }
  if (!row.started_at) update.started_at = now

  const result = await client
    .from('calendar_sync_jobs')
    .update(update)
    .eq('id', row.id)
    .eq('status', row.status)
    .select('id,user_id,feed_id,feed_name,platform,trigger,status,attempts,max_attempts,run_after,lease_expires_at,started_at,finished_at,last_error,result,created_at,updated_at')
    .maybeSingle()

  if (result.error) throw result.error
  return result.data ?? null
}

async function finishJob(client: any, job: any, result: SyncJobResult): Promise<'completed' | 'requeued' | 'failed'> {
  const now = nowIso()
  const shouldRetry = result.status === 'failed' && Number(job.attempts ?? 0) < Number(job.max_attempts ?? 3)
  const nextStatus = result.status === 'success' ? 'succeeded' : result.status

  if (shouldRetry) {
    const retryAt = addMs(now, retryDelayMs(Number(job.attempts ?? 1)))
    const { error } = await client
      .from('calendar_sync_jobs')
      .update({
        status: 'queued',
        run_after: retryAt,
        lease_owner: null,
        lease_expires_at: null,
        last_error: result.errors[0] ?? 'Sync failed and will retry.',
        result,
        updated_at: now,
      })
      .eq('id', job.id)
    if (error) throw error
    return 'requeued'
  }

  const { error } = await client
    .from('calendar_sync_jobs')
    .update({
      status: nextStatus,
      lease_owner: null,
      lease_expires_at: null,
      finished_at: now,
      last_error: result.errors[0] ?? null,
      result,
      updated_at: now,
    })
    .eq('id', job.id)
  if (error) throw error
  return nextStatus === 'failed' ? 'failed' : 'completed'
}

async function failClaimedJob(client: any, job: any, errorValue: unknown): Promise<'requeued' | 'failed'> {
  const now = nowIso()
  const message = String((errorValue as any)?.message ?? errorValue ?? 'Sync job failed')
  const attempts = Number(job.attempts ?? 1)
  const maxAttempts = Number(job.max_attempts ?? 3)

  if (attempts < maxAttempts) {
    const { error } = await client
      .from('calendar_sync_jobs')
      .update({
        status: 'queued',
        run_after: addMs(now, retryDelayMs(attempts)),
        lease_owner: null,
        lease_expires_at: null,
        last_error: message,
        updated_at: now,
      })
      .eq('id', job.id)
    if (error) throw error
    return 'requeued'
  }

  const { error } = await client
    .from('calendar_sync_jobs')
    .update({
      status: 'failed',
      lease_owner: null,
      lease_expires_at: null,
      finished_at: now,
      last_error: message,
      result: { status: 'failed', errors: [message] },
      updated_at: now,
    })
    .eq('id', job.id)
  if (error) throw error
  return 'failed'
}

export async function processDueSyncJobs(
  client: any,
  processor: (feed: SyncJobFeed, trigger: SyncJobTrigger) => Promise<SyncJobResult>,
  options: ProcessSyncJobsOptions = {}
): Promise<ProcessSyncJobsSummary> {
  const maxJobs = Math.max(1, options.maxJobs ?? 5)
  const maxRuntimeMs = Math.max(1000, options.maxRuntimeMs ?? 25_000)
  const leaseMs = Math.max(30_000, options.leaseMs ?? 5 * 60 * 1000)
  const startedAt = Date.now()
  const leaseOwner = options.leaseOwner ?? `sync-${startedAt}-${Math.random().toString(36).slice(2)}`
  const summary: ProcessSyncJobsSummary = {
    jobsClaimed: 0,
    jobsCompleted: 0,
    jobsRequeued: 0,
    jobsFailed: 0,
    feedResults: [],
    errors: [],
  }

  while (summary.jobsClaimed < maxJobs && Date.now() - startedAt < maxRuntimeMs) {
    const now = nowIso()
    let query = client
      .from('calendar_sync_jobs')
      .select('id,user_id,feed_id,feed_name,platform,trigger,status,attempts,max_attempts,run_after,lease_expires_at,started_at,finished_at,last_error,result,created_at,updated_at')
      .in('status', ACTIVE_JOB_STATUSES)
      .lte('run_after', now)
      .order('priority', { ascending: false })
      .order('run_after', { ascending: true })
      .limit(maxJobs - summary.jobsClaimed)

    if (options.userId) query = query.eq('user_id', options.userId)

    const { data, error } = await query
    if (error) {
      if (isSyncJobTableMissing(error)) {
        return { ...summary, queueUnavailable: 'Durable sync job table has not been added yet.' }
      }
      throw error
    }

    const candidates = (data ?? []).filter((row: any) =>
      row.status === 'queued' ||
      (row.status === 'running' && row.lease_expires_at && row.lease_expires_at <= now)
    )
    if (!candidates.length) break

    let progressed = false
    for (const row of candidates) {
      if (summary.jobsClaimed >= maxJobs || Date.now() - startedAt >= maxRuntimeMs) break
      const job = await claimSyncJob(client, row, leaseOwner, leaseMs)
      if (!job) continue
      progressed = true
      summary.jobsClaimed += 1

      try {
        const feedRes = await client
          .from('calendar_feeds')
          .select('*')
          .eq('id', job.feed_id)
          .eq('user_id', job.user_id)
          .maybeSingle()

        if (feedRes.error) throw feedRes.error
        if (!feedRes.data) throw new Error(`Feed ${job.feed_name} no longer exists.`)
        if (feedRes.data.enabled === false) throw new Error(`Feed ${job.feed_name} is disabled.`)

        const result = await processor(feedRes.data as SyncJobFeed, job.trigger === 'scheduled' ? 'scheduled' : 'manual')
        summary.feedResults.push(result)
        const disposition = await finishJob(client, job, result)
        if (disposition === 'completed') summary.jobsCompleted += 1
        else if (disposition === 'requeued') summary.jobsRequeued += 1
        else summary.jobsFailed += 1
      } catch (e: any) {
        const message = String(e?.message ?? e)
        summary.errors.push(message)
        const disposition = await failClaimedJob(client, job, e)
        if (disposition === 'requeued') summary.jobsRequeued += 1
        else summary.jobsFailed += 1
      }
    }

    if (!progressed) break
  }

  return summary
}

export function finalSyncJobStatuses() {
  return FINAL_JOB_STATUSES
}
