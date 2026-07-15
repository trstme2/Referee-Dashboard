export type MileageRatePeriod = {
  start: string
  end: string
  rateCents: number
  label: string
}

export const IRS_BUSINESS_MILEAGE_RATE_PERIODS: MileageRatePeriod[] = [
  {
    start: '2026-01-01',
    end: '2026-06-30',
    rateCents: 72.5,
    label: 'Jan. 1-Jun. 30, 2026',
  },
  {
    start: '2026-07-01',
    end: '2026-12-31',
    rateCents: 76,
    label: 'Jul. 1-Dec. 31, 2026',
  },
  {
    start: '2025-01-01',
    end: '2025-12-31',
    rateCents: 70,
    label: '2025',
  },
  {
    start: '2024-01-01',
    end: '2024-12-31',
    rateCents: 67,
    label: '2024',
  },
  {
    start: '2023-01-01',
    end: '2023-12-31',
    rateCents: 65.5,
    label: '2023',
  },
]

export function mileageRatesForYear(year: string): MileageRatePeriod[] {
  return IRS_BUSINESS_MILEAGE_RATE_PERIODS.filter((period) => period.start.startsWith(year) || period.end.startsWith(year))
}

export function mileageRateForDate(date: string): MileageRatePeriod | undefined {
  return IRS_BUSINESS_MILEAGE_RATE_PERIODS.find((period) => date >= period.start && date <= period.end)
}

export function hasSplitMileageRates(year: string): boolean {
  return mileageRatesForYear(year).length > 1
}

export function suggestedMileageRateCents(year: string): number {
  const rates = mileageRatesForYear(year)
  return rates.at(-1)?.rateCents ?? 72.5
}

export function mileageRateSummary(year: string): string {
  const rates = mileageRatesForYear(year)
  if (rates.length === 0) return `No saved IRS business mileage rate is available for ${year}.`
  if (rates.length === 1) return `IRS business rate for ${year}: ${rates[0].rateCents} cents per mile.`
  const summary = rates.map((rate) => `${rate.rateCents} cents ${rate.label}`).join('; ')
  return `IRS business rates for ${year}: ${summary}.`
}
