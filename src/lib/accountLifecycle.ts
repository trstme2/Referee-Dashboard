import { EXPENSE_RECEIPT_BUCKET, REQUIREMENT_EVIDENCE_BUCKET } from './documents'
import { recordPlatformEvent } from './platformEvents'
import { supabase } from './supabaseClient'
import type { DB } from './types'

export const ACCOUNT_TABLE_DELETE_ORDER = [
  'csv_import_rows',
  'csv_imports',
  'requirement_activities',
  'requirement_instances',
  'requirement_definitions',
  'expenses',
  'calendar_events',
  'games',
  'calendar_sync_jobs',
  'calendar_feed_sync_runs',
  'calendar_feeds',
  'user_settings',
] as const

const OPTIONAL_ACCOUNT_TABLES = new Set<string>(['calendar_feed_sync_runs', 'calendar_sync_jobs'])

export function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function evidencePaths(db: DB) {
  return {
    expenseReceipts: db.expenses.map((expense) => expense.receiptStoragePath).filter((path): path is string => Boolean(path)),
    requirementEvidence: db.requirementActivities.map((activity) => activity.evidenceStoragePath).filter((path): path is string => Boolean(path)),
  }
}

export function isMissingOptionalTableError(error: any, table: string) {
  const code = String(error?.code ?? '')
  const message = String(error?.message ?? error ?? '')
  if (code === '42P01' || code === 'PGRST205') return true
  if (message.includes('Could not find the table')) return true
  if (message.includes(table) && (message.includes('does not exist') || message.includes('schema cache'))) return true
  return false
}

export async function calendarFeedsForExport(accessToken?: string) {
  if (!accessToken) return []
  const res = await fetch('/api/calendar-feeds', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) return []
  const json = await res.json().catch(() => ({}))
  return json.feeds ?? []
}

export async function syncHistoryForExport(accessToken?: string) {
  if (!accessToken) return []
  const res = await fetch('/api/sync-ics?history=1&limit=50', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) return []
  const json = await res.json().catch(() => ({}))
  return json.history ?? []
}

export async function syncJobsForExport(accessToken?: string) {
  if (!accessToken) return []
  const res = await fetch('/api/sync-ics?history=1&limit=50', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) return []
  const json = await res.json().catch(() => ({}))
  return json.jobs ?? []
}

export async function platformProfileForExport(userId: string) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('user_profiles')
    .select('user_id,email,role,subscription_tier,subscription_status,created_at,updated_at,last_seen_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (error && isMissingOptionalTableError(error, 'user_profiles')) return null
  if (error) throw new Error(`Export platform profile: ${error.message}`)
  return data ?? null
}

export async function appEventsForExport(userId: string) {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('app_events')
    .select('id,event_type,event_source,metadata,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(5000)
  if (error && isMissingOptionalTableError(error, 'app_events')) return []
  if (error) throw new Error(`Export app events: ${error.message}`)
  return data ?? []
}

export async function exportAccountData(db: DB, user: { id: string; email?: string | null }, accessToken?: string) {
  const exportData = {
    exportedAt: new Date().toISOString(),
    exportType: 'whistle-keeper-account-data',
    user: {
      id: user.id,
      email: user.email,
    },
    note: 'Receipt and requirement evidence files are not embedded in this JSON export. File paths and filenames are included where saved.',
    data: db,
    platformProfile: await platformProfileForExport(user.id),
    appEvents: await appEventsForExport(user.id),
    calendarFeeds: await calendarFeedsForExport(accessToken),
    syncHistory: await syncHistoryForExport(accessToken),
    syncJobs: await syncJobsForExport(accessToken),
    fileReferences: evidencePaths(db),
  }
  downloadJson(`whistle-keeper-account-data-${new Date().toISOString().slice(0, 10)}.json`, exportData)
  await recordPlatformEvent(accessToken, 'account_exported')
}

export async function deleteOwnAppEvents(userId: string) {
  if (!supabase) throw new Error('Supabase client missing')
  const { error } = await supabase.from('app_events').delete().eq('user_id', userId)
  if (error && !isMissingOptionalTableError(error, 'app_events')) {
    throw new Error(`Delete app events: ${error.message}`)
  }
}

export async function removeStorageFiles(db: DB) {
  if (!supabase) throw new Error('Supabase client missing')
  const paths = evidencePaths(db)
  if (paths.expenseReceipts.length) {
    const { error } = await supabase.storage.from(EXPENSE_RECEIPT_BUCKET).remove(paths.expenseReceipts)
    if (error) throw new Error(`Delete expense receipts: ${error.message}`)
  }
  if (paths.requirementEvidence.length) {
    const { error } = await supabase.storage.from(REQUIREMENT_EVIDENCE_BUCKET).remove(paths.requirementEvidence)
    if (error) throw new Error(`Delete requirement evidence: ${error.message}`)
  }
}

export async function deleteSyncHistory(userId: string) {
  if (!supabase) throw new Error('Supabase client missing')
  const { error: jobsError } = await supabase.from('calendar_sync_jobs').delete().eq('user_id', userId)
  if (jobsError && !isMissingOptionalTableError(jobsError, 'calendar_sync_jobs')) {
    throw new Error(`Delete sync jobs: ${jobsError.message}`)
  }
  const { error } = await supabase.from('calendar_feed_sync_runs').delete().eq('user_id', userId)
  if (error && !isMissingOptionalTableError(error, 'calendar_feed_sync_runs')) {
    throw new Error(`Delete sync history: ${error.message}`)
  }
}

export async function deleteCalendarFeeds(userId: string) {
  if (!supabase) throw new Error('Supabase client missing')
  const { error } = await supabase.from('calendar_feeds').delete().eq('user_id', userId)
  if (error) throw new Error(`Delete calendar feeds: ${error.message}`)
}

export async function purgeCloudRows(userId: string) {
  if (!supabase) throw new Error('Supabase client missing')
  for (const table of ACCOUNT_TABLE_DELETE_ORDER) {
    const { error } = await supabase.from(table).delete().eq('user_id', userId)
    if (error && OPTIONAL_ACCOUNT_TABLES.has(table) && isMissingOptionalTableError(error, table)) continue
    if (error) throw new Error(`Delete ${table}: ${error.message}`)
  }
}
