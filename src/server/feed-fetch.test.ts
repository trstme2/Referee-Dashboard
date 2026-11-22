import { afterEach, describe, expect, it, vi } from 'vitest'
import dns from 'node:dns/promises'
import tls from 'node:tls'
import { fetchCalendarFeedText, fetchCalendarFeedTextWithRetry, validateFeedUrl } from './feed-fetch.js'

describe('calendar feed fetch hardening', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

  it.each(['[::1]', '[::ffff:127.0.0.1]', '[::ffff:7f00:1]',
    '[0:0:0:0:0:ffff:a00:1]', '[fc00::1]', '[fe80::1]',
    '[2002:7f00:1::]', '[2001:db8::1]', '169.254.169.254'])(
    'blocks special-use address %s', async host => {
      const fetchImpl = vi.fn()
      await expect(fetchCalendarFeedText(`https://${host}/feed`, fetchImpl)).rejects.toThrow(/not allowed/)
      expect(fetchImpl).not.toHaveBeenCalled()
    })

  it('pins the actual TLS connection to the checked DNS answer and retains SNI', async () => {
    const lookup = vi.spyOn(dns, 'lookup')
      .mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }] as any)
      .mockResolvedValue([{ address: '127.0.0.1', family: 4 }] as any)
    const connect = vi.spyOn(tls, 'connect').mockImplementation(() => {
      throw new Error('test stops before opening a socket')
    })
    await expect(fetchCalendarFeedText('https://calendar.example/feed')).rejects.toThrow()
    expect(connect).toHaveBeenCalledTimes(1)
    const options = connect.mock.calls[0][0] as tls.ConnectionOptions
    expect(options.servername).toBe('calendar.example')
    expect(options.rejectUnauthorized).not.toBe(false)
    const callback = vi.fn()
    options.lookup!('calendar.example', { all: true }, callback)
    expect(callback).toHaveBeenCalledWith(null, [{ address: '8.8.8.8', family: 4 }])
    expect(lookup).toHaveBeenCalledTimes(1)
  })

  it('rejects mixed public/private DNS answers before fetching', async () => {
    vi.spyOn(dns, 'lookup').mockResolvedValue([
      { address: '8.8.8.8', family: 4 }, { address: '::ffff:7f00:1', family: 6 },
    ] as any)
    const fetchImpl = vi.fn()
    await expect(fetchCalendarFeedText('https://calendar.example/feed', fetchImpl)).rejects.toThrow(/not allowed/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('checks redirect destinations and cancels the previous response', async () => {
    const cancel = vi.fn()
    const response = new Response(new ReadableStream({ cancel }), {
      status: 302, headers: { location: 'https://169.254.169.254/latest/meta-data/' },
    })
    const fetchImpl = vi.fn().mockResolvedValue(response)
    await expect(fetchCalendarFeedText('https://8.8.8.8/feed', fetchImpl)).rejects.toThrow(/not allowed/)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(cancel).toHaveBeenCalled()
  })

  it('bounds a stalled DNS lookup', async () => {
    vi.useFakeTimers()
    vi.spyOn(dns, 'lookup').mockImplementation(() => new Promise(() => {}))
    const result = expect(fetchCalendarFeedText('https://calendar.example/feed', vi.fn())).rejects.toThrow(/timeout/)
    await vi.advanceTimersByTimeAsync(8000)
    await result
  })

  it('requires https feed URLs by default', () => {
    expect(() => validateFeedUrl('http://example.com/calendar.ics')).toThrow(/https/i)
  })

  it('accepts webcal feed URLs by normalizing them to https', () => {
    expect(validateFeedUrl('webcal://example.com/calendar.ics')).toBe('https://example.com/calendar.ics')
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

  it('rejects empty provider responses instead of treating them as a healthy feed', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, {
      status: 204,
      headers: { 'content-type': 'text/calendar' },
    }))

    await expect(fetchCalendarFeedText('https://8.8.8.8/calendar.ics', fetchImpl as any)).rejects.toThrow(/no calendar data/i)
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

  it('retries an empty provider response before reporting a failure', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response('BEGIN:VCALENDAR\nEND:VCALENDAR', {
        status: 200,
        headers: { 'content-type': 'text/calendar' },
      }))

    const result = await fetchCalendarFeedTextWithRetry('https://8.8.8.8/calendar.ics', fetchImpl as any)

    expect(result.attempts).toBe(2)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('does not retry unsafe feed hosts', async () => {
    const fetchImpl = vi.fn()

    await expect(fetchCalendarFeedTextWithRetry('https://127.0.0.1/calendar.ics', fetchImpl as any)).rejects.toMatchObject({ attempts: 1 })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
