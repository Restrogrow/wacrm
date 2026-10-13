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
| Connect Shopify (one click) | **Server:** `SHOPIFY_API_KEY` (Client ID), `SHOPIFY_API_SECRET` (Client secret) from an app in the [Shopify Dev Dashboard](https://dev.shopify.com). App settings: redirect URL `https://repeatgrow.com/api/integrations/shopify/callback`, scopes `read_orders,read_fulfillments`, protected customer data (name, phone, email, address), compliance webhooks → `https://repeatgrow.com/api/integrations/shopify/webhooks`. App Store review needed before any store outside our org can use it. |

---

## 🛒 E-commerce (planned)

### WooCommerce
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

### Razorpay
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

### Calendly
- **Customer keys:** a **Personal Access Token** (Integrations → API &
  Webhooks). Webhooks need a paid Calendly plan (Standard or higher).
  We create the webhook with a **signing key** and verify
  `Calendly-Webhook-Signature`.
- **Server keys (one-click OAuth instead):** `CALENDLY_CLIENT_ID`,
  `CALENDLY_CLIENT_SECRET`, `CALENDLY_WEBHOOK_SIGNING_KEY`.

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

### Google Sheets
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
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Calendar, Meet, Sheets | Planned |
| `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_WEBHOOK_SECRET_TOKEN` | Zoom | Planned |
| `CALENDLY_CLIENT_ID`, `CALENDLY_CLIENT_SECRET`, `CALENDLY_WEBHOOK_SIGNING_KEY` | Calendly one-click | Optional (token route needs none) |
| `TYPEFORM_CLIENT_ID`, `TYPEFORM_CLIENT_SECRET` | Typeform one-click | Optional |
| `WIX_APP_ID`, `WIX_APP_SECRET`, `WIX_WEBHOOK_PUBLIC_KEY` | Wix app route | Optional |
| `BIGCOMMERCE_CLIENT_ID`, `BIGCOMMERCE_CLIENT_SECRET` | BigCommerce app route | Optional |

## Suggested order

1. **Razorpay** (customer payment links + our own billing)
2. **WooCommerce** (reuses the Shopify engine: events → templates)
3. **Calendly + Google Calendar** reminders (no-shows)
4. **Zapier / Make / Pabbly** apps (covers Dukaan, Wix, forms, Sheets
   for everyone else)
5. Typeform / Tally / Google Forms, Zoom / Meet, Cashfree, Wix,
   BigCommerce, Google Sheets native
