import { expect, test } from '@playwright/test'

// Signed-in smoke tests. Read-only: they open pages but never send
// messages or change data. Run with a dedicated test account:
//
//   E2E_EMAIL=... E2E_PASSWORD=... npm run test:e2e -- signed-in
//
// Skipped when those variables are not set (e.g. in CI).

const email = process.env.E2E_EMAIL
const password = process.env.E2E_PASSWORD

test.skip(!email || !password, 'set E2E_EMAIL and E2E_PASSWORD to run signed-in tests')

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await page.locator('#email').fill(email!)
  await page.locator('#password').fill(password!)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 })
})

test('inbox loads', async ({ page }) => {
  await page.goto('/inbox')
  await expect(page.getByPlaceholder(/search/i).first()).toBeVisible({ timeout: 20_000 })
})

test('contacts list loads', async ({ page }) => {
  await page.goto('/contacts')
  await expect(page.getByRole('heading', { name: 'Contacts' })).toBeVisible({ timeout: 20_000 })
})

test('broadcasts list loads', async ({ page }) => {
  await page.goto('/broadcasts')
  await expect(page.getByRole('heading', { name: 'Broadcasts' })).toBeVisible({ timeout: 20_000 })
})

test('settings loads', async ({ page }) => {
  await page.goto('/settings')
  await expect(page).toHaveURL(/\/settings/)
})

test('your data page offers download and delete (not clicked)', async ({ page }) => {
  await page.goto('/settings?tab=your-data')
  await expect(page.getByRole('button', { name: 'Download my data' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'Delete my account' })).toBeVisible()
})
