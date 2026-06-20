# QA Release Test Plan

## Purpose

This plan defines the release-quality testing approach for Whistle Keeper before beta deployments. The goal is to prove that a solo sports official can safely sign in, onboard, manage assignments, sync external calendar feeds, track requirements, record expenses and mileage, review tax records, and manage account data without cross-user data leakage or confusing failure states.

This is documentation only. It does not prescribe automated test implementation yet.

## Automation Harness

Whistle Keeper now includes a lightweight Playwright smoke harness under `tests/e2e`. It is not a separate QA product; it is a repo-local release guardrail.

Run:

```bash
npm run qa:smoke
```

Run the full local release gate:

```bash
npm run qa:release
```

The local config uses the installed Chrome browser when available. On a machine without Chrome, install Playwright browser binaries once:

```bash
npx playwright install
```

The current automated smoke suite runs in local mode with Supabase disabled. It covers core route rendering, mobile calendar layout behavior, and the manual-game default 7:00 PM regression. Live Supabase/RLS, OTP email, Google Maps, real iCal feeds, scheduled sync, and real iPad/iPhone Safari behavior still require the manual checks below.

`npm run qa:smoke` starts a temporary local Vite server, runs Playwright, and shuts the server down afterward.

## Release Scope

Run this plan before major beta releases, after changes to auth, onboarding, sync, data persistence, RLS policies, account lifecycle, requirements, tax review, calendar export, or mobile navigation.

Use the shorter [release smoke checklist](./release-smoke-checklist.md) before smaller beta deployments.

## Test Accounts And Devices

- Owner/admin account with existing production-like data.
- Returning referee account with games, feeds, expenses, requirements, and settings.
- Fresh referee account with no saved profile, no feeds, and no games.
- Mobile Safari on iPhone.
- Mobile Safari on iPad.
- Desktop Chrome or Edge.
- At least one private/incognito browser session to avoid local cache carrying user data between accounts.

## Smoke Tests

- Sign in with email OTP.
- Sign in with magic link.
- Load Home, Calendar, Games, Sync, Requirements, Expenses, Tax, Settings, Account, and Data & Privacy.
- Confirm authenticated routes redirect anonymous users to auth.
- Confirm the app does not auto-populate another user's profile, addresses, platforms, leagues, games, expenses, or requirements.
- Confirm Home renders a useful empty state for a new user.
- Confirm navigation works on mobile bottom nav and desktop nav.
- Run a manual build before release.
- Run `npm run qa:smoke` for the browser smoke suite.

## Functional Tests

### Auth And Onboarding

- New user can request an OTP email from Whistle Keeper.
- New user can verify OTP and lands on onboarding.
- Returning user lands on the dashboard.
- Expired, invalid, reused, or wrong OTP shows a friendly error.
- Profile setup requires a Google-verified primary mileage origin.
- Invalid profile address shows an inline, nearby error.
- Saving profile creates or updates `user_settings` for the signed-in user only.
- User can skip advanced setup after saving profile.
- `Finish quick start` persists completion and does not return the user to onboarding after refresh.
- Assignment onboarding offers either iCal feed connection or manual game entry.
- iCal help content appears only after choosing the feed path.

### Assignments And Calendar

- Manual game creation saves date, start time, sport, level, location, platform, pay, and status.
- Default 7:00 PM start time saves even if the user does not change the field.
- Game edit preserves user-entered pay, mileage, address, teams, notes, and status.
- Calendar month and agenda views render correctly on mobile and desktop.
- Calendar previous/next controls keep the visible date context synchronized.
- Multi-day availability blocks render without covering date numbers or blocking normal calendar scanning.
- Platform color coding is visible and readable.
- Platform blocking chips respect the user's tracked platform choices.

### Sync And Calendar Feeds

- User can add Arbiter, DragonFly, RefQuest/RQ+, Assignr, and Other feed entries.
- `webcal://` feeds normalize correctly.
- Full feed URLs are not displayed after save.
- Feed creation succeeds independently from immediate sync success.
- Immediate sync runs after creating a feed when possible.
- Failed immediate sync shows a reviewable warning without pretending the feed was not saved.
- Sync creates new games from feed events.
- Sync matches existing synced games and avoids duplicate games.
- Sync matches clear manual games when feed data represents the same assignment.
- Sync preserves manual details when later feed runs update the same assignment.
- Sync auto-fills mileage only when the game address and profile origin are clear enough.
- Sync history records success, partial, and failed runs.
- Scheduled sync processes queued work without requiring the user to keep the app open.

### Requirements

- User can create a readiness group by sport, level, governing body, and season.
- User can add common requirement templates.
- User can add a custom requirement.
- User can mark requirements not started, in progress, complete, waived, and overdue.
- Due date, completed date, expiration date, notes, and evidence link fields save.
- User can drill into a readiness group to see all requirements for that season/sport.
- Dashboard and Requirements page agree on readiness status.
- Duplicate last season workflow preserves useful repeated requirements without copying stale completion evidence as current.

