export type AssigningPlatformGuideConfidence =
  | 'user-verified'
  | 'official-docs'
  | 'general-guidance'
  | 'generic'

export type AssigningPlatformGuideId =
  | 'arbiter'
  | 'dragonfly'
  | 'refquest'
  | 'gameofficials'
  | 'gotsport'
  | 'assignr'
  | 'horizonwebref'
  | 'reftown'
  | 'other'

export type AssigningPlatformGuide = {
  id: AssigningPlatformGuideId
  name: string
  platformValue: string | null
  loginUrl: string | null
  helpUrl?: string
  confidence: AssigningPlatformGuideConfidence
  description: string
  instructions: string[]
  mobileInstructions?: string[]
  caveat: string
  specialNotes?: string[]
}

export const ASSIGNING_PLATFORM_GUIDES: AssigningPlatformGuide[] = [
  {
    id: 'arbiter',
    name: 'Arbiter',
    platformValue: 'Arbiter',
    loginUrl: 'https://go.arbitersports.com/',
    confidence: 'user-verified',
    description: 'Commonly used for high school and association assigning.',
    instructions: [
      'Open Arbiter and sign in.',
      'Go to Settings.',
      'Select User Preferences.',
      'Scroll down to Calendar Sync.',
      'Click the Send Email button.',
      'Open the email from Arbiter and follow the instructions to get your calendar sync link.',
      'Copy the iCal/calendar feed URL and paste it into Whistle Keeper.',
    ],
    caveat: 'Arbiter sends calendar sync instructions by email instead of displaying the feed directly in the app. Menu names may vary slightly by account or association.',
    specialNotes: [
      'Calendar sync instructions are sent by email.',
      'Check your inbox after clicking Send Email.',
    ],
  },
  {
    id: 'dragonfly',
    name: 'DragonFly',
    platformValue: 'DragonFly',
    loginUrl: 'https://max.dragonflyathletics.com/',
    confidence: 'user-verified',
    description: 'Used by many high school athletic associations for officials assignments, eligibility, payments, and compliance workflows.',
    instructions: [
      'Use the desktop/browser version of DragonFly. This flow may not be available in the mobile app.',
      'Open DragonFly and sign in.',
      'Go to Calendar.',
      'Click the gear/settings icon above the calendar area on the right side.',
      'Click the box in the upper-right corner that shows the Google, Apple, and Microsoft Outlook logos.',
      'Click + Integration.',
      'Click the Google icon.',
      'Select the calendars you want included.',
      'Click Continue.',
      'Copy the link DragonFly provides.',
      'Return to Whistle Keeper and paste the link.',
    ],
    caveat: 'DragonFly\'s calendar integration flow is not obvious and may require the desktop site. The Google option may still provide a usable calendar link for Whistle Keeper.',
    specialNotes: [
      'Desktop site recommended.',
      'The mobile app may not expose the calendar integration link.',
      'The Google option may still provide a reusable calendar URL.',
    ],
  },
  {
    id: 'refquest',
    name: 'RQ+ / RefQuest',
    platformValue: 'RefQuest',
    loginUrl: 'https://plus.refquest.com/',
    confidence: 'user-verified',
    description: 'Used for assigning, scheduling, availability, conflicts, evaluations, and multi-assignor officiating workflows.',
    instructions: [
      'Open RQ+ / RefQuest and sign in.',
      'Click Assign.',
      'Click Schedule.',
      'On the right side above the first game, click Export Games.',
      'Choose ICS (Calendar).',
      'Select the assignor you want to export.',
      'Copy the calendar link provided.',
      'Return to Whistle Keeper and paste the link.',
    ],
    caveat: 'RQ+ requires a separate calendar link for each assignor. If you work for multiple assignors in RQ+, add each assignor\'s feed separately in Whistle Keeper.',
    specialNotes: [
      'Separate feed may be required for each assignor.',
      'Add each RQ+ assignor feed separately in Whistle Keeper.',
    ],
  },
  {
    id: 'gameofficials',
    name: 'GameOfficials.net',
    platformValue: 'GameOfficials',
    loginUrl: 'https://www.gameofficials.net/',
    confidence: 'general-guidance',
    description: 'A legacy assigning platform still used by many officials, especially in soccer ecosystems.',
    instructions: [
      'Open GameOfficials.net and sign in.',
      'Go to My Assignments, Schedule, Calendar, or Personal Calendar.',
      'Look for options labeled iCal, Calendar Export, Subscribe, Sync Calendar, or webcal.',
      'Copy the subscription URL.',
      'Return to Whistle Keeper and paste the URL.',
    ],
    caveat: 'Some GameOfficials groups may not expose a persistent iCal feed, or the option may be hard to find in the legacy interface.',
    specialNotes: [
      'Instructions are general guidance until verified by users.',
      'Menu names may vary by group.',
    ],
  },
  {
    id: 'gotsport',
    name: 'GotSport',
    platformValue: 'GotSport',
    loginUrl: 'https://system.gotsport.com/',
    confidence: 'official-docs',
    description: 'GotSport has documented iCalendar support for referees to add accepted assignments to desktop or mobile calendars.',
    instructions: [
      'Open GotSport and sign in at system.gotsport.com.',
      'Click the Referees tab.',
      'Review your Offered and Accepted assignments.',
      'Click Add Accepted to Calendar.',
      'Choose whether to add all accepted matches or individual matches.',
      'If GotSport gives you a calendar subscription URL, copy it and paste it into Whistle Keeper.',
      'If your device adds events directly to Apple Calendar or Google Calendar instead of showing a URL, use your browser\'s copy/share options if available.',
    ],
    mobileInstructions: [
      'On mobile, sign into GotSport.',
      'Scroll right to the Referee tab.',
      'Go to your upcoming match list.',
      'Scroll until you see Add Accepted to Calendar.',
      'Tap it and follow the calendar prompt.',
    ],
    caveat: 'GotSport may add assignments directly to your device calendar rather than showing a reusable feed URL.',
    specialNotes: [
      'May add directly to Apple Calendar or Google Calendar.',
      'A reusable feed URL may not always be exposed.',
    ],
  },
  {
    id: 'assignr',
    name: 'Assignr',
    platformValue: 'Assignr',
    loginUrl: 'https://app.assignr.com/',
    helpUrl: 'https://support.assignr.com/en/articles/8526508-how-to-add-your-games-schedule-to-your-calendar',
    confidence: 'official-docs',
    description: 'A referee and umpire scheduling platform with iCalendar support for syncing assigned games to Apple Calendar, Google Calendar, and other calendar software.',
    instructions: [
      'Open Assignr and sign in.',
      'Go to Games.',
      'Select My Games.',
      'Select Personal iCalendar.',
      'If using a desktop browser and you need a URL, right-click Download.',
      'Choose Copy Link Address.',
      'Return to Whistle Keeper and paste the copied calendar link.',
    ],
    mobileInstructions: [
      'Open the Assignr mobile app.',
      'Tap the menu in the upper-left corner.',
      'Select iCalendar Subscribe.',
      'Follow the calendar prompt on your phone.',
      'If your phone subscribes directly instead of showing a link, use the desktop/browser instructions to copy the URL for Whistle Keeper.',
    ],
    caveat: 'Assignr says calendar sync is periodic, not immediate. Their iCalendar feed includes assigned games from one month ago through three months in the future.',
    specialNotes: [
      'Desktop/browser flow is best for copying the actual URL.',
      'Mobile app may subscribe directly instead of showing a link.',
      'Calendar sync may not be immediate.',
    ],
  },
  {
    id: 'horizonwebref',
    name: 'HorizonWebRef',
    platformValue: 'HorizonWebRef',
    loginUrl: 'https://www.horizonwebref.com/',
    confidence: 'general-guidance',
    description: 'A referee and umpire scheduling platform that publicly advertises external calendar synchronization.',
    instructions: [
      'Open HorizonWebRef and sign in.',
      'Go to your Schedule, Assignments, Calendar, or Settings/Preferences area.',
      'Look for Calendar Integration, Calendar Sync, Subscribe, iCal, or External Calendar.',
      'Copy the calendar subscription/feed URL.',
      'Return to Whistle Keeper and paste the URL.',
    ],
    caveat: 'The exact path may vary by organization or role. Search Horizon\'s Help Center for calendar integration or calendar sync if needed.',
    specialNotes: [
      'Instructions are general guidance until verified by users.',
      'Menu names may vary by organization.',
    ],
  },
  {
    id: 'reftown',
    name: 'RefTown',
    platformValue: 'RefTown',
    loginUrl: 'https://reftown.com/',
    confidence: 'general-guidance',
    description: 'A long-running officials management platform with scheduling, assignment windows, availability/conflict information, payroll, and organization tools.',
    instructions: [
      'Open RefTown and sign in.',
      'Go to your Schedules, Games, Assignments, or user account area.',
      'Look for Calendar, iCal, Subscribe, Export, Printable/Export, or External Calendar.',
      'Copy the feed URL if available.',
      'Return to Whistle Keeper and paste the URL.',
    ],
    caveat: 'Public iCal-feed instructions were not found. Treat this as a guided fallback until RefTown users confirm the exact path.',
    specialNotes: [
      'Instructions are general guidance until verified by users.',
      'Menu names may vary by organization.',
    ],
  },
  {
    id: 'other',
    name: 'Other / Not sure',
    platformValue: null,
    loginUrl: null,
    confidence: 'generic',
    description: 'Use this if your assigning platform is not listed or you are not sure which one you use.',
    instructions: [
      'Open your assigning platform.',
      'Look in Schedule, Assignments, Calendar, Profile, Settings, or Account.',
      'Search for words like iCal, ICS, Calendar Feed, Calendar Sync, Subscribe, Export Calendar, or Webcal.',
      'Copy the calendar URL if one is shown.',
      'Paste it into Whistle Keeper.',
    ],
    caveat: 'If you cannot find a calendar feed, tell us the platform name so we can improve these instructions.',
    specialNotes: [
      'A calendar feed URL often starts with webcal://, https://, or http://.',
      'A feed URL may include words like .ics, calendar, ical, subscribe, or feed.',
    ],
  },
]

