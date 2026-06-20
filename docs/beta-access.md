# Beta Access Flow

Whistle Keeper uses a gated beta flow before public self-serve signup.

## Purpose

The beta request flow lets prospective testers ask for access without requiring the app owner to create every Supabase user manually. It keeps the product curated while Whistle Keeper is still validating onboarding, feed sync, mobile behavior, tax readiness, requirements, and support load.

## User Flow

1. Visitor opens the public landing page.
2. Visitor clicks **Request beta access**.
3. Visitor submits name, email, region, sports, assigning platforms, primary device, and optional notes.
4. The request is saved through `/api/platform?action=beta-request`.
5. If `BETA_REQUEST_NOTIFY_TO` is configured, Whistle Keeper sends a best-effort owner notification email.
6. The visitor sees a confirmation message.

The public browser never writes directly to the `beta_access_requests` table.
Notification emails are sent server-side through Resend. Store `RESEND_API_KEY`, `EMAIL_FROM`, and `BETA_REQUEST_NOTIFY_TO` in Vercel environment variables; do not put email credentials in client code.

## Admin Flow

1. Admin opens `/admin`.
2. Admin reviews **Beta Access Requests**.
3. Admin chooses:
   - **Invite**: sends a Supabase Auth invite email and marks the request as `invited`.
   - **Waitlist**: marks the request as `waitlisted`.
   - **Reject**: marks the request as `rejected`.

Supabase Auth credentials and service-role access remain server-side only.

## Database

Run this manual patch in Supabase before using the flow in production:

`supabase/manual-patches/2026-06-20-beta-access-requests.sql`

The table has RLS enabled and intentionally has no public row policies. App access goes through the server API.

## Manual QA

- Open `/request-access` while signed out.
- Submit an incomplete form and confirm inline validation appears.
- Submit a complete form and confirm the success state appears.
- Confirm the request appears in Supabase `beta_access_requests`.
- If `BETA_REQUEST_NOTIFY_TO` is configured, confirm the owner/admin inbox receives a "New Whistle Keeper beta request" email.
- Sign in as an admin and open `/admin`.
- Confirm the request appears in **Beta Access Requests**.
- Click **Waitlist** and confirm the status updates.
- Submit another request or reset status, then click **Invite**.
- Confirm the tester receives a Whistle Keeper-branded Supabase Auth invite.
- Confirm the invite opens `/auth/callback` and routes the user through normal onboarding.
- Confirm a non-admin cannot load beta requests or review requests.
