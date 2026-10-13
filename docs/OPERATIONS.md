# Operations runbook (admin only)

How Repeat Grow is run day to day: where to look, what alerts you, and
what to do when something breaks. Customer-facing help lives in the
in-app Help Center (`/docs`); this file is for the people running the
platform.

## Quick links

| What | Where |
|---|---|
| Admin dashboard (sign-ups, activity, funnel, accounts) | https://repeatgrow.com/admin |
| System health (jobs, webhooks, config) | https://repeatgrow.com/admin/system |
| Public health check (for monitors) | https://repeatgrow.com/api/health |
| Uptime monitor | https://dashboard.uptimerobot.com |
| Error tracking | https://sentry.io (project `javascript-nextjs`) |
| Database | Supabase dashboard → SQL Editor / Table editor |
| Hosting, env vars, cron | Hostinger panel |
| Code and CI | https://github.com/Restrogrow/wacrm (Actions tab) |

Admin pages are only visible to users listed in the `platform_admins`
table.

## What alerts you

| Alert | Sent by | When | Set up |
|---|---|---|---|
| "Repeat Grow health is DOWN" email | UptimeRobot | `/api/health` returns 503 (database unreachable, or the cron jobs stopped / keep failing), or the site doesn't respond | HTTP(s) monitor on `/api/health`, every 5 min |
| "… is UP" email | UptimeRobot | It recovers | same monitor |
| New error email | Sentry | A new kind of error, a fixed error coming back, or an error spiking | Alerts → issue alert to `teamrepeatgrow@gmail.com` |

Optional second UptimeRobot monitor: a **Keyword** monitor on
`/api/health` that alerts when `"status":"ok"` is missing — this also
catches "degraded" (one job or webhook failing).

## `/api/health`

Public, returns states only (no error text, no env var names):

```json
{ "status": "ok", "checks": { "database": "ok", "database_latency_ms": 42,
  "config": "ok", "jobs": "ok", "webhooks": "ok" } }
```

| `status` | HTTP | Meaning |
|---|---|---|
| `ok` | 200 | Everything working |
| `degraded` | 200 | A task inside the cron is failing, a required env var is missing, or webhooks failed in the last hour |
| `down` | 503 | Database unreachable, or a cron endpoint hasn't succeeded recently / keeps failing |

Code: `src/app/api/health/route.ts`, `src/lib/ops/health.ts`.

## `/admin/system`

- **Database** — reachable, and how fast.
- **Configuration** — names of any missing required env vars.
- **Background jobs** — each job's last success, duration and last
  error. States: OK, Failing (last run errored), Not running (no success
  within its window), No runs yet.
- **Recent webhook failures** — last 50 failed WhatsApp / Shopify /
  Calendly webhooks with the account and error. Kept for 30 days.

### Jobs tracked

| Job | Runs inside | Considered "not running" after |
|---|---|---|
| Automations cron | `GET /api/automations/cron` | 10 min |
| Delayed automation steps | automations cron | 10 min |
| Scheduled broadcasts | automations cron | 10 min |
| Shopify abandoned carts | automations cron | 10 min |
| Calendly reminders | automations cron | 10 min |
| Daily summary emails | automations cron | 10 min |
| Flows cron | `GET /api/flows/cron` | 30 min |

Heartbeats are stored in `system_heartbeats`; failures in
`webhook_failures` (migration 045, service-role only). Code:
`src/lib/ops/monitoring.ts`.

## When something breaks

1. **Open `/admin/system`.** It tells you which part is failing and the
   error message.
2. **Database failing** → Supabase dashboard: project paused, over
   limits, or an outage (status.supabase.com).
3. **Automations / flows cron "Not running"** → Hostinger cron jobs: both
   must call the URLs every minute with header
   `x-cron-secret: $AUTOMATION_CRON_SECRET`. Check the secret matches the
   env var.
4. **One job "Failing"** → read its error. Common causes: SMTP settings
   (daily summary), an expired WhatsApp token (broadcasts, reminders), a
   missing migration.
5. **Webhook failures** → the error and account are listed; open the
   account (`/admin/accounts/<id>`) for its WhatsApp diagnostics. Shopify
   and Calendly retry failed webhooks themselves.
6. **Sentry** → the full stack trace. Errors are tagged `job:<name>` or
   `webhook:<source>`.
7. After a fix, `/admin/system` turns green on the next cron run (within
   a minute).

## Releases

1. Push to `main`. GitHub Actions runs lint, typecheck, unit tests, a
   production build and the Playwright end-to-end tests.
2. Hostinger deploys `main` automatically.
3. If the change adds a migration (see `CHANGELOG.md`), run the SQL file
   from `supabase/migrations/` in the Supabase SQL Editor. Every new
   feature fails safe until its migration is run.
4. Check `/api/health` and `/admin/system` after the deploy.

Pushing changes to `.github/workflows/` needs the GitHub `workflow`
permission. If a push is rejected for that reason, run
`gh auth refresh -h github.com -s workflow` and `gh auth setup-git`
once.

## Testing

| Command | What |
|---|---|
| `npm test` | Unit tests (Vitest) |
| `npm run build && npm run test:e2e` | End-to-end tests (Playwright) on desktop and mobile |
| `E2E_EMAIL=… E2E_PASSWORD=… npm run test:e2e -- signed-in` | Read-only signed-in smoke tests — use a dedicated test account |
| `E2E_BASE_URL=https://… npm run test:e2e` | Run against a deployed site instead of a local build |

First time only: `npx playwright install chromium`.

## Performance notes

- Lists are paginated: inbox 50 conversations, threads 50 messages,
  broadcasts 25, contacts 25 per page.
- Migration 045 adds the indexes those pages use, plus trigram indexes
  for contact search.
- Sentry ships errors only (no performance tracing, no Session Replay)
  to keep the browser bundle small.
- Lighthouse on the production build (Oct 2026): performance 84–91,
  SEO 100, best practices 100. The live site's CDN blocks headless
  Lighthouse, so test a local `npm run build && npm start`.
