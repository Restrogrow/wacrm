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
- **Sales pipelines**: Kanban boards with deals linked to conversations.
- **Broadcasts**: send Meta-approved templates, with delivery and read
  tracking and per-recipient variables.
- **No-code automations and flows**: trigger on inbound messages, first
  messages, keywords, or tags. Steps include branches, waits, tags, and
  webhooks, all in a visual builder.
- **AI chatbot**: answers WhatsApp chats from your knowledge base and
  hands off to a human when the customer asks for one.
- **Real-time dashboard**: response times, daily volume, pipeline value,
  and an activity feed.
- **Sign up with email or Google**: Google sign-ups are asked for the
  same business details as the signup form (business name, mobile
  number, nature of business, team size) before entering the app.
- **Team accounts**: invite teammates by link, with role-based access
  (owner / admin / agent / viewer).
- **Platform admin** (`/admin`, internal): every account with its
  owner, mobile number, business type, team size, signup method
  (Google / email), profile completeness, members, and WhatsApp status.
- **Public REST API and webhooks**: scoped, revocable API keys plus
  signed outbound events. See [Public API](#public-api).

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
docs/               Developer docs (public API, embedded signup)
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
