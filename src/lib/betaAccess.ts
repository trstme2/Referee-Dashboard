export const betaAccessSports = [
  'Soccer',
  'Lacrosse',
  'Basketball',
  'Volleyball',
  'Baseball',
  'Softball',
  'Football',
  'Other',
] as const

export const betaAccessPlatforms = [
  'DragonFly',
  'RefQuest',
  'Arbiter',
  'Assignr',
  'HorizonWebRef',
  'SportsEngine',
  'Other',
] as const

export const betaAccessDevices = [
  'iPhone',
  'Android',
  'iPad/tablet',
  'Desktop/laptop',
  'Mixed devices',
] as const

export type BetaAccessRequestInput = {
  fullName: string
  email: string
  region: string
  sports: string[]
  platforms: string[]
  devicePreference: string
  notes: string
}

export type SanitizedBetaAccessRequest = BetaAccessRequestInput & {
  emailNormalized: string
}

export type BetaAccessValidationResult =
  | { ok: true; value: SanitizedBetaAccessRequest }
  | { ok: false; errors: string[] }

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

function cleanArray(value: unknown, allowed: readonly string[], maxItems = 8): string[] {
  const input = Array.isArray(value) ? value : []
  const cleaned = input
    .map((item) => cleanText(item, 40))
    .filter(Boolean)
    .filter((item) => allowed.includes(item) || item.startsWith('Other: '))
  return Array.from(new Set(cleaned)).slice(0, maxItems)
}

export function normalizeBetaAccessEmail(email: unknown): string {
  return cleanText(email, 254).toLowerCase()
}

export function validateBetaAccessRequest(input: Partial<BetaAccessRequestInput>): BetaAccessValidationResult {
  const fullName = cleanText(input.fullName, 100)
  const email = cleanText(input.email, 254)
  const emailNormalized = normalizeBetaAccessEmail(email)
  const region = cleanText(input.region, 120)
  const sports = cleanArray(input.sports, betaAccessSports)
  const platforms = cleanArray(input.platforms, betaAccessPlatforms)
  const devicePreference = cleanText(input.devicePreference, 40)
  const notes = cleanText(input.notes, 800)
  const errors: string[] = []

  if (fullName.length < 2) errors.push('Enter your name.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalized)) errors.push('Enter a valid email address.')
  if (region.length < 2) errors.push('Enter your state or region.')
  if (!sports.length) errors.push('Choose at least one sport.')
  if (!platforms.length) errors.push('Choose at least one assigning platform or calendar source.')
  if (!betaAccessDevices.includes(devicePreference as any)) errors.push('Choose the device you expect to use most.')

  if (errors.length) return { ok: false, errors }

  return {
    ok: true,
    value: {
      fullName,
      email,
      emailNormalized,
      region,
      sports,
      platforms,
      devicePreference,
      notes,
    },
  }
}
