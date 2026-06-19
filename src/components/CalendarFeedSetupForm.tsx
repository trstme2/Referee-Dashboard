import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ASSIGNING_PLATFORM_OPTIONS,
  assigningPlatformConfidenceLabel,
  assigningPlatformStoredValue,
  getAssigningPlatformGuide,
  type AssigningPlatformGuideId,
} from '../lib/assigningPlatformGuides'
import {
  assessCalendarFeedUrl,
  friendlyCalendarFeedError,
  type CalendarFeedUrlScheme,
} from '../lib/calendarFeedInput'
import { recordPlatformEvent } from '../lib/platformEvents'
import type { Sport } from '../lib/types'

export type CalendarFeedSetupValue = {
  guideId: AssigningPlatformGuideId
  platform: string
  otherPlatformName: string
  name: string
  feedUrl: string
  sport: '' | Sport
  defaultLeague?: string
  importStartDate?: string
  enabled?: boolean
}

export type CalendarFeedSetupSubmitValue = CalendarFeedSetupValue & {
  normalizedFeedUrl: string | null
  resolvedPlatform: string
  urlScheme: CalendarFeedUrlScheme | null
}

type CalendarFeedSetupFormProps = {
  accessToken?: string
  mode: 'compact' | 'full'
  source: 'onboarding' | 'sync_page'
  value: CalendarFeedSetupValue
  sportOptions: Sport[]
  submitting: boolean
  submitLabel: string
  feedUrlOptional?: boolean
  showAdvancedFields?: boolean
  inlineMessage?: string | null
  inlineError?: string | null
  onChange: (next: CalendarFeedSetupValue) => void
  onSubmit: (next: CalendarFeedSetupSubmitValue) => Promise<void> | void
  secondaryAction?: ReactNode
  footerLinks?: ReactNode
}

function defaultFeedName(platformName: string): string {
  return `${platformName} assignments`
}

