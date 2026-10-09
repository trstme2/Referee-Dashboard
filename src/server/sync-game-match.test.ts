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

function match(games: object[], event: typeof incoming & { homeTeam?: string; awayTeam?: string } = incoming) {
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

describe('replacement assignments', () => {
  const old = { ...game, id: 'carlow', game_date: '2026-10-07', start_time: '19:00',
    competition_level: 'College', status: 'Scheduled',
    home_team: 'Marietta', away_team: 'Carlow', location_address: 'Marietta College' }
  const replacement = { ...incoming, gameDate: '2026-10-07', startTime: '19:00',
    competitionLevel: 'College', homeTeam: 'Muskingum (OH)', awayTeam: 'Otterbein',
    location: 'Muskingum University (OH)' }

  it('does not absorb Otterbein at Muskingum into Carlow at Marietta', () => {
    expect(match([old], replacement)).toEqual({ match: null, ambiguous: false })
    expect(match([{ ...old, status: 'Canceled' }], replacement).match).toBeNull()
  })

  it('rejects a changed opponent even at the same venue', () => {
    expect(match([old], { ...replacement, homeTeam: 'Marietta', location: 'Marietta College' }).match).toBeNull()
  })

  it('does not accept a conflicting venue just because the slot is unique', () => {
    expect(match([{ ...old, home_team: null, away_team: null }], replacement).match).toBeNull()
  })

  it('allows venue corrections when both teams agree', () => {
    expect(match([old], { ...replacement, homeTeam: 'Marietta', awayTeam: 'Carlow' }).match?.id).toBe('carlow')
  })

  it('keeps missing and TBD team names from becoming false conflicts', () => {
    expect(match([{ ...old, away_team: 'TBD' }],
      { ...replacement, homeTeam: 'Marietta', location: 'Marietta College' }).match?.id).toBe('carlow')
  })

  it('cannot claim an existing source-linked game reserved for another event', () => {
    const event = { ...replacement, homeTeam: 'Marietta', awayTeam: 'Carlow', location: 'Marietta College' }
    expect(findManualMatch([old], new Set(), event).match).toBeNull()
  })
})
