# Operations runbook (admin only)

How Repeat Grow is run day to day: where to look, what alerts you, and
what to do when something breaks. Customer-facing help lives in the
in-app Help Center (`/docs`); this file is for the people running the
platform.

## Quick links

| What | Where |
|---|---|
| Admin handbook (mailboxes, services, to-dos) | [ADMIN.md](./ADMIN.md) |
| Feature guide (where, setup, roles, limits) | [FEATURES.md](./FEATURES.md) |
| Blog manager · security report | https://repeatgrow.com/admin/blog · https://repeatgrow.com/admin/security |
| Admin dashboard (sign-ups, activity, funnel, accounts) | https://repeatgrow.com/admin |
| Email previews + test sends | https://repeatgrow.com/admin/emails |
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
  Calendly / WooCommerce / Shiprocket / Cal.com webhooks with the account
  and error. Kept for 30 days. (The allowed sources are the
  `webhook_failures_source_check` constraint; see
  [Running migrations](#running-migrations).)

### Jobs tracked

| Job | Runs inside | Considered "not running" after |
|---|---|---|
| Automations cron (`automations-cron`) | `GET /api/automations/cron` | 10 min |
| Delayed automation steps (`automation-steps`) | automations cron | 10 min |
| Scheduled broadcasts (`scheduled-broadcasts`) | automations cron | 10 min |
| Scheduled chat messages (`scheduled-messages`) | automations cron | 10 min |
| Shopify abandoned carts (`shopify-reminders`) | automations cron | 10 min |
| Calendly reminders (`calendly-reminders`) | automations cron | 10 min |
| Cal.com reminders (`calcom-reminders`) | automations cron | 10 min |
| Daily summary emails (`daily-summaries`) | automations cron | 10 min |
| WhatsApp number health (`number-health`) | automations cron (each account daily) | 10 min |
| Trial & renewal reminder emails (`billing-reminders`) | automations cron (daytime IST) | 10 min |
| Reply-time (SLA) alerts (`sla-alerts`) | automations cron | 10 min |
| AI lead scoring (`ai-analysis`) | automations cron (a few chats per run) | 10 min |
| Journeys (`journeys`) | automations cron | 10 min |
| Flows cron (`flows-cron`) | `GET /api/flows/cron` | 30 min |

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

## Data requests (DPDP Act / GDPR)

Customers handle these themselves in **Settings → Your data**:

- **Download my data** — JSON export. Owners/admins get the whole
  business; teammates get their own data.
- **Delete my account** — files a **request**; nothing is deleted until
  a platform admin approves it. You get an email (to `ADMIN_ALERT_EMAIL`,
  default support@repeatgrow.com, comma-separated for several) and the
  request appears at the top of `/admin`.

### Approving or rejecting a deletion

1. Open `/admin` → **Account deletion requests**. Each shows the email,
   owner or teammate, the business, when, and their reason.
2. Check the account (link) — e.g. unpaid dues, or a teammate asking
   to delete someone else's business.
3. **Approve** (type DELETE): an owner's business and all its data are
   deleted, or a teammate's login is deleted and their rows go to the
   owner. Refused if an owner still has teammates.
4. **Reject**: the account is kept; your note is emailed to them.
5. The user can cancel while it's pending. Respond within a reasonable
   time — the DPDP Act expects deletion requests to be honoured.

If someone emails a request instead, point them to Settings → Your data.
If they can't sign in, verify the request comes from the account's email
address before acting on it.

Deletions are logged anonymously:

```sql
select created_at, was_owner, deleted_account, reassigned_rows
from account_deletions order by created_at desc limit 50;
```

Deleted data disappears from the live database immediately; Supabase
backups expire on their own schedule. Shopify OAuth stores should also
uninstall the app from their Shopify admin (the webhook receiver ignores
stores that no longer exist).

## WhatsApp number health

- Stored per account in `whatsapp_number_health`, refreshed daily (10
  accounts per cron run) or by **Check now** in Settings → WhatsApp.
- `/admin` accounts table: quality dot + messaging limit under each
  WhatsApp status. Red / yellow or "limited" / "blocked" means the
  customer needs help: fewer broadcasts, opted-in contacts only,
  relevant templates, honour STOP.
- Owners are emailed once per change (`last_alert_key`); a warning bar
  shows in their app until it recovers.
- `check_error` holds why the last check failed (e.g. an expired token).

## WhatsApp calls

- Calls are in `whatsapp_calls` (status ringing → answering → connected
  → ended / missed / rejected / failed). Recent calls:
  `select created_at, direction, status, duration_seconds, error from whatsapp_calls order by created_at desc limit 20;`
- **Calls never ring:** is the `calls` webhook field subscribed in the
  Meta App Dashboard, and calling turned on (Settings → WhatsApp)? Meta
  needs a 2,000+ messaging limit.
- **"WhatsApp hasn't allowed calling on this number yet"** (amber note
  in Settings → WhatsApp calling): Meta refused to enable calling. Check
  WhatsApp Manager → Phone numbers → Messaging limit (needs 2K+), that
  the number isn't also on the WhatsApp Business app, and the `calls`
  webhook subscription. Meta's test number works for testing meanwhile.
- **Rings but no audio:** usually the agent's network blocks WebRTC, or
  the microphone was blocked in the browser. Try another network/browser.
- **"Hasn't allowed calls":** the customer must tap Allow on a call
  permission request (or call you first).
- Failed accepts are saved in `whatsapp_calls.error`.

## Running migrations

Migrations live in `supabase/migrations/` (currently `001` to `077`) and
must be applied **in order**, before the code that needs them is deployed.
Two ways:

1. **Supabase SQL Editor:** open the file, copy it all, paste, Run. Copy
   from the file itself (not from a chat), because a mangled paste
   produces confusing syntax errors.
2. **From a developer machine:** put the Postgres connection string
   (Supabase → Project Settings → Database → Connection string, with the
   database password filled in) in `wacrm/.env.local` as `SUPABASE_DB_URL`
   (a local-only variable; never set it on the server), then:

   ```bash
   node scripts/run-migration.mjs 076_products_catalog.sql 077_catalog_collections_stock.sql
   ```

   Each file runs in its **own transaction** (a failing file changes
   nothing) and the script **stops at the first failure**, so later files
   are not applied. Only plain `NNN_name.sql` files from the migrations
   folder are accepted.

Notes:

- **Always verify afterwards** that the new tables / functions exist (for
  example, select `count(*)` from each new table, or compare table names
  from `information_schema.tables` with the `CREATE TABLE` statements in
  the migration files). Do not trust a "success" message alone: on
  17 Oct 2026 migrations `063` and `064` had silently not been applied
  and were only noticed later.
- Almost every migration is idempotent (`IF NOT EXISTS`, `OR REPLACE`,
  `DROP POLICY IF EXISTS`), so re-running one is safe.
- **`063_woocommerce.sql` resets the `webhook_failures.source` check
  constraint to four sources** (`whatsapp`, `shopify`, `calendly`,
  `woocommerce`). **`072_shiprocket_calcom.sql` widens it to six**
  (adding `shiprocket`, `calcom`). If you re-run `063` on a database that
  already has `072`, **re-run `072` straight after**, or failed Shiprocket
  and Cal.com webhooks can no longer be logged.
- `077_catalog_collections_stock.sql` needs `063` (it adds columns to
  `woocommerce_stores`) and should come after `076` (products).
  `068_segments_merge.sql` is needed by segment-based Journeys sequences.
- `061_security_hardening.sql` adds a trigger on `auth.users` that blocks
  disposable emails and repeat mailboxes. After applying it, test a sign-up
  with a `@mailinator.com` address (it must be refused) and a normal one.
- **Rollback:** there are no down-migrations. To undo a migration, write a
  new SQL file that drops what it created (for example
  `DROP TABLE IF EXISTS … CASCADE`, `DROP FUNCTION IF EXISTS …`,
  `DROP TRIGGER IF EXISTS block_abusive_signups_trigger ON auth.users`)
  and test it on a copy first. Dropping tables deletes their data;
  take a Supabase backup (or a table export) before you do. Often the
  simpler fix is to deploy the previous code: new features fail safe when
  their tables are missing, but removing tables the code expects will make
  those screens show errors.

## Releases

1. Push to `main`. GitHub Actions runs lint, typecheck, unit tests, a
   production build and the Playwright end-to-end tests.
2. Hostinger deploys `main` automatically.
3. If the change adds a migration (see `CHANGELOG.md`), apply it first
   (see [Running migrations](#running-migrations)). Every new feature
   fails safe until its migration is run, but run it **before** the code
   goes live.
4. Check `/api/health` and `/admin/system` after the deploy. `/api/health`
   returns `version.commit`; when it matches the merge commit, the deploy is
   live. The same version, commit and build time show at the bottom of the
   app's sidebar.

Pushing changes to `.github/workflows/` needs the GitHub `workflow`
permission. If a push is rejected for that reason, run
`gh auth refresh -h github.com -s workflow` and `gh auth setup-git`
once.

## Security checks

- Every push runs the isolation tests (RLS on every table, every policy
  account-scoped, every API route authenticated).
- After running a new migration on production, run
  `npm run security:check` — it reads every table with the public anon
  key and must report "No table is readable without signing in".
- Login / sign-up / password-reset rate limits and CAPTCHA live in the
  Supabase dashboard (Authentication → Rate Limits / Attack Protection).
- **Sign-up abuse:** disposable emails and a second trial for the same
  real mailbox are blocked in the database (migration 061; table
  `blocked_email_domains` is editable, `signup_email_history` records
  used mailboxes). Rate limits use the proxy-set client IP; if everyone
  seems to be rate limited together after a deploy, check which header
  your proxy sets (`getClientIp` in `src/lib/rate-limit.ts`).
- **Captcha is not on yet.** Do not enable it in Supabase before the
  login, signup and forgot-password forms send a Turnstile token (see
  ADMIN.md), or every sign-in fails.
- **Audit log:** owners and admins see account actions in Settings →
  Activity log; the table is append-only (`audit_log`).
- A webhook sender that keeps failing signature checks gets 429s for 10
  minutes; look for `[webhook] rejected request with invalid signature`
  in the logs.

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
