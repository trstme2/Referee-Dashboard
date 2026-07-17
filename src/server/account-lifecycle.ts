const STORAGE_BUCKETS = ['expense-receipts', 'requirement-evidence'] as const
const STORAGE_LIST_PAGE_SIZE = 1000

const ACCOUNT_DATA_TABLES = [
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
  'app_events',
] as const

const OPTIONAL_TABLES = new Set<string>(['calendar_sync_jobs', 'calendar_feed_sync_runs', 'app_events'])

function isMissingOptionalTableError(error: any, table: string) {
  const code = String(error?.code ?? '')
  const message = String(error?.message ?? error ?? '')
  return code === '42P01' || code === 'PGRST205' || (message.includes(table) && (message.includes('does not exist') || message.includes('schema cache')))
}

async function listStoragePaths(client: any, bucket: string, prefix: string): Promise<string[]> {
  const files: string[] = []

  async function walk(currentPrefix: string): Promise<void> {
    let offset = 0
    while (true) {
      const { data, error } = await client.storage.from(bucket).list(currentPrefix, {
        limit: STORAGE_LIST_PAGE_SIZE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })
      if (error) throw new Error(`List ${bucket}: ${error.message}`)
      const entries = data ?? []
      for (const entry of entries) {
        const path = `${currentPrefix}/${entry.name}`
        if (entry.id) files.push(path)
        else await walk(path)
      }
      if (entries.length < STORAGE_LIST_PAGE_SIZE) break
      offset += entries.length
    }
  }

  await walk(prefix)
  return files
}

async function deleteStorageFiles(client: any, bucket: string, paths: string[]): Promise<number> {
  let deleted = 0
  for (let index = 0; index < paths.length; index += STORAGE_LIST_PAGE_SIZE) {
    const chunk = paths.slice(index, index + STORAGE_LIST_PAGE_SIZE)
    const { error } = await client.storage.from(bucket).remove(chunk)
    if (error) throw new Error(`Delete ${bucket}: ${error.message}`)
    deleted += chunk.length
  }
  return deleted
}

export async function deleteUserStorageFiles(serviceClient: any, userId: string): Promise<number> {
  let deleted = 0
  for (const bucket of STORAGE_BUCKETS) {
    const paths = await listStoragePaths(serviceClient, bucket, userId)
    deleted += await deleteStorageFiles(serviceClient, bucket, paths)
  }
  return deleted
}

export async function deleteAccountData(serviceClient: any, userId: string, options?: { includeProfile?: boolean }) {
  const deletedFiles = await deleteUserStorageFiles(serviceClient, userId)
  const tables = options?.includeProfile ? [...ACCOUNT_DATA_TABLES, 'user_profiles'] : ACCOUNT_DATA_TABLES
  for (const table of tables) {
    const { error } = await serviceClient.from(table).delete().eq('user_id', userId)
    if (error && OPTIONAL_TABLES.has(table) && isMissingOptionalTableError(error, table)) continue
    if (error) throw new Error(`${table}: ${error.message}`)
  }
  return { deletedFiles }
}
