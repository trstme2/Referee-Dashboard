import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import CalendarFeedSetupForm, { type CalendarFeedSetupSubmitValue, type CalendarFeedSetupValue } from '../components/CalendarFeedSetupForm'
import HelpTip from '../components/HelpTip'
import { useData } from '../lib/DataContext'
import { assigningPlatformConfidenceLabel, getAssigningPlatformGuide } from '../lib/assigningPlatformGuides'
import { getOnboardingProgress } from '../lib/onboarding'
import { trackedSportsFor } from '../lib/preferences'
import { recordPlatformEvent } from '../lib/platformEvents'
import { resolveVerifiedProfileAddresses } from '../lib/profileAddressValidation'
import type { CalendarFeed, SyncIcsResult } from '../lib/types'

function parseList(value: string): string[] {
  return value.split(',').map((x) => x.trim()).filter(Boolean)
}

function listString(values: string[]): string {
  return values.join(', ')
}

function createInitialFeedForm(): CalendarFeedSetupValue {
  return {
    guideId: 'dragonfly',
    platform: 'DragonFly',
    otherPlatformName: '',
    name: 'DragonFly assignments',
    feedUrl: '',
    sport: '',
  }
}

function stepStatusLabel(kind: 'required' | 'recommended' | 'optional', complete: boolean): string {
  if (complete) {
    if (kind === 'required') return 'Required and ready'
    if (kind === 'recommended') return 'Recommended and ready'
    return 'Optional and ready'
  }
  if (kind === 'required') return 'Required before you begin'
  if (kind === 'recommended') return 'Recommended for day one'
  return 'Optional for later'
}

