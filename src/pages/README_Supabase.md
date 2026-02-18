# Supabase Setup (Vercel + Auth + DB)

## 1) Create Supabase project
Create a project in Supabase, then grab:
- Project URL
- anon/public key

## 2) Run the schema SQL
Open Supabase → SQL Editor → paste `supabase/schema.sql` from this repo.

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

Serverless (Distance lookup):
- `GOOGLE_MAPS_API_KEY` (optional, only needed if you want distance-from-home)

## 5) Deploy
Push to GitHub, import into Vercel, deploy.

## Notes
- RLS policies enforce `auth.uid() = user_id` across all tables.
- Settings (home address, assigning platforms, league suggestions) are stored in `user_settings`.
- Distance is calculated via `/api/distance` (serverless) so your API key is not exposed to the browser.
