import type { Sport } from './types'

export const DEFAULT_TRACKED_SPORTS: Sport[] = ['Soccer', 'Lacrosse']

export function uniqueCleanList(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const item = String(value ?? '').trim()
    if (!item) continue
    const key = item.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

export function trackedSportsFor(settingsSports?: string[], extraSports: Array<string | null | undefined> = []): Sport[] {
  const sports = uniqueCleanList([
    ...(settingsSports?.length ? settingsSports : DEFAULT_TRACKED_SPORTS),
    ...extraSports,
  ])
  return (sports.length ? sports : DEFAULT_TRACKED_SPORTS) as Sport[]
}
