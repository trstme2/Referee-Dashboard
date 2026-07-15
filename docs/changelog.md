# Whistle Keeper Changelog

This document captures meaningful Whistle Keeper product, reliability, security, QA, and operational changes.

Going forward, update this file whenever a change affects user experience, data behavior, security posture, sync reliability, tax/readiness confidence, deployment readiness, or QA coverage. Tiny copy edits and internal-only refactors can be skipped unless they explain a release decision.

## Entry Format

Use short, dated entries:

```md
## YYYY-MM-DD

### Added
- New user-visible capability.

### Changed
- Existing behavior that changed.

### Fixed
- Bug or regression fixed.

### Security / Privacy
- Auth, RLS, personal data, token, or deletion change.

### QA / Release
- Test, checklist, harness, or release process change.
```

Use only the headings that apply.

## 2026-07-14

### Changed
- Added date-based 2026 mileage-rate handling for the one-time midyear IRS business-rate change: 72.5 cents per mile from January through June and 76 cents per mile from July through December.
- Updated the Tax mileage estimate and mileage CSV export to apply the mileage rate by record date for split-rate years, including a rate-period column in the export.
- Clarified Settings and Tax page mileage-rate copy so saved rates remain a setup confirmation while split-rate years use date-based calculations.

## 2026-07-07

### Changed
- Updated the Games page start-time picker to move in 5-minute increments while keeping common start-time shortcuts.
- Restored one-touch game status actions for marking scheduled games played and played games paid from the Games list.
- Added safer weekly games email diagnostics for cron authorization, email configuration, and per-user send failures so production can show where the Sunday email job stops.
- Added a focused sync reliability test command and documented manual live-feed checks for feed import, repeated syncs, manual corrections, blocks, mileage, and recovery.
- Extracted synced-game merge behavior into a shared server helper so production sync and regression tests use the same preservation rules.

### Fixed
- Preserved existing sport and competition level during calendar sync so manual corrections, such as changing a synced soccer game from High School to Club, are not overwritten by later feed syncs.
- Kept loaded game counts in weekly email failure summaries so Resend or delivery failures no longer misleadingly report zero games.
- Kept DragonFly availability blocks out of the Games list by classifying availability/block text before game inference and cleaning up previously-created games linked to block calendar events on the next sync.
- Added stale-feed deviation handling so future scheduled synced games/calendar items missing from the latest feed are marked canceled for review instead of staying active indefinitely.
- Broadened DragonFly availability-block detection to catch simpler "Availability" feed titles.
- Added platform-specific sync competition defaults: RefQuest defaults to College, Ref Insight defaults to Club, and DragonFly defaults to High School when the feed does not provide a clearer level.
- Parsed RefQuest note text like "Morehead State at Ohio (1:00PM EDT)" into away/home teams during sync.

## 2026-07-01

### Changed
- Added structured logging and a secured dry-run mode for the weekly games email cron route so delivery issues can be diagnosed without waiting for Sunday.
- Documented `CRON_SECRET` in the example environment file and weekly email manual test instructions.

## 2026-06-29

### Changed
- Reworked the Games page start-time input into a larger hour/minute/AM-PM picker with common start-time shortcuts.

## 2026-06-21

### Changed
- Improved the expense workflow so newly saved expenses stay open for receipt upload instead of resetting the form immediately.
- Made saved expense cards and table rows clickable/selectable for editing, with expanded detail feedback for the selected record.

## 2026-06-20

### Added
- Added server-side owner notifications for new beta access requests using the existing Resend email path.
- Added `support@whistlekeeper.com` as the visible support contact on public, auth, settings, and data/privacy surfaces.
- Added shared support-contact and transactional-email helpers so support address and Resend behavior stay consistent.

