import { describe, expect, it } from 'vitest'
import { deleteRequirementInstanceIn, editRequirementInstanceIn } from './mutate'
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
