import type { DB, Settings } from './types'

export type OnboardingStepId = 'profile' | 'assignments' | 'requirements' | 'tax'
export type OnboardingStepKind = 'required' | 'recommended' | 'optional'

export type OnboardingStep = {
  id: OnboardingStepId
  label: string
  complete: boolean
  kind: OnboardingStepKind
}

type OnboardingProgressOptions = {
  savedFeedCount?: number
}

export function hasRequiredProfileSetup(settings: Pick<Settings, 'homeAddress' | 'homeAddressPlaceId' | 'defaultTimezone'>): boolean {
  return Boolean(settings.homeAddress.trim()) &&
    Boolean(settings.homeAddressPlaceId?.trim()) &&
    Boolean(settings.defaultTimezone?.trim())
}

function hasConfirmedTaxMileageRate(settings: Pick<Settings, 'taxMileageRateCents'>): boolean {
  return typeof settings.taxMileageRateCents === 'number' && Number.isFinite(settings.taxMileageRateCents) && settings.taxMileageRateCents >= 0
}

export function getOnboardingSteps(db: DB, options?: OnboardingProgressOptions): OnboardingStep[] {
  const hasProfile = hasRequiredProfileSetup(db.settings)
  const hasAssignmentRecords = db.games.length > 0 || db.csvImports.length > 0 || Number(options?.savedFeedCount ?? 0) > 0
  const hasRequirements = db.requirementInstances.length > 0 || db.requirementActivities.length > 0
  const hasTaxRecords = db.expenses.length > 0 || db.games.some((g) =>
    g.roundtripMiles != null ||
    g.distanceMiles != null ||
    g.paidConfirmed ||
    g.status === 'Paid / Complete'
  )
  const hasTaxBasics = hasTaxRecords && hasConfirmedTaxMileageRate(db.settings)

  return [
    { id: 'profile', label: 'Profile', complete: hasProfile, kind: 'required' },
    { id: 'assignments', label: 'Assignments', complete: hasAssignmentRecords, kind: 'recommended' },
    { id: 'requirements', label: 'Requirements', complete: hasRequirements, kind: 'optional' },
    { id: 'tax', label: 'Tax record setup', complete: hasTaxBasics, kind: 'optional' },
  ]
}

export function getOnboardingProgress(db: DB, options?: OnboardingProgressOptions) {
  const steps = getOnboardingSteps(db, options)
  const quickStartSteps = steps.filter((step) => step.kind !== 'optional')
  const laterSteps = steps.filter((step) => step.kind === 'optional')
  const quickStartComplete = quickStartSteps.filter((step) => step.complete).length
  const laterComplete = laterSteps.filter((step) => step.complete).length
  const minimumReady = hasRequiredProfileSetup(db.settings)
  return {
    steps,
    quickStartSteps,
    laterSteps,
    complete: quickStartComplete,
    total: quickStartSteps.length,
    percent: Math.round((quickStartComplete / quickStartSteps.length) * 100),
    laterComplete,
    laterTotal: laterSteps.length,
    minimumReady,
    isComplete: minimumReady,
  }
}

export function shouldStartOnboarding(db: DB): boolean {
  return !hasRequiredProfileSetup(db.settings)
}
