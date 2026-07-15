import { describe, expect, it } from 'vitest'
import {
  hasSplitMileageRates,
  mileageRateForDate,
  mileageRatesForYear,
  mileageRateSummary,
  suggestedMileageRateCents,
} from './mileageRates'

describe('mileageRates', () => {
  it('uses the first 2026 rate through June 30', () => {
    expect(mileageRateForDate('2026-06-30')?.rateCents).toBe(72.5)
  })

  it('uses the second 2026 rate starting July 1', () => {
    expect(mileageRateForDate('2026-07-01')?.rateCents).toBe(76)
  })

  it('keeps single-rate years as one period', () => {
    expect(mileageRatesForYear('2025')).toHaveLength(1)
    expect(mileageRateForDate('2025-10-15')?.rateCents).toBe(70)
  })

  it('identifies 2026 as a split-rate year', () => {
    expect(hasSplitMileageRates('2026')).toBe(true)
    expect(suggestedMileageRateCents('2026')).toBe(76)
  })

  it('summarizes split-rate years for user-facing copy', () => {
    expect(mileageRateSummary('2026')).toContain('72.5 cents')
    expect(mileageRateSummary('2026')).toContain('76 cents')
  })
})
