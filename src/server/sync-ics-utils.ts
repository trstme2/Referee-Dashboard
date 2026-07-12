const DRAGONFLY_BLOCK_RANGE_SUFFIX = /\s+\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s*(?:am|pm)\s*-\s*\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s*(?:am|pm)\s*$/i
const AVAILABILITY_BLOCK_PATTERN = /\b(availability(?:\s+block)?|unavailable|not\s+available|blocked|blackout|out\s+of\s+office)\b/i

type FeedEventSlot = {
  eventType: string
  start: Date
  end: Date
  allDay: boolean
}

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
