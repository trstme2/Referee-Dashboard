export type CalendarFeedUrlScheme = 'webcal' | 'https' | 'http' | 'unknown'

export type CalendarFeedUrlAssessment =
  | {
      ok: true
      normalizedUrl: string
      scheme: CalendarFeedUrlScheme
      warning: string | null
      warningCategory: 'not_feed_like' | null
      looksLikeFeed: boolean
    }
  | {
      ok: false
      scheme: CalendarFeedUrlScheme
      error: string
      validationCategory: 'missing' | 'invalid_shape' | 'unsupported_protocol' | 'insecure_protocol'
    }

const FEED_HINT_PATTERN = /(\.ics\b|ical|calendar|feed|subscribe|webcal)/i

function schemeFor(raw: string): CalendarFeedUrlScheme {
  const normalized = raw.trim().toLowerCase()
  if (normalized.startsWith('webcal://')) return 'webcal'
  if (normalized.startsWith('https://')) return 'https'
  if (normalized.startsWith('http://')) return 'http'
  return 'unknown'
}

export function normalizeCalendarFeedUrl(raw: string): { normalizedUrl: string; scheme: CalendarFeedUrlScheme } {
  const trimmed = raw.trim()
  const scheme = schemeFor(trimmed)
  if (scheme === 'webcal') {
    return {
      normalizedUrl: `https://${trimmed.slice('webcal://'.length)}`,
      scheme,
    }
  }
  return {
    normalizedUrl: trimmed,
    scheme,
  }
}

export function assessCalendarFeedUrl(raw: string): CalendarFeedUrlAssessment {
  const trimmed = raw.trim()
  if (!trimmed) {
    return {
      ok: false,
      scheme: 'unknown',
      error: 'Paste the calendar feed URL from your assigning platform.',
      validationCategory: 'missing',
    }
  }

  const { normalizedUrl, scheme } = normalizeCalendarFeedUrl(trimmed)
  if (scheme === 'http') {
    return {
      ok: false,
      scheme,
      error: 'Whistle Keeper only accepts secure calendar feed URLs. Look for an https:// or webcal:// feed link.',
      validationCategory: 'insecure_protocol',
    }
  }

  if (scheme === 'unknown') {
    return {
      ok: false,
      scheme,
      error: 'That does not look like a valid calendar feed URL.',
      validationCategory: 'unsupported_protocol',
    }
  }

  try {
    const url = new URL(normalizedUrl)
    if (url.protocol !== 'https:') {
      return {
        ok: false,
        scheme,
        error: 'That does not look like a valid calendar feed URL.',
        validationCategory: 'unsupported_protocol',
      }
    }
    const looksLikeFeed = FEED_HINT_PATTERN.test(normalizedUrl)
    return {
      ok: true,
      normalizedUrl: url.toString(),
      scheme,
      warning: looksLikeFeed ? null : 'This looks more like a normal web page than a calendar feed. Look for iCal, subscribe, export, or calendar feed.',
      warningCategory: looksLikeFeed ? null : 'not_feed_like',
      looksLikeFeed,
    }
  } catch {
    return {
      ok: false,
      scheme,
      error: 'That does not look like a valid calendar feed URL.',
      validationCategory: 'invalid_shape',
    }
  }
}

export function friendlyCalendarFeedError(raw: unknown): string {
  const message = String((raw as any)?.message ?? raw ?? '').toLowerCase()

  if (message.includes('feedurl must use https')) {
    return 'Whistle Keeper only accepts secure calendar feed URLs. Look for an https:// or webcal:// feed link.'
  }
  if (message.includes('feedurl is required')) {
    return 'Paste the calendar feed URL from your assigning platform.'
  }
  if (message.includes('feed host is not allowed')) {
    return 'Whistle Keeper could not read this feed. Check that you copied the full iCal/calendar URL.'
  }
  if (message.includes('feed redirect') || message.includes('too many feed redirects')) {
    return 'Whistle Keeper could not read this feed. Check that you copied the full iCal/calendar URL.'
  }
  if (message.includes('http 401') || message.includes('http 403') || message.includes('http 404')) {
    return 'Whistle Keeper could not read this feed. Check that you copied the full iCal/calendar URL.'
  }
  if (message.includes('content type') || message.includes('parse failed') || message.includes('must be a valid https url')) {
    return 'This looks like a normal website link, not a calendar feed. Look for iCal, subscribe, export, or calendar feed.'
  }

  return 'Whistle Keeper could not read this feed. Check that you copied the full iCal/calendar URL.'
}
