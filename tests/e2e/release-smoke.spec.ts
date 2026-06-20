import { expect, test } from '@playwright/test'

const routeSmokeChecks = [
  { path: '/', text: 'Next Assignment' },
  { path: '/games', heading: 'Games' },
  { path: '/calendar', heading: 'Calendar' },
  { path: '/expenses', heading: 'Expense Ledger' },
  { path: '/tax', heading: 'Tax Prep Workspace' },
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

test('mobile calendar smoke has synchronized controls and no page-level horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/calendar')

  await expect(page.getByRole('heading', { name: 'Calendar' }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Prev' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Agenda' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Month' })).toBeVisible()

  await expect(page.getByText('June 2026').first()).toBeVisible()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByText('July 2026').first()).toBeVisible()

  const hasPageHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  expect(hasPageHorizontalScroll).toBe(false)
})
