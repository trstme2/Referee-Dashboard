import type { User } from '@supabase/supabase-js'
import type { CalendarEvent, CalendarFeed, CalendarFeedSyncRun, DB, Game, RequirementDefinition, RequirementInstance } from './types'
import { yyyyMmDd } from './utils'

const DAY_MS = 24 * 60 * 60 * 1000

export type DashboardTone = 'ok' | 'warn' | 'bad' | 'info'

export type DashboardAssignment = {
  game: Game
  title: string
  competitionLabel: string
  sourceLabel: string
  locationLabel: string
  roleLabel: string | null
  fee: number | null
  canAddMileage: boolean
  canMarkComplete: boolean
}

export type DashboardWeekSummary = {
  assignments: number
  estimatedEarnings: number
  mileage: number
  sportsCount: number
  pendingItems: number
}

export type DashboardReadinessItem = {
  id: string
  title: string
  subtitle: string
  statusLabel: string
  tone: DashboardTone
  remaining: number
}

export type DashboardSyncHealth = {
  tone: DashboardTone
  title: string
  detail: string
}

export type DashboardAttentionItem = {
  id: string
  title: string
  detail: string
  tone: DashboardTone
  href?: string
}

type ReadinessGroup = {
  key: string
  title: string
  subtitle: string
  items: Array<{ instance: RequirementInstance; definition?: RequirementDefinition }>
}

function dateDiffFromToday(dateYmd: string, todayKey: string): number {
  const target = new Date(`${dateYmd}T00:00:00`)
  const today = new Date(`${todayKey}T00:00:00`)
  return Math.round((target.getTime() - today.getTime()) / DAY_MS)
}

function sortGamesAscending(a: Game, b: Game): number {
  const ak = `${a.gameDate} ${a.startTime ?? '99:99'}`
  const bk = `${b.gameDate} ${b.startTime ?? '99:99'}`
  return ak < bk ? -1 : ak > bk ? 1 : 0
}

function eventById(db: DB): Map<string, CalendarEvent> {
  return new Map(db.calendarEvents.map(event => [event.id, event]))
}

function sourceLabelForGame(game: Game, linkedEvent?: CalendarEvent): string {
  const confirmedPlatforms = Object.entries(game.platformConfirmations ?? {})
    .filter(([, confirmed]) => confirmed)
    .map(([platform]) => platform)

  if (confirmedPlatforms.length === 1) return confirmedPlatforms[0]
  if (confirmedPlatforms.length > 1) return 'Multiple'
  if (linkedEvent?.externalRef) return linkedEvent.externalRef.split(':')[0] || 'Synced'
  if (linkedEvent?.source === 'CSV Import') return 'CSV Import'
  return 'Manual'
}

function assignmentTitle(game: Game): string {
  if (game.homeTeam && game.awayTeam) return `${game.homeTeam} vs ${game.awayTeam}`
  if (game.levelDetail) return `${game.sport} ${game.levelDetail}`
  return game.sport
}

function assignmentCompetitionLabel(game: Game): string {
  return [game.competitionLevel, game.levelDetail, game.league].filter(Boolean).join(' | ')
}

function mileageValue(game: Game): number {
  if (typeof game.roundtripMiles === 'number') return game.roundtripMiles
  if (typeof game.distanceMiles === 'number') return game.distanceMiles * 2
  return 0
}

function hasMileage(game: Game): boolean {
  return typeof game.roundtripMiles === 'number' || typeof game.distanceMiles === 'number'
}

function missingWeekDetails(game: Game): boolean {
  return !game.startTime || !game.role || game.gameFee == null
}

function completedNeedsBackfill(game: Game): boolean {
  if (game.status !== 'Played' && game.status !== 'Paid / Complete') return false
  return game.gameFee == null || !hasMileage(game)
}

