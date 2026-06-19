import { describe, expect, it } from 'vitest'
import { createFreshDB } from './storage'
import { getOnboardingProgress, getOnboardingSteps } from './onboarding'

describe('onboarding progress', () => {
  it('starts a fresh account at zero completed steps', () => {
    const db = createFreshDB()

    const progress = getOnboardingProgress(db)

    expect(progress.complete).toBe(0)
    expect(progress.total).toBe(2)
    expect(progress.laterComplete).toBe(0)
    expect(progress.laterTotal).toBe(2)
    expect(progress.minimumReady).toBe(false)
    expect(progress.isComplete).toBe(false)
    expect(progress.percent).toBe(0)
    expect(progress.steps.every((step) => step.complete === false)).toBe(true)
  })

  it('does not count starter requirement definitions as completed setup', () => {
    const db = createFreshDB()

    const requirementsStep = getOnboardingSteps(db).find((step) => step.id === 'requirements')

    expect(requirementsStep?.complete).toBe(false)
  })

  it('treats a verified profile as enough to finish onboarding', () => {
    const db = createFreshDB()
    db.settings.homeAddress = '399 S. Columbia Ave, Bexley, OH 43209'
    db.settings.homeAddressPlaceId = 'place-123'
    db.settings.defaultTimezone = 'America/New_York'

    const progress = getOnboardingProgress(db)

    expect(progress.complete).toBe(1)
    expect(progress.minimumReady).toBe(true)
    expect(progress.isComplete).toBe(true)
    expect(progress.steps.find((step) => step.id === 'profile')?.complete).toBe(true)
    expect(progress.steps.find((step) => step.id === 'assignments')?.complete).toBe(false)
  })

  it('does not mark tax readiness complete for a newly scheduled game by itself', () => {
    const db = createFreshDB()
    db.games = [
      {
        id: 'game-1',
        sport: 'Soccer',
        competitionLevel: 'High School',
        gameDate: '2026-06-20',
        startTime: '19:00',
        locationAddress: 'Central Stadium',
        status: 'Scheduled',
        paidConfirmed: false,
        gameFee: 85,
        platformConfirmations: {},
        createdAt: '2026-06-19T00:00:00.000Z',
        updatedAt: '2026-06-19T00:00:00.000Z',
      },
    ]

    const taxStep = getOnboardingSteps(db).find((step) => step.id === 'tax')

    expect(taxStep?.complete).toBe(false)
  })

  it('marks tax readiness complete once mileage or expense records exist', () => {
    const db = createFreshDB()
    db.games = [
      {
        id: 'game-1',
        sport: 'Soccer',
        competitionLevel: 'High School',
        gameDate: '2026-06-20',
        startTime: '19:00',
        locationAddress: 'Central Stadium',
        status: 'Scheduled',
        paidConfirmed: false,
        roundtripMiles: 24,
        platformConfirmations: {},
        createdAt: '2026-06-19T00:00:00.000Z',
        updatedAt: '2026-06-19T00:00:00.000Z',
      },
    ]

    const taxStep = getOnboardingSteps(db).find((step) => step.id === 'tax')

    expect(taxStep?.complete).toBe(true)
  })
})
