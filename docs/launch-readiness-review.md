# Launch Readiness Review

Reviewed: 2026-07-26

This review prioritizes referee experience, dependable workflows, maintainability, performance, accessibility, and proportionate security for a public beta. It is not a substitute for a formal penetration test or legal review.

## Completed In This Pass

- Converted page imports to route-level lazy loading. The initial JavaScript bundle dropped from about 209 kB gzipped to 136 kB gzipped, while each workspace now loads on demand.
- Added a screen-level error boundary with a clear reload and return-home path. Rendering failures are recorded through the existing privacy-safe client-error event path.
- Removed the closed mobile More sheet from the DOM so hidden navigation links are not left in keyboard focus order.
- Aligned the local Vite distance endpoint with the production POST request contract.
- Made release-smoke tests resilient to page copy updates and calendar dates, and added a mobile navigation accessibility check.
- Removed the deprecated `@types/uuid` stub because `uuid` provides its own types.

## Priority 1: Next Product Engineering Work

### Standardize user feedback and recoverable errors

Several pages still use browser `alert()` calls and sometimes display raw server or storage messages. Replace them with a shared toast/notice component and a small user-facing error mapper. Messages should explain what happened, preserve the user’s work, and point to a recovery action without exposing implementation details.

Primary surfaces: Games distance lookup, Expenses receipt actions, Requirements evidence actions, Settings validation, and Tax validation.

### Scale data loading before records become large

`DataContext` currently loads each user table in full during refresh. That is practical for a beta referee account, but startup and memory use will grow with years of games, imported rows, and requirement activity. Introduce targeted queries or server-backed pagination when real beta accounts approach large histories.

### Add authenticated end-to-end coverage

The browser smoke suite exercises local mode well, but it does not prove Supabase auth, RLS, email login, Storage policies, or server routes. Build a separate test-project harness with two test users before broad self-service access.

## Priority 2: Maintainability And Polish

### Decompose the largest workspaces while changing them

Requirements, Games, Sync, Calendar, and DataContext are each large enough that a feature fix has an elevated regression risk. Extract page-specific form panels, list cards, and data helpers opportunistically; avoid a broad rewrite that would destabilize beta workflows.

### Consolidate visual feedback and form primitives

The app has a strong visual direction, but its CSS is concentrated in one large stylesheet and pages repeat button, card, loading, and empty-state patterns. Introduce shared primitives only when the next feature touches a repeated pattern. This should make styling more consistent without a cosmetic rewrite.

### Improve form semantics incrementally

Audit buttons inside forms for explicit `type`, connect validation text with inputs, announce save failures through live regions, and make overlay sheets trap focus while open. The mobile navigation’s closed-state focus issue is fixed in this pass; the remaining work is refinement.

## Priority 3: Operational And Security Follow-Through

- Confirm Production configuration, MFA, key scope, and closed-beta signup settings.
- Add automated RLS smoke testing, then pursue deeper SSRF hardening and operational alerts as beta usage grows.
- Define backup/restore, secret rotation, log retention, and incident-response procedures before broad public launch.
- Revisit the documented React Router RSC-mode audit exception whenever a compatible patched release is available or if the app adopts server-rendered routing.

## Validation Baseline

- TypeScript checks pass.
- Unit tests pass.
- Lint passes with three existing React effect warnings.
- Production build passes.
- Desktop and mobile browser smoke tests pass.
