# Repeat Grow

> WhatsApp CRM for Indian businesses, built on the official WhatsApp
> Business API (Meta Cloud API). A shared team inbox, contacts,
> pipelines, broadcasts, no-code automations and flows, an AI chatbot,
> Shopify and Calendly integrations, plans with a free trial, and a
> public REST API.

**Website:** [repeatgrow.com](https://repeatgrow.com) ·
**App:** [repeatgrow.com/login](https://repeatgrow.com/login) ·
**Help Center:** [repeatgrow.com/docs](https://repeatgrow.com/docs) ·
**API reference:** [repeatgrow.com/docs/api](https://repeatgrow.com/docs/api) ·
**Support:** [support@repeatgrow.com](mailto:support@repeatgrow.com) ·
**LinkedIn:** [repeat-grow](https://www.linkedin.com/company/repeat-grow) ·
**Reviews:** [Trustpilot](https://www.trustpilot.com/review/repeatgrow.com)

[![License: MIT](https://img.shields.io/badge/License-MIT-violet.svg)](./LICENSE)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)](https://nextjs.org)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Auth-3ecf8e?logo=supabase)](https://supabase.com)
[![OpenAPI 3.1](https://img.shields.io/badge/OpenAPI-3.1-6ba539?logo=openapiinitiative)](https://repeatgrow.com/api/v1/openapi.json)

---

## Contents

- [Features](#features)
- [Plans, trial and limits](#plans-trial-and-limits)
- [Integrations](#integrations)
- [Public API and webhooks](#public-api-and-webhooks)
- [Platform admin](#platform-admin)
- [Operations and monitoring](#operations-and-monitoring)
- [Blog](#blog)
- [Tech stack](#tech-stack)
- [Getting started (local development)](#getting-started-local-development)
- [Environment variables](#environment-variables)
- [Database migrations](#database-migrations)
- [Background jobs (cron)](#background-jobs-cron)
- [Setup guides](#setup-guides)
- [Deployment](#deployment)
- [Project layout](#project-layout)
- [Scripts and testing](#scripts-and-testing)
- [Security](#security)
- [More documentation](#more-documentation)
- [License](#license)

---

## Features

### Shared inbox
- Every WhatsApp chat for the business number in one inbox, shared by
  the whole team, with live updates.
- Assign conversations, set status (open / pending / closed), add
  internal notes customers never see.
- Send text, images, video, documents, voice notes (recorded in the
  browser as Ogg/Opus), reactions, swipe-replies and approved templates.
  The 24-hour customer-service window is tracked; outside it only
  templates can be sent.
- **Saved replies:** type `/` in the message box to pick a team reply
  (↑↓, Enter); `{{name}}`, `{{full_name}}` and `{{agent}}` are filled in.
  Admins manage them in **Settings → Saved replies**.
- Taps on template quick-reply buttons ("Yes, confirm", "Stop
  promotions") appear as the button text and trigger keyword
  automations and the chatbot like typed messages.
- **WhatsApp usernames (BSUID):** customers who hide their phone number
  behind a username are matched and messaged by their business-scoped
  user ID and shown as `@username`.
- WhatsApp Business app **coexistence**: one number used in both the
  WhatsApp Business app and Repeat Grow, with contacts, history and
  messages sent from the phone synced in.
- **WhatsApp voice calls in the browser** (Meta Calling API, WebRTC):
  customers call your WhatsApp number and every agent's browser rings
  (incoming-call card + ringtone on any page); the first to **Answer**
  takes it. Agents call customers with the **Call** button in the chat
  header — if the customer hasn't allowed calls, it sends a WhatsApp
  call permission request instead. Mute, hang up, live timer, and
  **Recent calls** in the contact panel. Turn it on in **Settings →
  WhatsApp → WhatsApp calling**. Nothing is recorded; audio goes browser
  ↔ Meta directly. See [WhatsApp calling setup](#whatsapp-calling).
- **QR & WhatsApp link** (Settings → QR & WhatsApp link): a wa.me link and a
  printable QR code (PNG 1200 px with a caption, or SVG) with a ready-typed
  first message, prefilled with the connected number. Presets for shop
  counter, flyer, packaging, visiting card, Instagram bio and offers.
  Generated in the browser; nothing stored. Code: `src/lib/wa-link.ts`,
  `src/components/settings/qr-link-settings.tsx`.
- **New-message alerts:** a desktop notification and a short chime when a
  customer writes, on any page, plus the unread count in the tab title.
  Skips chats assigned to a teammate and the chat already on screen.
  Agents turn alerts on from a card (browsers need a click) and can mute
  the sound on the Notifications page. Code:
  `src/components/notifications/message-notifier.tsx`.
- **AI chat summary** (sparkles icon in the chat header): what the
  customer wants, key points, language, mood and a suggested next step,
  from the latest 120 messages. Nothing is stored.
  `POST /api/inbox/conversations/[id]/summary`.
- **Translate:** any message into English from its hover toolbar, and the
  draft reply into 14 languages (Hindi, Hinglish, Marathi, Gujarati,
  Bengali, Tamil, Telugu, Kannada, Malayalam, Punjabi, Odia, Urdu,
  Arabic, English) from the composer, with Undo. `POST /api/inbox/translate`.
  Both use Gemini (`GEMINI_KEY`) and are rate limited per user. Code:
  `src/lib/ai/inbox-ai.ts`, `src/lib/ai/languages.ts`.
- **Fast on big inboxes:** conversations load 50 at a time (**Load older
  conversations**) and threads load the latest 50 messages (**Load
  earlier messages**, scroll position kept). Links to an older
  conversation (`/inbox?c=<id>`) still open it.

### Contacts
- Tags, custom fields, notes, deal history and the full conversation per
  contact.
- **CSV import** with phone-number deduplication (trunk-prefix aware) and
  **CSV export** of every contact with tags, custom fields and opt-out
  status (spreadsheet-formula safe, UTF-8).
- **Opt-outs:** customers who reply STOP / UNSUBSCRIBE (or Hindi phrases
  like "band karo") or tap a template's "Stop promotions" button are
  opted out, get a confirmation, and are skipped by broadcasts and
  marketing templates until they reply START.

### Pipelines and deals
- Kanban pipelines with custom stages; deals linked to contacts and
  conversations; won/lost tracking and pipeline analytics.
- Currency per account, **Indian Rupees (₹) by default**.

### Broadcasts and templates
- Create WhatsApp templates in the app (text/media headers, variables,
  buttons, AI drafting) and submit them to Meta; approval status syncs
  back automatically.
- **Carousel templates** (Marketing): a personalised message followed
  by 2–10 swipeable cards, each with an image or video, short text (≤160
  characters) and 1–2 buttons (quick reply, website, call). Choose
  **Template type → Carousel** in the template builder; every card uses
  the same media type and button layout (Meta rule). Card media is
  uploaded to Meta as a sample on submit and sent by link, so carousels
  work in broadcasts, scheduled broadcasts, the inbox and automations.
  Carousels synced from Meta need their card images re-added before
  sending. Code: `src/lib/whatsapp/carousel.ts`,
  `src/components/settings/carousel-editor.tsx` (migration 051).
- Broadcast an approved template to all contacts, tags, a custom-field
  filter or a CSV, with per-recipient variables (contact fields or custom
  fields) and media headers.
- **Send now** or **Schedule for later**: scheduled broadcasts are sent
  by the server at the chosen time, in batches, so the browser doesn't
  need to stay open. Cancel from the broadcast page.
- Live sent / delivered / read / replied / failed counts per broadcast.
- The broadcasts list shows 25 at a time with **Load more**.

### Orders, payments and catalog (India)
- **Settings → Orders & payments:** choose how customers pay —
  **WhatsApp Pay** (native "Review and pay" with UPI / card /
  netbanking, using a payment configuration made in WhatsApp Manager
  with Razorpay, PayU, BillDesk or Zaakpay — no gateway keys in Repeat
  Grow) or your **UPI ID** (order summary + UPI ID, marked paid by an
  agent) — and add your Meta **catalog ID**.
- **In a chat (₹ icon):** create an order (items, quantity, price, tax,
  shipping, discount) and send the payment request; share the catalog or
  a single product; see this customer's orders.
- **Catalog carts** customers send become pending orders automatically.
  **WhatsApp Pay** payment webhooks (`statuses[].type = payment`) mark
  orders paid / failed / refunded by `reference_id`.
- **Fulfilment:** processing → shipped → delivered (or cancelled); the
  customer is told each time (an `order_status` card for WhatsApp Pay
  orders, a short text otherwise). Recent orders with payment / status
  controls are listed in Settings → Orders & payments.
- Amounts are stored in paise (`whatsapp_orders`). Code:
  `src/lib/whatsapp/commerce.ts`, `src/app/api/whatsapp/commerce/`,
  `src/components/inbox/order-button.tsx` (migration 053).

### WhatsApp forms (Meta Flows)
- **Settings → WhatsApp forms:** build a form from simple fields —
  short / long text, email, phone, number, dropdown, date, consent
  checkbox — with a title, intro and submit button. Publishing turns it
  into a single-screen Flow JSON and creates + publishes it on Meta
  (published Flows can't be edited, so saving changes publishes a new
  version and retires the old one).
- **Send from a chat:** clipboard icon in the chat header (within the
  24-hour window). The customer fills it in without leaving WhatsApp.
- **Answers** arrive on the `nfm_reply` webhook (matched by the
  `rgform:<form id>:…` flow token): shown in the chat with labels,
  saved to `whatsapp_form_responses`, optionally copied to the
  contact's name, email or custom fields, and listed per form with a
  CSV download.
- Code: `src/lib/whatsapp/forms.ts`, `src/components/settings/forms-settings.tsx`,
  `src/app/api/whatsapp/forms/` (migration 052).

### Automations and flows
- **Automations:** triggers (new message, first message, keyword, new
  contact, tag added, …) and steps (send message or template, tag, wait,
  branch, create deal, webhook, assign).
- **Round-robin assignment** (Assign conversation → Round-robin): never
  picks viewers, prefers teammates who are online, then whoever has the
  fewest open chats, rotating ties; never takes a chat from a teammate who
  already has it. Code: `src/lib/automations/round-robin.ts`.
- **Flows:** visual chatbot builder with buttons, lists, media, links,
  waits and branches; can be generated with AI from a description.

### AI chatbot
- Answers WhatsApp chats from the business's knowledge base (Google
  Gemini), knows opening hours, and hands off to a human when asked;
  picks the chat back up if no teammate replies within two hours.

### Notifications and reporting
- Real-time dashboard: response times, daily volume, pipeline value,
  activity feed; in-app notifications.
- **WhatsApp number health** (**Settings → WhatsApp → Number health**):
  quality rating (high / medium / low), messaging limit (customers a
  day), whether Meta lets the number send (with Meta's reasons),
  display-name status and whether calling is allowed — each explained
  in plain words, with **Check now**. Checked daily for every account
  inside the automations cron; the owner is emailed when the number
  becomes at risk (quality drop, limited / blocked, name declined —
  once per change), a warning bar shows across the app, and `/admin`
  shows each account's quality and limit. Reads
  `whatsapp_business_manager_messaging_limit` (falls back to the
  deprecated `messaging_limit_tier`) and `health_status`.
- **Daily summary email** (**Settings → Daily summary**): each owner
  picks on/off, the hour (India time) and up to 5 recipients. Morning
  emails cover yesterday, afternoon/evening ones today so far: messages
  received and sent, new conversations and contacts, chats waiting for a
  reply, broadcasts, deals created and won, opt-outs.

### Accounts, sign-in and team
- Sign up with **email** or **Google**. Google sign-ups complete the same
  business details as the email form (business name, mobile number,
  nature of business, team size) on an onboarding step; owners can edit
  them later in **Settings → Your profile**. Google users can set a
  password later in **Settings → Login & security**.
- Team members by invite link with roles: **owner / admin / agent /
  viewer**; ownership transfer.
- API keys and "Connect RepeatGrow" partner connections (e.g.
  RestroGrow) managed in Settings.
- **Your data (DPDP Act / GDPR)** — **Settings → Your data**:
  - **Download my data:** a JSON file (`GET /api/account/export`,
    streamed). Everyone gets their profile, sign-in details and
    notifications; owners and admins also get the business's contacts,
    chats, messages, deals, broadcasts, templates, automations, flows and
    integration settings. Business tables are read with the caller's
    RLS-scoped client; columns that look like tokens, secrets, key hashes
    or passwords are never exported.
  - **Delete my account (needs platform-admin approval):** the user
    confirms by typing their email and can add a reason
    (`POST /api/account/delete`). That only files a request in
    `account_deletion_requests` and emails `ADMIN_ALERT_EMAIL` (default
    support@repeatgrow.com); nothing is deleted. A platform admin
    approves or rejects it on [`/admin`](https://repeatgrow.com/admin#deletion-requests)
    (approve needs typing DELETE); the user is emailed either way and can
    cancel while it's pending.
  - On approval: a teammate's deletion removes only their login —
    business rows they created are reassigned to the owner first. An
    owner's deletion deletes the whole business (refused while teammates
    remain) and disconnects Calendly. An anonymous record (ids and counts
    only) goes to `account_deletions`; the request's email and business
    name are cleared.
  - Code: [`src/lib/account/data-export.ts`](./src/lib/account/data-export.ts),
    [`src/app/api/account/export`](./src/app/api/account/export/route.ts),
    [`src/app/api/account/delete`](./src/app/api/account/delete/route.ts),
    [`src/lib/account/deletion.ts`](./src/lib/account/deletion.ts),
    [`src/app/api/admin/deletion-requests`](./src/app/api/admin/deletion-requests/%5Bid%5D/route.ts),
    [`your-data-settings.tsx`](./src/components/settings/your-data-settings.tsx),
    migrations [`046_account_deletion.sql`](./supabase/migrations/046_account_deletion.sql)
    and [`047_account_deletion_requests.sql`](./supabase/migrations/047_account_deletion_requests.sql).

---

## Plans, trial and limits

No payment gateway yet: plans are activated by a platform admin after
the business pays (UPI / bank transfer).

| | Starter | Growth | Pro | Enterprise |
|---|---|---|---|---|
| Monthly | ₹999 | ₹1,999 | ₹3,999 | Custom |
| Quarterly | ₹2,699 | ₹5,399 | ₹10,799 | Custom |
| Yearly | ₹9,999 | ₹19,999 | ₹39,999 | Custom |
| Contacts (dashboard adds + imports) | 2,000 | 50,000 | 2,00,000 | Unlimited |
| Broadcasts per month | 60 | 250 | 1,000 | Unlimited |
| Automations + flows | 5 | 25 | 100 | Unlimited |
| Custom fields | 5 | 25 | 100 | Unlimited |
| Team members (incl. pending invites) | 5 | 25 | 50 | Unlimited |

Prices live in `src/lib/billing/plans.ts` (`PLAN_INFO`); the pricing page,
Settings → Plan & billing and the reminder emails all read from there.
Limits must match `plan_limit()` in the database (migration 056).

- **Free trial:** new accounts get **7 days** with Growth limits; a bar
  at the top of the app shows the days left.
- **After the trial (or a paid period) ends, the account is read-only:**
  inbound messages still arrive, but every send path — inbox, API,
  broadcasts, automations, flows, chatbot, Shopify, Calendly — stops
  with a "trial ended" message.
- **Limits are enforced in the database** (BEFORE INSERT triggers raising
  SQLSTATE `PL001` with a user-facing message). Inbound WhatsApp
  messages, the API and integrations always create contacts, so no
  customer message is ever dropped.
- **Reminder emails** to the owner (9 am–8 pm IST, each once): 2 days
  before the trial ends, on its last day, and after it ends; for paid
  plans 3 days before the paid-until date and after it. Each explains
  read-only mode, lists the plans and how to pay, and links to Plan &
  billing. Needs the SMTP env vars; tracked in
  `accounts.billing_reminder_key` (migration 050,
  `src/lib/billing/reminders.ts`).
- **Settings → Plan & billing** shows the plan, usage meters and the
  plans; "Choose" opens WhatsApp (or email) to support with the account
  details. Admins set plan, trial end, paid-until and a note in
  `/admin` → account → **Plan**.
- Code: `src/lib/billing/` (`plans.ts` mirrors the database's
  `plan_limit()` — change both together), migration
  `041_plans_and_trials.sql`. WhatsApp conversation fees are billed by
  Meta directly.

---

## Integrations

| Integration | Status | What it does |
|---|---|---|
| **Shopify** | Live | Order placed, COD order placed, shipped (tracking), out for delivery, delivered, cancelled, abandoned cart |
| **Calendly** | Live | Booking confirmed / rescheduled / cancelled, no-show follow-up, reminders 24 h and 1 h before |
| **Connect RepeatGrow** | Live | Partner apps (RestroGrow) connect with one click and send WhatsApp via the API |
| WooCommerce, Razorpay, Cashfree, Wix, BigCommerce, forms, Google Calendar, Zoom/Meet, Zapier/Make/Pabbly, Google Sheets | Planned | See [docs/INTEGRATIONS.md](./docs/INTEGRATIONS.md) for the plan and the keys each needs |

Both live integrations share one engine: each event maps to an approved
WhatsApp template, and the template's `{{1}}`, `{{2}}`… are filled from
event data chosen in Settings, with a live preview, **Send test**, and a
"Recent messages" log. Messages appear in the inbox; deliveries and sends
are de-duplicated; customer phone numbers are normalised (+91 default,
per-connection country code).

### Shopify (Settings → Shopify)
- **Connect Shopify (one click, OAuth):** Repeat Grow's Shopify app
  (public distribution, App Store review pending). Webhooks are
  registered automatically via the Admin API (2026-10) with expiring
  offline tokens; a merchant installing while logged out signs in or up
  and the connection continues. Until approval, one-click works on
  development stores.
- **Connect with webhooks (any store):** paste the signing key from
  Shopify admin → Settings → Notifications → Webhooks and create the
  listed webhooks pointing at the account's unique URL.
- Abandoned-cart reminders are sent by the cron after a configurable
  idle time and skip opted-out customers.
- App configuration: [`shopify/shopify.app.toml`](./shopify/shopify.app.toml)
  and [`shopify/README.md`](./shopify/README.md) (deploying config,
  App Store checklist). Code: `src/lib/shopify/`,
  `src/app/api/integrations/shopify/`.

### Calendly (Settings → Calendly)
- The business pastes a Calendly **personal access token**; Repeat Grow
  creates the webhook subscription (`invitee.created`,
  `invitee.canceled`, `invitee_no_show.created`) with its own signing
  key. Needs a paid Calendly plan.
- Dates and times use the invitee's time zone; reminders skip
  last-minute bookings and cancelled meetings. The phone number comes
  from a "Phone number" booking question, the SMS-reminder number, or an
  outbound-call location.
- Code: `src/lib/calendly/`, `src/app/api/integrations/calendly/`.

---

## Public API and webhooks

REST API at `https://repeatgrow.com/api/v1`: send messages and templates,
manage contacts, read conversations, create and list templates, launch broadcasts,
and subscribe to signed outbound webhooks (`message.received`,
`message.status_updated`, `conversation.created`).

| Resource | Where |
|---|---|
| Guide with examples (curl, Node.js, Python) | [repeatgrow.com/docs/api](https://repeatgrow.com/docs/api) |
| OpenAPI 3.1 spec | [repeatgrow.com/api/v1/openapi.json](https://repeatgrow.com/api/v1/openapi.json) |
| Full reference | [docs/public-api.md](./docs/public-api.md) |

```bash
curl -X POST https://repeatgrow.com/api/v1/messages \
  -H "Authorization: Bearer $REPEATGROW_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "to": "+919876543210", "text": "Hi 👋" }'
```

Create scoped, revocable keys in **Settings → API keys**. Requests are
rate limited; marketing templates to opted-out contacts are refused.

---

## Platform admin

`/admin` (platform admins only, listed in the `platform_admins` table):

- **Dashboard:** sign-ups today / last 7 / last 30 days with change vs
  the previous period and a 30-day chart (India time); WhatsApp
  connected, active in the last 7 days, messages today, logged in today;
  paying / on trial / trial ended; Shopify and Calendly connections;
  an activation funnel (signed up → details complete → WhatsApp
  connected → active → paying); breakdowns by plan, sign-up method,
  business type and team size.
- **Accounts table:** search (business, owner, email, phone), filters
  (plan, WhatsApp status, sign-up method), sorting (newest, recently
  active, most members), last chat and last login per account.
- **Account page:** business details, members (sign-in method, last
  sign-in), plan editor, WhatsApp connection and live diagnostics.
- **Accounts table** also shows each account's WhatsApp number health
  under its WhatsApp status (quality dot, messaging limit, limited /
  blocked).
- **Demo requests:** every request from `/demo` with a WhatsApp link, email,
  team size and message, a status you change as you follow up (new,
  contacted, demo done, won, lost) and a count of new ones (migration 054).
- **Account deletion requests:** shown at the top of the dashboard while
  any are waiting (history at the bottom). Approve (type DELETE) or
  reject with a note; the user is emailed.
- **System health** (`/admin/system`): database, required env vars,
  every background job (last success, duration, last error — "Not
  running" if a job hasn't succeeded recently) and the last 50 failed
  inbound webhooks (WhatsApp, Shopify, Calendly) with the account and
  error. Failed webhooks are kept for 30 days.

---

## Operations and monitoring

Admin-only. Full runbook: **[docs/OPERATIONS.md](./docs/OPERATIONS.md)**
(what alerts you, what each state means, what to do when something
breaks, releases, testing).

| What | Link |
|---|---|
| Admin dashboard | [repeatgrow.com/admin](https://repeatgrow.com/admin) |
| System health | [repeatgrow.com/admin/system](https://repeatgrow.com/admin/system) |
| Health check (monitors) | [repeatgrow.com/api/health](https://repeatgrow.com/api/health) |
| Uptime alerts | [UptimeRobot](https://dashboard.uptimerobot.com) — HTTP monitor on `/api/health`, every 5 min |
| Error alerts | [Sentry](https://sentry.io) — issue alert to `teamrepeatgrow@gmail.com` (see [Sentry setup](#sentry)) |
| CI | [GitHub Actions](https://github.com/Restrogrow/wacrm/actions) |

- **Background jobs** report a heartbeat every run (`system_heartbeats`);
  `/admin/system` shows OK / Failing / Not running per job.
- **Failed webhooks** (WhatsApp, Shopify, Calendly) are saved to
  `webhook_failures` for 30 days and sent to Sentry, tagged
  `webhook:<source>`; cron errors are tagged `job:<name>`.
- Code: [`src/lib/ops/`](./src/lib/ops), [`src/app/api/health`](./src/app/api/health/route.ts),
  [`src/app/admin/system`](./src/app/admin/system/page.tsx), migration
  [`045_monitoring_and_indexes.sql`](./supabase/migrations/045_monitoring_and_indexes.sql).

### Health check and uptime monitoring

`GET /api/health` is public and returns only states:

```json
{ "status": "ok", "checks": { "database": "ok", "database_latency_ms": 42,
  "config": "ok", "jobs": "ok", "webhooks": "ok" } }
```

- **200** with `status` `ok` or `degraded` (a task inside the cron is
  failing, an env var is missing, or webhooks failed in the last hour).
- **503** with `status` `down`: the database is unreachable, or a cron
  endpoint stopped running / keeps failing.

Point a free monitor at it (UptimeRobot, Better Stack): an HTTP monitor
on `https://repeatgrow.com/api/health` every 5 minutes alerts you when
it returns 503. For "degraded" alerts too, use a keyword monitor that
expects `"status":"ok"`.

---

## Blog

`/blog` is the public, SEO-focused blog: a featured post, a card grid and
a guides section. Each article has a cover image, a table of contents,
an FAQ, a call to action and related posts, and emits BreadcrumbList,
BlogPosting and FAQPage structured data. Posts are listed in the sitemap
automatically.

Current articles:

- Taking payments on WhatsApp in India (WhatsApp Pay, UPI, catalog)
- WhatsApp Business voice calling
- Shopify WhatsApp order notifications (e-commerce, COD confirmation)
- WhatsApp appointment reminders (Calendly, fewer no-shows)
- WhatsApp Business API verification guide
- WhatsApp template rules explained

**Adding a post:**

1. Add an entry at the top of `BLOG_POSTS` in `src/lib/blog.ts` (slug,
   title, description, category, dates, reading time, cover, keywords).
2. Put images in `public/blog/<slug>/` (`cover.svg` at 1200×630; in-article
   figures at 1200×675).
3. Create `src/app/blog/<slug>/page.tsx` rendering `<BlogPostLayout>` from
   `src/components/blog/post-layout.tsx` (`BlogFigure` and
   `TemplateExample` are available for the body), plus an
   `opengraph-image.tsx` copied from an existing post.

---

## Tech stack

- **App:** Next.js 16 (App Router, Turbopack in dev, webpack for
  production builds), React 19, TypeScript, Tailwind CSS v4.
- **Data & auth:** Supabase (Postgres with row-level security, Auth with
  email + Google, Storage, Realtime).
- **WhatsApp:** Meta Cloud API (official WhatsApp Business API),
  Embedded Signup, coexistence.
- **AI:** Google Gemini (chatbot, AI flows, AI template drafts).
- **Email:** SMTP via nodemailer (daily summary); Supabase Auth emails
  through Google Workspace SMTP.
- **Monitoring:** Sentry (`@sentry/nextjs`).
- **Tests:** Vitest.

---

## Getting started (local development)

Requirements: Node.js 20.19+ (or 22.12+), a [Supabase](https://supabase.com)
project, and a Meta app with WhatsApp Business API access.

```bash
git clone https://github.com/Restrogrow/wacrm.git repeatgrow
cd repeatgrow
npm install
cp .env.local.example .env.local   # fill in at least the Required variables
npm run dev
```

1. Run every SQL file in [`supabase/migrations`](./supabase/migrations)
   **in order** in the Supabase SQL Editor (see
   [Database migrations](#database-migrations)).
2. Open <http://localhost:3000>. Signed-out visitors see the marketing
   site; `/login` signs in to the app.
3. Sign up, then connect WhatsApp in **Settings → WhatsApp**.
4. To make yourself a platform admin, insert your user id into
   `platform_admins` (migration 030).

---

## Environment variables

Set in `.env.local` locally and in Hostinger hPanel in production.
`.env.local.example` documents each one. `NEXT_PUBLIC_*` values are
baked in at build time — **redeploy after changing them**.

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key (browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only key for webhooks, cron, admin, integrations |
| `ENCRYPTION_KEY` | Yes | 64-char hex key; encrypts WhatsApp tokens and integration secrets (AES-256-GCM) |
| `META_APP_SECRET` | Yes | Verifies the signature on every WhatsApp webhook |
| `NEXT_PUBLIC_SITE_URL` | Yes (prod) | Public origin, `https://repeatgrow.com` (local: `http://localhost:3000`); used for redirects, OAuth callbacks and webhook URLs |
| `AUTOMATION_CRON_SECRET` | Yes (prod) | Shared secret for the cron endpoints (`x-cron-secret` header) |
| `META_APP_ID`, `NEXT_PUBLIC_META_APP_ID`, `NEXT_PUBLIC_META_CONFIG_ID` | Optional | WhatsApp Embedded Signup ("Connect with Facebook") |
| `GEMINI_KEY` (`GEMINI_API_KEY` also accepted), `GEMINI_MODEL` | Optional | AI chatbot, AI flows, AI templates; model defaults to `gemini-3.8-flash` |
| `ALLOWED_INVITE_HOSTS` | Optional | Comma-separated hostnames allowed in team invite links (extra protection on bare deployments) |
| `CHATBOT_TIMEZONE` | Optional | Chatbot's "are you open now?" time zone (default `Asia/Kolkata`) |
| `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET` | Optional | Shopify one-click connect (Client ID / secret) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Optional | Outgoing email (daily summary, deletion request emails) |
| `DEMO_REQUEST_EMAIL` | Optional | Who is emailed when someone requests a demo on `/demo` (comma-separated; default sales@repeatgrow.com) |
| `ADMIN_ALERT_EMAIL` | Optional | Who is emailed about account deletion requests (comma-separated; default support@repeatgrow.com) |
| `NEXT_PUBLIC_GA_ID` | Optional | Google Analytics 4 measurement ID. Defaults to `G-L56ZRQGJ67`; set it empty to turn analytics off. Loaded on public marketing pages only; the demo form sends a `generate_lead` event |
| `NEXT_PUBLIC_SENTRY_DSN` | Optional | Turns on Sentry error monitoring |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | Optional | Environment label in Sentry (defaults to `NODE_ENV`) |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | Optional | Upload source maps to Sentry at build time |
| `WHATSAPP_TEMPLATES_DRY_RUN` | Dev only | Skip the Meta call when submitting templates (never in production) |

---

## Database migrations

Run in order in the Supabase SQL Editor (`supabase/migrations/`). Each
is idempotent where possible. Recent ones:

| Migration | Adds |
|---|---|
| `001`–`028` | Core schema: contacts, conversations, messages, pipelines, broadcasts, templates, automations, flows, multi-user accounts and roles, API keys, webhooks |
| `029_signup_business_fields` | Business name, mobile, nature of business, team size |
| `030_platform_admins` | `/admin` access list |
| `031_embedded_signup`, `032_coexistence` | WhatsApp Embedded Signup and Business app coexistence |
| `033_template_account_scoping` | Templates per account |
| `034_ai_chatbot` | AI chatbot settings |
| `035_connect_clients` | "Connect RepeatGrow" partner OAuth |
| `036_contact_opt_out` | STOP / START opt-outs |
| `037_default_currency_inr` | INR as default currency |
| `038_contacts_whatsapp_user_id` | WhatsApp usernames (BSUID) on contacts |
| `039_shopify_integration` | Shopify stores, rules, orders, checkouts, events |
| `040_calendly_integration` | Calendly connections, rules, bookings, events |
| `041_plans_and_trials` | Plans, trial dates, plan-limit triggers |
| `042_saved_replies` | Saved replies |
| `043_scheduled_broadcasts` | Scheduled broadcast params and send lease |
| `044_daily_summary` | Daily summary settings |
| `045_monitoring_and_indexes` | Job heartbeats, webhook failure log, faster inbox / thread / contacts / broadcasts queries, contact search indexes |
| `046_account_deletion` | Account deletion (`prepare_user_deletion`) and the anonymous `account_deletions` log |
| `047_account_deletion_requests` | Deletion requests that a platform admin approves or rejects |
| `048_whatsapp_calls` | WhatsApp voice calls (`whatsapp_calls`, Realtime) |
| `049_whatsapp_number_health` | Daily WhatsApp number health (quality, messaging limit, send status) |
| `050_billing_reminders` | Trial-ending and plan-renewal reminder emails |
| `051_carousel_templates` | Carousel templates (`message_templates.carousel_cards`) |
| `052_whatsapp_forms` | WhatsApp forms (Meta Flows) and their responses |
| `053_orders_and_payments` | Catalog / payment settings and orders (WhatsApp Pay or UPI ID) |
| `054_demo_requests` | Demo requests from the public `/demo` page (service-role only) |
| `055_lock_privileged_columns` | Security: users can't change their own account/role, and owners can't change their plan or billing columns, from the browser |
| `056_pro_plan` | Pro plan (`plan = 'pro'`) and its limits in `plan_limit()` |

[CHANGELOG.md](./CHANGELOG.md) notes which release needs which migration.

---

## Background jobs (cron)

Hostinger calls these every minute with the header
`x-cron-secret: $AUTOMATION_CRON_SECRET`:

| Endpoint | Runs |
|---|---|
| `GET /api/automations/cron` | Delayed automation steps, **scheduled broadcasts** (batched, leased), **Shopify abandoned-cart reminders**, **Calendly 24 h / 1 h reminders**, **daily summary emails**, **WhatsApp number health** (daily per account, 10 per run), **trial / renewal reminder emails** |
| `GET /api/flows/cron` | Flow waits and timeouts |

Each job is idempotent (claims before sending), so overlapping or
retried runs never send twice.

---

## Setup guides

### WhatsApp (Meta)
- In **Settings → WhatsApp**, paste the Phone Number ID, WhatsApp
  Business Account ID and access token, or use **Connect with Facebook**
  (Embedded Signup — see [docs/embedded-signup.md](./docs/embedded-signup.md)).
- Meta webhook: `https://<your-domain>/api/whatsapp/webhook`, with the
  verify token shown in Settings → WhatsApp; subscribe the `messages`
  field (plus template status fields, and `calls` for voice calling).
  `META_APP_SECRET` must be set.

### WhatsApp Pay (India)

1. Run migration `053_orders_and_payments.sql`.
2. WhatsApp Manager → Account tools → **Payment configurations**: link
   your Razorpay / PayU / BillDesk / Zaakpay account and name the
   configuration (Meta's Payments API for India must be enabled for
   your business).
3. Repeat Grow → **Settings → Orders & payments** → WhatsApp Pay → pick
   the gateway and enter the configuration name.
4. Payment updates arrive on the existing webhook (`messages` field,
   `statuses` with `type: payment`) — nothing extra to subscribe.
   Without WhatsApp Pay, choose **UPI ID** instead.
5. For catalog sharing and catalog orders: create a catalog in Commerce
   Manager, connect it to the number in WhatsApp Manager → Catalog, and
   paste the catalog ID in Settings → Orders & payments.

### WhatsApp calling

1. Run migration `048_whatsapp_calls.sql`.
2. Meta App Dashboard → WhatsApp → Configuration → Webhook fields:
   subscribe **`calls`**.
3. In the app: **Settings → WhatsApp → WhatsApp calling** → on (admins).
   This calls `POST /<PHONE_NUMBER_ID>/settings` with calling enabled,
   the call button shown and callback permission on. If Meta answers
   "calling not enabled for this phone number", the card keeps the
   switch (off) and shows why in plain words (messaging limit, Cloud
   API-only number, `calls` webhook) instead of an error; the chat's
   Call button says calling must be turned on first.
4. Requirements from Meta: the number is on Cloud API and has a
   messaging limit of **2,000+**. Customer-initiated calls are free;
   business-initiated calls are billed per minute by Meta and need the
   customer's permission (1 request a day, 2 a week).
5. Agents need a browser with WebRTC (Chrome, Edge, Safari, Firefox) and
   must allow the microphone. Very strict office networks may block
   WebRTC audio (only public STUN is used; no TURN server).

How it works: the `calls` webhook stores each call in `whatsapp_calls`
(with the customer's SDP offer); browsers get it through Realtime and
answer with WebRTC (`pre_accept` + `accept`, first agent wins). Outbound
calls send the browser's SDP offer (`action: connect`) and apply Meta's
SDP answer from the webhook. Code: [`src/lib/whatsapp/calling.ts`](./src/lib/whatsapp/calling.ts),
[`src/components/calls/`](./src/components/calls), [`src/app/api/whatsapp/calls/`](./src/app/api/whatsapp/calls/route.ts).

### Google sign-in
1. Google Cloud → OAuth client (Web application), authorized redirect
   URI `https://<project-ref>.supabase.co/auth/v1/callback`; publish the
   consent screen to Production.
2. Supabase → Authentication → Providers → Google: enable, paste client
   ID and secret.
3. Supabase → Authentication → URL Configuration: Site URL
   `https://repeatgrow.com`; Redirect URLs `http://localhost:3000/**`
   and `https://repeatgrow.com/**`.

New Google users go through `/onboarding` until their business details
are complete. A stray `/?code=…` (when Supabase falls back to the Site
URL) is forwarded to `/auth/callback`.

### Auth emails (Supabase SMTP)
Supabase → Authentication → Emails → SMTP: host `smtp.gmail.com`, port
`465`, user `support@repeatgrow.com`, password = a Google Workspace App
Password. Add SPF, DKIM and DMARC records for repeatgrow.com.

### Email addresses
Repeat Grow uses three addresses on Google Workspace (added as "Send mail
as" aliases):

| Address | Used for |
|---|---|
| `support@repeatgrow.com` | Default sender (SMTP login), customer support, security reports, account deletion alerts |
| `sales@repeatgrow.com` | Demo requests from `/demo` are emailed here |
| `info@repeatgrow.com` | General enquiries and public listings |

All app email is sent through the `support@` SMTP account (see below).

### App email (daily summary)
Set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`,
`SMTP_USER=support@repeatgrow.com`, `SMTP_PASS=<App Password>`,
`SMTP_FROM="Repeat Grow <support@repeatgrow.com>"`, restart, then use
**Send a test now** in Settings → Daily summary.

### Shopify app
Configure in the [Shopify Dev Dashboard](https://dev.shopify.com) or
deploy [`shopify/shopify.app.toml`](./shopify/shopify.app.toml) with the
Shopify CLI. Redirect URL `/api/integrations/shopify/callback`, App URL
`/api/integrations/shopify/install`, scopes
`read_orders,read_fulfillments`, compliance webhooks
`/api/integrations/shopify/webhooks`, not embedded. Request protected
customer data access (name, phone, email, address).

### Sentry
Set `NEXT_PUBLIC_SENTRY_DSN` and redeploy. Errors from the browser,
server, edge, webhooks and cron are reported (no Session Replay, no
default PII, no performance tracing — stripped at build time to keep the
browser bundle small). Background-job errors are tagged `job:<name>` and
webhook errors `webhook:<source>`.

**Alerts** (sentry.io → Alerts → Create alert → Issues):

1. "A new issue is created" → email you. Catches every new kind of error.
2. "The issue is seen more than 10 times in 1 hour" → email. Catches
   something that breaks repeatedly.
3. Optional: filter on tag `webhook` or `job` for a separate rule so
   webhook / cron failures go to WhatsApp or Slack via Sentry's
   integrations.

Code:
`src/instrumentation.ts`, `src/instrumentation-client.ts`,
`src/lib/sentry-options.ts`.

---

## Deployment

Production runs on [Hostinger](https://www.hostinger.com/web-apps-hosting)
Managed Node.js: **pushing to `main` builds and deploys**. Environment
variables live in hPanel.

- Set `NEXT_PUBLIC_SITE_URL=https://repeatgrow.com` (the app also
  upgrades any public `http` origin to `https`).
- The WhatsApp, Shopify and Calendly webhooks must be reachable over
  HTTPS.
- App and auth pages and RSC payloads are sent `Cache-Control: private,
  no-store`; marketing pages are cached briefly at the CDN.
- `next.config.mjs` is plain JS on purpose (Hostinger's older glibc
  forces the WASM SWC build).

The app also runs on any Node.js host (Vercel, Railway, a VPS).

---

## Project layout

```
src/app/                 App Router: marketing pages, /docs, the app, admin, API routes
src/app/(auth)/          Login, signup, onboarding, password reset
src/app/(dashboard)/     Inbox, contacts, pipelines, broadcasts, automations, flows, settings
src/app/admin/           Platform admin dashboard and account pages
src/app/api/v1/          Public REST API (+ openapi.json)
src/app/api/integrations Shopify and Calendly connect + webhook routes
src/components/          UI (inbox, contacts, broadcasts, settings, admin, …)
src/lib/whatsapp/        Meta Cloud API client, webhook handling, send pipeline
src/lib/automations/     Automation engine;  src/lib/flows/ flow engine
src/lib/shopify/         Shopify events, OAuth, webhook processing
src/lib/calendly/        Calendly events, API client, reminders
src/lib/billing/         Plans, limits, trial / read-only checks
src/lib/broadcasts/      Scheduled broadcast sender
src/lib/summary/         Daily summary email
src/lib/admin/           Admin dashboard data
src/lib/ops/             Health check, job heartbeats, webhook failure log
src/lib/account/         Data export ("Download my data")
src/components/calls/    Browser calling (call manager, call card, Call button)
src/app/admin/system/    System health page;  src/app/api/health/ health check
src/lib/integrations/    Shared integration helpers (phone normalisation)
src/app/blog/            Blog posts;  src/lib/blog.ts post list;  public/blog/ images
supabase/migrations/     Database schema, in order
e2e/                     Playwright end-to-end tests (playwright.config.ts)
shopify/                 Shopify app config (shopify.app.toml) + App Store checklist
docs/                    Operations runbook, public API, embedded signup, integrations, RestroGrow connect
```

---

## Scripts and testing

| Command | What it does |
|---|---|
| `npm run dev` | Dev server (Turbopack) at localhost:3000 |
| `npm run build` / `npm start` | Production build (webpack) and serve |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (Vitest) |
| `npm run security:check` | Live check that an anonymous visitor can't read any table (read-only) |
| `npm run test:e2e` | End-to-end tests (Playwright) against the production build — run `npm run build` first; `npx playwright install chromium` once |
| `npm run format` | Prettier |

CI (GitHub Actions) runs lint, typecheck, unit tests, a production build
and the end-to-end tests on every push to `main`.

**End-to-end tests** (`e2e/`): marketing pages, blog (structured data,
images, social images), robots.txt and sitemap, the sign-in guard on app
pages, the login form, and `/api/health`, on desktop and mobile. Signed-in
smoke tests (inbox, contacts, broadcasts, settings — read-only) run only
when `E2E_EMAIL` and `E2E_PASSWORD` are set; use a dedicated test account.
Set `E2E_BASE_URL` to test a running site (e.g. staging) instead of a
local build.

---

## Security

- **Account isolation is tested on every push:**
  - `src/lib/security/rls-migrations.test.ts` replays every migration
    and fails if any table lacks row-level security or any policy isn't
    scoped to the account / user (only the three public media buckets
    are allowlisted, because WhatsApp downloads media by URL).
  - `src/lib/security/api-auth.test.ts` fails if any API route doesn't
    check who is calling (member, admin, API key, cron secret or webhook
    signature) — public routes are an explicit, reasoned allowlist.
  - `npm run security:check` signs in as nobody (public anon key) and
    tries to read every table on a real project — it must see 0 rows.
- **Rate limits:** public `/api/health` per IP; webhooks block an IP
  after repeated bad signatures / unknown URLs (genuine Meta, Shopify
  and Calendly deliveries are never limited); AI generation per user;
  form, order, catalog and call-permission sends per user — on top of
  the existing message, broadcast, API-key, invite and admin limits.
  Login, sign-up and password-reset limits are Supabase Auth's
  (Authentication → Rate Limits; turn on CAPTCHA there for extra
  protection).
- WhatsApp tokens, integration tokens and signing keys are encrypted
  with AES-256-GCM (`ENCRYPTION_KEY`).
- Row-level security on every table; integration tables are
  service-role only.
- Webhooks are signature-verified: Meta (HMAC-SHA256), Shopify
  (`X-Shopify-Hmac-Sha256`), Calendly (`Calendly-Webhook-Signature`,
  replay window); outbound webhooks are signed.
- OAuth redirects are validated (state nonce, HMAC, anchored shop
  domains); post-login redirects are same-origin only.
- API keys are scoped and revocable; API and admin actions are rate
  limited; a Content Security Policy ships (report-only for now).
- Users can download their own data and request deletion (Settings →
  Your data); exports never include secrets, deletion requests are
  confirmed by typing the email and only take effect when a platform
  admin approves them, and both are rate limited.
- Cron endpoints check `x-cron-secret` in constant time. `/api/health`
  returns states only — error text and env var names are shown on
  `/admin/system` to platform admins only; the monitoring tables are
  service-role only.

Report vulnerabilities privately to
[support@repeatgrow.com](mailto:support@repeatgrow.com). See also
[repeatgrow.com/security](https://repeatgrow.com/security).

---

## More documentation

- [docs/OPERATIONS.md](./docs/OPERATIONS.md) — **admin runbook**: monitoring, alerts, incidents, releases, testing
- [CHANGELOG.md](./CHANGELOG.md) — what changed and which migrations it needs
- [TODO.md](./TODO.md) — roadmap and known gaps
- [docs/public-api.md](./docs/public-api.md) — API reference
- [docs/INTEGRATIONS.md](./docs/INTEGRATIONS.md) — integrations plan and keys
- [docs/embedded-signup.md](./docs/embedded-signup.md) — WhatsApp Embedded Signup
- [docs/RESTROGROW_CONNECT.md](./docs/RESTROGROW_CONNECT.md) — Connect RepeatGrow ↔ RestroGrow
- [shopify/README.md](./shopify/README.md) — Shopify app config and App Store checklist
- [CONTRIBUTING.md](./CONTRIBUTING.md)

---

## License

[MIT](./LICENSE). Repeat Grow is built on the open-source
[wacrm](https://github.com/ArnasDon/wacrm) starter by Arnas Donauskas.
