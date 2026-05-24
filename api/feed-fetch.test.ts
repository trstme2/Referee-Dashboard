import { describe, expect, it, vi } from 'vitest'
import { fetchCalendarFeedText, validateFeedUrl } from './feed-fetch.js'

describe('calendar feed fetch hardening', () => {
  it('requires https feed URLs by default', () => {
    expect(() => validateFeedUrl('http://example.com/calendar.ics')).toThrow(/https/i)
  })

  it('blocks loopback feed hosts before fetching', async () => {
    const fetchImpl = vi.fn()

    await expect(fetchCalendarFeedText('https://127.0.0.1/calendar.ics', fetchImpl as any)).rejects.toThrow(/not allowed/i)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects oversized calendar responses', async () => {
    const body = 'A'.repeat(2 * 1024 * 1024 + 1)
    const fetchImpl = vi.fn(async () => new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/calendar' },
    }))

    await expect(fetchCalendarFeedText('https://8.8.8.8/calendar.ics', fetchImpl as any)).rejects.toThrow(/too large/i)
  })

  it('rejects html responses', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html></html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    }))

    await expect(fetchCalendarFeedText('https://8.8.8.8/calendar.ics', fetchImpl as any)).rejects.toThrow(/content type/i)
  })
})
