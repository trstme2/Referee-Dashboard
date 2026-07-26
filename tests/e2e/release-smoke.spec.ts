import { expect, test } from '@playwright/test'

const routeSmokeChecks = [
  { path: '/', text: 'Next Assignment' },
  { path: '/games', heading: 'Games' },
  { path: '/calendar', heading: 'Calendar' },
  { path: '/expenses', heading: 'Expense Ledger' },
  { path: '/tax', heading: 'Tax Record Workspace' },
  { path: '/requirements', heading: 'Requirements' },
  { path: '/settings', heading: 'Settings' },
  { path: '/privacy', heading: 'Data & Privacy' },
]

test('core local-mode routes render', async ({ page }) => {
  for (const check of routeSmokeChecks) {
    await page.goto(check.path)
    if ('heading' in check) {
      await expect(page.getByRole('heading', { name: check.heading }).first()).toBeVisible()
    } else {
      await expect(page.getByText(check.text).first()).toBeVisible()
    }
  }
})

test('games page renders a persisted 7 PM default start time', async ({ page }) => {
  await page.addInitScript(() => {
    const now = '2026-06-19T12:00:00.000Z'
    window.localStorage.setItem('referee_dashboard_db_v4_local', JSON.stringify({
      settings: {
        homeAddress: '',
        defaultTimezone: 'America/New_York',
        trackedSports: [],
        showGamePlatformChips: true,
        assigningPlatforms: [],
        leagues: [],
      },
      games: [{
        id: 'game_default_7pm',
        sport: 'Soccer',
        competitionLevel: 'High School',
        gameDate: '2026-08-04',
        startTime: '19:00',
        locationAddress: 'Test Stadium, Columbus, OH',
        status: 'Scheduled',
        paidConfirmed: false,
        platformConfirmations: {},
        createdAt: now,
        updatedAt: now,
      }],
      calendarEvents: [],
      expenses: [],
      requirementDefinitions: [],
      requirementInstances: [],
      requirementActivities: [],
      csvImports: [],
      csvImportRows: [],
    }))
  })

  await page.goto('/games')
  await expect(page.locator('body')).toContainText('Test Stadium, Columbus, OH')
  await expect(page.locator('body')).toContainText('19:00')

  await page.reload()
  await expect(page.locator('body')).toContainText('Test Stadium, Columbus, OH')
  await expect(page.locator('body')).toContainText('19:00')
})

test('requirements can add a common requirement directly to a selected season', async ({ page }) => {
  await page.addInitScript(() => {
    const now = '2026-07-26T12:00:00.000Z'
    window.localStorage.setItem('referee_dashboard_db_v4_local', JSON.stringify({
      settings: {
        homeAddress: '',
        defaultTimezone: 'America/New_York',
        trackedSports: ['Soccer'],
        showGamePlatformChips: true,
        assigningPlatforms: [],
        leagues: [],
      },
      games: [],
      calendarEvents: [],
      expenses: [],
      requirementDefinitions: [{
        id: 'club-registration',
        name: 'Registration',
        governingBody: 'Club Association',
        sport: 'Soccer',
        competitionLevel: 'Club',
        frequency: 'Season',
        requiredCount: 1,
        evidenceType: 'Document',
        createdAt: now,
        updatedAt: now,
      }],
      requirementInstances: [{
        id: 'club-registration-2026',
        definitionId: 'club-registration',
        seasonName: 'Fall',
        year: 2026,
        status: 'Not Started',
        createdAt: now,
        updatedAt: now,
      }],
      requirementActivities: [],
      csvImports: [],
      csvImportRows: [],
    }))
  })

  await page.goto('/requirements')
  const seasonCard = page.locator('.readiness-group-card').filter({ hasText: 'Club Association' })
  await seasonCard.getByRole('button', { name: 'Add requirement' }).click()
  await expect(page.getByRole('heading', { name: 'Add to Soccer 2026' })).toBeVisible()
  await page.getByRole('button', { name: 'Dues / Payment' }).click()
  await page.locator('.quick-requirement-panel input[type="date"]').fill('2026-09-01')
  await page.locator('.quick-requirement-panel').getByRole('button', { name: 'Add requirement' }).click()
  await expect(page.locator('#requirement-tracker-card')).toContainText('Dues / Payment')
  await expect(page.locator('#requirement-tracker-card')).toContainText('Due 2026-09-01')
})

test('mobile calendar smoke has synchronized controls and no page-level horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/calendar')

  await expect(page.getByRole('heading', { name: 'Calendar' }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Prev' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Agenda' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Month' })).toBeVisible()

  const monthLabel = page.locator('.calendar-month-bar .landing-eyebrow')
  await expect(monthLabel).toBeVisible()
  const initialMonth = await monthLabel.textContent()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(monthLabel).not.toHaveText(initialMonth || '')

  const hasPageHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  expect(hasPageHorizontalScroll).toBe(false)
})

test('closed mobile navigation sheet is not left in the focus order', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/calendar')

  await expect(page.locator('#mobile-nav-more-sheet')).toHaveCount(0)
  await page.getByRole('button', { name: 'More' }).click()
  await expect(page.locator('#mobile-nav-more-sheet')).toBeVisible()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.locator('#mobile-nav-more-sheet')).toHaveCount(0)
})
