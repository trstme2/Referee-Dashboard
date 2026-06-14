import { afterEach, describe, expect, it } from 'vitest'
import { protectFeedUrl, revealFeedUrl } from './personal-data-security.js'

const originalKey = process.env.FEED_URL_ENCRYPTION_KEY

afterEach(() => {
  process.env.FEED_URL_ENCRYPTION_KEY = originalKey
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
})
