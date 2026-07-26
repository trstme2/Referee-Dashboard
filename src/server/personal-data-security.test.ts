import { afterEach, describe, expect, it } from 'vitest'
import { isFeedUrlEncrypted, protectFeedUrl, revealFeedUrl } from './personal-data-security.js'

const originalKey = process.env.FEED_URL_ENCRYPTION_KEY
const originalVercelEnv = process.env.VERCEL_ENV

afterEach(() => {
  process.env.FEED_URL_ENCRYPTION_KEY = originalKey
  process.env.VERCEL_ENV = originalVercelEnv
})

describe('feed URL protection', () => {
  it('keeps legacy plaintext readable when encryption is not configured', () => {
    delete process.env.FEED_URL_ENCRYPTION_KEY
    const url = 'https://assignor.example.com/private-calendar.ics?token=secret'

    expect(protectFeedUrl(url)).toBe(url)
    expect(revealFeedUrl(url)).toBe(url)
  })

  it('encrypts feed URLs at rest when an encryption key is configured', () => {
    process.env.FEED_URL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
    const url = 'https://assignor.example.com/private-calendar.ics?token=secret'

    const stored = protectFeedUrl(url)

    expect(stored).not.toContain('assignor.example.com')
    expect(stored).toMatch(/^wkenc:v1:/)
    expect(revealFeedUrl(stored)).toBe(url)
  })

  it('refuses to save plaintext feed URLs in production', () => {
    delete process.env.FEED_URL_ENCRYPTION_KEY
    process.env.VERCEL_ENV = 'production'

    expect(() => protectFeedUrl('https://assignor.example.com/calendar.ics?token=secret')).toThrow('FEED_URL_ENCRYPTION_KEY')
  })

  it('identifies the encrypted storage format without exposing the source URL', () => {
    process.env.FEED_URL_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString('base64')
    const stored = protectFeedUrl('https://assignor.example.com/private-calendar.ics?token=secret')

    expect(isFeedUrlEncrypted(stored)).toBe(true)
    expect(isFeedUrlEncrypted('https://assignor.example.com/private-calendar.ics?token=secret')).toBe(false)
  })
})
