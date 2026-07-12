import { describe, expect, it } from 'vitest'
import { cleanupDragonFlyBlockTitle, dateKeysTouched, dedupeFeedBlocks, looksLikeAvailabilityBlock } from './sync-ics-utils.js'

describe('sync ICS utilities', () => {
  it('removes shifted DragonFly timestamps from availability block titles', () => {
    expect(cleanupDragonFlyBlockTitle('Availability Block: Unavailable 5/24/2026 07:00 pm - 5/25/2026 02:00 am')).toBe('Availability Block: Unavailable')
  })

  it('recognizes availability blocks before game classification', () => {
    expect(looksLikeAvailabilityBlock('Availability Block: Unavailable 5/24/2026 07:00 pm - 5/25/2026 02:00 am')).toBe(true)
    expect(looksLikeAvailabilityBlock('Blocked')).toBe(true)
    expect(looksLikeAvailabilityBlock('Soccer (Club): Ants vs Bees')).toBe(false)
  })

  it('deduplicates repeated block slots without collapsing games', () => {
    const block = {
      eventType: 'Block',
      start: new Date('2026-05-24T19:00:00.000Z'),
      end: new Date('2026-05-25T02:00:00.000Z'),
      allDay: false,
    }
    expect(dedupeFeedBlocks([
      { ...block, uid: 'block-1' },
      { ...block, uid: 'block-2' },
      { ...block, uid: 'game-1', eventType: 'Game' },
      { ...block, uid: 'game-2', eventType: 'Game' },
    ]).map(event => event.uid)).toEqual(['block-1', 'game-1', 'game-2'])
  })

  it('returns every date touched by a multi-day block', () => {
    expect(dateKeysTouched(
      new Date('2026-05-28T16:00:00.000Z'),
      new Date('2026-06-10T06:00:00.000Z'),
      'America/New_York',
    )).toEqual([
      '2026-05-28', '2026-05-29', '2026-05-30', '2026-05-31',
      '2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04',
      '2026-06-05', '2026-06-06', '2026-06-07', '2026-06-08',
      '2026-06-09', '2026-06-10',
    ])
  })
})
