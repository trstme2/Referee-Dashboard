import { afterEach, describe, expect, it } from 'vitest'
import { summarizeSensitiveDataMigration } from './sensitive-data-migration.js'

const originalKey = process.env.FEED_URL_ENCRYPTION_KEY

afterEach(() => {
  process.env.FEED_URL_ENCRYPTION_KEY = originalKey
})

describe('sensitive data migration inventory', () => {
  it('counts legacy feed URLs and calendar tokens without returning their values', () => {
    process.env.FEED_URL_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64')
    const status = summarizeSensitiveDataMigration({
      feeds: [
        { id: 'plain', feed_url: 'https://assignor.example.com/feed.ics?token=secret' },
        { id: 'encrypted', feed_url: 'wkenc:v1:iv.tag.ciphertext' },
      ],
      settings: [
        { user_id: 'legacy', calendar_export_token: 'a'.repeat(64) },
        { user_id: 'hashed', calendar_export_token: `sha256:${'b'.repeat(64)}` },
        { user_id: 'missing', calendar_export_token: null },
      ],
    })

    expect(status).toEqual({
      encryptionConfigured: true,
      plaintextFeedUrls: 1,
      encryptedFeedUrls: 1,
      legacyCalendarExportTokens: 1,
      hashedCalendarExportTokens: 1,
      missingCalendarExportTokens: 1,
    })
  })
})
