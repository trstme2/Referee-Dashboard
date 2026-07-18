import { describe, expect, it } from 'vitest'
import {
  assertSyncEventCount,
  chunkSyncValues,
  isWithinSyncWindow,
  MAX_AUTO_MILEAGE_LOOKUPS_PER_SYNC,
  MAX_EVENTS_PER_FEED_SYNC,
  mileageLookupCandidates,
} from './sync-safety.js'

describe('sync safety guardrails', () => {
  it('rejects unusually large feeds before processing them', () => {
    expect(() => assertSyncEventCount(MAX_EVENTS_PER_FEED_SYNC)).not.toThrow()
    expect(() => assertSyncEventCount(MAX_EVENTS_PER_FEED_SYNC + 1)).toThrow('calendar contains more than')
  })

  it('accepts only events in the bounded sync window', () => {
    const now = new Date('2026-07-17T12:00:00.000Z')
    expect(isWithinSyncWindow(new Date('2025-05-01T12:00:00.000Z'), now)).toBe(false)
    expect(isWithinSyncWindow(new Date('2026-07-17T12:00:00.000Z'), now)).toBe(true)
    expect(isWithinSyncWindow(new Date('2028-08-01T12:00:00.000Z'), now)).toBe(false)
  })

  it('batches large database filters so sync requests stay within API URL limits', () => {
    const values = Array.from({ length: 205 }, (_, index) => `event-${index}`)
    const chunks = chunkSyncValues(values, 100)

    expect(chunks.map((chunk) => chunk.length)).toEqual([100, 100, 5])
    expect(chunks.flat()).toEqual(values)
    expect(chunkSyncValues([], 100)).toEqual([])
  })

  it('selects only games that need automatic mileage', () => {
    const candidates = mileageLookupCandidates([
      { location_address: '100 Main St', mileage_origin: 'home' },
      { location_address: '101 Main St', distance_miles: 12, mileage_origin: 'home' },
      { location_address: '102 Main St', mileage_origin: 'other' },
      { location_address: '' },
    ])
    expect(candidates).toHaveLength(1)
    expect(MAX_AUTO_MILEAGE_LOOKUPS_PER_SYNC).toBe(25)
  })
})
