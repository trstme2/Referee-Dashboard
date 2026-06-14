# Supabase Setup (Vercel + Auth + DB)

## 1) Create Supabase project
Create a project in Supabase, then grab:
- Project URL
- publishable key (`sb_publishable_...`)
- server secret key (`sb_secret_...`)

## 2) Run the schema SQL
Open Supabase -> SQL Editor -> paste `supabase/schema.sql` from this repo.
This now also creates the private `requirement-evidence` Storage bucket plus policies for per-user document access.

## 2a) Production schema drift control
Before deploying features that touch Supabase, run the read-only drift check:

1. Open Supabase -> SQL Editor.
2. Paste and run `supabase/production-schema-drift-check.sql`.
3. Expected healthy result: zero rows.

If the drift check returns rows, production is missing tables, columns, indexes, RLS policies, or storage bucket policy pieces expected by the app. Repair production by running `supabase/schema.sql`, then rerun `supabase/production-schema-drift-check.sql` until it returns zero rows.

Use `supabase/manual-patches/*` only for small targeted fixes when you do not want to rerun the full idempotent schema. The full `supabase/schema.sql` remains the source of truth.

## 2b) Roles, subscriptions, and admin bootstrap
The app uses `user_profiles` for server-side roles and subscription entitlement metadata:

- `role`: `user`, `support`, `admin`, `owner`
- `subscription_tier`: `free`, `pro`, `premium`
- `subscription_status`: `free`, `trialing`, `active`, `past_due`, `canceled`

Roles and subscription fields are not user-editable from the browser. The `/api/platform` server route creates/updates profile heartbeat data and checks admin authorization with the server secret key.

To bootstrap the first admin:

1. Sign in to the app once so `user_profiles` is created.
2. In Supabase SQL Editor, run:

```sql
update public.user_profiles
set role = 'owner', updated_at = now()
where email = 'you@example.com';
```

The initial admin metrics page is available at `/admin`. Non-admin users receive a server-side authorization failure.

## 3) Enable Auth + URLs
Supabase -> Authentication -> URL Configuration:
- Site URL: your Vercel production URL (e.g. https://your-app.vercel.app)
- Redirect URLs: add the same domain, plus Preview domains if you use them.

Magic link sign-in uses `emailRedirectTo = window.location.origin`.

## 4) Vercel env vars
In Vercel Project Settings -> Environment Variables:

Frontend (Vite):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Serverless:
- `SUPABASE_PUBLISHABLE_KEY` (same publishable key, used by server routes that also pass a user JWT)
- `SUPABASE_SECRET_KEY` (server-only elevated key for scheduled jobs)
- `GOOGLE_MAPS_API_KEY` (optional, only needed if you want distance-from-home)
- `CRON_SECRET` (used by Vercel Cron to authorize scheduled requests)
- `FEED_URL_ENCRYPTION_KEY` (recommended; 32-byte base64 or 64-character hex key used to encrypt saved iCal feed URLs at rest)
- `RESEND_API_KEY` (needed for weekly schedule emails)
- `WEEKLY_EMAIL_FROM` (optional, defaults to Resend's test sender)
- `WEEKLY_EMAIL_REPLY_TO` (optional)
- `APP_URL` (optional, used for the dashboard link in emails)

The weekly schedule email runs from `/api/weekly-games-email` every Sunday at `13:00 UTC`.
It sends opted-in users a "Games Next 7 Days" email using the same Scheduled-game date window as the Home page.
Users opt in or out from Settings with the Weekly Sunday game email checkbox.

## 5) Deploy
Push to GitHub, import into Vercel, deploy.

## Notes
- RLS policies enforce `auth.uid() = user_id` across all tables.
- Legacy `VITE_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` still work during rotation, but new deployments should use the publishable and secret key variables above.
- Requirement evidence uploads are stored in private Supabase Storage, under a user-scoped folder path.
- Expense receipt uploads are stored in private Supabase Storage, under a user-scoped folder path.
- Calendar feed URLs and calendar subscription URLs are sensitive secrets. The app masks saved feed URLs in API responses, encrypts newly saved feed URLs when `FEED_URL_ENCRYPTION_KEY` is configured, stores newly generated calendar subscription tokens as hashes, uses private/no-store response headers for calendar exports, and lets users regenerate subscription tokens from Settings. Treat copied subscription URLs like passwords because calendar clients need unauthenticated access to poll them.
- Serverless endpoints include best-effort in-process rate limits. For high-volume production usage, pair these with a platform or edge rate limit because serverless instances do not share memory.
- Settings (home address, assigning platforms, league suggestions) are stored in `user_settings`.
- Distance is calculated via `/api/distance` (serverless) so your API key is not exposed to the browser.