export default function CalendarFeedSetupForm({
  accessToken,
  mode,
  source,
  value,
  sportOptions,
  submitting,
  submitLabel,
  feedUrlOptional = false,
  showAdvancedFields = false,
  inlineMessage,
  inlineError,
  onChange,
  onSubmit,
  secondaryAction,
  footerLinks,
}: CalendarFeedSetupFormProps) {
  const [localError, setLocalError] = useState<string | null>(null)
  const startedRef = useRef(false)
  const pastedRef = useRef(false)
  const otherLoggedRef = useRef(false)
  const guide = useMemo(() => getAssigningPlatformGuide(value.guideId), [value.guideId])
  const assessment = useMemo(() => assessCalendarFeedUrl(value.feedUrl), [value.feedUrl])

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    void recordPlatformEvent(accessToken, 'calendar_feed_add_started', {
      source,
      mode,
    })
  }, [accessToken, mode, source])

  function update(patch: Partial<CalendarFeedSetupValue>) {
    setLocalError(null)
    onChange({ ...value, ...patch })
  }

  function handleGuideChange(nextGuideId: AssigningPlatformGuideId) {
    const nextGuide = getAssigningPlatformGuide(nextGuideId)
    const nextPlatform = nextGuide.platformValue ?? value.otherPlatformName.trim()
    const previousDefaultName = value.guideId === 'other'
      ? defaultFeedName(value.otherPlatformName.trim() || getAssigningPlatformGuide(value.guideId).name)
      : defaultFeedName(getAssigningPlatformGuide(value.guideId).platformValue ?? getAssigningPlatformGuide(value.guideId).name)
    const nextDefaultName = defaultFeedName((nextGuide.platformValue ?? value.otherPlatformName.trim()) || nextGuide.name)
    update({
      guideId: nextGuideId,
      platform: nextPlatform,
      otherPlatformName: nextGuideId === 'other' ? value.otherPlatformName : '',
      name: !value.name.trim() || value.name.trim() === previousDefaultName ? nextDefaultName : value.name,
    })
    void recordPlatformEvent(accessToken, 'assigning_platform_selected', {
      source,
      platformId: nextGuide.id,
      confidenceLabel: assigningPlatformConfidenceLabel(nextGuide.confidence),
      usedOther: nextGuide.id === 'other',
    })
  }

  function handleFeedUrlBlur() {
    if (!value.feedUrl.trim() || pastedRef.current) return
    pastedRef.current = true
    void recordPlatformEvent(accessToken, 'calendar_feed_url_pasted', {
      source,
      platformId: guide.id,
      confidenceLabel: assigningPlatformConfidenceLabel(guide.confidence),
      urlScheme: assessment.scheme,
      usedOther: guide.id === 'other',
    })
  }

  function handleOtherPlatformBlur() {
    if (guide.id !== 'other' || !value.otherPlatformName.trim() || otherLoggedRef.current) return
    otherLoggedRef.current = true
    void recordPlatformEvent(accessToken, 'platform_other_entered', {
      source,
      platformName: value.otherPlatformName.trim().slice(0, 60),
    })
  }

  async function submit() {
    const resolvedPlatform = assigningPlatformStoredValue(guide.id, value.otherPlatformName)
    if (!resolvedPlatform) {
      const error = 'Tell Whistle Keeper which platform you use so we can save this feed cleanly.'
      setLocalError(error)
      void recordPlatformEvent(accessToken, 'calendar_feed_validation_failed', {
        source,
        platformId: guide.id,
        validationCategory: 'missing_platform_name',
        usedOther: true,
      })
      return
    }
    if (!value.name.trim()) {
      setLocalError('Give this feed a short name so you can tell it apart later.')
      void recordPlatformEvent(accessToken, 'calendar_feed_validation_failed', {
        source,
        platformId: guide.id,
        validationCategory: 'missing_name',
        usedOther: guide.id === 'other',
      })
      return
    }

    if (feedUrlOptional && !value.feedUrl.trim()) {
      await onSubmit({
        ...value,
        normalizedFeedUrl: null,
        resolvedPlatform,
        urlScheme: null,
      })
      return
    }

    if (!assessment.ok) {
      setLocalError(assessment.error)
      void recordPlatformEvent(accessToken, 'calendar_feed_validation_failed', {
        source,
        platformId: guide.id,
        validationCategory: assessment.validationCategory,
        urlScheme: assessment.scheme,
        usedOther: guide.id === 'other',
      })
      return
    }

    await onSubmit({
      ...value,
      normalizedFeedUrl: assessment.normalizedUrl,
      resolvedPlatform,
      urlScheme: assessment.scheme,
    })
  }

  const displayError = inlineError ? friendlyCalendarFeedError(inlineError) : localError

  return (
    <section className={`guided-feed-flow ${mode}`.trim()}>
      <div className="guided-feed-intro">
        <p className="small">
          Whistle Keeper does not need your assigning platform password. Paste only the calendar feed URL provided by your assigning platform.
        </p>
        <p className="small">
          Calendar feed URLs often start with <code>webcal://</code>, <code>https://</code>, or sometimes <code>http://</code> and may include <code>.ics</code>, <code>calendar</code>, <code>ical</code>, <code>subscribe</code>, or <code>feed</code>.
        </p>
      </div>

      <div className="field">
        <label>Assigning platform</label>
        <select value={value.guideId} onChange={(event) => handleGuideChange(event.target.value as AssigningPlatformGuideId)}>
          {ASSIGNING_PLATFORM_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </div>

      {guide.id === 'other' ? (
        <div className="field">
          <label>Platform name</label>
          <input
            value={value.otherPlatformName}
            onChange={(event) => {
              const nextOtherPlatformName = event.target.value
              const nextDefaultName = defaultFeedName(nextOtherPlatformName || 'Other platform')
              const previousDefaultName = defaultFeedName(value.otherPlatformName.trim() || 'Other platform')
              update({
                otherPlatformName: nextOtherPlatformName,
                platform: nextOtherPlatformName,
                name: !value.name.trim() || value.name.trim() === previousDefaultName ? nextDefaultName : value.name,
              })
            }}
            onBlur={handleOtherPlatformBlur}
            placeholder="Tell us what platform you use"
          />
        </div>
      ) : null}

      <section className="card guided-platform-card">
        <div className="guided-platform-card-head">
          <div>
            <h3>{guide.name}</h3>
            <p className="small">{guide.description}</p>
          </div>
          <span className="pill info">{assigningPlatformConfidenceLabel(guide.confidence)}</span>
        </div>

        <div className="btnbar">
          {guide.loginUrl ? (
            <a
              className="btn"
              href={guide.loginUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => {
                void recordPlatformEvent(accessToken, 'assigning_platform_help_clicked', {
                  source,
                  platformId: guide.id,
                  target: 'login',
                })
              }}
            >
              Open {guide.name}
            </a>
          ) : null}
          {guide.helpUrl ? (
            <a
              className="btn"
              href={guide.helpUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => {
                void recordPlatformEvent(accessToken, 'assigning_platform_help_clicked', {
                  source,
                  platformId: guide.id,
                  target: 'help',
                })
              }}
            >
              Platform help
            </a>
          ) : null}
        </div>

        <div className="guided-platform-section">
          <strong>How to find the feed</strong>
          <ol className="guided-platform-list">
            {guide.instructions.map((instruction) => (
              <li key={instruction}>{instruction}</li>
            ))}
          </ol>
        </div>

        {guide.mobileInstructions?.length ? (
          <div className="guided-platform-section">
            <strong>On a phone</strong>
            <ul className="guided-platform-list is-bulleted">
              {guide.mobileInstructions.map((instruction) => (
                <li key={instruction}>{instruction}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="guided-platform-callout">
          <strong>Heads up</strong>
          <p>{guide.caveat}</p>
        </div>

        {guide.specialNotes?.length ? (
          <div className="guided-platform-section">
            <strong>Special notes</strong>
            <ul className="guided-platform-list is-bulleted">
              {guide.specialNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <div className="field">
        <label>Feed name</label>
        <input
          value={value.name}
          onChange={(event) => update({ name: event.target.value })}
          placeholder={guide.platformValue ? defaultFeedName(guide.platformValue) : 'My assigning feed'}
        />
      </div>

      <div className="field">
        <label>{feedUrlOptional ? 'Replace feed URL (optional)' : 'iCal feed URL'}</label>
        <input
          value={value.feedUrl}
          onChange={(event) => update({ feedUrl: event.target.value })}
          onBlur={handleFeedUrlBlur}
          placeholder="webcal://... or https://..."
        />
        {assessment.ok && assessment.warning ? <div className="small"><span className="pill warn">{assessment.warning}</span></div> : null}
        {assessment.ok && assessment.scheme === 'webcal' ? (
          <div className="small">Whistle Keeper will convert this <code>webcal://</code> link into a secure feed URL before saving it.</div>
        ) : null}
      </div>

      <div className="row">
        <div className="field">
          <label>Sport (optional)</label>
          <select value={value.sport} onChange={(event) => update({ sport: event.target.value as '' | Sport })}>
            <option value="">Auto-detect</option>
            {sportOptions.map((sport) => <option key={sport} value={sport}>{sport}</option>)}
          </select>
        </div>
        {showAdvancedFields ? (
          <div className="field">
            <label>Default league (optional)</label>
            <input value={value.defaultLeague ?? ''} onChange={(event) => update({ defaultLeague: event.target.value })} />
          </div>
        ) : null}
      </div>

      {showAdvancedFields ? (
        <>
          <div className="field">
            <label>Import events on/after (optional)</label>
            <input
              type="date"
              value={value.importStartDate ?? ''}
              onChange={(event) => update({ importStartDate: event.target.value })}
            />
            <div className="small">Only assignments on or after this date will be imported from this feed.</div>
          </div>

          <div className="field">
            <label>Enabled</label>
            <select value={value.enabled ? 'Yes' : 'No'} onChange={(event) => update({ enabled: event.target.value === 'Yes' })}>
              <option>Yes</option>
              <option>No</option>
            </select>
          </div>
        </>
      ) : null}

      <div className="btnbar">
        <button className="btn primary" onClick={() => void submit()} disabled={submitting}>
          {submitting ? 'Saving...' : submitLabel}
        </button>
        {secondaryAction}
      </div>

      {(inlineMessage || displayError) ? (
        <div className="onboarding-status" aria-live="polite">
          {inlineMessage ? <span className="pill ok">{inlineMessage}</span> : null}
          {displayError ? <span className="pill bad">{displayError}</span> : null}
        </div>
      ) : null}

      {footerLinks ? <div className="guided-feed-footer">{footerLinks}</div> : null}
      {mode === 'compact' ? <div className="small">If you already know the URL, you can paste it directly here without following the steps above.</div> : null}
      {mode === 'full' ? (
        <p className="small">
          Whistle Keeper reads the calendar feed. It does not write assignments back to your assigning platform or ask for your assigning-platform credentials.
        </p>
      ) : null}
      {mode === 'full' ? <div className="small">If the feed does not include pay or location, that is normal. You can add those after sync in each game.</div> : null}
      {footerLinks && source === 'onboarding' ? <Link className="small" to="/sync">Prefer the full feed manager? Open Sync.</Link> : null}
    </section>
  )
}
