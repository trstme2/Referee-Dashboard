import { describe, expect, it } from 'vitest'
import type { CalendarEvent } from './types'
import {
  calendarEventDayKeys,
  calendarEventDisplayTitle,
  calendarEventTimeRangeLabel,
  visibleCalendarEvents,
} from './calendarEvents'

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'event-1',
    eventType: 'Block',
    title: 'Availability Block: Unavailable 5/24/2026 07:00 pm - 5/25/2026 02:00 am',
    start: '2026-05-24T19:00:00.000Z',
    end: '2026-05-25T02:00:00.000Z',
    allDay: false,
    timezone: 'America/New_York',
    source: 'Manual',
    externalRef: 'DragonFly:feed:test:block-1',
    status: 'Scheduled',
    platformConfirmations: { DragonFly: true },
    createdAt: '2026-05-24T00:00:00.000Z',
    updatedAt: '2026-05-24T00:00:00.000Z',
    ...overrides,
  }
}

describe('calendar event display helpers', () => {
  it('shows a multi-day block on every touched calendar date', () => {
    expect(calendarEventDayKeys(event({
      start: '2026-05-28T16:00:00.000Z',
      end: '2026-06-10T06:00:00.000Z',
    }))).toEqual([
      '2026-05-28', '2026-05-29', '2026-05-30', '2026-05-31',
      '2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04',
      '2026-06-05', '2026-06-06', '2026-06-07', '2026-06-08',
      '2026-06-09', '2026-06-10',
    ])
  })

  it('uses the event timezone for an accurate start and end label', () => {
    expect(calendarEventTimeRangeLabel(event())).toBe('3:00 PM - 10:00 PM')
  })

  it('removes DragonFly shifted timestamps from block titles', () => {
    expect(calendarEventDisplayTitle(event())).toBe('Availability Block: Unavailable')
  })

  it('hides repeated DragonFly blocks with the same slot while preserving other events', () => {
    expect(visibleCalendarEvents([
      event(),
      event({ id: 'event-2', externalRef: 'DragonFly:feed:test:block-2' }),
      event({ id: 'event-3', eventType: 'Admin', externalRef: undefined }),
    ]).map(item => item.id)).toEqual(['event-1', 'event-3'])
  })
})
