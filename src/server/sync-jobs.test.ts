import { describe, expect, it } from 'vitest'
import { immediatelyDueRunAfter } from './sync-jobs.js'

describe('durable sync queue', () => {
  it('makes newly queued work due before a same-request processor checks the queue', () => {
    const now = new Date('2026-08-07T06:48:17.439Z')

    expect(immediatelyDueRunAfter(now)).toBe('2026-08-07T06:48:12.439Z')
  })
})
