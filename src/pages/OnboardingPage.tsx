import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import FeedSetupGuide from '../components/FeedSetupGuide'
import HelpTip from '../components/HelpTip'
import { useData } from '../lib/DataContext'
import { getOnboardingProgress } from '../lib/onboarding'
import { trackedSportsFor } from '../lib/preferences'
import { recordPlatformEvent } from '../lib/platformEvents'
import { resolveVerifiedProfileAddresses } from '../lib/profileAddressValidation'
import type { CalendarFeed, FeedPlatform, Sport } from '../lib/types'

const platformSuggestions = [
  'DragonFly',
  'RefQuest',
  'Arbiter',
  'Assignr',
  'HorizonWebRef',
  'Stack Officials',
  'GameOfficials',
  'ZebraWeb',
]

function parseList(value: string): string[] {
  return value.split(',').map((x) => x.trim()).filter(Boolean)
}

function listString(values: string[]): string {
  return values.join(', ')
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
  const progress = useMemo(() => getOnboardingProgress(db), [db])
  const profilePanelRef = useRef<HTMLDivElement | null>(null)
  const [homeAddress, setHomeAddress] = useState(db.settings.homeAddress)
  const [timezone, setTimezone] = useState(db.settings.defaultTimezone || 'America/New_York')
  const [weeklyEmail, setWeeklyEmail] = useState(Boolean(db.settings.weeklyGamesEmailEnabled))
  const [trackedSports, setTrackedSports] = useState(listString(db.settings.trackedSports))
  const [platforms, setPlatforms] = useState(listString(db.settings.assigningPlatforms))
  const [leagues, setLeagues] = useState(listString(db.settings.leagues))
  const [feeds, setFeeds] = useState<CalendarFeed[]>([])
  const [feedPlatform, setFeedPlatform] = useState<FeedPlatform>('DragonFly')
  const [feedName, setFeedName] = useState('')
  const [feedUrl, setFeedUrl] = useState('')
  const [feedSport, setFeedSport] = useState<'' | Sport>('')
  const [feedSaving, setFeedSaving] = useState(false)
  const [assignmentPath, setAssignmentPath] = useState<'feed' | 'manual' | null>(null)
  const [defaultsSaving, setDefaultsSaving] = useState(false)
  const [profileMessage, setProfileMessage] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [feedMessage, setFeedMessage] = useState<string | null>(null)
  const [feedError, setFeedError] = useState<string | null>(null)

  const token = session?.access_token ?? null
  const sportOptions = useMemo(() => trackedSportsFor(parseList(trackedSports)), [trackedSports])

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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadFeeds()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, token])

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
          trackedSports: sportOptions,
          assigningPlatforms: parseList(platforms),
          leagues: parseList(leagues).sort(),
          onboardingCompletedAt: options?.complete ? now : db.settings.onboardingCompletedAt,
        },
      }
      await write(next)
      setProfileMessage(options?.complete ? 'Setup marked complete. Mileage origin verified.' : 'Defaults saved. Mileage origin verified.')
      if (options?.complete) {
        void recordPlatformEvent(session?.access_token, 'onboarding_completed', {
          trackedSports: sportOptions.length,
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

  async function addFeed() {
    setFeedError(null)
    setFeedMessage(null)
    setFeedSaving(true)
    try {
      await feedApi('/api/calendar-feeds', {
        method: 'POST',
        body: JSON.stringify({
          platform: feedPlatform,
          name: feedName.trim() || String(feedPlatform),
          feedUrl: feedUrl.trim(),
          enabled: true,
          sport: feedSport || null,
        }),
      })
      setFeedName('')
      setFeedUrl('')
      setFeedSport('')
      await loadFeeds()
      void recordPlatformEvent(session?.access_token, 'feed_created', {
        platform: feedPlatform,
        sport: feedSport || 'unspecified',
        source: 'onboarding',
      })
      setFeedMessage('Assignment feed added.')
    } catch (e: any) {
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
          <h2>Get moving quickly, then come back for the deeper tools.</h2>
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
              <p className="small">This is the only part you need before using the app. The rest of these defaults can be filled in later.</p>
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
                onClick={() => setAssignmentPath('feed')}
              >
                <strong>Connect an iCal feed</strong>
                <span>Best when DragonFly, RefQuest, Arbiter, or another assignor already has your schedule.</span>
              </button>
            ) : null}
            <button
              type="button"
              className={`onboarding-choice-card${assignmentPath === 'manual' ? ' selected' : ''}`}
              onClick={() => setAssignmentPath('manual')}
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
              <HelpTip className="help-tip-inline" title="How to set up an iCal feed">
                <p>Whistle Keeper ingests iCal feeds from your assignor. Most assigning platforms hide the calendar link inside profile, calendar, or export settings.</p>
                <p>Common places to check: DragonFly calendar tools, RefQuest calendar export, Arbiter schedule export, and Assignr calendar sync settings.</p>
                <p>Once you paste the feed URL here, sync pulls assignments into Whistle Keeper without changing anything in the assignor itself.</p>
              </HelpTip>
              <FeedSetupGuide compact />
              <div className="row">
                <div className="field">
                  <label>Platform</label>
                  <input list="onboarding-platforms" value={feedPlatform} onChange={(e) => setFeedPlatform(e.target.value as FeedPlatform)} />
                  <datalist id="onboarding-platforms">
                    {platformSuggestions.map((platform) => <option key={platform} value={platform} />)}
                  </datalist>
                </div>
                <div className="field">
                  <label>Sport</label>
                  <select value={feedSport} onChange={(e) => setFeedSport(e.target.value as '' | Sport)}>
                    <option value="">Auto-detect</option>
                    {sportOptions.map((sport) => <option key={sport} value={sport}>{sport}</option>)}
                  </select>
                </div>
              </div>
              <div className="field">
                <label>Feed name</label>
                <input value={feedName} onChange={(e) => setFeedName(e.target.value)} placeholder="DragonFly soccer" />
              </div>
              <div className="field">
                <label>iCal feed URL</label>
                <input value={feedUrl} onChange={(e) => setFeedUrl(e.target.value)} placeholder="https://..." />
              </div>
              <div className="onboarding-guidance">
                <HelpTip label="What comes through?" title="What to expect from calendar feeds">
                  <p>Most calendar feeds do not include everything you care about. Pay, precise location, mileage, and some league details are often missing or inconsistent.</p>
                  <p>Add the missing pieces in game Edit after the sync. When the next sync matches the same assignment, Whistle Keeper keeps your manual details and merges the new feed data around them.</p>
                </HelpTip>
              </div>
              <div className="btnbar">
                <button className="btn primary" onClick={addFeed} disabled={feedSaving || !feedUrl.trim()}>
                  {feedSaving ? 'Adding...' : 'Add feed'}
                </button>
                <Link className="btn" to="/sync">Manage feeds</Link>
              </div>
              {(feedMessage || feedError) ? (
                <div className="onboarding-status" aria-live="polite">
                  {feedMessage ? <span className="pill ok">{feedMessage}</span> : null}
                  {feedError ? <span className="pill bad">{feedError}</span> : null}
                </div>
              ) : null}
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
          <button className="btn" onClick={async () => { await refresh(); navigate('/') }}>
            Go to dashboard
          </button>
        </div>
      </section>
    </div>
  )
}
