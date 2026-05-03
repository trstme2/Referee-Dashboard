# Supabase Setup (Vercel + Auth + DB)

## 1) Create Supabase project
Create a project in Supabase, then grab:
- Project URL
- anon/public key

## 2) Run the schema SQL
Open Supabase → SQL Editor → paste `supabase/schema.sql` from this repo.
This now also creates the private `requirement-evidence` Storage bucket plus policies for per-user document access.

## 3) Enable Auth + URLs
Supabase → Authentication → URL Configuration:
- Site URL: your Vercel production URL (e.g. https://your-app.vercel.app)
- Redirect URLs: add the same domain, plus Preview domains if you use them.

Magic link sign-in uses `emailRedirectTo = window.location.origin`.

## 4) Vercel env vars
In Vercel Project Settings → Environment Variables:

Frontend (Vite):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Serverless:
- `GOOGLE_MAPS_API_KEY` (optional, only needed if you want distance-from-home)
- `SUPABASE_SERVICE_ROLE_KEY` (needed for scheduled server jobs)
- `CRON_SECRET` (used by Vercel Cron to authorize scheduled requests)
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
- Requirement evidence uploads are stored in private Supabase Storage, under a user-scoped folder path.
- Settings (home address, assigning platforms, league suggestions) are stored in `user_settings`.
- Distance is calculated via `/api/distance` (serverless) so your API key is not exposed to the browser.
