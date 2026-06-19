import type { DB } from './types'

export type OnboardingStepId = 'profile' | 'sports' | 'platforms' | 'records' | 'requirements' | 'tax'

export type OnboardingStep = {
  id: OnboardingStepId
  label: string
  complete: boolean
}

export function getOnboardingSteps(db: DB): OnboardingStep[] {
  const hasProfile = Boolean(db.settings.homeAddress.trim()) && Boolean(db.settings.defaultTimezone?.trim())
  const hasSports = (db.settings.trackedSports ?? []).length > 0
  const hasPlatforms = db.settings.assigningPlatforms.length > 0
  const hasAssignmentRecords = db.games.length > 0 || db.csvImports.length > 0
  const hasRequirements = db.requirementInstances.length > 0 || db.requirementActivities.length > 0
  const hasTaxBasics = db.games.some((g) => g.gameFee != null || g.roundtripMiles != null) || db.expenses.length > 0

  return [
    { id: 'profile', label: 'Profile', complete: hasProfile },
    { id: 'sports', label: 'Sports', complete: hasSports },
    { id: 'platforms', label: 'Platforms', complete: hasPlatforms },
    { id: 'records', label: 'Assignment records', complete: hasAssignmentRecords },
    { id: 'requirements', label: 'Requirements', complete: hasRequirements },
    { id: 'tax', label: 'Tax basics', complete: hasTaxBasics },
  ]
}

export function getOnboardingProgress(db: DB) {
  const steps = getOnboardingSteps(db)
  const complete = steps.filter((step) => step.complete).length
  return {
    steps,
    complete,
    total: steps.length,
    percent: Math.round((complete / steps.length) * 100),
    isComplete: Boolean(db.settings.onboardingCompletedAt),
  }
}

export function shouldStartOnboarding(db: DB): boolean {
  if (db.settings.onboardingCompletedAt) return false
  return db.games.length === 0 &&
    db.csvImports.length === 0 &&
    db.expenses.length === 0 &&
    db.requirementInstances.length === 0
}
