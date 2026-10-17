# Integrations

What Repeat Grow connects to, what each integration sends on WhatsApp,
and the keys it needs.

**Two kinds of keys:**

- **Server keys** — set once by us in Hostinger (hPanel → environment
  variables). Needed when Repeat Grow has its own app on that platform
  (OAuth / "Connect" buttons).
- **Customer keys** — each business pastes its own in Settings. Stored
  encrypted per account (`ENCRYPTION_KEY`).

Every integration sends WhatsApp **templates** (approved by Meta) for
business-initiated messages; messages land in the inbox like any chat.

---

## ✅ Live

### Shopify

Order placed, COD order placed, shipped (tracking link), out for
delivery, delivered, cancelled, abandoned cart. Settings → Shopify.
Code: `src/lib/shopify/`, migration `039_shopify_integration.sql`.

| Option | Keys |
|---|---|
| Connect with webhooks (any store) | **Customer:** webhook signing key from Shopify admin → Settings → Notifications → Webhooks. **Server:** none. |
| Connect Shopify (one click) | **Server:** `SHOPIFY_API_KEY` (Client ID), `SHOPIFY_API_SECRET` (Client secret) from an app in the [Shopify Dev Dashboard](https://dev.shopify.com). App settings: redirect URL `https://repeatgrow.com/api/integrations/shopify/callback`, scopes `read_orders,read_fulfillments`, protected customer data (name, phone, email, address), compliance webhooks → `https://repeatgrow.com/api/integrations/shopify/webhooks`. App config: [`shopify/shopify.app.toml`](../shopify/shopify.app.toml). Public distribution selected; App Store listing in draft — until it's approved, one-click works only on development stores. |

### Calendly

Booking confirmed, rescheduled, cancelled, no-show follow-up, and
reminders 24 h and 1 h before the meeting (sent by the every-minute
cron; skipped for last-minute bookings). Settings → Calendly. Code:
`src/lib/calendly/`, migration `040_calendly_integration.sql`.

| Keys | |
|---|---|
| **Customer** | A Calendly **personal access token** (Calendly → Integrations → API & Webhooks → Personal access tokens). Repeat Grow creates the webhook subscription (`invitee.created`, `invitee.canceled`, `invitee_no_show.created`) with its own signing key and verifies `Calendly-Webhook-Signature`. Needs a **paid Calendly plan** (webhooks are paid-only). |
| **Server** | None. (A one-click OAuth version later would add `CALENDLY_CLIENT_ID`, `CALENDLY_CLIENT_SECRET`.) |

The invitee's phone comes from a booking question (type **Phone
number**, e.g. "WhatsApp number"), the SMS-reminder number, or an
outbound-call location — Calendly doesn't collect one by default.

### WooCommerce

Order placed / COD order placed, completed, cancelled and refunded
messages, driven by order status. Integrations → WooCommerce. Code:
`src/lib/woocommerce/`, migrations `063_woocommerce.sql` and
`077_catalog_collections_stock.sql`.

| Keys | |
|---|---|
| **Customer** | Repeat Grow shows a webhook URL and a secret. In WooCommerce → Settings → Advanced → Webhooks create `order.created` and `order.updated` (REST API v3) with that URL and secret; we verify `X-WC-Webhook-Signature` (base64 HMAC-SHA256). Optional: a REST API **consumer key + secret** (`ck_…` / `cs_…`), stored encrypted, to sync products into the catalog. |
| **Server** | None. |

No abandoned-cart message: core WooCommerce has no such event.

### Razorpay payment links (in chats)

Request a payment in a chat; a Razorpay Payment Link is sent and a signed
webhook marks it paid / expired / failed (and the linked order paid) and
sends a confirmation. Settings → Orders & payments → Razorpay card. Code:
`src/lib/payments/razorpay.ts`, migration `064_razorpay_payment_links.sql`.