function readinessTitle(definition?: RequirementDefinition): string {
  if (!definition) return 'General readiness'
  const sport = definition.sport && definition.sport !== 'Any' ? definition.sport : ''
  const competitionLevel = definition.competitionLevel && definition.competitionLevel !== 'Any' ? definition.competitionLevel : ''
  const sportLabel = [competitionLevel, sport].filter(Boolean).join(' ').trim()
  if (sportLabel) return sportLabel
  if (definition.governingBody) return definition.governingBody
  return definition.name
}

function readinessSubtitle(group: ReadinessGroup): string {
  return group.subtitle || 'Season readiness'
}

function buildReadinessGroups(db: DB): ReadinessGroup[] {
  const definitionById = new Map(db.requirementDefinitions.map(definition => [definition.id, definition]))
  const groups = new Map<string, ReadinessGroup>()

  for (const instance of db.requirementInstances) {
    const definition = definitionById.get(instance.definitionId)
    const title = readinessTitle(definition)
    const governingBody = definition?.governingBody ?? ''
    const season = instance.seasonName ?? ''
    const year = instance.year ? String(instance.year) : ''
    const subtitle = [governingBody, season, year].filter(Boolean).join(' | ')
    const key = `${title}::${subtitle}`
    const existing = groups.get(key)
    if (existing) {
      existing.items.push({ instance, definition })
    } else {
      groups.set(key, { key, title, subtitle, items: [{ instance, definition }] })
    }
  }

  return Array.from(groups.values())
}

export function displayNameForUser(user: Pick<User, 'email' | 'user_metadata'> | null | undefined): string | null {
  const metadata = user?.user_metadata as Record<string, unknown> | undefined
  const candidates = [
    metadata?.full_name,
    metadata?.name,
    metadata?.display_name,
    metadata?.first_name,
  ]
    .map(value => String(value ?? '').trim())
    .filter(Boolean)

  if (candidates.length) return candidates[0]

  const emailPrefix = String(user?.email ?? '').split('@')[0]?.replace(/[._-]+/g, ' ').trim()
  if (!emailPrefix) return null
  return emailPrefix.replace(/\b\w/g, letter => letter.toUpperCase())
}

export function getUpcomingAssignments(db: DB, today = new Date(), limit = 4): DashboardAssignment[] {
  const todayKey = yyyyMmDd(today)
  const events = eventById(db)

  return [...db.games]
    .filter(game => game.status === 'Scheduled')
    .filter(game => dateDiffFromToday(game.gameDate, todayKey) >= 0)
    .sort(sortGamesAscending)
    .slice(0, limit)
    .map(game => {
      const linkedEvent = game.calendarEventId ? events.get(game.calendarEventId) : undefined
      return {
        game,
        title: assignmentTitle(game),
        competitionLabel: assignmentCompetitionLabel(game),
        sourceLabel: sourceLabelForGame(game, linkedEvent),
        locationLabel: game.locationAddress,
        roleLabel: game.role ?? null,
        fee: game.gameFee ?? null,
        canAddMileage: !hasMileage(game),
        canMarkComplete: dateDiffFromToday(game.gameDate, todayKey) <= 0,
      }
    })
}

export function getNextAssignment(db: DB, today = new Date()): DashboardAssignment | null {
  return getUpcomingAssignments(db, today, 1)[0] ?? null
}

export function getWeekSummary(db: DB, today = new Date()): DashboardWeekSummary {
  const todayKey = yyyyMmDd(today)
  const weekGames = db.games
    .filter(game => game.status === 'Scheduled')
    .filter(game => {
      const diff = dateDiffFromToday(game.gameDate, todayKey)
      return diff >= 0 && diff <= 6
    })

  return {
    assignments: weekGames.length,
    estimatedEarnings: weekGames.reduce((sum, game) => sum + (game.gameFee ?? 0), 0),
    mileage: weekGames.reduce((sum, game) => sum + mileageValue(game), 0),
    sportsCount: new Set(weekGames.map(game => game.sport)).size,
    pendingItems: weekGames.filter(missingWeekDetails).length,
  }
}

