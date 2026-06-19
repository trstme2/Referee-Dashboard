import { describe, expect, it } from 'vitest'
import { assessCalendarFeedUrl, friendlyCalendarFeedError, normalizeCalendarFeedUrl } from './calendarFeedInput'

describe('calendar feed input assessment', () => {
  it('normalizes webcal urls to https', () => {
    expect(normalizeCalendarFeedUrl('webcal://example.com/calendar.ics')).toEqual({
      normalizedUrl: 'https://example.com/calendar.ics',
      scheme: 'webcal',
    })
  })

  it('accepts https feed-looking urls', () => {
    expect(assessCalendarFeedUrl('https://example.com/calendar.ics')).toEqual({
      ok: true,
      normalizedUrl: 'https://example.com/calendar.ics',
      scheme: 'https',
      warning: null,
      warningCategory: null,
      looksLikeFeed: true,
    })
  })

  it('warns when a url looks more like a normal page than a feed', () => {
    const result = assessCalendarFeedUrl('https://example.com/schedule')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.warningCategory).toBe('not_feed_like')
      expect(result.warning).toContain('normal web page')
    }
  })

  it('blocks insecure http urls with a friendly explanation', () => {
    expect(assessCalendarFeedUrl('http://example.com/calendar.ics')).toEqual({
      ok: false,
      scheme: 'http',
      error: 'Whistle Keeper only accepts secure calendar feed URLs. Look for an https:// or webcal:// feed link.',
      validationCategory: 'insecure_protocol',
    })
  })

  it('rejects invalid urls cleanly', () => {
    expect(assessCalendarFeedUrl('not a url')).toEqual({
      ok: false,
      scheme: 'unknown',
      error: 'That does not look like a valid calendar feed URL.',
      validationCategory: 'unsupported_protocol',
    })
  })

  it('maps server-ish errors back to user-friendly copy', () => {
    expect(friendlyCalendarFeedError('feedUrl must use https')).toContain('secure calendar feed URLs')
    expect(friendlyCalendarFeedError('feed host is not allowed')).toContain('copied the full iCal/calendar URL')
    expect(friendlyCalendarFeedError('content type is not allowed')).toContain('normal website link')
  })
})
