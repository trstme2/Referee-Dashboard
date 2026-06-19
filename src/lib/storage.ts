import type { DB } from './types'
import { migrateLegacyGameStatus } from './gameStatus'

const LEGACY_KEY = 'referee_dashboard_db_v4'
const LOCAL_KEY = 'referee_dashboard_db_v4_local'

export function dbStorageKey(userId?: string | null) {
  return userId ? `${LOCAL_KEY}_user_${userId}` : LOCAL_KEY
}

export function loadDB(userId?: string | null): DB {
  const key = dbStorageKey(userId)
  const legacyRaw = !userId ? localStorage.getItem(LEGACY_KEY) : null
  const raw = localStorage.getItem(key) ?? legacyRaw
  if (!raw) return seedDB()
  try {
    const parsed = JSON.parse(raw) as DB
    const migrated = {
      ...seedDB(),
      ...parsed,
      settings: { ...seedDB().settings, ...(parsed as any).settings },
      games: Array.isArray(parsed.games) ? parsed.games.map(migrateLegacyGameStatus) : [],
    }
    if (JSON.stringify(migrated) !== raw) {
      localStorage.setItem(key, JSON.stringify(migrated))
      if (!userId && legacyRaw) localStorage.removeItem(LEGACY_KEY)
    }
    return migrated
  } catch {
    return seedDB()
  }
}

export function saveDB(db: DB, userId?: string | null) {
  localStorage.setItem(dbStorageKey(userId), JSON.stringify(db))
}

export function resetDB(userId?: string | null) {
  localStorage.removeItem(dbStorageKey(userId))
  if (!userId) localStorage.removeItem(LEGACY_KEY)
}

function nowISO() {
  return new Date().toISOString()
}

export function createFreshDB(): DB {
  const now = nowISO()
  return {
    settings: {
      homeAddress: '',
      homeAddressPlaceId: undefined,
      homeAddressLatitude: undefined,
      homeAddressLongitude: undefined,
      otherWorkAddress: '',
      otherWorkAddressPlaceId: undefined,
      otherWorkAddressLatitude: undefined,
      otherWorkAddressLongitude: undefined,
      defaultTimezone: 'America/New_York',
      taxMileageRateCents: undefined,
      weeklyGamesEmailEnabled: false,
      onboardingCompletedAt: undefined,
      trackedSports: [],
      showGamePlatformChips: true,
      assigningPlatforms: [],
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

function seedDB(): DB {
  return createFreshDB()
}