export function getReadinessSummary(db: DB, today = new Date(), limit = 4): DashboardReadinessItem[] {
  const todayKey = yyyyMmDd(today)
  const dueSoonCutoff = new Date(today.getTime() + 30 * DAY_MS)
  const dueSoonKey = yyyyMmDd(dueSoonCutoff)

  return buildReadinessGroups(db)
    .map(group => {
      const activeItems = group.items.filter(({ instance }) => instance.status !== 'Complete' && instance.status !== 'Waived')
      const overdueItems = activeItems.filter(({ instance }) => Boolean(instance.dueDate && instance.dueDate < todayKey))
      const dueSoonItems = activeItems.filter(({ instance }) => Boolean(instance.dueDate && instance.dueDate >= todayKey && instance.dueDate <= dueSoonKey))
      const remaining = activeItems.length

      if (!remaining) {
        return {
          id: group.key,
          title: group.title,
          subtitle: readinessSubtitle(group),
          statusLabel: 'Ready',
          tone: 'ok' as DashboardTone,
          remaining: 0,
        }
      }

      if (overdueItems.length) {
        return {
          id: group.key,
          title: group.title,
          subtitle: readinessSubtitle(group),
          statusLabel: overdueItems.length === 1 ? '1 item overdue' : `${overdueItems.length} items overdue`,
          tone: 'bad' as DashboardTone,
          remaining,
        }
      }

      if (dueSoonItems.length) {
        const nextDue = dueSoonItems
          .slice()
          .sort((a, b) => (a.instance.dueDate ?? '9999-12-31').localeCompare(b.instance.dueDate ?? '9999-12-31'))[0]
        const requirementName = nextDue.definition?.name ?? 'Requirement'
        return {
          id: group.key,
          title: group.title,
          subtitle: readinessSubtitle(group),
          statusLabel: `${requirementName} due`,
          tone: 'warn' as DashboardTone,
          remaining,
        }
      }

      return {
        id: group.key,
        title: group.title,
        subtitle: readinessSubtitle(group),
        statusLabel: remaining === 1 ? '1 item remaining' : `${remaining} items remaining`,
        tone: 'info' as DashboardTone,
        remaining,
      }
    })
    .sort((a, b) => {
      const tonePriority = (item: DashboardReadinessItem) => item.tone === 'bad' ? 0 : item.tone === 'warn' ? 1 : item.tone === 'info' ? 2 : 3
      const toneDelta = tonePriority(a) - tonePriority(b)
      if (toneDelta !== 0) return toneDelta
      return a.title.localeCompare(b.title)
    })
    .slice(0, limit)
}

