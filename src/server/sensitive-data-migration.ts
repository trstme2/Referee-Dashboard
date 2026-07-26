import { hashCalendarExportToken, isFeedUrlEncrypted, isFeedUrlEncryptionConfigured, isHashedCalendarExportToken, protectFeedUrl, revealFeedUrl } from './personal-data-security.js'

type FeedRow = { id: string; feed_url: string | null }
type SettingsRow = { user_id: string; calendar_export_token: string | null }

export type SensitiveDataMigrationStatus = {
  encryptionConfigured: boolean
  plaintextFeedUrls: number
  encryptedFeedUrls: number
  legacyCalendarExportTokens: number
  hashedCalendarExportTokens: number
  missingCalendarExportTokens: number
}

function asText(value: unknown): string {
  return String(value || '').trim()
}

export function summarizeSensitiveDataMigration(rows: { feeds: FeedRow[]; settings: SettingsRow[] }): SensitiveDataMigrationStatus {
  let plaintextFeedUrls = 0
  let encryptedFeedUrls = 0
  for (const feed of rows.feeds) {
    if (isFeedUrlEncrypted(feed.feed_url)) encryptedFeedUrls += 1
    else if (asText(feed.feed_url)) plaintextFeedUrls += 1
  }

  let legacyCalendarExportTokens = 0
  let hashedCalendarExportTokens = 0
  let missingCalendarExportTokens = 0
  for (const setting of rows.settings) {
    const token = asText(setting.calendar_export_token)
    if (!token) missingCalendarExportTokens += 1
    else if (isHashedCalendarExportToken(token)) hashedCalendarExportTokens += 1
    else legacyCalendarExportTokens += 1
  }

  return {
    encryptionConfigured: isFeedUrlEncryptionConfigured(),
    plaintextFeedUrls,
    encryptedFeedUrls,
    legacyCalendarExportTokens,
    hashedCalendarExportTokens,
    missingCalendarExportTokens,
  }
}

async function loadMigrationRows(serviceClient: any): Promise<{ feeds: FeedRow[]; settings: SettingsRow[] }> {
  const [feedsResult, settingsResult] = await Promise.all([
    serviceClient.from('calendar_feeds').select('id,feed_url').limit(1000),
    serviceClient.from('user_settings').select('user_id,calendar_export_token').limit(1000),
  ])
  if (feedsResult.error) throw new Error(`calendar_feeds: ${feedsResult.error.message}`)
  if (settingsResult.error) throw new Error(`user_settings: ${settingsResult.error.message}`)
  return {
    feeds: (feedsResult.data ?? []) as FeedRow[],
    settings: (settingsResult.data ?? []) as SettingsRow[],
  }
}

export async function loadSensitiveDataMigrationStatus(serviceClient: any): Promise<SensitiveDataMigrationStatus> {
  return summarizeSensitiveDataMigration(await loadMigrationRows(serviceClient))
}

export async function migrateLegacySensitiveData(serviceClient: any) {
  const rows = await loadMigrationRows(serviceClient)
  const before = summarizeSensitiveDataMigration(rows)
  if (!before.encryptionConfigured) {
    throw new Error('FEED_URL_ENCRYPTION_KEY is not configured in the production server environment')
  }

  // Verify the configured key can read existing encrypted values before writing anything.
  for (const feed of rows.feeds) {
    if (!isFeedUrlEncrypted(feed.feed_url)) continue
    try {
      if (!revealFeedUrl(String(feed.feed_url || ''))) throw new Error('empty decrypted URL')
    } catch {
      throw new Error(`The production encryption key cannot read existing encrypted calendar feed ${feed.id}`)
    }
  }

  const now = new Date().toISOString()
  let encryptedFeeds = 0
  for (const feed of rows.feeds) {
    const plaintext = asText(feed.feed_url)
    if (!plaintext || isFeedUrlEncrypted(plaintext)) continue

    const encrypted = protectFeedUrl(plaintext)
    if (!isFeedUrlEncrypted(encrypted) || revealFeedUrl(encrypted) !== plaintext) {
      throw new Error(`Could not verify encrypted calendar feed ${feed.id}`)
    }

    const { data, error } = await serviceClient
      .from('calendar_feeds')
      .update({ feed_url: encrypted, updated_at: now })
      .eq('id', feed.id)
      .eq('feed_url', feed.feed_url)
      .select('feed_url')
      .maybeSingle()
    if (error) throw new Error(`calendar_feeds: ${error.message}`)
    if (!data || revealFeedUrl(String(data.feed_url || '')) !== plaintext) {
      throw new Error(`Calendar feed ${feed.id} changed while the migration was running`)
    }
    encryptedFeeds += 1
  }

  let hashedCalendarExportTokens = 0
  for (const setting of rows.settings) {
    const legacyToken = asText(setting.calendar_export_token)
    if (!legacyToken || isHashedCalendarExportToken(legacyToken)) continue

    const protectedToken = hashCalendarExportToken(legacyToken)
    const { data, error } = await serviceClient
      .from('user_settings')
      .update({ calendar_export_token: protectedToken, updated_at: now })
      .eq('user_id', setting.user_id)
      .eq('calendar_export_token', setting.calendar_export_token)
      .select('calendar_export_token')
      .maybeSingle()
    if (error) throw new Error(`user_settings: ${error.message}`)
    if (!data || !isHashedCalendarExportToken(data.calendar_export_token)) {
      throw new Error('A calendar subscription token changed while the migration was running')
    }
    hashedCalendarExportTokens += 1
  }

  const after = await loadSensitiveDataMigrationStatus(serviceClient)
  if (after.plaintextFeedUrls !== 0 || after.legacyCalendarExportTokens !== 0) {
    throw new Error('Sensitive-data migration did not complete cleanly; no credentials were returned')
  }

  return {
    encryptedFeeds,
    hashedCalendarExportTokens,
    before,
    after,
  }
}
