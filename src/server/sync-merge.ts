import { randomUUID } from 'node:crypto'

type ExistingSyncedGame = {
  id?: string | null
  sport?: string | null
  competition_level?: string | null
  league?: string | null
  level_detail?: string | null
  start_time?: string | null
  timezone?: string | null
  location_address?: string | null
  distance_miles?: number | null
  roundtrip_miles?: number | null
  mileage_origin?: string | null
  role?: string | null
  status?: string | null
  game_fee?: number | null
  paid_confirmed?: boolean | null
  paid_date?: string | null
  pay_expected?: number | null
  home_team?: string | null
  away_team?: string | null
  notes?: string | null
  platform_confirmations?: Record<string, boolean> | null
  created_at?: string | null
}

type NormalizedSyncedGame = {
  sport: string
  competitionLevel: string
  levelDetail: string | null
  gameDate: string
  startTime: string | null
  location: string | null
  role: string | null
  homeTeam: string | null
  awayTeam: string | null
  notes: string | null
}

type SyncedGameFeedContext = {
  userId: string
  platform: string
  defaultLeague: string | null
}

export function buildSyncedGameRow(input: {
  existing?: ExistingSyncedGame | null
  normalized: NormalizedSyncedGame
  feed: SyncedGameFeedContext
  calendarEventId: string
  now: string
  userDefaultTimezone: string
  idFactory?: () => string
}) {
  const { existing, normalized, feed, calendarEventId, now, userDefaultTimezone } = input
  const idFactory = input.idFactory ?? randomUUID
  const platformConfirmations = {
    ...(existing?.platform_confirmations ?? {}),
    [feed.platform]: true,
  }

  return {
    id: existing?.id ?? idFactory(),
    user_id: feed.userId,
    sport: existing?.sport ?? normalized.sport,
    competition_level: existing?.competition_level ?? normalized.competitionLevel,
    league: existing?.league ?? feed.defaultLeague ?? null,
    level_detail: existing?.level_detail ?? normalized.levelDetail ?? null,
    game_date: normalized.gameDate,
    start_time: normalized.startTime ?? existing?.start_time ?? null,
    timezone: existing?.timezone ?? userDefaultTimezone,
    location_address: existing?.location_address || normalized.location || '',
    distance_miles: existing?.distance_miles ?? null,
    roundtrip_miles: existing?.roundtrip_miles ?? null,
    mileage_origin: existing?.mileage_origin ?? 'home',
    role: existing?.role ?? normalized.role ?? null,
    status: existing?.status ?? 'Scheduled',
    game_fee: existing?.game_fee ?? null,
    paid_confirmed: existing?.paid_confirmed ?? false,
    paid_date: existing?.paid_date ?? null,
    pay_expected: existing?.pay_expected ?? null,
    home_team: existing?.home_team || normalized.homeTeam || null,
    away_team: existing?.away_team || normalized.awayTeam || null,
    notes: existing?.notes ?? normalized.notes ?? null,
    platform_confirmations: platformConfirmations,
    calendar_event_id: calendarEventId,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  }
}
