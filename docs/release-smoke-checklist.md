# Release Smoke Checklist

Use this 20-30 minute checklist before beta deployments. It is intentionally practical: prove the app starts, auth works, core workflows save, sync does not lie, and user data stays isolated.

## Setup

- Use the current beta deployment or local preview build.
- Have one existing owner/admin account ready.
- Have one fresh test user or invite ready.
- Use one desktop browser and one iPhone or iPad.
- Use private/incognito mode for the fresh-user test.

## 1. Build And App Load

- Run `npm run typecheck:all`.
- Run `npm test`.
- Run `npm run lint`.
- Run `npm run build`.
- Run `npm run qa:smoke`.
- Open the app and confirm the auth page loads without console-breaking errors.

## 2. Fresh User Onboarding

- Sign in as a fresh user with OTP on iPhone or iPad.
- Confirm the user lands on onboarding.
- Confirm no owner/test data appears in profile, platforms, leagues, games, requirements, or dashboard cards.
- Enter a real profile address and save profile.
- Confirm the address saves and shows as verified.
- Click `Finish quick start`.
- Refresh the app.
- Confirm the app stays on Home instead of returning to onboarding.

## 3. Assignment Entry And Feed Setup

- From onboarding or Sync, choose `Connect an iCal feed`.
- Open `What is this?` and confirm the help text appears.
- Add a known-good feed.
- Confirm the feed appears in the feed list.
- Confirm immediate sync either imports games or shows a clear warning while keeping the feed saved.
- Add one manual game with the default 7:00 PM start time.
- Save it without changing the time.
- Reopen the game and confirm 7:00 PM persisted.

## 4. Home, Calendar, And Games

- Open Home.
- Confirm next assignment, week summary, readiness, sync health, attention, and quick actions render sensibly.
- Open Calendar on mobile.
- Switch month and agenda views.
- Use previous/next controls and confirm the visible dates stay synchronized.
- Confirm blocks and games do not cover date numbers or create horizontal scrolling.
- Open Games and edit one assignment.
- Confirm location, pay, mileage, platform, and notes save.

## 5. Requirements, Expenses, And Tax

- Open Requirements.
- Create or open a readiness group.
- Add or update one requirement and save it.
- Open Expenses.
- Add one small expense.
- Confirm category-specific review language appears where relevant.
- Open Tax.
- Confirm the review queue loads.
- Confirm tax readiness does not imply tax advice.
- Download a tax or review CSV if safe in the test environment.

## 6. Settings, Account, And Privacy

- Open Settings.
- Toggle weekly email on, refresh, and confirm it stays on.
- Toggle it off again if needed for the test account.
- Open Data & Privacy.
- Confirm export/delete/reset options are visible and understandable.
- Open Account and confirm sign-out works.

## 7. Security Spot Check

- Sign back in as the owner/admin account.
- Confirm the owner does not see the fresh user's profile data unless using admin-only aggregate views.
- Open `/admin` as owner/admin and confirm metrics load.
- Sign in as the non-admin test user and confirm `/admin` redirects or blocks access.
- Confirm full feed URLs are not visible in feed lists, telemetry, or normal UI.

## 8. Sync And Observability

- Run `Sync All`.
- Confirm the result card shows success, partial, or failed status with useful counts.
- Confirm Sync History updates or degrades gracefully if the optional table is unavailable.
- Confirm admin metrics show recent activity after the test run.
- Confirm app events do not include private addresses, notes, feed URLs, receipt names, or tax export contents.

## Release Decision

Ship the beta build only if:

- Auth, onboarding, profile save, Home, Calendar, Games, Sync, Settings, and sign-out work.
- The fresh user does not inherit any other user's data.
- No RLS/security spot check fails.
- Feed creation does not falsely report failure after saving.
- Build checks pass.
- Any remaining issue is low-risk, documented, and acceptable for beta.
