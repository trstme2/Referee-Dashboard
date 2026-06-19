import { describe, expect, it } from 'vitest'
import { createFreshDB } from './storage'
import { getOnboardingProgress, getOnboardingSteps } from './onboarding'

describe('onboarding progress', () => {
  it('starts a fresh account at zero completed steps', () => {
    const db = createFreshDB()

    const progress = getOnboardingProgress(db)

    expect(progress.complete).toBe(0)
    expect(progress.percent).toBe(0)
    expect(progress.steps.every((step) => step.complete === false)).toBe(true)
  })

  it('does not count starter requirement definitions as completed setup', () => {
    const db = createFreshDB()

    const requirementsStep = getOnboardingSteps(db).find((step) => step.id === 'requirements')

    expect(requirementsStep?.complete).toBe(false)
  })
})
