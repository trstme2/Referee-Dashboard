import { describe, expect, it } from 'vitest'
import type { Expense, Game } from './types'
import { expenseCategoryCaution, taxReviewFlags, taxReviewFlagsForExpense } from './taxReview'

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'expense-1',
    expenseDate: '2026-04-05',
    amount: 25,
    category: 'Gear',
    taxDeductible: true,
    createdAt: '2026-04-05T00:00:00.000Z',
    updatedAt: '2026-04-05T00:00:00.000Z',
    ...overrides,
  }
}

function game(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game-1',
    sport: 'Soccer',
    competitionLevel: 'High School',
    gameDate: '2026-04-05',
    locationAddress: '100 Field Rd',
    status: 'Played',
    paidConfirmed: false,
    platformConfirmations: {},
    createdAt: '2026-04-05T00:00:00.000Z',
    updatedAt: '2026-04-05T00:00:00.000Z',
    ...overrides,
  }
}

describe('tax review flags', () => {
  it('flags deductible non-mileage expenses without receipts', () => {
    expect(taxReviewFlagsForExpense(expense(), []).map((flag) => flag.code)).toEqual(['missing-receipt'])
    expect(taxReviewFlagsForExpense(expense({ receiptFileName: 'receipt.pdf' }), [])).toEqual([])
  })

  it('flags incomplete and possibly duplicated mileage entries', () => {
    expect(taxReviewFlagsForExpense(expense({ category: 'Mileage', miles: 0 }), []).map((flag) => flag.code)).toEqual(['mileage-missing-miles'])

    const flags = taxReviewFlagsForExpense(
      expense({ category: 'Mileage', miles: 24, gameId: 'game-1' }),
      [game({ roundtripMiles: 24 })],
    )
    expect(flags.map((flag) => flag.code)).toEqual(['linked-game-mileage', 'same-date-mileage-match'])
  })

  it('adds category-specific review flags and only returns the selected year', () => {
    const rows = [
      expense({ id: 'phone', category: 'Phone/App', receiptFileName: 'phone.pdf' }),
      expense({ id: 'meals', category: 'Meals', receiptFileName: 'meal.pdf' }),
      expense({ id: 'lodging', category: 'Lodging', receiptFileName: 'hotel.pdf' }),
      expense({ id: 'other', category: 'Other', receiptFileName: 'other.pdf' }),
      expense({ id: 'old', expenseDate: '2025-04-05', category: 'Other' }),
    ]

    expect(taxReviewFlags(rows, [], '2026').map((flag) => flag.code)).toEqual([
      'other-missing-description',
      'lodging-tax-home',
      'meals-review',
      'phone-app-allocation',
    ])
  })

  it('provides category caution text for the expense editor', () => {
    expect(expenseCategoryCaution('Mileage')).toContain('Avoid double entry')
    expect(expenseCategoryCaution('Gear')).toBeUndefined()
  })
})
