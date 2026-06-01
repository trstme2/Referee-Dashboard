import { describe, expect, it } from 'vitest'
import { buildIcsCalendar, dedupeCalendarExportRows } from './calendar-export-utils.js'

function block(id: string) {
  return {
    id,
    event_type: 'Block',
    title: 'Availability Block: Unavailable 8/4/2026 07:00 pm - 8/5/2026 02:00 am',
    start_ts: '2026-08-04T19:00:00.000Z',
    end_ts: '2026-08-05T02:00:00.000Z',
    all_day: false,
    timezone: 'America/New_York',
    location_address: null,
    notes: null,
    updated_at: '2026-08-01T00:00:00.000Z',
    created_at: '2026-08-01T00:00:00.000Z',
    status: 'Scheduled',
    linked_game_id: null,
  }
}

describe('calendar export duplicate protection', () => {
  it('collapses repeated block rows while preserving non-block calendar rows', () => {
    const admin = { ...block('admin-1'), event_type: 'Admin' }
    expect(dedupeCalendarExportRows([
      block('block-1'),
      block('block-2'),
      block('block-3'),
      admin,
    ]).map(event => event.id)).toEqual(['block-1', 'admin-1'])
  })

  it('serializes one clean availability event when stored rows contain duplicates', () => {
    const ics = buildIcsCalendar({
      userId: 'user-1',
      defaultTimezone: 'America/New_York',
      games: [],
      calendarEvents: Array.from({ length: 15 }, (_, index) => block(`block-${index + 1}`)),
    })

    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1)
    expect(ics).toContain('SUMMARY:Availability Block: Unavailable')
    expect(ics).not.toContain('8/4/2026 07:00 pm')
  })
})