### Expenses, Mileage, And Tax Review

- User can create deductible and non-deductible expenses.
- Deductible means "marked for user review," not a tax determination.
- Receipt upload works where configured.
- Missing receipt flags appear for deductible non-mileage expenses.
- Mileage expenses with missing or zero miles are flagged.
- Mileage double-counting flags appear when an expense overlaps a game mileage record.
- Meals, lodging, phone/app, and other categories show category-specific review flags.
- Tax page displays income, mileage, expenses, 1099 reconciliation, review queue, and exports.
- Mileage rate requires explicit confirmation before tax readiness is green.
- Review checklist CSV downloads and includes review flags.
- Tax copy clearly says Whistle Keeper organizes records and does not provide tax advice.

### Account, Data, And Privacy

- User can view Data & Privacy information.
- User can export account data.
- User can request or complete account deletion flow.
- Deleting or resetting account data removes user-owned games, events, feeds, expenses, requirements, imports, sync history, and settings as intended.
- Calendar export token can be created, regenerated, and used for outbound calendar subscription.
- Regenerating a calendar export token invalidates the previous subscription URL.
- Weekly email preference persists after refresh and device switch.

## End-To-End Tests

### New User Day-One Flow

1. Create or invite a fresh user.
2. Sign in on iPad using OTP.
3. Save a verified mileage origin.
4. Add one iCal feed.
5. Confirm immediate sync either imports games or clearly explains why it needs review.
6. Review Games and update one assignment with pay, location, and mileage.
7. Return to Home and confirm next assignment, weekly summary, sync health, and quick actions.
8. Refresh the app and confirm the user remains past onboarding.

### Returning Referee Weekly Flow

1. Sign in as a returning user.
2. Run Sync All.
3. Review sync history.
4. Open Calendar on mobile and desktop.
5. Edit an upcoming game.
6. Add an expense.
7. Check requirements readiness.
8. Export tax review CSV.
9. Confirm Home reflects the updated assignment and attention state.

### Account Lifecycle Flow

1. Sign in as a non-admin user.
2. Export account data.
3. Toggle weekly email.
4. Regenerate calendar export token.
5. Delete or reset test account data in a controlled test environment.
6. Confirm no deleted data appears after refresh or on another device.

## Regression Tests

- New user does not inherit the owner's address, platforms, leagues, timezone, sports, or readiness state.
- Onboarding does not mark Tax readiness complete from seeded mileage defaults alone.
- Adding a manual game with platform does not create a fake feed refresh alert.
- Assignment feed add does not show "could not read feed" after the feed was saved successfully.
- Mobile calendar date strip and month navigation remain synchronized.
- Calendar blocks do not cover date numbers.
- Duplicate DragonFly availability blocks do not reappear after sync cleanup.
- Outbound iCal feed does not include previously cleaned duplicate blocks.
- Weekly email toggle persists in Supabase and across reloads.
- `/admin` remains restricted to owner/admin roles.
- Non-admin users cannot read admin metrics.
- Full feed URLs remain encrypted or protected and are not exposed in UI, analytics, logs, or exported telemetry.

## Negative And Input Validation Tests

- Empty profile address.
- Fake profile address.
- City-only or PO-box-like profile address.
- Address validation service unavailable.
- Missing auth token on protected API routes.
- Expired auth token on protected API routes.
- Invalid iCal URL.
- `http://` feed URL.
- Malformed `webcal://` feed URL.
- Feed URL that returns HTML instead of iCal.
- Feed URL that times out.
- Duplicate DragonFly feed beyond the allowed limit.
- Too many RefQuest feeds.
- Overlong feed name, platform name, league, sport, notes, or description.
- Expense with negative amount.
- Mileage expense with zero, blank, or non-numeric miles.
- Requirement with invalid date order, such as expiration before completion.
- CSV import with missing columns.

## Boundary Tests

- New account with no local cache.
- Account with no games, no feeds, no requirements, and no expenses.
- Account with one game.
- Account with hundreds of games.
- Account with many multi-day blocks.
- Account with many feeds, including disabled feeds.
- Assignment crossing midnight.
- All-day block.
- Multi-day block spanning month boundaries.
- Leap day.
- Daylight saving time transition.
- Long team names and long venue names on mobile.
- Long requirement group names.
- Very large receipt file within allowed upload limits.
- Offline or flaky mobile network during save, sync, and reload.

## RLS And Security Tests