| Keys | |
|---|---|
| **Customer** | Razorpay **Key ID + Key Secret** (Dashboard → Account & Settings → API Keys). Repeat Grow generates a webhook secret and shows the URL once; in Razorpay → Webhooks add the events `payment_link.paid`, `payment_link.expired`, `payment_link.cancelled`, `payment.failed`. |
| **Server** | None. (Our *own* plan billing is still manual: TODO #1.) |

### Shiprocket

Shipped, in transit, out for delivery, delivered, delivery failed and
return-started messages. Integrations → Shiprocket. Code:
`src/lib/shiprocket/`, migration `072_shiprocket_calcom.sql`.

| Keys | |
|---|---|
| **Customer** | In Shiprocket → Settings → API → Webhooks, paste the URL (path `shipping-updates`, because Shiprocket rejects `sr` / `kr` in URLs) and the token (sent in `x-api-key`). Shiprocket sends no phone number, so the order must also come from a connected Shopify or WooCommerce store. |
| **Server** | None. |

### Cal.com

Booking confirmed, rescheduled, cancelled, and reminders 24 h and 1 h
before. Integrations → Cal.com. Code: `src/lib/calcom/`, migration
`072_shiprocket_calcom.sql`.

| Keys | |
|---|---|
| **Customer** | Cal.com → Settings → Developer → Webhooks: paste the URL and secret, tick `BOOKING_CREATED`, `BOOKING_RESCHEDULED`, `BOOKING_CANCELLED`; we verify `X-Cal-Signature-256` (HMAC-SHA256). Add a "Phone number" question to the event type. |
| **Server** | None. |

### Inbound webhooks and team alerts

**Inbound webhooks** (Integrations → Webhooks & alerts): a per-account
URL `POST /api/hooks/in/<token>` creates / updates a contact, adds tags,
adds a note and can send an approved template. This is how Zapier, Make,
n8n, Google Forms and Typeform connect today, without a native app.
**Team alerts** post to Slack, Discord or Telegram. Code:
`src/lib/inbound-hooks/`, `src/lib/alerts/`, migration
`071_inbound_hooks_alerts.sql`. Keys: customer-supplied only (Slack /
Discord webhook URL, Telegram bot token + chat id), stored encrypted.

### Google Sheets

Connect a Google account (Integrations → Google Sheets). Code:
`src/lib/google-sheets/`, migration `059_google_sheets.sql`. Server keys:
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

---

## 🛒 E-commerce (planned)

### WooCommerce — now live (see above)
Same messages as Shopify (order placed / COD / shipped / delivered /
cancelled / abandoned cart*).

- **Customer keys:** a webhook **secret** for each webhook created in
  WooCommerce → Settings → Advanced → Webhooks (we verify
  `X-WC-Webhook-Signature`, base64 HMAC-SHA256). For writing back (e.g.
  marking COD orders confirmed): REST API **consumer key + secret**
  (`ck_…` / `cs_…`) from Settings → Advanced → REST API.
- **Server keys:** none.
- \*Abandoned carts aren't in core WooCommerce — needs a cart plugin's
  webhook, or a small Repeat Grow WordPress plugin.

### Wix
Order confirmations and shipping updates for Wix Stores; bookings for
Wix Bookings.

- **Easy route (no app):** Wix Automations → "Send HTTP request" to a
  Repeat Grow URL with a per-account token. **Keys:** none.
- **App route:** a Wix app (Wix Dev Center). **Server keys:**
  `WIX_APP_ID`, `WIX_APP_SECRET`, `WIX_WEBHOOK_PUBLIC_KEY` (Wix signs
  webhooks as JWTs).

### Dukaan
Order and delivery updates.

- **Keys:** to confirm — check whether Dukaan offers webhooks / a
  public API on the merchant's plan. If not, connect through Pabbly
  Connect / Zapier (see "Connect" below).

### BigCommerce
Order placed / shipped / cancelled, abandoned cart.

- **Customer keys (simple):** a store API account → **store hash** +
  **access token** (Settings → API → Store-level API accounts, scopes:
  Orders read-only, Information read-only). We register webhooks with it.
  BigCommerce webhooks aren't signed, so we add a secret custom header.
- **Server keys (app route):** `BIGCOMMERCE_CLIENT_ID`,
  `BIGCOMMERCE_CLIENT_SECRET` from the BigCommerce Developer Portal.

---

## 💳 Payments (planned)

### Razorpay — payment links are live (see above); our own billing is not
Payment links inside WhatsApp, "payment received" receipts,
failed-payment and unpaid-link reminders. Also needed for **our own
billing** (TODO #1).

- **Customer keys:** **Key ID** + **Key Secret** (Dashboard → Account &
  Settings → API Keys) to create payment links; a **webhook secret**
  (Dashboard → Webhooks; we verify `X-Razorpay-Signature`, hex
  HMAC-SHA256) for paid / failed / expired events.
- **Server keys (our billing):** `RAZORPAY_KEY_ID`,
  `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.

### Cashfree
Same as Razorpay: payment links, receipts, failed-payment reminders.

- **Customer keys:** **App ID** + **Secret Key** (Cashfree Dashboard →
  Developers → API Keys; sent as `x-client-id` / `x-client-secret`). The
  secret key also verifies webhooks (`x-webhook-signature`,
  base64 HMAC-SHA256 of timestamp + body).
- **Server keys:** none (unless we bill through Cashfree:
  `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`).

---

## 📝 Forms → leads (planned)

New form submission → create/update the contact (tags, custom fields),
send a WhatsApp welcome/confirmation, optionally create a deal.

### Google Forms
- Google Forms has no webhooks. We give a copy-paste **Apps Script**
  (Extensions → Apps Script, `onFormSubmit` trigger) that posts each
  response to a Repeat Grow URL.
- **Keys:** none — the URL carries a per-account token we generate.

### Typeform
- **Customer keys:** a webhook **secret** set on the form's webhook
  (Connect → Webhooks; we verify `Typeform-Signature`, `sha256=` base64
  HMAC). Or one-click via OAuth with **server keys**
  `TYPEFORM_CLIENT_ID`, `TYPEFORM_CLIENT_SECRET`.

### Tally
- **Customer keys:** the webhook **signing secret** set on the form
  (Integrations → Webhooks; we verify `Tally-Signature`, base64
  HMAC-SHA256).
- **Server keys:** none.

---

## 📅 Bookings & meetings (planned)

Booking confirmed → WhatsApp confirmation; reminders 24 h and 1 h
before (cron) to cut no-shows; reschedule/cancel notices.

Calendly is live — see the top of this file. Cal.com (free webhooks)
is a cheap follow-up on the same engine.

### Google Calendar
- **Server keys:** a Google OAuth client from Google Cloud Console →
  APIs & Services → Credentials: `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`. Enable the Google Calendar API; scope
  `calendar.events.readonly` (or `calendar.events` to create events).
  Calendar scopes are "sensitive" — Google app verification is needed
  before public launch. Changes arrive via push channels (`events.watch`)
  or polling.
- **Customer keys:** none (they click "Connect Google Calendar").

### Zoom
Auto-send the meeting link for demos and online classes; reminders.

- **Server keys:** a Zoom **General (OAuth) app** from the Zoom App
  Marketplace: `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, plus the app's
  webhook **Secret Token** `ZOOM_WEBHOOK_SECRET_TOKEN` (verifies
  `x-zm-signature` and the URL-validation challenge).
- **Customer keys:** none (they click "Connect Zoom").

### Google Meet
- Meet links are created through the **Google Calendar API**
  (`conferenceData` / `hangoutsMeet` on an event), so it uses the same
  `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` with scope
  `calendar.events`.

---

## 🔗 Connect to thousands of apps (planned)

### Zapier, Make, Pabbly Connect
One integration that reaches thousands of apps. Built on what already
exists: the public REST API (`/api/v1`) and signed outbound webhooks.

- **Customer keys:** their Repeat Grow **API key** (Settings → API keys).
- **Server keys:** none. We publish a Repeat Grow app on each platform
  (Zapier Developer Platform, Make custom app, Pabbly Connect app) with
  triggers (new message, new contact, conversation created) and actions
  (send message, send template, create/update contact).

### Google Sheets (native import / export: not built; the connection is live, see above)
- **Export:** add each new contact / lead / order as a row; **import:**
  send a template to every row (mini broadcast).
- **Server keys:** same Google OAuth client (`GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`) with the Google Sheets API enabled; scope
  `spreadsheets` (sensitive → Google verification), or `drive.file` to
  touch only sheets the user picks (non-sensitive, easier to approve).
- **No-code alternative:** via Zapier / Make / Pabbly above.

---

## Server keys at a glance

| Env variable | For | Status |
|---|---|---|
| `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET` | Shopify one-click connect | Optional now (webhook option works without) |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Our own billing | Needed for TODO #1 |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Sheets (live); Calendar, Meet (planned) | Optional |
| `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_WEBHOOK_SECRET_TOKEN` | Zoom | Planned |
| `CALENDLY_CLIENT_ID`, `CALENDLY_CLIENT_SECRET` | Calendly one-click OAuth (not built; the live token version needs none) | Optional |
| `TYPEFORM_CLIENT_ID`, `TYPEFORM_CLIENT_SECRET` | Typeform one-click | Optional |
| `WIX_APP_ID`, `WIX_APP_SECRET`, `WIX_WEBHOOK_PUBLIC_KEY` | Wix app route | Optional |
| `BIGCOMMERCE_CLIENT_ID`, `BIGCOMMERCE_CLIENT_SECRET` | BigCommerce app route | Optional |

## Suggested order

1. **Razorpay for our own billing** (customer payment links ✅ done)
2. ~~WooCommerce~~ ✅ done (reuses the Shopify engine: events → templates)
3. **Google Calendar** reminders (Calendly ✅ and Cal.com ✅ done — same engine)
4. **Zapier / Make / Pabbly** apps (covers Dukaan, Wix, forms, Sheets
   for everyone else)
5. Typeform / Tally / Google Forms, Zoom / Meet, Cashfree, Wix,
   BigCommerce, Google Sheets native
