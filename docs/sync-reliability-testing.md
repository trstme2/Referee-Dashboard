# Sync Reliability Testing

This guide defines the repeatable checks Whistle Keeper should use before trusting calendar-feed changes.

## Automated Checks

Run the focused sync suite when changing feed onboarding, feed fetching, calendar display, calendar export, sync jobs, or `/api/sync-ics` behavior:

```sh
npm run test:sync
```

The focused suite covers:

- Feed URL input validation and friendly errors.
- Feed fetch hardening, including secure URLs, blocked local hosts, oversized responses, HTML responses, and retry behavior.
- DragonFly block cleanup, duplicate block collapse, and multi-day block date coverage.
- Calendar display helpers for multi-day events and duplicate block visibility.
- Dashboard sync-health summaries.
- Sync merge behavior that preserves referee corrections on existing games.

For release candidates, keep using the full release check:

```sh
npm run qa:release
```

## Manual Live-Feed Checks

Use a beta/test account with at least one real feed whenever possible. Do not run these against a production account unless you are comfortable editing or deleting test games afterward.

### 1. New Feed Import

1. Add a new calendar feed through onboarding or Sync.
2. Confirm the app either syncs immediately or clearly tells the user to sync.
3. Run Sync for that feed.
4. Confirm the Sync page shows a success or partial result with understandable details.
5. Confirm imported games appear on Home, Games, and Calendar.
6. Confirm the feed row has `last_synced_at` populated in Supabase.
7. Confirm a row is written to `calendar_feed_sync_runs` when that table exists.

### 2. Repeat Sync Idempotency

1. Run the same feed sync again without changing the source platform.
2. Confirm the game count does not duplicate.
3. Confirm calendar block count does not duplicate.
4. Confirm existing games are updated, not recreated.
5. Confirm sync history reports updated/matched rows rather than a new batch of created rows.

### 3. Manual Correction Preservation

1. Pick one synced game.
2. Change the competition level, such as High School to Club.
3. Add or change a role, fee, mileage, notes, and payment status.
4. Run the feed sync again.
5. Confirm the manual competition level and referee-entered details stay intact.
6. Confirm source-platform confirmation chips still update correctly.

### 4. Real Feed Change

1. Change one assignment in the source platform if practical, or wait for a real platform update.
2. Run Sync again.
3. Confirm time/date/location changes from the source feed are reflected.
4. Confirm user-owned fields such as fee, mileage, notes, payment status, and manual classification are not unnecessarily overwritten.

### 5. Availability Blocks

1. Sync a feed with availability blocks.
2. Confirm duplicate blocks collapse in the app calendar and outbound calendar export.
3. Confirm multi-day blocks display on every touched date.
4. Confirm a block does not hide or duplicate a real game on the same day.

### 6. Import Start Date

1. Create or edit a feed with an import start date.
2. Sync the feed.
3. Confirm older source events are ignored.
4. Confirm future source events still import normally.

### 7. Mileage Backfill

1. Use a profile with a verified origin address.
2. Sync a feed event with a clear location address.
3. Confirm mileage is calculated only when the location is clear enough.
4. Confirm vague locations remain blank and can be manually updated.
5. Confirm existing mileage is not overwritten by a later sync.

### 8. Failure and Recovery

1. Temporarily disable or break a test feed URL.
2. Run Sync.
3. Confirm the Sync page shows a failed or partial result with useful language.
4. Restore the feed URL.
5. Run Sync again.
6. Confirm the feed recovers without duplicating games.

## What Still Requires Human Review

Automation can test parsing, merge rules, and duplicate protection. A referee still needs to manually verify:

- Whether each assigning platform exposes complete enough data.
- Whether platform-specific summaries are classified correctly.
- Whether real source changes are reflected after a repeated sync.
- Whether the app's wording makes partial imports understandable.
- Whether mobile Sync and Games workflows feel clear enough under field conditions.
