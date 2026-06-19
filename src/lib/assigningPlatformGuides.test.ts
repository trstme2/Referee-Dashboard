import { describe, expect, it } from 'vitest'
import {
  ASSIGNING_PLATFORM_OPTIONS,
  assigningPlatformConfidenceLabel,
  assigningPlatformGuideIdForPlatformValue,
  assigningPlatformStoredValue,
  getAssigningPlatformGuide,
} from './assigningPlatformGuides'

describe('assigning platform guides', () => {
  it('includes the supported onboarding platform list', () => {
    expect(ASSIGNING_PLATFORM_OPTIONS.map((option) => option.label)).toEqual([
      'Arbiter',
      'DragonFly',
      'RQ+ / RefQuest',
      'GameOfficials.net',
      'GotSport',
      'Assignr',
      'HorizonWebRef',
      'RefTown',
      'Other / Not sure',
    ])
  })

  it('maps stored platform values back to the right guide', () => {
    expect(assigningPlatformGuideIdForPlatformValue('DragonFly')).toBe('dragonfly')
    expect(assigningPlatformGuideIdForPlatformValue('RQ+')).toBe('refquest')
    expect(assigningPlatformGuideIdForPlatformValue('gameofficials.net')).toBe('gameofficials')
    expect(assigningPlatformGuideIdForPlatformValue('Some New Assignor')).toBe('other')
  })

  it('returns friendly confidence labels', () => {
    expect(assigningPlatformConfidenceLabel('user-verified')).toBe('User-verified instructions')
    expect(assigningPlatformConfidenceLabel('official-docs')).toBe('Based on official platform instructions')
    expect(assigningPlatformConfidenceLabel('general-guidance')).toBe('General guidance; menu names may vary')
    expect(assigningPlatformConfidenceLabel('generic')).toBe('Generic guidance')
  })

  it('uses the canonical stored value when the guide has one', () => {
    expect(assigningPlatformStoredValue('dragonfly')).toBe('DragonFly')
    expect(assigningPlatformStoredValue('other', 'My Local Board')).toBe('My Local Board')
  })

  it('exposes help and mobile notes where available', () => {
    const assignr = getAssigningPlatformGuide('assignr')
    const gotSport = getAssigningPlatformGuide('gotsport')

    expect(assignr.helpUrl).toContain('assignr.com')
    expect(assignr.mobileInstructions?.length).toBeGreaterThan(0)
    expect(gotSport.mobileInstructions?.[0]).toContain('On mobile')
  })
})