const guidesById = new Map(ASSIGNING_PLATFORM_GUIDES.map((guide) => [guide.id, guide]))

const platformAliases: Array<{ id: AssigningPlatformGuideId; matches: string[] }> = [
  { id: 'dragonfly', matches: ['dragonfly'] },
  { id: 'refquest', matches: ['refquest', 'rq+', 'rq plus'] },
  { id: 'arbiter', matches: ['arbiter'] },
  { id: 'assignr', matches: ['assignr'] },
  { id: 'horizonwebref', matches: ['horizonwebref', 'horizon webref'] },
  { id: 'gameofficials', matches: ['gameofficials', 'gameofficials.net'] },
  { id: 'gotsport', matches: ['gotsport'] },
  { id: 'reftown', matches: ['reftown'] },
]

export function getAssigningPlatformGuide(id: AssigningPlatformGuideId): AssigningPlatformGuide {
  return guidesById.get(id) ?? guidesById.get('other')!
}

export function assigningPlatformConfidenceLabel(confidence: AssigningPlatformGuideConfidence): string {
  switch (confidence) {
    case 'user-verified':
      return 'User-verified instructions'
    case 'official-docs':
      return 'Based on official platform instructions'
    case 'general-guidance':
      return 'General guidance; menu names may vary'
    default:
      return 'Generic guidance'
  }
}

export function assigningPlatformGuideIdForPlatformValue(platform: string | null | undefined): AssigningPlatformGuideId {
  const value = String(platform ?? '').trim().toLowerCase()
  if (!value) return 'other'
  const match = platformAliases.find((candidate) => candidate.matches.some((alias) => value === alias || value.includes(alias)))
  return match?.id ?? 'other'
}

export function assigningPlatformStoredValue(
  guideId: AssigningPlatformGuideId,
  otherPlatformName?: string
): string {
  const guide = getAssigningPlatformGuide(guideId)
  if (guide.platformValue) return guide.platformValue
  return String(otherPlatformName ?? '').trim()
}

export const ASSIGNING_PLATFORM_OPTIONS = ASSIGNING_PLATFORM_GUIDES.map((guide) => ({
  id: guide.id,
  label: guide.name,
}))
