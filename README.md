# Repeat Grow

> WhatsApp CRM for sales and support teams, built on the official
> WhatsApp Business API. Shared inbox, contacts, sales pipelines,
> broadcasts, no-code automations, an AI chatbot, and a public REST API.

**Website:** [repeatgrow.com](https://repeatgrow.com) ·
**App login:** [repeatgrow.com/login](https://repeatgrow.com/login) ·
**Help Center:** [repeatgrow.com/docs](https://repeatgrow.com/docs) ·
**API reference:** [repeatgrow.com/docs/api](https://repeatgrow.com/docs/api) ·
**Support:** [support@repeatgrow.com](mailto:support@repeatgrow.com)

[![License: MIT](https://img.shields.io/badge/License-MIT-violet.svg)](./LICENSE)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)](https://nextjs.org)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Auth-3ecf8e?logo=supabase)](https://supabase.com)
[![OpenAPI 3.1](https://img.shields.io/badge/OpenAPI-3.1-6ba539?logo=openapiinitiative)](https://repeatgrow.com/api/v1/openapi.json)

## Features

- **Shared inbox** on the official WhatsApp Business API: several
  agents on one number, with per-conversation assignment, status, and
  internal notes.
- **Contacts**: tags, custom fields, CSV import, and deduplication.
  Supports WhatsApp usernames: customers who hide their number are
  matched and messaged by their business-scoped user ID (BSUID) and
  shown as "@username".
- **Sales pipelines**: Kanban boards with deals linked to conversations.
  Amounts default to Indian Rupees (₹); each account can pick its
  currency in Settings.
- **Broadcasts**: send Meta-approved templates, with delivery and read
  tracking and per-recipient variables. Customers who reply STOP or tap
  a template's "Stop promotions" button are opted out automatically.
  Template quick-reply taps also trigger automations and the chatbot.
- **No-code automations and flows**: trigger on inbound messages, first
  messages, keywords, or tags. Steps include branches, waits, tags, and
  webhooks, all in a visual builder.
- **Shopify**: automatic WhatsApp messages for order placed, COD order
  placed, shipped, out for delivery, delivered, cancelled, and abandoned
  carts. Connect with one click (Shopify app) or with webhooks created in
  Shopify admin; each event maps to an approved template whose variables
  are filled from the order.
- **Calendly**: WhatsApp booking confirmations, reschedule and
  cancellation notices, no-show follow-ups, and reminders 24 h and 1 h
  before each meeting. Connect with a Calendly personal access token.
- **AI chatbot**: answers WhatsApp chats from your knowledge base and
  hands off to a human when the customer asks for one.
- **Real-time dashboard**: response times, daily volume, pipeline value,
  and an activity feed.
- **Sign up with email or Google**: Google sign-ups are asked for the
  same business details as the signup form (business name, mobile
  number, nature of business, team size) before entering the app.
- **Team accounts**: invite teammates by link, with role-based access
  (owner / admin / agent / viewer).
- **Plans & free trial**: Starter / Growth / Enterprise with the limits
  on /pricing, enforced by the database; new accounts get a 7-day trial,
  then become read-only (sending paused) until a plan is active. Usage
  and plans live in Settings → Plan & billing.
- **Platform admin** (`/admin`, internal): a live dashboard — sign-ups
  today / 7 / 30 days with change vs the previous period and a 30-day
  chart (India time), WhatsApp connections, active accounts, messages
  today, logins, paying / trial / expired counts, integrations, a
  sign-up → details → WhatsApp → active → paying funnel, breakdowns by
  plan, sign-up method, business type and team size — plus a searchable,
  filterable accounts table and per-account pages with a plan editor.

## Public API

Repeat Grow exposes a REST API at `https://repeatgrow.com/api/v1` for
sending messages, managing contacts, reading conversations, launching
broadcasts, and subscribing to webhooks.

| Resource | Where |
| --- | --- |
| Guide with examples (curl, Node.js, Python) | [repeatgrow.com/docs/api](https://repeatgrow.com/docs/api) |
| OpenAPI 3.1 spec (import into Postman, Insomnia, or codegen) | [repeatgrow.com/api/v1/openapi.json](https://repeatgrow.com/api/v1/openapi.json) |
| Full reference in this repo | [docs/public-api.md](./docs/public-api.md) |

```bash
curl -X POST https://repeatgrow.com/api/v1/messages \
  -H "Authorization: Bearer $REPEATGROW_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "to": "+14155550123", "text": "Hi 👋" }'
```

Create keys at [repeatgrow.com/settings?tab=api](https://repeatgrow.com/settings?tab=api)
(**Settings → API keys**).

## Local development

Requirements: Node.js 20+, a [Supabase](https://supabase.com) project,
and a Meta app with WhatsApp Business API access.

```bash
git clone https://github.com/Restrogrow/wacrm.git repeatgrow
cd repeatgrow
npm install
cp .env.local.example .env.local   # fill in Supabase + Meta credentials
npm run dev
```

Open <http://localhost:3000>. Signed-out visitors see the marketing
site; `/login` signs you in to the app.

Apply the database schema by running the SQL files in
[`supabase/migrations`](./supabase/migrations) in order against your
Supabase project. `.env.local.example` documents every environment
variable.

### Google sign-in

1. In Google Cloud, create an OAuth client (type **Web application**)
   with this authorized redirect URI:
   `https://<your-project-ref>.supabase.co/auth/v1/callback`. Publish
   the OAuth consent screen to **Production**, or only listed test
   users can sign in.
2. In Supabase → **Authentication → Providers → Google**, enable it
   and paste the client ID and secret.
3. In Supabase → **Authentication → URL Configuration**, set **Site
   URL** to `https://repeatgrow.com` and add these **Redirect URLs**:

   ```
   http://localhost:3000/**
   https://repeatgrow.com/**
   ```

   If the app's address isn't on this list, Supabase sends the user to
   the Site URL instead. The proxy forwards a stray `/?code=…` to
   `/auth/callback` so the sign-in still completes on that host, but
   a local sign-in that lands on production can't finish there.

New Google users are routed to `/onboarding` (from the dashboard
layout) until their account has a mobile number, nature of business,
and team size. Invited teammates are never asked.

### Shopify integration

Two ways to connect a store, both in **Settings → Shopify**:

- **Webhooks (works for any store, no setup on our side):** the merchant
  pastes the signing key from Shopify admin → Settings → Notifications →
  Webhooks, then creates the listed webhooks (Order creation, Order
  cancellation, Fulfillment creation, Fulfillment update, Checkout
  creation, Checkout update; JSON) pointing at their unique URL
  `/api/integrations/shopify/webhooks/<token>`.
- **Connect Shopify (OAuth):** uses Repeat Grow's Shopify app
  (**public distribution**; App Store listing in draft). Its settings
  live in [`shopify/shopify.app.toml`](./shopify/shopify.app.toml) and
  are deployed with the Shopify CLI — see
  [`shopify/README.md`](./shopify/README.md), which also has the App
  Store submission checklist. Server env: `SHOPIFY_API_KEY` (Client ID)
  and `SHOPIFY_API_SECRET` (Client secret).

  On connect, Repeat Grow registers the order/fulfillment/checkout
  webhooks via the Admin API (2026-10) with expiring offline tokens.
  A merchant who installs from Shopify while logged out is sent to log
  in or sign up, then the connection continues automatically. Until
  the App Store review is approved, one-click connect works only on
  development stores — use the webhook option for live stores.

Apply `supabase/migrations/039_shopify_integration.sql` first. Planned
integrations and the keys each needs: [docs/INTEGRATIONS.md](./docs/INTEGRATIONS.md).
Abandoned-cart reminders run from the existing every-minute
`/api/automations/cron` job. Code: `src/lib/shopify/`,
`src/app/api/integrations/shopify/`.

### Plans, trial and limits

No payment gateway yet. `accounts.plan` is `trial`, `starter`, `growth`
or `enterprise`, with `trial_ends_at` (new accounts: 7 days) and
`plan_expires_at` (paid-until; empty = no end). A platform admin sets
them in `/admin` → account → **Plan** after the business pays (UPI /
bank transfer); "Choose plan" in Settings → Plan & billing opens
WhatsApp/email to support with the account details.

- **Trial** gets Growth limits. When the trial or paid period ends the
  account is **read-only**: inbound messages still arrive, but every
  send path (inbox, API, broadcasts, automations, flows, chatbot,
  Shopify, Calendly) stops with a "trial ended" message
  (`src/lib/billing/server.ts`).
- **Limits** (`src/lib/billing/plans.ts`, mirrored in the database's
  `plan_limit()`): contacts (dashboard adds and CSV imports only —
  inbound WhatsApp, API and integrations always create contacts),
  broadcasts per month, automations + flows, custom fields, and team
  members including pending invites. BEFORE INSERT triggers raise
  SQLSTATE `PL001` with a message shown to the user as-is.

Apply `supabase/migrations/041_plans_and_trials.sql` (existing accounts
get a one-time 14-day trial).

### Calendly integration

**Settings → Calendly.** The business pastes a Calendly personal access
token (Calendly → Integrations → API & Webhooks); Repeat Grow creates a
webhook subscription (`invitee.created`, `invitee.canceled`,
`invitee_no_show.created`) to `/api/integrations/calendly/webhooks/<token>`
with its own signing key, verified via `Calendly-Webhook-Signature`.
Needs a paid Calendly plan. No server env vars.

Each event maps to an approved template whose variables come from the
booking (invitee name, meeting name, date and time in the invitee's
time zone, meeting link, host, reschedule/cancel links, booking page).
Bookings are stored so the every-minute `/api/automations/cron` job can
send the 24 h and 1 h reminders. The invitee's phone comes from a
"Phone number" booking question, the SMS-reminder number, or an
outbound-call location. Apply
`supabase/migrations/040_calendly_integration.sql` first. Code:
`src/lib/calendly/`, `src/app/api/integrations/calendly/`.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (Vitest) |

## Project layout

```
src/app/            Next.js App Router: marketing pages, /docs, the app, and API routes
src/app/api/v1/     Public REST API (+ openapi.json)
src/app/docs/       Help Center and API reference pages
src/lib/api/v1/     API envelope, pagination, serializers, OpenAPI spec
src/lib/whatsapp/   Meta Cloud API client, webhooks, send pipeline
src/components/     UI components
supabase/           Database migrations
shopify/            Shopify app configuration (shopify.app.toml) and App Store checklist
docs/               Developer docs (public API, embedded signup, integrations)
```

## Deployment

Production runs on [Hostinger](https://www.hostinger.com/web-apps-hosting)
Managed Node.js. Pushing to `main` builds and deploys. Environment
variables are set in hPanel. The app runs on any Node.js host, such as
Vercel, Railway, or a VPS.

Set `NEXT_PUBLIC_SITE_URL=https://repeatgrow.com` in production. The
WhatsApp webhook must be reachable over HTTPS.

## Stack

- **App**: Next.js 16 (App Router), React 19, TypeScript, Tailwind v4.
- **Data**: Supabase (Postgres, Auth, Storage, row-level security).
- **WhatsApp**: Meta Cloud API (official WhatsApp Business API).
- **AI**: Google Gemini for the AI chatbot and AI flow builder (`GEMINI_KEY`).

## Security

WhatsApp tokens are encrypted with AES-256-GCM. Every table has
row-level security. Webhooks are verified with HMAC, and responses carry
a Content Security Policy. API requests are rate limited. Report
vulnerabilities privately to
[support@repeatgrow.com](mailto:support@repeatgrow.com). See also
[repeatgrow.com/security](https://repeatgrow.com/security).

## License

[MIT](./LICENSE). Repeat Grow is built on the open-source
[wacrm](https://github.com/ArnasDon/wacrm) starter by Arnas Donauskas.
