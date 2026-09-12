function normText(s: string | null | undefined): string {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\bhs\b/g, 'high school').replace(/\bms\b/g, 'middle school').replace(/\s+/g, ' ').trim()
}

function sameLocation(a: string | null | undefined, b: string | null | undefined): boolean {
  const aa = normText(a)
  const bb = normText(b)
  if (!aa || !bb) return false
  return aa.includes(bb) || bb.includes(aa)
}

function sameTeam(a: string | null | undefined, b: string | null | undefined): boolean {
  const aa = normText(a)
  const bb = normText(b)
  if (!aa || !bb) return false
  return aa === bb || aa.includes(bb) || bb.includes(aa)
}

function minutesBetween(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null
  const [ah, am] = String(a).slice(0, 5).split(':').map(Number)
  const [bh, bm] = String(b).slice(0, 5).split(':').map(Number)
  if (![ah, am, bh, bm].every(Number.isFinite)) return null
  return Math.abs((ah * 60 + am) - (bh * 60 + bm))
}

function manualCandidateScore(g: any, n: any): number {
  if (String(g.game_date) !== n.gameDate) return 0
  if (g.status === 'Canceled') return 0

  let score = 0
  const gameStart = g.start_time ? String(g.start_time).slice(0, 5) : null
  if (gameStart && n.startTime && gameStart === n.startTime) score += 45
  else if (!gameStart || !n.startTime) score += 10
  else {
    const delta = minutesBetween(gameStart, n.startTime)
    if (delta == null || delta > 30) return 0
    score += delta <= 10 ? 28 : delta <= 20 ? 18 : 10
  }

  if (String(g.sport || '') === n.sport) score += 12
  if (String(g.competition_level || '') === n.competitionLevel) score += 8
  if (sameLocation(g.location_address, n.location)) score += 45

  const homeMatches = sameTeam(g.home_team, n.homeTeam)
  const awayMatches = sameTeam(g.away_team, n.awayTeam)
  if (homeMatches && awayMatches) score += 35
  else if (homeMatches || awayMatches) score += 18

  if (n.levelDetail && normText(g.level_detail) === normText(n.levelDetail)) score += 8
  return score
}

function sameExactSlot(g: any, n: any): boolean {
  const gameStart = g.start_time ? String(g.start_time).slice(0, 5) : null
  return (
    String(g.game_date) === n.gameDate &&
    gameStart != null &&
    n.startTime != null &&
    gameStart === n.startTime &&
    String(g.sport || '') === n.sport &&
    String(g.competition_level || '') === n.competitionLevel
  )
}

export function findManualMatch(dayGames: any[], unusedGameIds: Set<string>, n: any): {
  match: any | null
  topScore?: number
  competingScore?: number
  ambiguous: boolean
} {
  const exactSlotCandidates = dayGames.filter((g: any) =>
    unusedGameIds.has(String(g.id)) &&
    g.status !== 'Canceled' &&
    sameExactSlot(g, n)
  )

  const scored = dayGames
    .filter((g: any) => unusedGameIds.has(String(g.id)))
    .map((g: any) => {
      let score = manualCandidateScore(g, n)
      if (score > 0 && exactSlotCandidates.length === 1 && String(exactSlotCandidates[0].id) === String(g.id)) {
        score += 18
      }
      return { game: g, score }
    })
    .filter((x) => x.score >= (n.location ? 55 : 70))
    .sort((a, b) => b.score - a.score)

  const best = scored[0]
  const second = scored[1]
  if (!best) return { match: null, ambiguous: false }

  const margin = best.score - (second?.score ?? 0)
  const strongEnough = best.score >= (n.location ? 70 : 82)
  const clearlyBest = !second || margin >= 15
  if (strongEnough && clearlyBest) {
    return {
      match: best.game,
      topScore: best.score,
      competingScore: second?.score,
      ambiguous: false,
    }
  }

  return {
    match: null,
    topScore: best.score,
    competingScore: second?.score,
    ambiguous: Boolean(second || best.score >= 60),
  }
}
