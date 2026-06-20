import type { Expense, ExpenseCategory, Game } from './types'

export const IRS_TAX_REVIEW_LINKS = [
  { label: 'IRS small business tax guide', href: 'https://www.irs.gov/publications/p334' },
  { label: 'IRS travel, gift, and car expenses', href: 'https://www.irs.gov/publications/p463' },
  { label: 'IRS recordkeeping guidance', href: 'https://www.irs.gov/taxtopics/tc305' },
  { label: 'IRS business use of home', href: 'https://www.irs.gov/taxtopics/tc509' },
] as const

export const IRS_MILEAGE_ORIGIN_LINKS = [
  { label: 'IRS travel, gift, and car expenses', href: 'https://www.irs.gov/publications/p463' },
  { label: 'IRS business use of home', href: 'https://www.irs.gov/taxtopics/tc509' },
] as const

export const TAX_REVIEW_CHECKLIST_ITEMS = [
  'Confirm whether your referee income is treated as independent contractor, employee, fee-basis official, or another status.',
  'Review whether any mileage from home is commuting, travel from a qualifying business location, or another treatment under IRS rules.',
  'Check whether any mileage was reimbursed, duplicated, personal, or already included in another record.',
  'Confirm whether you are using the standard mileage method or actual vehicle expenses for each vehicle and tax year.',
  'Review mixed personal/business expenses and document any allocation you plan to use.',
  'Review meals, lodging, travel-away-from-tax-home facts, and any limits that may apply.',
  'Keep receipts, payment records, assignment records, and notes that support the records you export.',
] as const

export const EXPENSE_CATEGORY_CAUTIONS: Partial<Record<ExpenseCategory, string>> = {
  Mileage: 'Avoid double entry between Games and Expenses. Review whether you are using the standard mileage method or actual vehicle costs for the same vehicle and tax year; do not combine both without confirming the treatment.',
  Meals: 'Document the business purpose and attendees. Deduction limitations may apply.',
  Lodging: 'Treatment depends on the travel-away-from-tax-home facts. Keep the dates, location, and business purpose.',
  'Phone/App': 'Mixed personal and business costs may require a reasonable allocation. Keep a note explaining the business portion.',
  Other: 'Add a description and business purpose so this record can be reviewed later.',
}

export type TaxReviewFlagCode =
  | 'missing-receipt'
  | 'mileage-missing-miles'
  | 'phone-app-allocation'
  | 'meals-review'
  | 'lodging-tax-home'
  | 'other-missing-description'
  | 'linked-game-mileage'
  | 'same-date-mileage-match'

export interface TaxReviewFlag {
  id: string
  expenseId: string
  expenseDate: string
  expenseCategory: ExpenseCategory
  expenseAmount: number
  markedForDeductibleReview: boolean
  code: TaxReviewFlagCode
  label: string
  detail: string
}

function gameMiles(game: Game): number {
  return Number(game.roundtripMiles ?? (game.distanceMiles != null ? game.distanceMiles * 2 : 0))
}

function hasReceipt(expense: Expense): boolean {
  return Boolean(expense.receiptStoragePath || expense.receiptFileName)
}

function makeFlag(expense: Expense, code: TaxReviewFlagCode, label: string, detail: string): TaxReviewFlag {
  return {
    id: `${expense.id}:${code}`,
    expenseId: expense.id,
    expenseDate: expense.expenseDate,
    expenseCategory: expense.category,
    expenseAmount: expense.amount,
    markedForDeductibleReview: expense.taxDeductible,
    code,
    label,
    detail,
  }
}

export function expenseCategoryCaution(category: ExpenseCategory): string | undefined {
  return EXPENSE_CATEGORY_CAUTIONS[category]
}

export function taxReviewFlagsForExpense(expense: Expense, games: Game[]): TaxReviewFlag[] {
  const flags: TaxReviewFlag[] = []
  const miles = Number(expense.miles ?? 0)

  if (expense.taxDeductible && expense.category !== 'Mileage' && !hasReceipt(expense)) {
    flags.push(makeFlag(expense, 'missing-receipt', 'Receipt missing', 'This non-mileage expense is marked for tax review but does not have a receipt uploaded.'))
  }

  if (expense.category === 'Mileage') {
    if (!(miles > 0)) {
      flags.push(makeFlag(expense, 'mileage-missing-miles', 'Mileage missing', 'Enter miles for this mileage expense before export.'))
    }

    const linkedGame = expense.gameId ? games.find((game) => game.id === expense.gameId) : undefined
    if (linkedGame && gameMiles(linkedGame) > 0) {
      flags.push(makeFlag(expense, 'linked-game-mileage', 'Linked game already has mileage', 'This mileage expense is linked to a game that already has mileage. Review it for possible double entry.'))
    }

    if (miles > 0 && games.some((game) => game.status !== 'Canceled' && game.gameDate === expense.expenseDate && gameMiles(game) > 0 && Math.abs(gameMiles(game) - miles) < 0.01)) {
      flags.push(makeFlag(expense, 'same-date-mileage-match', 'Possible mileage double count', 'A game on the same date has matching mileage. Confirm that the trip should not be counted twice.'))
    }
  }

  if (expense.category === 'Phone/App') {
    flags.push(makeFlag(expense, 'phone-app-allocation', 'Phone/App allocation review', 'Review mixed personal and business use and document any reasonable allocation.'))
  }

  if (expense.category === 'Meals') {
    flags.push(makeFlag(expense, 'meals-review', 'Meals documentation review', 'Document the business purpose and attendees. Deduction limitations may apply.'))
  }

  if (expense.category === 'Lodging') {
    flags.push(makeFlag(expense, 'lodging-tax-home', 'Lodging tax-home review', 'Review whether the travel-away-from-tax-home facts support the treatment.'))
  }

  if (expense.category === 'Other' && !expense.description?.trim()) {
    flags.push(makeFlag(expense, 'other-missing-description', 'Description missing', 'Add a description and business purpose for this Other expense.'))
  }

  return flags
}

export function taxReviewFlags(expenses: Expense[], games: Game[], year?: string): TaxReviewFlag[] {
  return expenses
    .filter((expense) => !year || expense.expenseDate.startsWith(year))
    .flatMap((expense) => taxReviewFlagsForExpense(expense, games))
    .sort((a, b) => a.expenseDate.localeCompare(b.expenseDate) || a.label.localeCompare(b.label))
}
