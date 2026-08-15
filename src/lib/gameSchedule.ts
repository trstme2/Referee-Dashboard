import type { Game } from './types'

function gameDateTimeKey(game: Game): string {
  return `${game.gameDate} ${game.startTime ?? '99:99'}`
}

function compareAscending(a: Game, b: Game): number {
  return gameDateTimeKey(a).localeCompare(gameDateTimeKey(b))
}

function compareDescending(a: Game, b: Game): number {
  return compareAscending(b, a)
}

export function getUpcomingGames(games: Game[], today: string): Game[] {
  return games
    .filter((game) => game.status === 'Scheduled' && game.gameDate >= today)
    .sort(compareAscending)
}

export function getRecentGames(games: Game[], today: string): Game[] {
  return games
    .filter((game) =>
      game.status !== 'Canceled' && (
        game.gameDate < today ||
        (game.gameDate === today && (game.status === 'Played' || game.status === 'Paid / Complete'))
      )
    )
    .sort(compareDescending)
}

export function sortGamesAroundToday(games: Game[], today: string): Game[] {
  return [...games].sort((a, b) => {
    const aCanceled = a.status === 'Canceled'
    const bCanceled = b.status === 'Canceled'
    if (aCanceled !== bCanceled) return aCanceled ? 1 : -1

    const aUpcoming = a.gameDate >= today
    const bUpcoming = b.gameDate >= today
    if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1
    return aUpcoming ? compareAscending(a, b) : compareDescending(a, b)
  })
}
