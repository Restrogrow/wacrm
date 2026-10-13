import { defineConfig, devices } from '@playwright/test'

// End-to-end tests (e2e/). By default they start the production build
// with `next start` on port 3100, so run `npm run build` first.
// Point E2E_BASE_URL at a running site (e.g. staging) to skip that.
//
// Tests that need a signed-in user only run when E2E_EMAIL and
// E2E_PASSWORD are set. Use a dedicated test account, never a real
// customer's.
const PORT = 3100
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // One `next start` serves every test; more workers than this make it
  // time out on slower machines.
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /public\.spec\.ts/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next start -p ${PORT}`,
        url: `${baseURL}/robots.txt`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
