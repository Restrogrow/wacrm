import { expect, test } from '@playwright/test'

// Auth guard, sign-in form and the health endpoint. No real account
// needed.

test('signed-out visitors are sent from the app to login', async ({ page }) => {
  for (const path of ['/inbox', '/contacts', '/broadcasts', '/settings']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/login/)
  }
})

test('login form renders and requires an email', async ({ page }) => {
  await page.goto('/login')
  const email = page.locator('#email')
  await expect(email).toBeVisible()
  await expect(page.locator('#password')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  // Browser validation keeps the user on the page with an invalid field.
  await expect(page).toHaveURL(/\/login/)
  expect(await email.evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false)
})

test('signup page renders', async ({ page }) => {
  const response = await page.goto('/signup')
  expect(response?.status()).toBe(200)
  await expect(page.locator('input[type="email"]').first()).toBeVisible()
})

test('admin is not reachable signed out', async ({ page }) => {
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/login/)
})

test('health endpoint reports status without leaking details', async ({ request }) => {
  const res = await request.get('/api/health')
  expect([200, 503]).toContain(res.status())
  expect(res.headers()['cache-control']).toContain('no-store')
  const body = await res.json()
  expect(['ok', 'degraded', 'down']).toContain(body.status)
  expect(Object.keys(body.checks).sort()).toEqual(
    ['config', 'database', 'database_latency_ms', 'jobs', 'webhooks'].sort(),
  )
  // Only states: no error messages or env var names.
  expect(JSON.stringify(body)).not.toMatch(/SERVICE_ROLE|ENCRYPTION_KEY|Missing/)
})
