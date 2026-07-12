import { describe, expect, it } from 'vitest'
import { buildSyncedGameRow } from './sync-merge.js'

const now = '2026-07-08T12:00:00.000Z'

function normalized(overrides: Partial<Parameters<typeof buildSyncedGameRow>[0]['normalized']> = {}) {
  return {
    sport: 'Soccer',
    competitionLevel: 'High School',
    levelDetail: 'Varsity',
    gameDate: '2026-09-12',
    startTime: '19:00',
    location: 'Feed Stadium, Columbus, OH',
    role: 'Center',
    homeTeam: 'Feed Home',
    awayTeam: 'Feed Away',
    notes: 'Feed notes',
    ...overrides,
  }
}

function feed(overrides: Partial<Parameters<typeof buildSyncedGameRow>[0]['feed']> = {}) {
  return {
    userId: 'user-1',
    platform: 'Ref Insight',
    defaultLeague: 'Central Ohio Assignors',
    ...overrides,
  }
}

describe('sync game merge reliability', () => {
  it('preserves referee corrections when a synced game is seen again', () => {
    const row = buildSyncedGameRow({
      existing: {
        id: 'game-existing',
        sport: 'Soccer',
        competition_level: 'Club',
        league: 'ECSR',
        level_detail: 'U19',
        start_time: '19:30',
        timezone: 'America/New_York',
        location_address: 'Manual Field, Columbus, OH',
        distance_miles: 11.2,
        roundtrip_miles: 22,
        mileage_origin: 'home',
        role: 'AR',
        status: 'Played',
        game_fee: 72,
        paid_confirmed: false,
        paid_date: null,
        home_team: 'Manual Home',
        away_team: 'Manual Away',
        notes: 'Referee-entered notes',
        platform_confirmations: { DragonFly: true },
        created_at: '2026-07-01T10:00:00.000Z',
      },
      normalized: normalized({
        competitionLevel: 'High School',
        levelDetail: 'Varsity',
        startTime: '19:00',
        location: 'Feed Field, Columbus, OH',
        role: 'Center',
        homeTeam: 'Feed Home',
        awayTeam: 'Feed Away',
        notes: 'Feed notes',
      }),
      feed: feed(),
      calendarEventId: 'event-updated',
      now,
      userDefaultTimezone: 'America/New_York',
      idFactory: () => 'new-id-should-not-be-used',
    })

    expect(row.id).toBe('game-existing')
    expect(row.sport).toBe('Soccer')
    expect(row.competition_level).toBe('Club')
    expect(row.league).toBe('ECSR')
    expect(row.level_detail).toBe('U19')
    expect(row.start_time).toBe('19:00')
    expect(row.location_address).toBe('Manual Field, Columbus, OH')
    expect(row.role).toBe('AR')
    expect(row.status).toBe('Played')
    expect(row.game_fee).toBe(72)
    expect(row.home_team).toBe('Manual Home')
    expect(row.away_team).toBe('Manual Away')
    expect(row.notes).toBe('Referee-entered notes')
    expect(row.platform_confirmations).toEqual({ DragonFly: true, 'Ref Insight': true })
    expect(row.calendar_event_id).toBe('event-updated')
    expect(row.created_at).toBe('2026-07-01T10:00:00.000Z')
    expect(row.updated_at).toBe(now)
  })

  it('creates a new game row from feed data when no match exists', () => {
    const row = buildSyncedGameRow({
      existing: null,
      normalized: normalized({
        sport: 'Lacrosse',
        competitionLevel: 'Club',
        levelDetail: 'U17',
        role: 'Lead',
      }),
      feed: feed({ platform: 'DragonFly', defaultLeague: 'Summer Lax' }),
      calendarEventId: 'event-new',
      now,
      userDefaultTimezone: 'America/New_York',
      idFactory: () => 'game-new',
    })

    expect(row).toMatchObject({
      id: 'game-new',
      user_id: 'user-1',
      sport: 'Lacrosse',
      competition_level: 'Club',
      league: 'Summer Lax',
      level_detail: 'U17',
      game_date: '2026-09-12',
      start_time: '19:00',
      timezone: 'America/New_York',
      location_address: 'Feed Stadium, Columbus, OH',
      role: 'Lead',
      status: 'Scheduled',
      paid_confirmed: false,
      mileage_origin: 'home',
      platform_confirmations: { DragonFly: true },
      calendar_event_id: 'event-new',
      created_at: now,
      updated_at: now,
    })
  })

  it('fills blank manual fields from the feed without overwriting chosen classification', () => {
    const row = buildSyncedGameRow({
      existing: {
        id: 'manual-game',
        sport: 'Soccer',
        competition_level: 'Club',
        league: null,
        level_detail: null,
        start_time: null,
        location_address: '',
        role: null,
        home_team: null,
        away_team: null,
        platform_confirmations: { Arbiter: true },
        created_at: '2026-07-02T10:00:00.000Z',
      },
      normalized: normalized({
        competitionLevel: 'High School',
        levelDetail: 'Varsity',
        role: 'Center',
      }),
      feed: feed({ platform: 'Ref Insight', defaultLeague: null }),
      calendarEventId: 'event-linked',
      now,
      userDefaultTimezone: 'America/New_York',
    })

    expect(row.id).toBe('manual-game')
    expect(row.competition_level).toBe('Club')
    expect(row.level_detail).toBe('Varsity')
    expect(row.start_time).toBe('19:00')
    expect(row.location_address).toBe('Feed Stadium, Columbus, OH')
    expect(row.role).toBe('Center')
    expect(row.home_team).toBe('Feed Home')
    expect(row.away_team).toBe('Feed Away')
    expect(row.platform_confirmations).toEqual({ Arbiter: true, 'Ref Insight': true })
  })
})
