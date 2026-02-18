import type { DB } from './types'

const KEY = 'referee_dashboard_db_v4'

export function loadDB(): DB {
  const raw = localStorage.getItem(KEY)
  if (!raw) return seedDB()
  try {
    const parsed = JSON.parse(raw) as DB
    return { ...seedDB(), ...parsed, settings: { ...seedDB().settings, ...(parsed as any).settings } }
  } catch {
    return seedDB()
  }
}

export function saveDB(db: DB) {
  localStorage.setItem(KEY, JSON.stringify(db))
}

export function resetDB() {
  localStorage.removeItem(KEY)
}

function nowISO() {
  return new Date().toISOString()
}

function seedDB(): DB {
  const now = nowISO()
  return {
    settings: {
      homeAddress: '399 S. Columbia Ave, Bexley, OH 43209',
      assigningPlatforms: ['DragonFly', 'RefQuest'],
      leagues: [],
    },
    games: [],
    calendarEvents: [],
    expenses: [],
    requirementDefinitions: [
      {
        id: 'reqdef_hs_meetings',
        name: 'Local Meetings',
        governingBody: 'Local Association',
        sport: 'Any',
        competitionLevel: 'High School',
        frequency: 'Season',
        requiredCount: 4,
        evidenceType: 'Attendance',
        notes: 'Track each meeting as an activity (quantity 1). No need to create four separate requirements.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'reqdef_ussoccer_fitness',
        name: 'US Soccer Fitness Test',
        governingBody: 'US Soccer',
        sport: 'Soccer',
        competitionLevel: 'Club',
        frequency: 'Annual',
        requiredCount: 1,
        evidenceType: 'PassFail',
        notes: 'Add other US Soccer requirements as you confirm them.',
        createdAt: now,
        updatedAt: now,
      },
    ],
    requirementInstances: [],
    requirementActivities: [],
    csvImports: [],
    csvImportRows: [],
  }
}
