import { describe, expect, it } from 'vitest'
import { findManualMatch } from './sync-game-match.js'

const incoming = {
  gameDate: '2026-09-10', startTime: '19:15', sport: 'Soccer',
  competitionLevel: 'High School', location: 'Pickerington North HS',
}
const game = {
  id: 'played', game_date: incoming.gameDate, start_time: '19:15:00',
  sport: 'Soccer', competition_level: 'High School', status: 'Played',
  location_address: 'Pickerington North High School',
}

function match(games: object[], event = incoming) {
  return findManualMatch(games, new Set(games.map(g => String((g as { id: string }).id))), event)
}

describe('feed game matching', () => {
  it('recognizes the reported HS spelling despite another game in the same slot', () => {
    const other = { ...game, id: 'other', location_address: 'Pickerington Central High School' }
    expect(match([game, other]).match?.id).toBe('played')
  })

  it('recognizes Olentangy Orange HS while preserving the paid record identity', () => {
    const paid = { ...game, id: 'paid', status: 'Paid', paid_confirmed: true, location_address: 'Olentangy Orange High School' }
    const result = match([paid, { ...game, id: 'other' }], { ...incoming, location: 'Olentangy Orange HS' })
    expect(result.match).toBe(paid)
  })

  it('flags existing duplicates for review instead of choosing one arbitrarily', () => {
    const result = match([game, { ...game, id: 'duplicate', status: 'Scheduled' }])
    expect(result.ambiguous).toBe(true)
    expect(result.match).toBeNull()
  })

  it('does not match a different date or a game over thirty minutes away', () => {
    expect(match([{ ...game, game_date: '2026-09-11' }]).match).toBeNull()
    expect(match([{ ...game, start_time: '20:00' }]).match).toBeNull()
  })
})
