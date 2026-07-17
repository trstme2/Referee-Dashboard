# Security Hardening Deployment Notes

This release moves calendar feed records, sync queue records, and sync history behind verified server routes. It also adds durable rate limits, server-side account cleanup, and stricter closed-beta authentication behavior.

## Required Production Steps

1. Deploy the application code.
2. In Supabase SQL Editor, run `supabase/manual-patches/2026-07-17-security-hardening.sql`.
3. Run `supabase/production-schema-drift-check.sql`. A healthy result has zero rows.
4. In Vercel Production environment variables, set `APP_URL` to the canonical public URL, for example `https://whistlekeeper.com`.
5. In Supabase Dashboard, open Authentication settings and disable new-user signups while the app remains invite-only. The client also uses `shouldCreateUser: false`, but the Dashboard setting prevents a person from bypassing the app UI through Supabase's public Auth endpoint.

## What Changes

- `calendar_feeds`, `calendar_sync_jobs`, `calendar_feed_sync_runs`, and beta-access requests become server-managed. The app UI still uses the same APIs.
- A private `api_rate_limit_buckets` table stores hashed subjects and is accessed only through a `service_role`-only function.
- Feed sync rejects calendars with more than 1,000 events, processes only a bounded date window, and limits automatic Google mileage lookups to 25 per sync.
- Reset and delete enumerate both private Storage buckets under the user id before deleting database records. Account deletion also attempts global session revocation before deleting the Auth user.
- Distance lookups use POST bodies so precise addresses are not placed in application URL query strings.
- Browser sign-out removes the cloud account's local cache from this browser profile.

## Deferred Work

The legacy feed-URL encryption migration and existing calendar-export-token rotation are intentionally deferred. The prior audit found legacy production rows that must be migrated or rotated separately.

## Manual QA

- Add, edit, disable, delete, and sync a calendar feed.
- Confirm Sync history and queue status still load for the signed-in user.
- Confirm a direct browser Data API request cannot read or write a calendar feed, sync job, or sync-history row.
- Reset a test account with a receipt and requirement-evidence file, then verify its user-folder files are gone from both Storage buckets.
- Delete a separate test account and verify private files, app data, and the Auth user are removed.
- Sign out, inspect browser storage, and confirm the `referee_dashboard_db_v4_user_<user id>` item is gone.
- Submit the access-request form twice with the same email and confirm the original request details are not overwritten.
