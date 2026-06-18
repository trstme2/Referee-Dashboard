import { describe, expect, it } from 'vitest'
import { createFreshDB } from './storage'
import { getAttentionNeeded, getNextAssignment, getReadinessSummary, getSyncHealthSummary, getWeekSummary, mapsHrefForAddress } from './mobileDashboard'
import type { CalendarFeed, CalendarFeedSyncRun, DB } from './types'

function baseDb(): DB {
  const db = createFreshDB()
  return {
    ...db,
    requirementDefinitions: [],
  }
}

describe('mobile dashboard helpers', () => {
  it('selects the next assignment and builds a weekly summary', () => {
    const db = baseDb()
    db.games = [
      {
        id: 'game-2',
        sport: 'Lacrosse',
        competitionLevel: 'High School',
        gameDate: '2026-06-18',
        startTime: '',
        locationAddress: 'North HS',
        status: 'Scheduled',
        paidConfirmed: false,
        role: '',
        gameFee: undefined,
        platformConfirmations: {},
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
      {
        id: 'game-1',
        sport: 'Soccer',
        competitionLevel: 'High School',
        league: 'OHSAA',
        gameDate: '2026-06-17',
        startTime: '19:00',
        locationAddress: 'Central Stadium',
        status: 'Scheduled',
        paidConfirmed: false,
        role: 'Center',
        gameFee: 85,
        roundtripMiles: 24,
        platformConfirmations: {},
        calendarEventId: 'event-1',
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
    ]
    db.calendarEvents = [
      {
        id: 'event-1',
        eventType: 'Game',
        title: 'Soccer match',
        start: '2026-06-17T23:00:00.000Z',
        end: '2026-06-18T01:00:00.000Z',
        allDay: false,
        timezone: 'America/New_York',
        source: 'Manual',
        externalRef: 'DragonFly:feed:abc:uid',
        status: 'Scheduled',
        linkedGameId: 'game-1',
        platformConfirmations: {},
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
    ]

    const next = getNextAssignment(db, new Date('2026-06-16T12:00:00.000Z'))
    const week = getWeekSummary(db, new Date('2026-06-16T12:00:00.000Z'))

    expect(next?.game.id).toBe('game-1')
    expect(next?.sourceLabel).toBe('DragonFly')
    expect(week).toMatchObject({
      assignments: 2,
      estimatedEarnings: 85,
      mileage: 24,
      sportsCount: 2,
      pendingItems: 1,
    })
  })

  it('summarizes readiness and attention items from real requirement state', () => {
    const db = baseDb()
    db.requirementDefinitions = [
      {
        id: 'req-1',
        name: 'Rules Test',
        sport: 'Soccer',
        competitionLevel: 'High School',
        governingBody: 'OHSAA',
        frequency: 'Season',
        evidenceType: 'Score',
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
    ]
    db.requirementInstances = [
      {
        id: 'inst-1',
        definitionId: 'req-1',
        seasonName: 'Fall',
        year: 2026,
        dueDate: '2026-06-18',
        status: 'In Progress',
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
    ]
    db.games = [
      {
        id: 'played-1',
        sport: 'Soccer',
        competitionLevel: 'High School',
        gameDate: '2026-06-10',
        startTime: '19:00',
        locationAddress: 'Central Stadium',
        status: 'Played',
        paidConfirmed: false,
        role: 'Center',
        gameFee: undefined,
        platformConfirmations: {},
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
    ]

    const readiness = getReadinessSummary(db, new Date('2026-06-16T12:00:00.000Z'))
    const attention = getAttentionNeeded({
      db,
      onboardingIncomplete: false,
      feeds: [],
      syncHistory: [],
      today: new Date('2026-06-16T12:00:00.000Z'),
    })

    expect(readiness[0]).toMatchObject({
      title: 'High School Soccer',
      statusLabel: 'Rules Test due',
      tone: 'warn',
    })
    expect(attention.map(item => item.id)).toContain('missing-backfill')
    expect(attention.find(item => item.id.startsWith('readiness-'))?.href).toBe('/requirements')
  })

  it('reports sync health based on real feed state', () => {
    const feeds: CalendarFeed[] = [
      {
        id: 'feed-1',
        platform: 'DragonFly',
        name: 'DragonFly soccer',
        enabled: true,
        lastSyncedAt: '2026-06-10T12:00:00.000Z',
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
    ]
    const failedRun: CalendarFeedSyncRun[] = [
      {
        id: 'run-1',
        feedId: 'feed-1',
        feedName: 'DragonFly soccer',
        platform: 'DragonFly',
        trigger: 'manual',
        status: 'failed',
        startedAt: '2026-06-16T09:00:00.000Z',
        finishedAt: '2026-06-16T09:00:03.000Z',
        durationMs: 3000,
        attempts: 1,
        createdEvents: 0,
        updatedEvents: 0,
        createdGames: 0,
        updatedGames: 0,
        errors: ['Timeout'],
      },
    ]

    const stale = getSyncHealthSummary(feeds, [], new Date('2026-06-16T12:00:00.000Z'))
    const failed = getSyncHealthSummary(feeds, failedRun, new Date('2026-06-16T12:00:00.000Z'))

    expect(stale.tone).toBe('warn')
    expect(failed.tone).toBe('bad')
    expect(mapsHrefForAddress('123 Main St, Columbus, OH')).toContain('google.com/maps/search')
  })
})
