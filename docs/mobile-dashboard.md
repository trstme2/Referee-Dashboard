# Mobile Dashboard

## Purpose

The Whistle Keeper home screen is the referee command center. It is designed to answer the first mobile questions quickly:

- What is my next assignment?
- What does this week look like?
- Am I ready to work my seasons?
- Is sync healthy?
- Is anything quietly broken?

The dashboard is mobile-first, but it still scales into a clean desktop layout without splitting into separate product surfaces.

## Section Priority

The dashboard is intentionally ordered by decision urgency:

1. Header and greeting
2. Next Assignment
3. This Week
4. Readiness
5. Sync Health
6. Attention Needed
7. Quick Actions
8. Upcoming or recent assignments

This keeps the most useful referee context above the fold on an iPhone-sized screen.

## Mobile vs Desktop

Mobile behavior:
- The layout stacks vertically.
- The next assignment card leads the page.
- Weekly summary uses compact stat cards instead of wide KPI strips.
- Readiness, sync health, and attention all use card rows rather than tables.
- Quick actions stay touch-friendly and avoid horizontal scrolling.

Desktop behavior:
- The next assignment sits beside a secondary stack for week, readiness, and sync cards.
- Upcoming assignments can expand into a two-column card grid.
- The layout keeps the same data order and logic as mobile rather than introducing separate desktop-only dashboard behavior.

## Manual QA Checklist

- New user with no assignments:
  Confirm the dashboard shows the next-assignment empty state and useful quick actions instead of a dead blank screen.
- User with one upcoming assignment:
  Confirm the next assignment card shows sport, competition, date, time, location, role, source, and fee when present.
- User with multiple assignments this week:
  Confirm the weekly summary counts assignments, pay, mileage, sports, and pending details correctly.
- User with requirements complete:
  Confirm readiness shows a ready state and does not create fake alerts.
- User with requirements incomplete:
  Confirm readiness and attention surface the real due or overdue items.
- User with failed sync or stale feed data:
  Confirm sync health and attention show a real warning that links to Sync.
- Mobile iPhone-sized viewport:
  Confirm no horizontal scrolling, comfortable buttons, and a sensible section order.
- Desktop viewport:
  Confirm the dashboard uses wider space cleanly without becoming a dense report page.
- Dark/light mode if supported:
  Confirm the dashboard remains legible in every supported theme. Skip this check if the app only supports one theme.
- Authenticated user only:
  Confirm the dashboard remains behind the existing auth flow and routing behavior.
