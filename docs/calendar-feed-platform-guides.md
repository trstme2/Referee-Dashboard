# Calendar Feed Platform Guides

## Purpose

Whistle Keeper uses a guided "Add Calendar Feed" flow to help officials find the iCal or calendar subscription link that their assigning platform already provides.

This is a helper and teaching tool. It is not a direct platform integration.

## Guardrails

- Whistle Keeper does not directly integrate with Arbiter, DragonFly, RQ+ / RefQuest, GameOfficials.net, GotSport, Assignr, HorizonWebRef, RefTown, or any other assigning platform.
- Whistle Keeper must not ask for, store, or transmit assigning-platform usernames or passwords.
- Users should paste only the calendar feed URL that their assigning platform already exposes.
- Feed URLs can be sensitive. Do not add full feed URLs to product analytics or logs.

## Where the guide content lives

Platform instructions are centralized in [src/lib/assigningPlatformGuides.ts](/C:/Users/westi/OneDrive/David_Applications/Referee%20Dashboard/src/lib/assigningPlatformGuides.ts).

Each guide supports:

- `id`
- `name`
- `platformValue`
- `loginUrl`
- `helpUrl`
- `confidence`
- `description`
- `instructions`
- `mobileInstructions`
- `caveat`
- `specialNotes`

Keep new platform wording in that helper so onboarding and Sync stay consistent.

## Confidence labels

- `user-verified` -> `User-verified instructions`
- `official-docs` -> `Based on official platform instructions`
- `general-guidance` -> `General guidance; menu names may vary`
- `generic` -> `Generic guidance`

These labels are meant to set expectations without sounding alarming.

## URL handling

- `webcal://` URLs are normalized to `https://` before save and fetch.
- `https://` URLs are accepted.
- Plain `http://` URLs stay blocked by default so feed storage remains on secure transport.
- The UI warns, but does not block, when a URL does not look obviously feed-like.

## Updating platform instructions

1. Update the relevant entry in `src/lib/assigningPlatformGuides.ts`.
2. Preserve user-verified wording when a real user has confirmed the path.
3. Prefer official help URLs when they exist.
4. Keep caveats honest because platform menus drift over time.
5. If a platform stops exposing a reusable feed URL, note that clearly instead of implying a direct integration.

## User feedback

Platform menus change often. Treat user feedback as a signal to refresh the guide copy, especially when a user has physically walked the path in the live assigning platform.

## Manual QA checklist

- Add feed using Arbiter guide.
- Add feed using DragonFly guide.
- Add feed using RQ+ / RefQuest guide.
- Add feed using Assignr guide.
- Add feed using Other / Not sure.
- Test on iPhone-sized viewport.
- Test on desktop viewport.
- Test external links open in a new tab/window.
- Test invalid URL.
- Test `webcal://` URL.
- Test `https://` URL.
- Test existing manual feed paste flow still works.
- Test successful sync after adding feed.
- Test failed sync user message.
- Confirm full feed URLs are not unnecessarily exposed in product analytics or logs.
