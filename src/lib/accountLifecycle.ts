import { recordPlatformEvent } from './platformEvents'
import { supabase } from './supabaseClient'
import type { DB } from './types'

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

async function postAccountLifecycle(endpoint: string, accessToken: string, body?: unknown) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(String(json?.error || res.statusText))
  return json
}

export function resetCloudAccountData(accessToken: string) {
  return postAccountLifecycle('/api/account-delete', accessToken, { action: 'reset' })
}

export function deleteCloudAccount(accessToken: string) {
  return postAccountLifecycle('/api/account-delete', accessToken)
}