### Changed
- Hardened tax-facing language so tax features are framed as record organization, review prompts, and export summaries rather than tax advice or tax readiness.
- Changed new expenses to default to not marked for tax review, reducing any implication that the app pre-classifies expenses as deductible.
- Replaced user-facing "home office" and "work location" mileage labels with primary/secondary mileage-origin language.
- Added IRS-linked mileage-origin guidance to onboarding, settings, and game mileage calculation.
- Renamed Tax export confidence language to record completeness language and added general review prompts to the tax review checklist export.
- Enlarged the PWA and Apple touch icon artwork so the installed app logo fills more of the available icon space.

### Fixed
- Restored normal app navigation on the signed-in Account page while keeping unauthenticated sign-in and auth callback screens focused.
- Aligned onboarding mileage-origin guidance with Settings so new users see the same caution when entering their first address.
- Stopped completed users from being redirected back to onboarding after a browser refresh by honoring the saved onboarding completion timestamp.

### Security / Privacy
- Kept beta request notification emails server-side and best-effort so email failures do not block request storage.
- Documented new Vercel email environment variables without exposing secrets in client code.

## 2026-06-20

### Added
- Added a gated beta access request flow so prospective testers can request access from the public site.
- Added an admin beta queue with invite, waitlist, and reject actions.
- Added a `beta_access_requests` manual Supabase patch and beta access operations documentation.

### Changed
- Updated landing-page calls to action to send new prospects to request beta access while preserving sign-in for invited users.

### Fixed
- Hardened account deletion so the server route owns account-row cleanup and then deletes the Supabase Auth user with the service-role admin API.
- Added clearer failure behavior when app data is deleted but the Auth user cannot be deleted automatically.

### Security / Privacy
- Kept beta request table access server-side with RLS enabled and no direct public table policies.
- Reaffirmed that account deletion should be self-service and server-side, with manual Supabase Auth deletion only as an exception path.
- Expanded account deletion cleanup to include core app rows, feeds, sync history, app events, profiles, and optional sync/admin tables where present.

## 2026-06-19

### Added
- Created a release QA plan covering smoke, functional, end-to-end, regression, negative/input validation, boundary, RLS/security, cross-device, sync resilience, observability, accessibility, and beta acceptance testing.
- Created a practical 20-30 minute release smoke checklist for beta deployment confidence.
- Added a Playwright-based QA smoke harness with desktop and mobile Chrome projects.
- Added `npm run qa:smoke`, `npm run test:e2e`, and `npm run qa:release`.
- Added a dedicated Playwright smoke runner that starts and stops a temporary local Vite server cleanly on Windows.

### Fixed
- Resolved new-user iPad profile-save failures by moving `user_settings` persistence through the authenticated server route instead of relying only on direct browser-to-Supabase writes.
- Made calendar-feed onboarding resilient when feed creation succeeds but immediate sync or follow-up settings refresh needs review.
- Fixed misleading feed-add errors where a saved feed could appear to have failed.
- Required explicit mileage-rate confirmation before Tax readiness is shown as complete.
- Improved onboarding completion persistence so users who finish quick start do not return to onboarding after refresh.

### Changed
- Split unit tests and browser tests so Vitest does not collect Playwright specs.
- Updated release docs to clarify what the automated harness covers and what still requires real-device or live-service testing.
- Preserved Vercel Hobby function budget by reusing existing API domains instead of adding new serverless functions for settings persistence.

### QA / Release
- Verified `npm run qa:release` runs typecheck, unit tests, lint, build, and Playwright smoke tests.
- Captured remaining manual-only coverage: real iPad/iPhone Safari behavior, Supabase OTP delivery, Google Maps address validation, real assigning-platform iCal feeds, scheduled sync, storage uploads, and product feel.

## 2026-06-18

### Added
- Added privacy-conscious observability documentation and admin-facing operational metrics.
- Added durable sync history and sync job visibility so feed health can be inspected over time.
- Added mobile-focused documentation for the Home dashboard.

