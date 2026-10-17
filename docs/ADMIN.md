# Repeat Grow — Admin handbook

**Private. For the people who run the platform.** This is the single page to read when you have forgotten how
something is set up. It lists every mailbox, service, secret *name*, cron job, email and open task.
Day-to-day monitoring and incident steps live in [OPERATIONS.md](./OPERATIONS.md); product features are in the
[README](../README.md), and a feature-by-feature guide (where it is, how to set it up, who can use it) is in
[FEATURES.md](./FEATURES.md).

> **No secret values are written here** (passwords, API keys, app passwords). They live in the hosting panel,
> `.env.local`, or the password manager. This file only says *where* each one lives.

**Billing decision (17 Oct 2026): the plan-billing payment gateway (Razorpay subscriptions) is deliberately NOT being set up now.** Paid plans are activated by hand from /admin after UPI or bank transfer. Do not treat it as a missing task; it comes back only when the owner says so.

**Project status: feature freeze (decided 17 Oct 2026).** No new features until there are customers. The only open
work is the owner to-do list below, testing the live site and fixing bugs. Parked ideas are in
[TODO.md](../TODO.md).

Last reviewed: **17 Oct 2026** (after the blog, security, catalog, reports, journeys and integrations release).

---

## ⚠️ Important to-do (do these first)

Updated 17 Oct 2026. Tick them off and delete the line once done.

**Already done (17 Oct 2026):** the green redesign is on `main`; database migrations `059` to `077` are applied to
production and checked against the live database; the blog, security fixes, catalog, reports, journeys, business
hours / SLA, notes and mentions, segments, scheduled messages, CSAT, audit log, WooCommerce, Razorpay links,
Shiprocket, Cal.com, inbound webhooks and alerts, website widget, short links and AI suggestions are all pushed.
Nothing new has been tried against the real services yet, so click through the new screens after the deploy and
report anything that looks wrong.

