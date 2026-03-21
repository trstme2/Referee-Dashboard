import { describe, expect, it } from 'vitest'
import {
  deleteCalendarEventIn,
  deleteGameIn,
  deleteRequirementInstanceIn,
  editRequirementInstanceIn,
  rollbackImportIn,
  setRequirementStatusIn,
  upsertGameIn,
} from './mutate'
import { migrateLegacyGameStatus } from './gameStatus'
import type { DB } from './types'

function baseDB(): DB {
  return {
    settings: {
      homeAddress: '123 Main St',
      assigningPlatforms: ['RefQuest', 'DragonFly'],
      leagues: [],
    },
    games: [],
    calendarEvents: [],
    expenses: [],
    requirementDefinitions: [
      {
        id: 'def-1',
        name: 'Clinic',
        frequency: 'Season',
        evidenceType: 'Attendance',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    requirementInstances: [
      {
        id: 'inst-1',
        definitionId: 'def-1',
        seasonName: 'Spring',
        year: 2026,
        dueDate: '2026-04-01',
        status: 'Not Started',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'inst-2',
        definitionId: 'def-1',
        seasonName: 'Fall',
        year: 2026,
        dueDate: '2026-10-01',
        status: 'In Progress',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    requirementActivities: [
      {
        id: 'act-1',
        instanceId: 'inst-1',
        activityDate: '2026-02-01',
        quantity: 1,
        createdAt: '2026-02-01T00:00:00.000Z',
        updatedAt: '2026-02-01T00:00:00.000Z',
      },
      {
        id: 'act-2',
        instanceId: 'inst-2',
        activityDate: '2026-03-01',
        quantity: 1,
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-01T00:00:00.000Z',
      },
    ],
    csvImports: [],
    csvImportRows: [],
  }
}

describe('requirement instance mutations', () => {
  it('edits only targeted requirement instance fields', () => {
    const db = baseDB()
    const next = editRequirementInstanceIn(db, 'inst-1', {
      seasonName: 'Summer',
      year: 2027,
      dueDate: '2027-05-05',
      status: 'In Progress',
    })

    const edited = next.requirementInstances.find((x) => x.id === 'inst-1')
    const untouched = next.requirementInstances.find((x) => x.id === 'inst-2')

    expect(edited?.seasonName).toBe('Summer')
    expect(edited?.year).toBe(2027)
    expect(edited?.dueDate).toBe('2027-05-05')
    expect(edited?.status).toBe('In Progress')
    expect(untouched?.seasonName).toBe('Fall')
    expect(untouched?.status).toBe('In Progress')
  })

  it('deletes requirement instance and linked activities only', () => {
    const db = baseDB()
    const next = deleteRequirementInstanceIn(db, 'inst-1')

    expect(next.requirementInstances.map((x) => x.id)).toEqual(['inst-2'])
    expect(next.requirementActivities.map((x) => x.id)).toEqual(['act-2'])
  })
})

describe('game mutations', () => {
  it('migrates legacy completed unpaid games to Played', () => {
    const migrated = migrateLegacyGameStatus({
      id: 'legacy-1',
      sport: 'Soccer',
      competitionLevel: 'High School',
      gameDate: '2026-09-10',
      locationAddress: 'Legacy Field',
      status: 'Completed' as any,
      paidConfirmed: false,
      paidDate: undefined,
      platformConfirmations: {},
      createdAt: '2026-09-10T00:00:00.000Z',
      updatedAt: '2026-09-10T00:00:00.000Z',
    })

    expect(migrated.status).toBe('Played')
    expect(migrated.paidConfirmed).toBe(false)
    expect(migrated.paidDate).toBeUndefined()
  })

  it('migrates legacy completed paid games to Paid / Complete', () => {
    const migrated = migrateLegacyGameStatus({
      id: 'legacy-2',
      sport: 'Soccer',
      competitionLevel: 'High School',
      gameDate: '2026-09-11',
      locationAddress: 'Legacy Field',
      status: 'Completed' as any,
      paidConfirmed: true,
      paidDate: undefined,
      platformConfirmations: {},
      createdAt: '2026-09-11T00:00:00.000Z',
      updatedAt: '2026-09-11T00:00:00.000Z',
    })

    expect(migrated.status).toBe('Paid / Complete')
    expect(migrated.paidConfirmed).toBe(true)
    expect(migrated.paidDate).toBe('2026-09-11')
  })

  it('creates a linked calendar event, normalizes platform confirmations, and saves new leagues', () => {
    const db = baseDB()
    const next = upsertGameIn(db, {
      sport: 'Soccer',
      competitionLevel: 'High School',
      gameDate: '2026-09-10',
      startTime: '19:15',
      locationAddress: '100 Stadium Dr',
      league: 'OHSAA',
      status: 'Scheduled',
      paidConfirmed: true,
      platformConfirmations: { RefQuest: true, ExtraPlatform: true },
      homeTeam: 'North',
      awayTeam: 'South',
      notes: 'Varsity match',
    })

    expect(next.games).toHaveLength(1)
    expect(next.calendarEvents).toHaveLength(1)
    expect(next.settings.leagues).toContain('OHSAA')

    const game = next.games[0]
    const calendarEvent = next.calendarEvents[0]

    expect(game.calendarEventId).toBe(calendarEvent.id)
    expect(game.platformConfirmations).toEqual({ RefQuest: true, DragonFly: false })
    expect(calendarEvent.linkedGameId).toBe(game.id)
    expect(calendarEvent.platformConfirmations).toEqual({ RefQuest: true, DragonFly: false })
    expect(calendarEvent.locationAddress).toBe('100 Stadium Dr')
    expect(calendarEvent.notes).toBe('Varsity match')
    expect(calendarEvent.title).toContain('Soccer')
    expect(calendarEvent.title).toContain('North vs South')
    expect(calendarEvent.start).toBe(new Date('2026-09-10T19:15:00').toISOString())
    expect(calendarEvent.end).toBe(new Date('2026-09-10T21:15:00').toISOString())
  })

  it('updates the existing linked calendar event instead of creating a second one', () => {
    const created = upsertGameIn(baseDB(), {
      sport: 'Soccer',
      competitionLevel: 'College',
      gameDate: '2026-10-12',
      startTime: '18:00',
      locationAddress: 'Old Field',
      status: 'Scheduled',
      notes: 'Original note',
    })

    const game = created.games[0]
    const event = created.calendarEvents[0]

    const updated = upsertGameIn(created, {
      ...game,
      locationAddress: 'New Field',
      startTime: '20:30',
      notes: 'Updated note',
      status: 'Played',
    })

    expect(updated.games).toHaveLength(1)
    expect(updated.calendarEvents).toHaveLength(1)
    expect(updated.games[0].calendarEventId).toBe(event.id)
    expect(updated.calendarEvents[0].id).toBe(event.id)
    expect(updated.calendarEvents[0].locationAddress).toBe('New Field')
    expect(updated.calendarEvents[0].notes).toBe('Updated note')
    expect(updated.calendarEvents[0].start).toBe(new Date('2026-10-12T20:30:00').toISOString())
    expect(updated.calendarEvents[0].end).toBe(new Date('2026-10-12T22:30:00').toISOString())
  })

  it('marks a game paid automatically when status becomes Paid / Complete', () => {
    const created = upsertGameIn(baseDB(), {
      sport: 'Soccer',
      competitionLevel: 'High School',
      gameDate: '2026-11-03',
      locationAddress: 'North Field',
      status: 'Scheduled',
    })

    const game = created.games[0]
    const updated = upsertGameIn(created, {
      ...game,
      status: 'Paid / Complete',
    })

    expect(updated.games[0].status).toBe('Paid / Complete')
    expect(updated.games[0].paidConfirmed).toBe(true)
    expect(updated.games[0].paidDate).toBe('2026-11-03')
  })

  it('clears paid fields when moving back out of Paid / Complete', () => {
    const created = upsertGameIn(baseDB(), {
      sport: 'Soccer',
      competitionLevel: 'High School',
      gameDate: '2026-11-03',
      locationAddress: 'North Field',
      status: 'Paid / Complete',
    })

    const game = created.games[0]
    const updated = upsertGameIn(created, {
      ...game,
      status: 'Played',
    })

    expect(updated.games[0].status).toBe('Played')
    expect(updated.games[0].paidConfirmed).toBe(false)
    expect(updated.games[0].paidDate).toBeUndefined()
  })

  it('deletes a game and its linked calendar event together', () => {
    const created = upsertGameIn(baseDB(), {
      sport: 'Lacrosse',
      competitionLevel: 'Club',
      gameDate: '2026-05-01',
      locationAddress: 'Turf Complex',
      status: 'Scheduled',
    })

    const gameId = created.games[0].id
    const eventId = created.calendarEvents[0].id
    const next = deleteGameIn(created, gameId)

    expect(next.games).toHaveLength(0)
    expect(next.calendarEvents.find((x) => x.id === eventId)).toBeUndefined()
  })
})

describe('calendar and import mutations', () => {
  it('unlinks a game when its calendar event is deleted', () => {
    const created = upsertGameIn(baseDB(), {
      sport: 'Soccer',
      competitionLevel: 'High School',
      gameDate: '2026-08-20',
      locationAddress: 'Main Stadium',
      status: 'Scheduled',
    })

    const eventId = created.calendarEvents[0].id
    const gameId = created.games[0].id
    const next = deleteCalendarEventIn(created, eventId)

    expect(next.calendarEvents).toHaveLength(0)
    expect(next.games.find((x) => x.id === gameId)?.calendarEventId).toBeUndefined()
  })

  it('rolls back imported games, events, rows, and the import record together', () => {
    const db: DB = {
      ...baseDB(),
      games: [
        {
          id: 'game-imported',
          sport: 'Soccer',
          competitionLevel: 'High School',
          gameDate: '2026-03-01',
          locationAddress: 'Imported Field',
          status: 'Scheduled',
          paidConfirmed: false,
          platformConfirmations: { RefQuest: false, DragonFly: false },
          createdAt: '2026-03-01T00:00:00.000Z',
          updatedAt: '2026-03-01T00:00:00.000Z',
        },
        {
          id: 'game-keep',
          sport: 'Lacrosse',
          competitionLevel: 'Club',
          gameDate: '2026-03-02',
          locationAddress: 'Keep Field',
          status: 'Scheduled',
          paidConfirmed: false,
          platformConfirmations: { RefQuest: false, DragonFly: false },
          createdAt: '2026-03-02T00:00:00.000Z',
          updatedAt: '2026-03-02T00:00:00.000Z',
        },
      ],
      calendarEvents: [
        {
          id: 'event-imported',
          eventType: 'Game',
          title: 'Imported game',
          start: '2026-03-01T17:00:00.000Z',
          end: '2026-03-01T19:00:00.000Z',
          allDay: false,
          timezone: 'America/New_York',
          source: 'CSV Import',
          status: 'Scheduled',
          linkedGameId: 'game-imported',
          platformConfirmations: { RefQuest: false, DragonFly: false },
          createdAt: '2026-03-01T00:00:00.000Z',
          updatedAt: '2026-03-01T00:00:00.000Z',
        },
        {
          id: 'event-keep',
          eventType: 'Admin',
          title: 'Keep event',
          start: '2026-03-03T17:00:00.000Z',
          end: '2026-03-03T18:00:00.000Z',
          allDay: false,
          timezone: 'America/New_York',
          source: 'Manual',
          status: 'Scheduled',
          platformConfirmations: { RefQuest: false, DragonFly: false },
          createdAt: '2026-03-03T00:00:00.000Z',
          updatedAt: '2026-03-03T00:00:00.000Z',
        },
      ],
      csvImports: [
        { id: 'import-1', importType: 'Games', fileName: 'games.csv', importedAt: '2026-03-01T00:00:00.000Z', rowCount: 1 },
        { id: 'import-keep', importType: 'Blocks', fileName: 'blocks.csv', importedAt: '2026-03-01T00:00:00.000Z', rowCount: 1 },
      ],
      csvImportRows: [
        {
          id: 'row-1',
          importId: 'import-1',
          rowNumber: 1,
          rawJson: { game_date: '2026-03-01' },
          status: 'Imported',
          createdGameId: 'game-imported',
          createdCalendarEventId: 'event-imported',
        },
        {
          id: 'row-keep',
          importId: 'import-keep',
          rowNumber: 1,
          rawJson: { date: '2026-03-03' },
          status: 'Imported',
          createdCalendarEventId: 'event-keep',
        },
      ],
    }

    const next = rollbackImportIn(db, 'import-1')

    expect(next.games.map((x) => x.id)).toEqual(['game-keep'])
    expect(next.calendarEvents.map((x) => x.id)).toEqual(['event-keep'])
    expect(next.csvImports.map((x) => x.id)).toEqual(['import-keep'])
    expect(next.csvImportRows.map((x) => x.id)).toEqual(['row-keep'])
  })
})

describe('requirement status mutations', () => {
  it('sets completed date automatically when marking an instance complete', () => {
    const db = baseDB()
    const next = setRequirementStatusIn(db, 'inst-1', 'Complete', undefined, 'Finished clinic')
    const updated = next.requirementInstances.find((x) => x.id === 'inst-1')

    expect(updated?.status).toBe('Complete')
    expect(updated?.completionNotes).toBe('Finished clinic')
    expect(updated?.completedDate).toBe(new Date().toISOString().slice(0, 10))
  })
})
