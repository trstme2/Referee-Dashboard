import { afterEach, describe, expect, it } from 'vitest'
import { checkRateLimit, cronAuthorized } from './auth-utils.js'
import type { VercelRequest } from '@vercel/node'

const oldCronSecret = process.env.CRON_SECRET

function req(headers: Record<string, string> = {}, remoteAddress = '203.0.113.10'): VercelRequest {
  return {
    headers,
    socket: { remoteAddress },
  } as unknown as VercelRequest
}

afterEach(() => {
  if (oldCronSecret == null) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = oldCronSecret
})

describe('api auth hardening helpers', () => {
  it('requires an exact bearer token for cron authorization', () => {
    process.env.CRON_SECRET = 'secret-value'

    expect(cronAuthorized(req({ authorization: 'Bearer secret-value' }))).toBe(true)
    expect(cronAuthorized(req({ authorization: 'Bearer wrong-value' }))).toBe(false)
    expect(cronAuthorized(req({ authorization: 'secret-value' }))).toBe(false)
  })

  it('rate limits by bucket and client address', () => {
    const first = checkRateLimit(req({}, '198.51.100.11'), 'test-bucket', { limit: 1, windowMs: 60_000 })
    const second = checkRateLimit(req({}, '198.51.100.11'), 'test-bucket', { limit: 1, windowMs: 60_000 })
    const otherAddress = checkRateLimit(req({}, '198.51.100.12'), 'test-bucket', { limit: 1, windowMs: 60_000 })

    expect(first.allowed).toBe(true)
    expect(second.allowed).toBe(false)
    expect(second.retryAfterSeconds).toBeGreaterThan(0)
    expect(otherAddress.allowed).toBe(true)
  })
})
