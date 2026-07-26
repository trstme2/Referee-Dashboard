import { afterEach, describe, expect, it } from 'vitest'
import { calendarExportTokenLookupValues } from './calendar-export-utils.js'
import { isHashedCalendarExportToken } from './personal-data-security.js'
import { migrateLegacySensitiveData, summarizeSensitiveDataMigration } from './sensitive-data-migration.js'

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

  it('hashes a legacy subscription token without changing the calendar URL that uses it', async () => {
    const token = 'c'.repeat(64)
    const state = {
      feeds: [] as Array<{ id: string; feed_url: string | null }>,
      settings: [{ user_id: 'user-1', calendar_export_token: token }],
    }
    process.env.FEED_URL_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64')

    const client = {
      from(table: string) {
        if (table === 'calendar_feeds') {
          return {
            select: () => ({ limit: async () => ({ data: state.feeds, error: null }) }),
          }
        }

        return {
          select: () => ({ limit: async () => ({ data: state.settings, error: null }) }),
          update(values: Record<string, string>) {
            const matches: Array<[string, unknown]> = []
            const query = {
              eq(column: string, value: unknown) {
                matches.push([column, value])
                return query
              },
              select() {
                return {
                  maybeSingle: async () => {
                    const setting = state.settings.find((candidate) => matches.every(([column, value]) => candidate[column as keyof typeof candidate] === value))
                    if (!setting) return { data: null, error: null }
                    Object.assign(setting, values)
                    return { data: { calendar_export_token: setting.calendar_export_token }, error: null }
                  },
                }
              },
            }
            return query
          },
        }
      },
    }

    const migration = await migrateLegacySensitiveData(client)

    expect(migration.hashedCalendarExportTokens).toBe(1)
    expect(isHashedCalendarExportToken(state.settings[0].calendar_export_token)).toBe(true)
    expect(calendarExportTokenLookupValues(token)).toContain(state.settings[0].calendar_export_token)
  })
})
