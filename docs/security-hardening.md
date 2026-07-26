# Security Hardening Deployment Notes

This release moves calendar feed records, sync queue records, and sync history behind verified server routes. It also adds durable rate limits, server-side account cleanup, and stricter closed-beta authentication behavior.

## Required Production Steps

1. Deploy the application code.
2. Confirm the Supabase project URL matches the app's configured project before running SQL. If the drift check reports missing base tables, do not apply the base schema until the correct project is confirmed.
3. In Supabase SQL Editor, run `supabase/manual-patches/2026-07-17-security-hardening.sql`. It skips missing base-schema tables rather than failing.
4. Run `supabase/production-schema-drift-check.sql`. A healthy result has zero rows.
5. In Vercel Production environment variables, set `APP_URL` to the canonical public URL, for example `https://whistlekeeper.com`.
6. In Supabase Dashboard, open Authentication settings and disable new-user signups while the app remains invite-only. The client also uses `shouldCreateUser: false`, but the Dashboard setting prevents a person from bypassing the app UI through Supabase's public Auth endpoint.

## What Changes

- `calendar_feeds`, `calendar_sync_jobs`, `calendar_feed_sync_runs`, and beta-access requests become server-managed. The app UI still uses the same APIs.
- A private `api_rate_limit_buckets` table stores hashed subjects and is accessed only through a `service_role`-only function.
- Feed sync rejects calendars with more than 1,000 events, processes only a bounded date window, and limits automatic Google mileage lookups to 25 per sync.
- Reset and delete enumerate both private Storage buckets under the user id before deleting database records. Account deletion also attempts global session revocation before deleting the Auth user.
- Distance lookups use POST bodies so precise addresses are not placed in application URL query strings.
- Browser sign-out removes the cloud account's local cache from this browser profile.

## Legacy Sensitive-Data Migration

Legacy production records created before the hardening release may still contain plaintext iCal feed URLs or unhashed calendar-export tokens. The app now includes a one-time owner-only migration in `/admin` that protects those records without adding another Vercel function or exposing any secret values.

Before running it:

1. Set `FEED_URL_ENCRYPTION_KEY` in Vercel for the **Production** environment. Use the same key that encrypted any feeds already stored with the `wkenc:v1:` prefix. Do not rotate this value before the migration; doing so would prevent the app from reading those existing encrypted feeds.
2. Deploy the release containing the owner migration control.
3. Sign in as the owner and open `/admin`.
4. Confirm the status shows `Encryption key ready`, then select **Protect legacy data** and type `MIGRATE SENSITIVE DATA` exactly.

The migration preflights the configured key against existing encrypted feed values, encrypts and verifies each remaining plaintext feed URL, and clears legacy calendar-export tokens. It is idempotent: if an interruption occurs, rerun it and it resumes with the rows that remain.

Clearing a legacy calendar-export token intentionally invalidates its old unauthenticated calendar URL. Affected users can open Settings after the migration to receive a new subscription URL. Treat that URL like a password.

## Manual QA

- Add, edit, disable, delete, and sync a calendar feed.
- Confirm Sync history and queue status still load for the signed-in user.
- Confirm a direct browser Data API request cannot read or write a calendar feed, sync job, or sync-history row.
- Reset a test account with a receipt and requirement-evidence file, then verify its user-folder files are gone from both Storage buckets.
- Delete a separate test account and verify private files, app data, and the Auth user are removed.
- Sign out, inspect browser storage, and confirm the `referee_dashboard_db_v4_user_<user id>` item is gone.
- Submit the access-request form twice with the same email and confirm the original request details are not overwritten.
