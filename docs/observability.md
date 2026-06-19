# Observability

Whistle Keeper uses a privacy-conscious observability model. The goal is to understand whether the product is healthy without storing assignment details, addresses, notes, feed URLs, receipt filenames, or requirement evidence names in telemetry.

## What Is Tracked

- Page views by route, such as `/calendar` or `/requirements`.
- Client-side errors with route, error kind, short message, and error name.
- Core workflow events: feed creation/deletion, manual game creation, expense creation, onboarding completion, tax export downloads, calendar export downloads, weekly email preference changes, sync success/failure, and app data reset.
- Aggregate admin metrics for users, activation, feed adoption, sync reliability, sync job backlog, product events, and error signals.

## What Is Not Tracked

- Opponent names, locations, addresses, calendar feed URLs, notes, receipt filenames, evidence filenames, tax export contents, or requirement details.
- Raw stack traces from the browser.
- Third-party tracking pixels or paid analytics dependencies.

## Admin Dashboard

The Admin page reads from the existing server-authorized platform endpoint. It shows aggregate-only signals:

- User count, active users, and new users.
- Activation rate based on whether users have core data such as feeds, games, expenses, or requirements.
- Sync success rate, failed/partial runs, average sync duration, and sync attempts.
- Durable sync job backlog and job status.
- Client/API error counts, page views, and workflow events.

If `calendar_sync_jobs` is not installed in an environment, the Admin page reports that the queue table is unavailable instead of failing the whole dashboard.

## Manual QA

- Sign in and visit Home, Calendar, Sync, Requirements, Tax, and Settings, then confirm `page_view` events appear in `app_events`.
- Create a test expense and confirm an `expense_created` event appears without private description text.
- Download a tax CSV and confirm a `tax_export_downloaded` event appears with export type and row count only.
- Toggle the weekly email setting and confirm `weekly_email_enabled` or `weekly_email_disabled`.
- Run Sync Now and confirm `sync_completed` or `sync_failed` records counts, not feed URLs.
- Open `/admin` as an owner/admin and confirm activation, reliability, sync job, and error signal cards load.
- Trigger a harmless browser error in a dev session and confirm `client_error` records route, kind, and short message only.
