import type { CalendarEvent } from './types'

const DRAGONFLY_BLOCK_RANGE_SUFFIX = /\s+\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s*(?:am|pm)\s*-\s*\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s*(?:am|pm)\s*$/i

function partsInTimeZone(iso: string, timeZone: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  return Object.fromEntries(parts.map(part => [part.type, part.value]))
}

function addDateKeyDays(key: string, days: number): string {
  const [year, month, day] = key.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function effectiveEventEnd(event: CalendarEvent): string {
  const startMs = new Date(event.start).getTime()
  const endMs = new Date(event.end).getTime()
  return new Date(endMs > startMs ? endMs - 1 : startMs).toISOString()
}

function formatTime(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleTimeString([], { timeZone, hour: 'numeric', minute: '2-digit' })
}

function formatDate(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleDateString([], { timeZone, month: 'short', day: 'numeric' })
}

export function calendarDateKey(iso: string, timeZone: string): string {
  const parts = partsInTimeZone(iso, timeZone)
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function calendarTimeInputValue(iso: string, timeZone: string): string {
  const parts = partsInTimeZone(iso, timeZone)
  return `${parts.hour}:${parts.minute}`
}

export function calendarEventDayKeys(event: CalendarEvent): string[] {
  const first = calendarDateKey(event.start, event.timezone)
  const last = calendarDateKey(effectiveEventEnd(event), event.timezone)
  const keys: string[] = []

  for (let key = first, count = 0; key <= last && count < 370; key = addDateKeyDays(key, 1), count += 1) {
    keys.push(key)
  }
  return keys
}

export function calendarEventTimeRangeLabel(event: CalendarEvent): string {
  if (event.allDay) return 'All day'
  const startDay = calendarDateKey(event.start, event.timezone)
  const endDay = calendarDateKey(event.end, event.timezone)
  const startTime = formatTime(event.start, event.timezone)
  const endTime = formatTime(event.end, event.timezone)
  if (startDay === endDay) return `${startTime} - ${endTime}`
  return `${formatDate(event.start, event.timezone)} ${startTime} - ${formatDate(event.end, event.timezone)} ${endTime}`
}

export function cleanupDragonFlyBlockTitle(title: string): string {
  return String(title || '').replace(/\s+/g, ' ').replace(DRAGONFLY_BLOCK_RANGE_SUFFIX, '').trim() || 'Blocked'
}

export function calendarEventDisplayTitle(event: CalendarEvent): string {
  if (event.eventType === 'Block' && event.externalRef?.startsWith('DragonFly:')) {
    return cleanupDragonFlyBlockTitle(event.title)
  }
  return event.title
}

export function visibleCalendarEvents(events: CalendarEvent[]): CalendarEvent[] {
  const dragonFlyBlockSlots = new Set<string>()
  return events.filter(event => {
    if (event.eventType !== 'Block' || !event.externalRef?.startsWith('DragonFly:')) return true
    const key = `${event.start}|${event.end}|${event.allDay}`
    if (dragonFlyBlockSlots.has(key)) return false
    dragonFlyBlockSlots.add(key)
    return true
  })
}