export function getSyncHealthSummary(
  feeds: CalendarFeed[],
  syncHistory: CalendarFeedSyncRun[],
  now = new Date()
): DashboardSyncHealth {
  if (!feeds.length) {
    return {
      tone: 'info',
      title: 'No calendar feeds yet',
      detail: 'Add an assigning-platform feed when you want Whistle Keeper to pull assignments automatically.',
    }
  }

  const enabledFeeds = feeds.filter(feed => feed.enabled)
  if (!enabledFeeds.length) {
    return {
      tone: 'info',
      title: 'Feeds are paused',
      detail: 'Your saved feeds are currently disabled, so new assignments will not sync in.',
    }
  }

  const neverSyncedFeeds = enabledFeeds.filter(feed => !feed.lastSyncedAt)
  const feedsWithHistory = enabledFeeds.filter((feed): feed is CalendarFeed & { lastSyncedAt: string } => Boolean(feed.lastSyncedAt))

  const latestFailed = syncHistory.find(run => run.status === 'failed')
  if (latestFailed) {
    return {
      tone: 'bad',
      title: 'A recent sync failed',
      detail: `${latestFailed.feedName} needs attention. Open Sync to review the latest errors and retry the feed.`,
    }
  }

  const latestPartial = syncHistory.find(run => run.status === 'partial')
  if (latestPartial) {
    return {
      tone: 'warn',
      title: 'A feed synced with warnings',
      detail: `${latestPartial.feedName} finished with warnings. Open Sync to review what was skipped or merged.`,
    }
  }

  if (feedsWithHistory.length === 0 && neverSyncedFeeds.length > 0) {
    return {
      tone: 'info',
      title: neverSyncedFeeds.length === 1 ? '1 feed is ready for first sync' : `${neverSyncedFeeds.length} feeds are ready for first sync`,
      detail: 'Run your first sync when you want Whistle Keeper to pull assignments in automatically.',
    }
  }

  const staleFeeds = feedsWithHistory.filter(feed => {
    return now.getTime() - new Date(feed.lastSyncedAt).getTime() > 48 * 60 * 60 * 1000
  })

  if (staleFeeds.length) {
    return {
      tone: 'warn',
      title: staleFeeds.length === 1 ? '1 feed needs a refresh' : `${staleFeeds.length} feeds need a refresh`,
      detail: staleFeeds.length === 1
        ? `${staleFeeds[0].name} has not synced recently.`
        : 'One or more feeds have not synced recently.',
    }
  }

  if (neverSyncedFeeds.length > 0) {
    return {
      tone: 'ok',
      title: 'Sync looks healthy',
      detail: `${feedsWithHistory.length} active feed${feedsWithHistory.length === 1 ? '' : 's'} have synced recently, and ${neverSyncedFeeds.length} ${neverSyncedFeeds.length === 1 ? 'is' : 'are'} ready for first sync.`,
    }
  }

  return {
    tone: 'ok',
    title: 'Sync looks healthy',
    detail: `All ${enabledFeeds.length} active feed${enabledFeeds.length === 1 ? '' : 's'} have synced recently.`,
  }
}

export function getAttentionNeeded(args: {
  db: DB
  onboardingIncomplete: boolean
  feeds: CalendarFeed[]
  syncHistory: CalendarFeedSyncRun[]
  syncError?: string | null
  appError?: string | null
  today?: Date
}): DashboardAttentionItem[] {
  const {
    db,
    onboardingIncomplete,
    feeds,
    syncHistory,
    syncError,
    appError,
    today = new Date(),
  } = args

  const items: DashboardAttentionItem[] = []

  if (appError) {
    items.push({
      id: 'app-error',
      title: 'Whistle Keeper hit a sync problem',
      detail: appError,
      tone: 'bad',
    })
  }

  if (syncError) {
    items.push({
      id: 'sync-health-error',
      title: 'Feed health could not be loaded',
      detail: syncError,
      tone: 'warn',
      href: '/sync',
    })
  } else {
    const syncHealth = getSyncHealthSummary(feeds, syncHistory, today)
    if (syncHealth.tone === 'warn' || syncHealth.tone === 'bad') {
      items.push({
        id: 'sync-health',
        title: syncHealth.title,
        detail: syncHealth.detail,
        tone: syncHealth.tone,
        href: '/sync',
      })
    }
  }

  const readinessAttention = getReadinessSummary(db, today, 3)
    .filter(item => item.tone === 'warn' || item.tone === 'bad')
    .map(item => ({
      id: `readiness-${item.id}`,
      title: item.title,
      detail: item.statusLabel,
      tone: item.tone,
      href: '/requirements',
    }))

  items.push(...readinessAttention)

  const missingBackfillCount = db.games.filter(completedNeedsBackfill).length
  if (missingBackfillCount) {
    items.push({
      id: 'missing-backfill',
      title: 'Completed assignments need cleanup',
      detail: missingBackfillCount === 1
        ? '1 completed assignment is still missing mileage or earnings details.'
        : `${missingBackfillCount} completed assignments are still missing mileage or earnings details.`,
      tone: 'info',
      href: '/games',
    })
  }

  if (onboardingIncomplete && !db.games.length) {
    items.push({
      id: 'onboarding',
      title: 'Finish your referee profile',
      detail: 'Save a verified mileage origin so directions, mileage, and future assignments work smoothly.',
      tone: 'info',
      href: '/onboarding',
    })
  }

  return items.slice(0, 4)
}

export function mapsHrefForAddress(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}