- [ ] **1. Set the environment variables in Hostinger hPanel, then redeploy.**
  - Demo login: `DEMO_LOGIN_EMAIL` (the demo workspace **admin**, e.g. `support.repeatgrow+anjali@gmail.com`) and
    `DEMO_LOGIN_PASSWORD` (that account's current password, which you set in Supabase; the old `.env.demo-login` file was deleted). Without them, typing
    `demo` / `demo` on `/login` says the demo isn't enabled. Normal login is unaffected.
  - `GEMINI_KEY`: without it the AI buttons (suggest reply, lead score, chatbot, assistant) show "AI is not set up".
  - App email: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER=support@repeatgrow.com`,
    `SMTP_PASS=<Workspace App Password>`, `SMTP_FROM="Repeat Grow <support@repeatgrow.com>"` (see item 5).
  - Optional: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` for Google Sheets.
- [ ] **2. Rotate secrets that were shared in a chat while building.** Reset the Supabase **database password**
  (Project Settings → Database) and rotate the **service-role key**. The database password is only used by
  `scripts/run-migration.mjs`, so resetting it does not affect the site. The service-role key is used by the site:
  after rotating it, update `SUPABASE_SERVICE_ROLE_KEY` in Hostinger **and** `wacrm/.env.local` at the same time, or
  server features fail until you do. Never paste either into a chat again; keep `SUPABASE_DB_URL` in `.env.local` only.
- [ ] **3. Captcha (Cloudflare Turnstile).** Plan: (a) create a Turnstile widget (hostnames `repeatgrow.com` and
  `localhost`, mode Managed); (b) give the **site key** (public) to the developer, who adds the widget to the signup,
  login and forgot-password forms; (c) deploy; (d) **only then** turn on Supabase → Authentication → Attack
  Protection → Turnstile and paste the **secret key**. **Do not enable it in Supabase first**: the forms don't send a
  token yet, so every signup and login would fail. Also tick "Prevent leaked passwords" if your plan has it.
- [ ] **4. Lower the Supabase Auth rate limits** (Authentication → Rate Limits: emails per hour, sign-ins per IP).
- [ ] **5. Turn on app email (SMTP) and test it.** Add the `SMTP_*` variables (item 1) and restart. Then open
  `/admin/emails` → **Send all test emails** (they land in `restrogrow@gmail.com` marked `[TEST]`; check your phone
  too). The daily summary, billing reminders, number-health alerts, demo / deletion notices and team invites all use
  it. The Supabase dashboard SMTP is a *separate* setting that only covers sign-up / reset emails.
- [ ] **6. Paste the 6 Supabase email templates.** `/admin/emails` → pick each *Sent by Supabase* email →
  **Copy template HTML** → Supabase → Authentication → Email Templates (Confirm signup, Magic link, Reset password,
  Invite user, Change email, Reauthentication). Also copy each subject line.
- [ ] **7. Email deliverability.** Confirm SPF, DKIM and DMARC for `repeatgrow.com` in Hostinger DNS (Google Workspace →
  Admin console → Gmail → Authenticate email). Without them, mail may go to spam.
- [ ] **8. Check the cron jobs exist on Hostinger** (see [Crons](#crons-background-jobs)) and that
  `AUTOMATION_CRON_SECRET` is set. Open `/admin/system`: every job (now 14, including `sla-alerts`,
  `scheduled-messages`, `journeys`, `ai-analysis`, `calcom-reminders`) should say OK.
- [x] **9. Delete the plain-text demo passwords. DONE 17 Oct 2026** (the demo admin password was reset). Original task: `wacrm/.env.demo-login` and `demo-login.txt` (one folder above the
  repo) sit in OneDrive. Move them to a password manager and delete both files. If the demo workspace is on the
  production database (it is), change those five passwords. See [Demo account](#demo-account) for the public
  `demo` / `demo` login risks.
- [ ] **10. Decide what to do with the demo workspace.** It lives on the **production** Supabase project, so it shows
  up in `/admin` counts as a real account with 5 members. Keep it for testing, or delete it before you report numbers.
- [ ] **11. Merchants' own setup** (not yours): each customer pastes webhook URLs / secrets for WooCommerce,
  Shiprocket, Cal.com, Razorpay and inbound hooks, and adds the catalog ID and a `catalog_management` token for
  catalog sync. Steps are in [FEATURES.md](./FEATURES.md).

**Later (not urgent):**

- Welcome email is built but not sent — it needs a "welcome sent" flag column so it goes out once per account.
- Sign-in by one-time code (OTP): the Supabase templates already show a code, but the app's login/signup screens
  still use links. A "type your 6-digit code" screen is a separate piece of work.
- A "shared with" list on chats (today sharing = a notification + a note on the contact) needs a new database table.
- Public view-only chat link (expiring, revocable) — deliberately not built yet because it exposes customer messages.
- The longer list of known gaps (monthly broadcast cap on the direct send API, daily caps on invite emails, suspend-
  account button, enforcing the CSP, hiding the WhatsApp token column from viewers, DNS-rebinding guard for webhooks,
  a few exposed database helper functions) is in [TODO.md](../TODO.md).

---

## 1. What this is

Repeat Grow is a WhatsApp CRM for Indian businesses (shared inbox, contacts, pipelines, broadcasts, templates,
automations, flows, journeys, AI chatbot, WhatsApp forms, orders/payments, product catalog, reports, Shopify,
WooCommerce, Calendly, Cal.com, Shiprocket and Razorpay integrations, inbound webhooks, public API).
Next.js app on Hostinger Managed Node.js, Supabase (Postgres + Auth) for data, Meta WhatsApp Cloud API for messaging.

| Item | Value |
|---|---|
| Live site | https://repeatgrow.com |
| Code | https://github.com/Restrogrow/wacrm (private) |
| Production branch | `main` — **pushing to `main` builds and deploys** |
| Redesign branch | `ui-redesign` (already merged into `main`; kept only as history) |
| Support phone / WhatsApp | +91 63775 68749 |
| Sister product | RestroGrow — https://restrogrow.com (see [RESTROGROW_CONNECT.md](./RESTROGROW_CONNECT.md)) |

---

## 2. Mailboxes and addresses (all of them)

Google Workspace owns the `repeatgrow.com` mailboxes. `support@` is the real account; the others are "send mail as"
aliases.

| Address | What it is | Used for |
|---|---|---|
| `support@repeatgrow.com` | **Main Workspace account** | Default sender; SMTP login for the app *and* for Supabase Auth; customer support; security reports; default recipient of account-deletion alerts (`ADMIN_ALERT_EMAIL`) |
| `sales@repeatgrow.com` | Alias | Demo requests from `/demo` (`DEMO_REQUEST_EMAIL`); shown on the Contact page |
| `info@repeatgrow.com` | Alias | General enquiries; public listings; shown on the Contact page |
| `teamrepeatgrow@gmail.com` | Gmail | **Billing / recovery contact** for the Workspace purchase (it is *not* the Workspace login); receives **Sentry** error alerts; used for directory/backlink listings |
| `restrogrow@gmail.com` | Gmail | **Email test inbox** — every `[TEST]` email from `/admin/emails` goes here (`EMAIL_TEST_RECIPIENT`) |
| `support.repeatgrow@gmail.com` | Gmail, real account | Your own working login on the live Supabase project. Do not seed or edit it |
| `support.repeatgrow+demo@gmail.com` | Demo owner login | Test workspace owner. `+demo` goes to the `support.repeatgrow@gmail.com` inbox |
| `support.repeatgrow+priya@…` `+rahul@…` `+anjali@…` `+kabir@…` | Demo teammates | agent / agent / admin / viewer in the demo workspace |
| WhatsApp +91 63775 68749 | Phone | Support line used in email footers and invite messages |

> Gmail ignores everything after `+`, so all `support.repeatgrow+…@gmail.com` addresses are delivered to the same
> inbox, but Supabase treats each as a separate user.

---

## 3. Services and where to log in

| Service | Used for | Notes |
|---|---|---|
| **Hostinger** (Managed Node.js) | Hosting, env vars (hPanel), cron scheduler, DNS | Deploys on push to `main`. `next.config.mjs` is plain JS on purpose (older glibc) |
| **Supabase** (project ref `hfufrwjhajtpfzjbqocv`) | Postgres, Auth, storage | Migrations run by hand in the SQL Editor. Auth emails need Supabase's own SMTP setting |
| **Google Workspace** | `repeatgrow.com` mailboxes, SMTP | Sending uses an **App Password** for `support@` (myaccount.google.com/apppasswords) |
| **GitHub** `Restrogrow/wacrm` | Code + CI (Actions) | Private repo |
| **Meta for Developers / WhatsApp Manager** | WhatsApp Cloud API, Embedded Signup, WhatsApp Pay, Calling | App secret → `META_APP_SECRET` |
| **Google Gemini** | AI chatbot, AI flows, AI templates, **help assistant** | Key in `GEMINI_KEY` |
| **Sentry** (project `javascript-nextjs`) | Error tracking | Alerts → `teamrepeatgrow@gmail.com` |
| **UptimeRobot** | Uptime monitor on `/api/health` every 5 min | Down/up emails |
| **Google Analytics 4** | Marketing-site analytics only (`G-L56ZRQGJ67`) | Never loaded inside the signed-in app |
| **Shopify Dev Dashboard** | Shopify app (one-click connect) | Config in `shopify/shopify.app.toml` |
| **Calendly** | Booking reminders | Needs a paid Calendly plan on the customer's side |

---

## 4. Email system

### 4.1 Two senders (important to understand)

1. **The app** sends: daily summary, billing reminders, number-health alerts, demo-request and deletion notices, team
   invites. Uses `SMTP_*` environment variables (code: `src/lib/email/mailer.ts`).
2. **Supabase** sends: sign-up confirmation, magic link / login code, password reset, invite, email change,
   reauthentication. Uses the SMTP settings **inside the Supabase dashboard** (Authentication → Emails → SMTP:
   `smtp.gmail.com`, port `465`, user `support@repeatgrow.com`, App Password). Set up from 13 Oct 2026; re-check it if sign-up emails ever stop.

Both use the same Workspace mailbox. If either stops sending, the first suspect is an expired/revoked App Password.

### 4.2 Every email (21)

Preview any of them, and send yourself a sample, at **`/admin/emails`** (platform admins only). Catalogue source:
`src/lib/email/catalog.ts`; layouts: `src/lib/email/branded.ts`, `src/lib/email/content.ts`.

| Email | Sent by | When | Goes to | Live? |
|---|---|---|---|---|
| Confirm signup (link + 6-digit code) | Supabase | New email/password sign-up | The new user | ✅ paste template |
| Magic link / login code | Supabase | Email-code sign-in | The user | ✅ only if enabled |
| Reset password | Supabase | "Forgot password" | The user | ✅ paste template |
| Invite user | Supabase | Invite sent from the Supabase dashboard | The invitee | ➖ rarely used |
| Change email | Supabase | User changes email | The user | ✅ |
| Reauthentication code | Supabase | Sensitive change needs a code | The user | ➖ needs Supabase setting |
| Team invite | App | Admin types an email in *Invite member* | The invitee | ✅ |
| Welcome | App | After sign-up | The new owner | ❌ built, not wired (needs DB flag) |
| Trial ends in 2 days | App · cron | 2 days before trial end | Account owner | ✅ |
| Last day of trial | App · cron | Last trial day | Account owner | ✅ |
| Trial ended | App · cron | Day trial ends | Account owner | ✅ |
| Plan renews in 3 days | App · cron | 3 days before plan end | Account owner | ✅ |
| Plan expired | App · cron | Day plan ends | Account owner | ✅ |
| Daily summary | App · cron | Daily, at each account's chosen hour | Addresses set in Settings → Daily summary | ✅ |
| Number health — heads up | App · cron | Quality/limit drops | Account owner | ✅ |
| Number health — action needed | App · cron | Number limited/blocked | Account owner | ✅ |
| New demo request | App | Visitor submits `/demo` | `sales@repeatgrow.com` | ✅ |
| Account deletion request | App | User asks to delete account | `support@repeatgrow.com` | ✅ |
| Account deleted (approved) | App | You approve the request | The user | ✅ |
| Deletion request declined | App | You decline the request | The user | ✅ |
| SMTP test | App | Test button | `restrogrow@gmail.com` | ✅ |

Billing emails are sent once per stage per account, only in Indian daytime. Marked "cron" = fired by the main cron.

### 4.3 Environment variables that control email

| Variable | Meaning | Default |
|---|---|---|
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Outgoing mail (all required except `SMTP_FROM`) | none — email is disabled without them |
| `ADMIN_ALERT_EMAIL` | Who gets account-deletion alerts (comma-separated) | `support@repeatgrow.com` |
| `DEMO_REQUEST_EMAIL` | Who gets demo requests (comma-separated) | `sales@repeatgrow.com` |
| `EMAIL_TEST_RECIPIENT` | Where `/admin/emails` test mails go | `restrogrow@gmail.com` |

When SMTP is not configured, features that email say so (or skip quietly) instead of failing; `/admin/emails` still
previews everything and shows an amber "not configured" notice.

---

## 5. Crons (background jobs)

Hostinger calls these URLs with the header `x-cron-secret: <AUTOMATION_CRON_SECRET>`.

| Endpoint | How often | What it does |
|---|---|---|
| `GET /api/automations/cron` | **Every minute** | Delayed automation steps · scheduled broadcasts · **scheduled chat messages** · Shopify abandoned-cart messages · Calendly and **Cal.com** 24 h / 1 h reminders · **daily summary emails** · WhatsApp **number-health** check (daily per account) · **trial/renewal reminder emails** · **reply-time (SLA) alerts** · **AI lead scoring** · **Journeys** (date, drip and win-back messages) |
| `GET /api/flows/cron` | Every 5 minutes is enough | Times out abandoned flow runs so customers can re-trigger flows |
| `GET /api/health` | Every 5 min (UptimeRobot) | Database + job heartbeats; no secret needed |

Each job records a heartbeat; `/admin/system` shows OK / Failing / Not running for each. If "Not running" appears,
the scheduler stopped calling the URL or the secret is wrong. Details: [OPERATIONS.md](./OPERATIONS.md).

---

## 6. Admin pages (platform admins only)

Access = a row in the `platform_admins` table (Supabase table editor, column `user_id` = the user's id from
Authentication → Users). Everyone else gets a 404. A workspace admin (even the demo admin) is **not** a platform admin.

| Page | Purpose |
|---|---|
| `/admin` | Sign-ups, activity, funnel, accounts table, demo requests, deletion requests |
| `/admin/accounts/[id]` | One account: members, plan editor, WhatsApp diagnostics |
| `/admin/system` | Database, required env vars, every job, last 50 failed webhooks |
| `/admin/emails` | **Preview every email and send test copies** |
| `/admin/blog` | **Blog manager**: write, schedule and publish posts (markdown editor, SEO checklist, image upload). Run migration `060` first |
| `/admin/security` | **Security & fraud report**: audit findings with status, owner to-dos, and a playbook for fake trials and scams. Edit the content in `src/lib/security-report.ts` |

---

## 7. Environment variables

The full table (what each one does, required vs optional) is in the README →
[Environment variables](../README.md#environment-variables). `NEXT_PUBLIC_*` values are baked in at build time — redeploy
after changing them. Where they live: **Hostinger hPanel** for production, **`wacrm/.env.local`** locally
(git-ignored). Present locally today: Supabase URL/keys, `ENCRYPTION_KEY`, `META_APP_SECRET`,
`AUTOMATION_CRON_SECRET`, `DEMO_LOGIN_EMAIL` / `DEMO_LOGIN_PASSWORD`. **Not** present locally: `SMTP_*`, `GEMINI_KEY`
(so the help assistant, AI suggestions and email sending cannot be tried on this machine until you add them).
`SUPABASE_DB_URL` is a local-only variable for `scripts/run-migration.mjs`; never put it in Hostinger.

---

## 8. Demo account

> **Public demo login — quick reference**
>
> - **Visitors:** on `/login` type `demo` / `demo`. They become **Anjali Rao**, admin of the demo workspace (sample data only; not a platform admin).
> - **Account:** `support.repeatgrow+anjali@gmail.com` (the `+anjali` is part of the address; it lands in the `support.repeatgrow@gmail.com` inbox). Type it exactly, no quotes.
> - **Where the password lives:** only in Hostinger env vars `DEMO_LOGIN_EMAIL` and `DEMO_LOGIN_PASSWORD` (and `wacrm/.env.local` locally). It was reset on 17 Oct 2026 when the old password file was deleted. Never put it in the repo or docs.
> - **Turn off:** delete the two env vars and redeploy, or change the user's password in Supabase.
> - **Change password:** Supabase → Authentication → Users → the demo admin → new password; update `DEMO_LOGIN_PASSWORD` on Hostinger; redeploy.
> - **Risks:** anyone can use it, so they can edit demo data, invite teammates (invite emails go from your domain) and create API keys *inside the demo workspace only*. Rate limited to 20 attempts/hour/IP. Keep real customer data out of it.

A fully populated test workspace on the **production** Supabase project, for previewing the UI.

- **Owner:** `support.repeatgrow+demo@gmail.com`. **Passwords** are no longer stored in plain-text files (deleted 17 Oct 2026). Keep them in a password
  manager. Never commit them.
- **Teammates:** Priya Sharma (agent), Rahul Verma (agent), Anjali Rao (admin), Kabir Khan (viewer).
- **Data:** 12 contacts, 7 chats with messages, 9 deals, templates, broadcasts, automations, forms, orders, saved
  replies, AI chatbot knowledge, notifications. Shopify, Calendly and WhatsApp are **not** connected; Flows are not seeded.
- **Plan:** Pro for a year.
- **Public `demo` / `demo` login:** typing `demo` as both email and password on `/login` signs anyone into the demo
  workspace as the account named by the server variables `DEMO_LOGIN_EMAIL` / `DEMO_LOGIN_PASSWORD` (today: the demo
  **admin**, Anjali Rao). The route is `POST /api/demo-login`, rate limited to 20 per hour per IP, and does nothing
  (returns 404) when the variables are unset. **Risks:** anyone on the internet can use it, so the visitor can change
  demo data, invite teammates (invite emails go out from your domain, capped by plan) and create API keys inside the
  demo workspace. It is not a platform admin and cannot see other accounts (row-level security). Keep real customer
  data out of the demo workspace; change the demo admin's password to switch the public login off.
- **Re-create:** delete the demo user in Supabase, then `node scripts/seed-demo.mjs`. It refuses to touch a demo user
  older than an hour, and only writes inside the demo account.

---

## 9. Deploying and branches

1. Work on a branch, push, open a pull request. CI (GitHub Actions) runs lint, type-check, unit tests, a production build and the end-to-end tests.
2. **Merging to `main` deploys to production** on Hostinger.
3. Run any new SQL in `supabase/migrations/` **before** the code that needs it goes live: in the Supabase SQL Editor, or
   from a developer machine with `node scripts/run-migration.mjs <files>` (needs `SUPABASE_DB_URL` in `.env.local`;
   see [OPERATIONS.md](./OPERATIONS.md#running-migrations)). Always check afterwards that the new tables exist.
4. After changing a `NEXT_PUBLIC_*` variable, redeploy.

Checks before merging: `npx tsc --noEmit`, `npx eslint src`, `npx vitest run` (all passing at last review: 1,350 tests).

---

## 10. Where things are in the code

| Area | Path |
|---|---|
| Sidebar, top bar, page banners, Ctrl+K | `src/components/layout/` |
| Email layouts, catalogue, sender | `src/lib/email/` · admin page `src/app/admin/emails/` |
| Help assistant (floating bubble) | `src/components/assistant/` · `src/lib/ai/app-assistant.ts` · `src/app/api/assistant/` |
| Assign / share / export a chat | `src/components/inbox/share-chat-button.tsx` · `src/app/api/inbox/conversations/[id]/share/` |
| Sign-in showcase panel | `src/components/auth/auth-showcase.tsx` |
| Demo seed | `scripts/seed-demo.mjs` |
| Migration runner | `scripts/run-migration.mjs` |
| Blog admin, security report | `src/app/admin/blog/` · `src/app/admin/security/` · `src/lib/security-report.ts` |
| Theme (mint green default) | `src/app/globals.css`, `src/lib/themes.ts` |

---

## 11. Change log (admin-relevant)

- **17 Oct 2026 (later)** — Blog manager (`/admin/blog`), security audit and fixes (`/admin/security`), sign-up abuse
  guard, public demo login, ad attribution, catalog (product library, Meta sync both ways, store sync, picker, stock),
  Reports, business hours / SLA, notes and mentions, bulk inbox actions, segments and merge, scheduled messages, CSAT,
  activity log, WooCommerce, Razorpay payment links, Shiprocket, Cal.com, inbound webhooks and alerts, website
  widget, short links, AI suggestions and lead scoring, Journeys. Migrations 059 to 077. Two-factor login was built and
  then removed at the owner's request.
- **13 Oct 2026** — Supabase Auth custom SMTP set up with `support@repeatgrow.com` (Google Workspace App Password).
- **17 Oct 2026** — Green redesign, new sidebar, sections moved out of Settings (AI chatbot, forms, orders, Shopify,
  Calendly, connected apps, templates, QR link, daily summary), chat assign/share/export, help assistant,
  unified branded email system, `/admin/emails`, team-invite email, this handbook. Demo workspace created.
  Old `/settings?tab=…` links redirect to the new pages.
