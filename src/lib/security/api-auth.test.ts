// ============================================================
// Every API route must check who is calling.
//
// Scans src/app/api/**/route.ts: each route must use one of the auth
// guards below (signed-in member, platform admin, API key, cron secret,
// webhook signature), or be on the PUBLIC_ROUTES allowlist with a
// reason. Adding an unguarded route fails CI.
// ============================================================

import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const API_DIR = path.join(process.cwd(), 'src', 'app', 'api')

const GUARDS = [
  /getCurrentAccount\(/, // signed-in member
  /requireRole\(/, // member with a minimum role
  /requireCallingAgent\(/, // agent+ (calls)
  /requirePlatformAdmin\(/, // /admin
  /requireApiKey\(/, // public REST API
  /auth\.getUser\(\)/, // signed-in user (older routes)
  /x-cron-secret/, // cron endpoints
  /verifyMetaWebhookSignature\(/, // WhatsApp webhook
  /verifyShopifyWebhook\(|verifyShopifyHmac|verifyOAuthState|hmac/i, // Shopify webhooks / OAuth
  /verifyCalendlySignature\(/, // Calendly webhook
]

/** Routes that are public on purpose. Keep the reason honest. */
const PUBLIC_ROUTES: Record<string, string> = {
  'health/route.ts': 'uptime monitors; returns states only, rate limited per IP',
  'v1/openapi.json/route.ts': 'public API description',
  'invitations/[token]/peek/route.ts': 'invite preview by unguessable token, rate limited per IP',
  'invitations/[token]/signup/route.ts': 'sign up from an invite token, rate limited per IP',
  'v1/connect/token/route.ts': 'OAuth-style code exchange with client secret, rate limited',
}

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) return routeFiles(full)
    return e.name === 'route.ts' ? [full] : []
  })
}

describe('API route authentication', () => {
  const files = routeFiles(API_DIR)

  it('finds the routes', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('every route checks who is calling (or is deliberately public)', () => {
    const unguarded = files
      .map((f) => path.relative(API_DIR, f).split(path.sep).join('/'))
      .filter((rel) => !PUBLIC_ROUTES[rel])
      .filter((rel) => {
        const src = fs.readFileSync(path.join(API_DIR, rel), 'utf8')
        return !GUARDS.some((g) => g.test(src))
      })
    expect(unguarded).toEqual([])
  })

  it('public routes on the allowlist still exist', () => {
    for (const rel of Object.keys(PUBLIC_ROUTES)) {
      expect(fs.existsSync(path.join(API_DIR, rel)), rel).toBe(true)
    }
  })

  it('public routes that hit the database are rate limited', () => {
    for (const rel of ['health/route.ts', 'invitations/[token]/peek/route.ts', 'invitations/[token]/signup/route.ts']) {
      const src = fs.readFileSync(path.join(API_DIR, rel), 'utf8')
      expect(src, rel).toMatch(/checkRateLimit\(/)
    }
  })

  it('webhooks block IPs that keep sending bad signatures', () => {
    for (const rel of [
      'whatsapp/webhook/route.ts',
      'integrations/shopify/webhooks/route.ts',
      'integrations/shopify/webhooks/[token]/route.ts',
      'integrations/calendly/webhooks/[token]/route.ts',
    ]) {
      const src = fs.readFileSync(path.join(API_DIR, rel), 'utf8')
      expect(src, rel).toMatch(/webhookBlocked\(/)
      expect(src, rel).toMatch(/recordWebhookRejection\(/)
    }
  })
})
