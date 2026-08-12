import { describe, expect, it } from 'vitest'
import { getRecentCompletedGames, getUpcomingGames, sortGamesAroundToday } from './gameSchedule'
import type { Game } from './types'

function game(id: string, gameDate: string, startTime: string | undefined, status: Game['status']): Game {
  return {
    id,
    sport: 'Soccer',
    competitionLevel: 'High School',
    gameDate,
    startTime,
    locationAddress: 'Test Field',
    status,
    paidConfirmed: status === 'Paid / Complete',
    platformConfirmations: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('game schedule helpers', () => {
  const today = '2026-08-11'
  const games = [
    game('future-late', '2026-08-20', '19:00', 'Scheduled'),
    game('recent-paid', '2026-08-10', '19:00', 'Paid / Complete'),
    game('next-up', '2026-08-12', '17:00', 'Scheduled'),
    game('recent-unpaid', '2026-08-10', '20:00', 'Played'),
    game('canceled', '2026-08-09', '17:00', 'Canceled'),
  ]

  it('puts the nearest scheduled assignments first', () => {
    expect(getUpcomingGames(games, today).map((item) => item.id)).toEqual(['next-up', 'future-late'])
  })

  it('shows recent completed assignments newest first', () => {
    expect(getRecentCompletedGames(games, today).map((item) => item.id)).toEqual(['recent-unpaid', 'recent-paid'])
  })

  it('sorts the full schedule around today and keeps canceled games last', () => {
    expect(sortGamesAroundToday(games, today).map((item) => item.id)).toEqual([
      'next-up',
      'future-late',
      'recent-unpaid',
      'recent-paid',
      'canceled',
    ])
  })
})

