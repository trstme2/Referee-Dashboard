import { describe, expect, it, vi } from 'vitest'
import { fetchCalendarFeedText, fetchCalendarFeedTextWithRetry, validateFeedUrl } from './feed-fetch.js'

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

  it('retries transient feed fetch failures', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('try again', { status: 503 }))
      .mockResolvedValueOnce(new Response('BEGIN:VCALENDAR\nEND:VCALENDAR', {
        status: 200,
        headers: { 'content-type': 'text/calendar' },
      }))

    const result = await fetchCalendarFeedTextWithRetry('https://8.8.8.8/calendar.ics', fetchImpl as any)

    expect(result.attempts).toBe(2)
    expect(result.text).toContain('BEGIN:VCALENDAR')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('does not retry unsafe feed hosts', async () => {
    const fetchImpl = vi.fn()

    await expect(fetchCalendarFeedTextWithRetry('https://127.0.0.1/calendar.ics', fetchImpl as any)).rejects.toMatchObject({ attempts: 1 })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