export default function OnboardingPage() {
  const { db, write, loading, mode, session, refresh } = useData()
  const navigate = useNavigate()
  const profilePanelRef = useRef<HTMLDivElement | null>(null)
  const [homeAddress, setHomeAddress] = useState(db.settings.homeAddress)
  const [timezone, setTimezone] = useState(db.settings.defaultTimezone || 'America/New_York')
  const [weeklyEmail, setWeeklyEmail] = useState(Boolean(db.settings.weeklyGamesEmailEnabled))
  const [trackedSports, setTrackedSports] = useState(listString(db.settings.trackedSports))
  const [platforms, setPlatforms] = useState(listString(db.settings.assigningPlatforms))
  const [leagues, setLeagues] = useState(listString(db.settings.leagues))
  const [feeds, setFeeds] = useState<CalendarFeed[]>([])
  const [feedForm, setFeedForm] = useState<CalendarFeedSetupValue>(() => createInitialFeedForm())
  const [feedSaving, setFeedSaving] = useState(false)
  const [assignmentPath, setAssignmentPath] = useState<'feed' | 'manual' | null>(null)
  const [defaultsSaving, setDefaultsSaving] = useState(false)
  const [profileMessage, setProfileMessage] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [feedMessage, setFeedMessage] = useState<string | null>(null)
  const [feedError, setFeedError] = useState<string | null>(null)
  const [feedSyncSummary, setFeedSyncSummary] = useState<SyncIcsResult | null>(null)

  const token = session?.access_token ?? null
  const enteredSports = useMemo(() => parseList(trackedSports), [trackedSports])
  const sportOptions = useMemo(() => trackedSportsFor(enteredSports), [enteredSports])
  const progress = useMemo(() => getOnboardingProgress(db, { savedFeedCount: feeds.length }), [db, feeds.length])

  async function feedApi(path: string, init?: RequestInit) {
    if (!token) throw new Error('Sign in to manage assignment feeds.')
    const res = await fetch(path, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(String(json?.error || res.statusText))
    return json
  }

  async function loadFeeds() {
    if (mode !== 'supabase' || !token) return
    try {
      const json = await feedApi('/api/calendar-feeds')
      setFeeds((json.feeds ?? []) as CalendarFeed[])
    } catch {
      setFeeds([])
    }
  }

  async function syncFeedNow(feedId: string) {
    return await feedApi('/api/sync-ics', {
      method: 'POST',
      body: JSON.stringify({ feedId }),
    }) as SyncIcsResult
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadFeeds()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, token])

  useEffect(() => {
    const syncId = window.requestAnimationFrame(() => {
      setHomeAddress(db.settings.homeAddress)
      setTimezone(db.settings.defaultTimezone || 'America/New_York')
      setWeeklyEmail(Boolean(db.settings.weeklyGamesEmailEnabled))
      setTrackedSports(listString(db.settings.trackedSports))
      setPlatforms(listString(db.settings.assigningPlatforms))
      setLeagues(listString(db.settings.leagues))
    })
    return () => window.cancelAnimationFrame(syncId)
  }, [
    db.settings.homeAddress,
    db.settings.defaultTimezone,
    db.settings.weeklyGamesEmailEnabled,
    db.settings.trackedSports,
    db.settings.assigningPlatforms,
    db.settings.leagues,
  ])

  async function saveDefaults(options?: { complete?: boolean }) {
    setProfileError(null)
    setProfileMessage(null)
    setDefaultsSaving(true)
    try {
      const now = new Date().toISOString()
      const verifiedAddresses = await resolveVerifiedProfileAddresses(session?.access_token, {
        homeAddress,
        otherWorkAddress: '',
      })
      setHomeAddress(verifiedAddresses.homeAddress)
      const next = {
        ...db,
        settings: {
          ...db.settings,
          ...verifiedAddresses,
          defaultTimezone: timezone.trim() || 'America/New_York',
          weeklyGamesEmailEnabled: weeklyEmail,
          trackedSports: enteredSports,
          assigningPlatforms: parseList(platforms),
          leagues: parseList(leagues).sort(),
          onboardingCompletedAt: options?.complete ? now : db.settings.onboardingCompletedAt,
        },
      }
      await write(next)
      setProfileMessage(options?.complete ? 'Setup marked complete. Mileage origin verified.' : 'Defaults saved. Mileage origin verified.')
      if (options?.complete) {
        void recordPlatformEvent(session?.access_token, 'onboarding_completed', {
          trackedSports: enteredSports.length,
          assigningPlatforms: parseList(platforms).length,
          weeklyEmailEnabled: weeklyEmail,
          feeds: feeds.length,
        })
      }
      if (options?.complete) navigate('/')
    } catch (e: any) {
      setProfileError(String(e?.message ?? e))
      profilePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } finally {
      setDefaultsSaving(false)
    }
  }

  function switchAssignmentPath(nextPath: 'feed' | 'manual' | null) {
    const baseline = createInitialFeedForm()
    const hasDraft = Boolean(
      feedForm.feedUrl.trim() ||
      feedForm.otherPlatformName.trim() ||
      feedForm.sport ||
      feedForm.name.trim() !== baseline.name
    )
    if (assignmentPath === 'feed' && nextPath !== 'feed' && hasDraft) {
      void recordPlatformEvent(session?.access_token, 'calendar_feed_add_cancelled', {
        source: 'onboarding',
        platformId: feedForm.guideId,
        usedOther: feedForm.guideId === 'other',
      })
    }
    setFeedMessage(null)
    setFeedError(null)
    setFeedSyncSummary(null)
    setAssignmentPath(nextPath)
  }

  async function addFeed(submitted: CalendarFeedSetupSubmitValue) {
    setFeedError(null)
    setFeedMessage(null)
    setFeedSyncSummary(null)
    setFeedSaving(true)
    try {
      const followUpNotes: string[] = []
      const created = await feedApi('/api/calendar-feeds', {
        method: 'POST',
        body: JSON.stringify({
          platform: submitted.resolvedPlatform,
          name: submitted.name.trim(),
          feedUrl: submitted.normalizedFeedUrl,
          enabled: true,
          sport: submitted.sport || null,
        }),
      })
      let syncSummary: SyncIcsResult | null = null
      if (created?.feed?.id) {
        try {
          syncSummary = await syncFeedNow(String(created.feed.id))
        } catch (e: any) {
          followUpNotes.push(`Immediate sync needs review: ${String(e?.message ?? e)}`)
        }
      }
      if (!db.settings.assigningPlatforms.some((platform) => platform.toLowerCase() === submitted.resolvedPlatform.toLowerCase())) {
        try {
          await write({
            ...db,
            settings: {
              ...db.settings,
              assigningPlatforms: [...db.settings.assigningPlatforms, submitted.resolvedPlatform].sort((a, b) => a.localeCompare(b)),
            },
          })
        } catch (e: any) {
          followUpNotes.push(`Platform list update needs review: ${String(e?.message ?? e)}`)
        }
      }
      setFeedForm(createInitialFeedForm())
      setFeedSyncSummary(syncSummary)
      try {
        await refresh()
        await loadFeeds()
      } catch (e: any) {
        followUpNotes.push(`Refresh needs review: ${String(e?.message ?? e)}`)
      }
      void recordPlatformEvent(session?.access_token, 'feed_created', {
        platform: submitted.resolvedPlatform,
        sport: submitted.sport || 'unspecified',
        source: 'onboarding',
      })
      void recordPlatformEvent(session?.access_token, 'calendar_feed_added', {
        source: 'onboarding',
        platformId: submitted.guideId,
        confidenceLabel: assigningPlatformConfidenceLabel(getAssigningPlatformGuide(submitted.guideId).confidence),
        urlScheme: submitted.urlScheme ?? 'unknown',
        usedOther: submitted.guideId === 'other',
      })
      const importedAssignments = Number(syncSummary?.createdGames ?? 0) + Number(syncSummary?.updatedGames ?? 0)
      const mileageHydrated = Number(syncSummary?.autoMileageUpdatedGames ?? 0)
      if (syncSummary && !syncSummary.errors.length) {
        setFeedMessage(
          importedAssignments > 0
            ? `Feed added and synced. ${importedAssignments} assignment${importedAssignments === 1 ? '' : 's'} imported.`
            : 'Feed added and synced. No assignments were imported yet.'
        )
      } else if (syncSummary) {
        setFeedMessage('Feed added. Whistle Keeper tried an immediate sync, but some items still need review.')
      } else {
        setFeedMessage('Feed added. Open Sync if you want to run it right away.')
      }
      if (mileageHydrated > 0) {
        setFeedMessage((current) => `${current ?? 'Feed added and synced.'} Auto-filled mileage for ${mileageHydrated} game${mileageHydrated === 1 ? '' : 's'} with mappable addresses.`)
      }
      if (followUpNotes.length) {
        setFeedMessage((current) => `${current ?? 'Feed added.'} ${followUpNotes.join(' ')}`)
      }
    } catch (e: any) {
      setFeedSyncSummary(null)
      setFeedError(String(e?.message ?? e))
    } finally {
      setFeedSaving(false)
    }
  }

  async function finishSetup() {
    try {
      await saveDefaults({ complete: true })
    } catch (e: any) {
      setProfileError(String(e?.message ?? e))
      profilePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  const hasProfileFields = Boolean(homeAddress.trim()) && Boolean(timezone.trim())
  const canSaveDefaults = hasProfileFields

  return (
    <div className="onboarding-page">
      <section className="onboarding-hero accent-frame">
        <div>
          <span className="landing-eyebrow">First-run setup</span>
          <h2>Set up your account.</h2>
          <p>
            Your profile is the only required setup. Adding assignments is the best next step. Requirements and tax review can wait until you are ready for them.
          </p>
        </div>
        <div className="onboarding-progress-card">
          <div className="label">Quick start progress</div>
          <div className="value">{progress.percent}%</div>
          <div className="onboarding-progress-track">
            <span style={{ width: `${progress.percent}%` }} />
          </div>
          <div className="small">{progress.complete} of {progress.total} quick-start steps ready</div>
          <div className="small">{progress.laterComplete} of {progress.laterTotal} advanced tools set up</div>
        </div>
      </section>

      <section className="onboarding-steps" aria-label="Setup progress">
        {progress.steps.map((step, index) => (
          <div key={step.id} className={`onboarding-step ${step.complete ? 'complete' : ''}`}>
            <span>{index + 1}</span>
            <div>
              <strong>{step.label}</strong>
              <small>{stepStatusLabel(step.kind, step.complete)}</small>
            </div>
          </div>
        ))}
      </section>

      <section className="onboarding-layout">
        <div ref={profilePanelRef} className="onboarding-panel">
          <div className="onboarding-panel-head">
            <span className="pill ok">1</span>
            <div>
              <h2>Referee Profile</h2>
              <p className="small">This is the only part you need before using the app. Additional preferences can be completed later.</p>
            </div>
          </div>

          <div className="field">
            <label>Primary mileage origin</label>
            <input value={homeAddress} onChange={(e) => setHomeAddress(e.target.value)} placeholder="Home office or starting address" />
            <div className="small">Use a real street address. Whistle Keeper verifies it against Google Maps before saving so mileage calculations work.</div>
            {db.settings.homeAddressPlaceId && homeAddress.trim() === db.settings.homeAddress.trim() ? <div className="small">Verified Google Maps origin saved.</div> : null}
          </div>
          <div className="row">
            <div className="field">
              <label>Default timezone</label>
              <input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="America/New_York" />
            </div>
            <div className="field">
              <label>Weekly schedule email</label>
              <select value={weeklyEmail ? 'Yes' : 'No'} onChange={(e) => setWeeklyEmail(e.target.value === 'Yes')}>
                <option>Yes</option>
                <option>No</option>
              </select>
            </div>
          </div>

          <div className="field">
            <label>Sports you want to track</label>
            <input value={trackedSports} onChange={(e) => setTrackedSports(e.target.value)} placeholder="Soccer, Lacrosse, Basketball, Football" />
            <div className="small">Helpful for game entry, feeds, and requirements, but not required to get started.</div>
          </div>

          <div className="row">
            <div className="field">
              <label>Assigning platforms</label>
              <input value={platforms} onChange={(e) => setPlatforms(e.target.value)} placeholder="DragonFly, RefQuest, Arbiter" />
            </div>
            <div className="field">
              <label>Leagues / governing bodies</label>
              <input value={leagues} onChange={(e) => setLeagues(e.target.value)} placeholder="OHSAA, USYS, CCI" />
            </div>
          </div>

          <div className="btnbar">
            <button className="btn primary" onClick={() => saveDefaults()} disabled={loading || defaultsSaving || !canSaveDefaults}>
              {defaultsSaving ? 'Verifying...' : 'Save profile'}
            </button>
            {progress.minimumReady
              ? <span className="small">Profile saved. You can head to the dashboard now and come back here any time.</span>
              : <span className="small">Save a verified home address so mileage and directions work correctly.</span>}
          </div>
          {(profileMessage || profileError) ? (
            <div className="onboarding-status" aria-live="polite">
              {profileMessage ? <span className="pill ok">{profileMessage}</span> : null}
              {profileError ? <span className="pill bad">{profileError}</span> : null}
            </div>
          ) : null}
        </div>

        <div className="onboarding-panel">
          <div className="onboarding-panel-head">
            <span className="pill ok">2</span>
            <div>
              <h2>Add Existing Assignments</h2>
              <p className="small">Strongly recommended for day one, but not required. You can connect an iCal feed or start by adding games yourself.</p>
            </div>
          </div>

          <div className="onboarding-choice-grid">
            {mode === 'supabase' ? (
              <button
                type="button"
                className={`onboarding-choice-card${assignmentPath === 'feed' ? ' selected' : ''}`}
                onClick={() => switchAssignmentPath('feed')}
              >
                <strong>Connect an iCal feed</strong>
                <span>Best when DragonFly, RefQuest, Arbiter, or another assignor already has your schedule.</span>
              </button>
            ) : null}
            <button
              type="button"
              className={`onboarding-choice-card${assignmentPath === 'manual' ? ' selected' : ''}`}
              onClick={() => switchAssignmentPath('manual')}
            >
              <strong>Add games yourself</strong>
              <span>Best for trying one assignment now or importing from your own spreadsheet.</span>
            </button>
          </div>

          {assignmentPath == null ? <p className="small">Choose one option above to keep going.</p> : null}

          {mode === 'supabase' && assignmentPath === 'feed' ? (
            <>
              <div className="onboarding-guidance">
                <HelpTip label="What is this?" title="What is an iCal feed?">
                  <p>An iCal feed is a calendar subscription link that allows events from an assigning platform or another system to appear in your calendar app, such as Google Calendar, Apple Calendar, or Outlook.</p>
                  <p>Most assigning platforms provide iCal feeds as part of their application, and when the source calendar is updated, those changes can automatically sync to your calendar.</p>
                </HelpTip>
              </div>
              <CalendarFeedSetupForm
                accessToken={session?.access_token}
                mode="compact"
                source="onboarding"
                value={feedForm}
                sportOptions={sportOptions}
                submitting={feedSaving}
                submitLabel="Add feed"
                inlineMessage={feedMessage}
                inlineError={feedError}
                onChange={setFeedForm}
                onSubmit={addFeed}
                footerLinks={(
                  <HelpTip label="What comes through?" title="What to expect from calendar feeds">
                    <p>Most calendar feeds do not include all assignment details. Pay, precise location, mileage, and some league details are often missing or inconsistent.</p>
                    <p>Add the missing pieces in game Edit after the sync. When the next sync matches the same assignment, Whistle Keeper keeps your manual details and merges the new feed data around them.</p>
                  </HelpTip>
                )}
                secondaryAction={<Link className="btn" to="/sync">Manage feeds</Link>}
              />
              <div className="onboarding-feed-list">
                {feeds.map((feed) => (
                  <div key={feed.id}>
                    <span className="pill ok">{feed.platform}</span>
                    <strong>{feed.name}</strong>
                    <small>{feed.maskedFeedUrl || 'Saved feed'}</small>
                  </div>
                ))}
                {feeds.length === 0 ? <p className="small">No feeds added yet.</p> : null}
              </div>
              {feedSyncSummary ? (
                <div className="onboarding-next-steps">
                  <strong>What to review next</strong>
                  <ul className="guided-platform-list is-bulleted">
                    <li>Open Games and review imported assignments.</li>
                    <li>Calendar feeds usually bring only partial information. Exact field address, pay, teams, and level details often still need manual review.</li>
                    <li>Use Calculate mileage on any game that still does not show mileage.</li>
                    {Number(feedSyncSummary.autoMileageUpdatedGames ?? 0) > 0 ? (
                      <li>Whistle Keeper already auto-filled mileage for {Number(feedSyncSummary.autoMileageUpdatedGames)} game{Number(feedSyncSummary.autoMileageUpdatedGames) === 1 ? '' : 's'} where the address was clear enough to map.</li>
                    ) : null}
                  </ul>
                  <div className="btnbar">
                    <Link className="btn primary" to="/games">Review games</Link>
                    <Link className="btn" to="/sync">Open Sync</Link>
                  </div>
                  {feedSyncSummary.errors.length ? (
                    <p className="small"><span className="pill warn">{feedSyncSummary.errors[0]}</span></p>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : assignmentPath === 'manual' ? (
            <div className="onboarding-action-list">
              <Link className="onboarding-action" to="/games">
                <strong>Add a game manually</strong>
                <span>Enter one assignment now, then fill in pay, mileage, teams, and status.</span>
              </Link>
              <Link className="onboarding-action" to="/import">
                <strong>Import from a CSV</strong>
                <span>Bring over existing games from your spreadsheet if you already track them elsewhere.</span>
              </Link>
              {mode === 'supabase' ? <p className="small">Prefer not to type games in? Switch back to the iCal feed option above.</p> : null}
            </div>
          ) : null}
        </div>
      </section>

      <section className="onboarding-layout">
        <div className="onboarding-panel">
          <div className="onboarding-panel-head">
            <span className="pill">Later</span>
            <div>
              <h2>Advanced setup</h2>
              <p className="small">These tools are valuable, but they do not need to block first-day use.</p>
            </div>
          </div>
          <p className="small">Once your profile and assignments are in place, come back here to track season readiness and prepare cleaner tax records.</p>
        </div>
        <Link className="onboarding-action" to="/requirements">
          <strong>Track requirements</strong>
          <span>Set up meetings, tests, training, and evidence.</span>
        </Link>
        <Link className="onboarding-action" to="/tax">
          <strong>Review tax readiness</strong>
          <span>Check income, mileage, expenses, and exports.</span>
        </Link>
      </section>

      <section className="onboarding-finish">
        <div>
          <h2>Ready to start using Whistle Keeper?</h2>
          <p className="small">Profile is required. Assignments are recommended. Requirements and tax tools can wait until later.</p>
        </div>
        <div className="btnbar">
          <button className="btn primary" onClick={finishSetup} disabled={loading || defaultsSaving || !canSaveDefaults}>
            {defaultsSaving ? 'Verifying...' : 'Finish quick start'}
          </button>
          <button className="btn" onClick={async () => { await refresh(); navigate('/') }} disabled={!progress.minimumReady}>
            Go to dashboard
          </button>
        </div>
      </section>
    </div>
  )
}