- User A cannot read User B games, settings, feeds, expenses, requirements, imports, sync jobs, or sync history.
- User A cannot update User B settings by changing request payload IDs.
- User A cannot delete User B feeds or data.
- User A cannot access User B receipt or evidence storage paths.
- Non-admin cannot access `/admin` UI or `/api/platform?action=metrics`.
- Server routes verify bearer tokens with Supabase Auth before reading or writing user data.
- API routes scope every user-owned query by authenticated `user_id`.
- Service-role routes do not trust client-supplied `user_id`.
- RLS policies allow a new user to create and update their own `user_settings`.
- RLS policies block unauthenticated access.
- Feed URLs are encrypted or protected at rest.
- Calendar export tokens are protected and regenerated safely.
- Observability events do not include addresses, feed URLs, opponent names, notes, receipt filenames, or tax export contents.

Future automation target: add a dedicated RLS smoke script against a Supabase test project that signs in as User A and User B, then proves cross-user reads, updates, and deletes fail.

## Cross-Device Tests

- New-user onboarding on iPad Safari.
- New-user onboarding on iPhone Safari.
- Returning-user dashboard on iPhone Safari.
- Desktop Chrome or Edge after mobile setup.
- Same account switching between iPad and desktop sees the same profile, feeds, games, settings, and readiness.
- Private/incognito session does not pull cached data from another user.
- Refresh after onboarding stays on dashboard.
- PWA/home-screen shortcut sign-in works with OTP.
- Magic link remains available as a web fallback.
- Touch targets are comfortable on mobile.
- No horizontal scrolling on primary pages.

## Sync Resilience Tests

- Add feed succeeds when immediate sync fails.
- Immediate sync warning is actionable and does not duplicate feeds.
- Scheduled sync retries failed jobs.
- Partial sync records partial status and shows feed-specific errors.
- Sync timeout does not corrupt existing games.
- Feed with one malformed event still imports valid events when supported.
- Disabled feed does not sync.
- Feed deletion removes or pauses future sync work as intended.
- Duplicate cleanup preview is non-destructive.
- Applying selected duplicate cleanup deletes only selected duplicate groups.
- Manual details survive a subsequent sync.

Future automation target: add local `.ics` fixtures for DragonFly-style games, availability blocks, multi-day blocks, overnight events, duplicate blocks, and malformed events. These should test parser and dedupe behavior without depending on live assigning platforms.

## Observability Tests

- Page views appear for primary routes.
- `onboarding_completed` records after finishing quick start.
- `calendar_feed_added` records without feed URL.
- `sync_completed` and `sync_failed` records include counts and status only.
- `weekly_email_enabled` and `weekly_email_disabled` record after toggles.
- `tax_export_downloaded` records export type and row count only.
- `account_exported` records without exported data contents.
- Client errors record route, error kind, name, and short message only.
- Admin metrics load for owner/admin.
- Admin metrics do not load for non-admin.
- Missing optional sync queue/history table degrades gracefully where applicable.

## Accessibility Checks

- Keyboard can reach all primary navigation and action controls.
- Focus state is visible on buttons, links, form fields, and modal controls.
- Forms have usable labels.
- Error messages are close to the field or action that caused them.
- Status messages use readable text, not color alone.
- Color contrast is acceptable for dark theme cards, chips, warnings, and buttons.
- Calendar items remain readable at mobile sizes.
- Touch targets are large enough for iPhone use.
- Dialogs and help tips can be dismissed without pointer precision.
- Page headings and section order make sense to screen readers.

## Beta Acceptance Testing

A beta build is acceptable when:

- A fresh user can sign in, save profile, add assignments, and reach Home on iPad and desktop.
- A returning user can run sync, review calendar, edit games, add expenses, and view tax readiness.
- No known cross-user data leakage exists.
- No high-severity RLS/security issue remains open.
- New-user onboarding does not show another user's data.
- Sync failures are understandable and recoverable.
- Core mobile pages have no horizontal scrolling or blocked controls.
- Tax language remains clearly non-advisory.
- Observability shows enough health data to diagnose beta issues without storing private officiating details.
- The release smoke checklist passes, or documented exceptions are accepted before deployment.

## Manual-Only Coverage

These checks are intentionally not automated yet:

- Real iPad and iPhone Safari session behavior.
- Supabase OTP and magic-link delivery through Resend.
- Live Google Maps address verification and mileage calculation.
- Real assigning-platform iCal feeds.
- Vercel Cron or scheduled sync execution.
- Receipt/evidence storage in the deployed Supabase project.
- Product feel and clarity for an actual referee using real assignments.

## Exit Criteria

Before releasing to beta:

- Automated typecheck, tests, lint, and build pass.
- Manual smoke checklist passes on desktop and at least one iOS device.
- RLS/security spot checks pass for two separate users.
- Known failures are documented with severity, owner, and beta impact.
- Any issue that could lose data, leak data, block sign-in, block onboarding, or corrupt sync is fixed before release.
