const DRAGONFLY_BLOCK_RANGE_SUFFIX = /\s+\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s*(?:am|pm)\s*-\s*\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s*(?:am|pm)\s*$/i
const AVAILABILITY_BLOCK_PATTERN = /\b(availability(?:\s+block)?|unavailable|not\s+available|blocked|blackout|out\s+of\s+office)\b/i
const DRAGONFLY_ADMIN_PATTERN = /\b(?:soccer\s+)?(?:officials?|referees?)\s+assoc(?:iation|ation)\b|\b(?:MWSOA|NWOSOA|MVSOA)\b/i

type FeedEventSlot = {
  eventType: string
  start: Date
  end: Date
  allDay: boolean
}

type CompetitionLevel = 'High School' | 'College' | 'Club'

function dateKeyInZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

function addDateKeyDays(key: string, days: number): string {
  const [year, month, day] = key.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

export function cleanupDragonFlyBlockTitle(title: string): string {
  return String(title || '').replace(/\s+/g, ' ').replace(DRAGONFLY_BLOCK_RANGE_SUFFIX, '').trim() || 'Blocked'
}

export function looksLikeAvailabilityBlock(text: string): boolean {
  return AVAILABILITY_BLOCK_PATTERN.test(String(text || ''))
}

export function looksLikeDragonFlyAdministrativeEvent(text: string): boolean {
  const value = String(text || '')
  if (/\bvs\b/i.test(value)) return false
  return DRAGONFLY_ADMIN_PATTERN.test(value)
}

function platformKey(platform: string): string {
  return String(platform || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

export function defaultCompetitionLevelForPlatform(platform: string): CompetitionLevel {
  const key = platformKey(platform)
  if (key === 'refquest' || key === 'rq') return 'College'
  if (key === 'refinsight') return 'Club'
  if (key === 'dragonfly') return 'High School'
  return 'High School'
}

export function inferCompetitionLevelForPlatform(platform: string, text: string): CompetitionLevel {
  if (/\bcollege\b|\bncaa\b|\bnaia\b|\bjuco\b/i.test(text)) return 'College'
  if (/\bvarsity\b|\bjv\b|junior varsity|\bms\b|middle school|\bhs\b|high school/i.test(text)) return 'High School'
  if (/\badult\b|\bu\d{1,2}\b|\bclub\b/i.test(text)) return 'Club'
  return defaultCompetitionLevelForPlatform(platform)
}

function cleanTeamName(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/[.;,]\s*$/, '')
    .trim()
}

export function parseRefQuestTeamsFromText(text: string): { awayTeam: string | null; homeTeam: string | null } {
  const lines = String(text || '').split(/\r?\n|\s+\|\s+/).map(line => line.trim()).filter(Boolean)
  for (const line of lines) {
    const match = line.match(/^(.+?)\s+at\s+(.+?)\s*(?:\((?:\d{1,2}:\d{2}\s*)?(?:AM|PM)?\s*(?:[A-Z]{2,4})?\))?[.;]?\s*$/i)
    if (!match) continue
    const awayTeam = cleanTeamName(match[1])
    const homeTeam = cleanTeamName(match[2])
    if (awayTeam && homeTeam) return { awayTeam, homeTeam }
  }
  return { awayTeam: null, homeTeam: null }
}

export function blockSlotKey(event: FeedEventSlot | { event_type: string; start_ts: string; end_ts: string; all_day: boolean }): string {
  if ('eventType' in event) {
    return `${event.eventType}|${event.start.toISOString()}|${event.end.toISOString()}|${event.allDay}`
  }
  return `${event.event_type}|${event.start_ts}|${event.end_ts}|${event.all_day}`
}

export function dedupeFeedBlocks<T extends FeedEventSlot>(events: T[]): T[] {
  const blockSlots = new Set<string>()
  return events.filter(event => {
    if (event.eventType !== 'Block') return true
    const key = blockSlotKey(event)
    if (blockSlots.has(key)) return false
    blockSlots.add(key)
    return true
  })
}

export function dateKeysTouched(start: Date, end: Date, timeZone: string): string[] {
  const startMs = start.getTime()
  const endMs = end.getTime()
  const first = dateKeyInZone(start, timeZone)
  const last = dateKeyInZone(new Date(endMs > startMs ? endMs - 1 : startMs), timeZone)
  const keys: string[] = []

  for (let key = first, count = 0; key <= last && count < 370; key = addDateKeyDays(key, 1), count += 1) {
    keys.push(key)
  }
  return keys
}
