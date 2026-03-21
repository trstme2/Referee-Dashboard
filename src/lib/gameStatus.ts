import type { Game } from './types'

type LegacyCompatibleGame = Omit<Pick<Game, 'status' | 'paidConfirmed' | 'paidDate' | 'gameDate'>, 'status'> & {
  status: Game['status'] | 'Completed'
}

export function migrateLegacyGameStatus<T extends LegacyCompatibleGame>(game: T): T {
  if (game.status !== 'Completed') return game

  return {
    ...game,
    status: game.paidConfirmed ? 'Paid / Complete' : 'Played',
    paidConfirmed: Boolean(game.paidConfirmed),
    paidDate: game.paidConfirmed ? (game.paidDate ?? game.gameDate) : undefined,
  }
}
