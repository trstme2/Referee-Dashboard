import type { DB } from './types'

export type OnboardingStepId = 'profile' | 'assignments' | 'requirements' | 'tax'
export type OnboardingStepKind = 'required' | 'recommended' | 'optional'

export type OnboardingStep = {
  id: OnboardingStepId
  label: string
  complete: boolean
  kind: OnboardingStepKind
}

export function getOnboardingSteps(db: DB): OnboardingStep[] {
  const hasProfile = Boolean(db.settings.homeAddress.trim()) &&
    Boolean(db.settings.homeAddressPlaceId?.trim()) &&
    Boolean(db.settings.defaultTimezone?.trim())
  const hasAssignmentRecords = db.games.length > 0 || db.csvImports.length > 0
  const hasRequirements = db.requirementInstances.length > 0 || db.requirementActivities.length > 0
  const hasTaxBasics = db.expenses.length > 0 || db.games.some((g) =>
    g.roundtripMiles != null ||
    g.distanceMiles != null ||
    g.paidConfirmed ||
    g.status === 'Paid / Complete'
  )

  return [
    { id: 'profile', label: 'Profile', complete: hasProfile, kind: 'required' },
    { id: 'assignments', label: 'Assignments', complete: hasAssignmentRecords, kind: 'recommended' },
    { id: 'requirements', label: 'Requirements', complete: hasRequirements, kind: 'optional' },
    { id: 'tax', label: 'Tax readiness', complete: hasTaxBasics, kind: 'optional' },
  ]
}

export function getOnboardingProgress(db: DB) {
  const steps = getOnboardingSteps(db)
  const quickStartSteps = steps.filter((step) => step.kind !== 'optional')
  const laterSteps = steps.filter((step) => step.kind === 'optional')
  const quickStartComplete = quickStartSteps.filter((step) => step.complete).length
  const laterComplete = laterSteps.filter((step) => step.complete).length
  const minimumReady = Boolean(steps.find((step) => step.id === 'profile')?.complete)
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
    isComplete: minimumReady || Boolean(db.settings.onboardingCompletedAt),
  }
}

export function shouldStartOnboarding(db: DB): boolean {
  if (db.settings.onboardingCompletedAt) return false
  const hasProfile = Boolean(db.settings.homeAddress.trim()) &&
    Boolean(db.settings.homeAddressPlaceId?.trim()) &&
    Boolean(db.settings.defaultTimezone?.trim())
  return !hasProfile
}