### Changed
- Refactored the Home screen into a mobile-first referee dashboard focused on next assignment, weekly summary, readiness, sync health, attention-needed items, and quick actions.
- Extracted dashboard logic into shared helpers for next assignment, week summary, readiness, sync health, attention items, and map links.
- Continued mobile polish across Sync, Requirements, Settings, and related workflows.

### QA / Release
- Published and verified the mobile dashboard change set with typecheck, unit tests, and build checks.

## 2026-06-17

### Added
- Added email OTP as a mobile/PWA-friendly sign-in option while preserving magic-link login for web use.
- Added mobile-first app-shell and bottom navigation patterns.
- Added mobile calendar polish with agenda/month modes and improved month navigation.

### Changed
- Reworked Home into a referee command center instead of a desktop-style overview page.
- Moved quick actions lower on the Home page after dashboard content.
- Improved calendar usability on phone-sized screens.

## 2026-06-14

### Added
- Added production schema drift control through a read-only Supabase drift-check script and documented repair workflow.
- Added server-side user profile and admin foundation using `user_profiles`, `app_events`, `api/platform.ts`, and the Admin page.
- Added role and subscription fields to support future tiering and RBAC.
- Added owner/admin bootstrap SQL guidance.
- Added durable sync SQL patches for sync history and sync jobs.

### Fixed
- Fixed `/admin` redirect behavior by separating "auth still restoring" from "signed out" with `authReady`.
- Delayed protected-route redirects until Supabase session restoration completes.

### Security / Privacy
- Established `user_profiles.role` as the server-side source for admin access.
- Kept admin telemetry aggregate and privacy-aware, avoiding assignment details, addresses, feed URLs, notes, receipt filenames, and tax export contents.

## 2026-06-01 To 2026-06-13

### Added
- Added account and data lifecycle controls including account export, reset, and delete flows.
- Added Data & Privacy page as a clearer user-facing home for privacy and lifecycle controls.
- Added weekly email preference persistence support.
- Added guided calendar-feed setup documentation and platform help content.
- Added calendar export token handling and outbound iCal feed improvements.

### Changed
- Consolidated Vercel serverless functions to stay within Hobby plan limits.
- Improved sync dependability and reduced duplicate calendar/feed behavior.
- Improved mobile calendar layout and polished platform color-coding.
- Improved Requirements into a readiness-oriented experience for sport, level, governing body, and season.
- Improved Tax into a safer review workspace with official IRS links, review flags, export confidence, and CSV review queue.

### Fixed
- Fixed duplicate availability block display and outbound iCal duplicate behavior.
- Fixed weekly email setting not persisting to Supabase.
- Fixed onboarding issues where fresh users inherited cached or seeded owner profile data.
- Fixed onboarding assignment setup confusion by presenting feed connection and manual game entry as alternatives in the same step.
- Fixed profile-origin address validation flow to require a real verified address for mileage origins.
- Fixed onboarding error placement for bad addresses so feedback appears near the action.
- Fixed manual game default start time behavior so default 7 PM assignments save correctly.
- Fixed false feed-refresh alerts for manually entered games.
- Fixed Tax readiness being marked complete too easily from default mileage-rate state.

### Security / Privacy
- Hardened personal-data handling around feed URLs and account lifecycle.
- Added feed URL encryption/protection handling and guidance.
- Added server-authorized admin/platform endpoints without exposing service-role credentials to the client.

## Pre-Changelog Baseline

The app already supported the core Whistle Keeper workflows before this changelog was created:

- Games and assignment tracking.
- Calendar view with games, blocks, travel, and admin events.
- Sync with iCal/calendar feeds.
- Expenses, mileage, receipts, and tax-time exports.
- Requirements tracking.
- Supabase Auth with passwordless sign-in.
- Supabase-backed cloud data with RLS expectations.

This changelog starts as a best-effort reconstruction from recent QA work, commit history, docs, and implementation memory. Future entries should be added as part of each meaningful release or QA-driven change.
