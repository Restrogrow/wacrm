# Feature guide

Where each newer feature lives in the app, how to set it up, which role can use it, and what its limits are.
Roles are **owner > admin > agent > viewer**. "Agent+" means agent, admin or owner.

Everything here was verified by tests and a production build, but most of it has not yet been exercised against the
live services (Meta, WooCommerce, Razorpay, Shiprocket, Cal.com, Slack, Gemini). If something misbehaves, check
`/admin/system` and the browser console first.

Related: [README](../README.md) · [Admin handbook](./ADMIN.md) · [Operations runbook](./OPERATIONS.md) ·
[Integrations plan](./INTEGRATIONS.md)

**Contents:** [Catalog](#catalog) · [Reports](#reports) · [Ad attribution](#ad-attribution) ·
[WooCommerce](#woocommerce) · [Razorpay payment links](#razorpay-payment-links) · [Shiprocket](#shiprocket) ·
[Cal.com](#calcom) · [Inbound webhooks and team alerts](#inbound-webhooks-and-team-alerts) ·
[Website chat widget](#website-chat-widget) · [Short links](#short-links) · [Business hours and SLA](#business-hours-and-sla) ·
[Notes, @mentions and bulk actions](#notes-mentions-and-bulk-actions) · [Segments and merge](#segments-and-merge) ·
[Scheduled messages](#scheduled-messages) · [CSAT](#csat-satisfaction-surveys) · [Journeys](#journeys) ·
[AI suggestions and lead score](#ai-suggestions-and-lead-score) · [Activity log](#activity-log) ·
[Blog admin](#blog-admin) · [Security report](#security-report) · [Demo login](#demo-login)

---

## Catalog

- **Where:** sidebar → CRM → **Catalog** (`/catalog`). In a chat, the bag button next to the composer is the product picker.
- **Who:** agent+ can add, edit and sync; viewers can look.
- **What it does:** a product library (photo, price, sale price, stock, availability, category, brand, link), CSV import and
  export (Shopify and WooCommerce export files are understood; up to 2,000 rows), bulk archive / activate / delete, a
  **Sync to WhatsApp** button, a **Fetch from WhatsApp** button, **Sync from store** (Shopify, WooCommerce), saved
  **collections** (named product lists), and stock-aware catalog orders.
- **Product limits by plan:** 500 on trial, expired and Starter; 2,000 on Growth; 10,000 on Pro; no cap on Enterprise.

### Setting it up with Meta

1. **Create the catalog** in Meta Commerce Manager (business.facebook.com/commerce → Add catalog → E-commerce). It can
   start empty.
2. **Connect it to your WhatsApp number** in WhatsApp Manager (the account's catalog settings), and turn on **Show
   catalog** and **Cart** so customers can browse and send carts.
3. **Copy the catalog ID** (Commerce Manager → catalog Settings, or Business Settings → Data sources → Catalogs).
4. **Paste it** in **Settings → Orders & payments** (field _WhatsApp catalog ID_) and save.
5. **Give the token permission.** Pushing and fetching products needs a token with `catalog_management`. In Business
   Settings → System users, give the system user **Manage catalog** on the catalog, generate a token with
   `catalog_management` plus `whatsapp_business_management` and `whatsapp_business_messaging`, and save it in Settings →
   WhatsApp. Without it the app says "Your WhatsApp access token needs catalog_management permission." Sharing the
   catalog and receiving catalog orders in chat work without this step.

Meta's menus change, so the exact names may differ slightly.

### Using it

- **Sync to WhatsApp** pushes active products (it also runs automatically after a create / edit / archive / import and
  removes archived or draft items from Meta). Products need a photo; others are marked _skipped_ with a reason. Up to
  500 products per click.
- **Fetch from WhatsApp** reads the products already in your Meta catalog and adds the ones not in the library yet
  (up to 2,000, and your plan's cap). It never overwrites products you already have. Meta does not send stock counts,
  only in stock / out of stock.
- **Sync from store:** Shopify uses the Admin API if the store is OAuth-connected, otherwise the public product feed
  (no stock counts; reading stock needs the `read_products` scope on the Shopify app). WooCommerce needs the optional
  REST API keys on its integration page. Each variant becomes one product. Products deleted in the store are not
  removed.
- **In a chat:** the bag button shares one product, a multi-product list (1–30 products) or a collection, or starts an
  order request.
- **Stock:** when a catalog order arrives, items are matched by SKU and an out-of-stock or short item adds a warning to
  the order summary (the order is still saved as placed). Stock is reduced when an order becomes **paid**, restored on
  cancel / refund, and owners and admins are notified at 5 or fewer units.
- **Known limits:** no variant groups (each size / colour is a product); the SKU can't be changed after creation; prices
  are entered in rupees; the order route does not itself block out-of-stock items (the picker does).
- **Migrations:** 076, 077.

## Reports

- **Where:** sidebar → **Reports** (`/reports`). **Who:** everyone, including viewers.
- **What:** messaging volume and delivery rates, conversations and first-response / resolution times, an agent table,
  broadcast results, deals and orders, and customer satisfaction. Date presets (7 / 30 / 90 days) or a custom range up
  to 365 days; every table has an **Export CSV** button (spreadsheet-formula safe).
- **Accuracy:** volume, new conversations, first response (to the first human reply; bot replies excluded), deal
  creation and broadcast counts are exact. Delivery rates, closed dates, resolution time and won / lost dates are
  approximations because the database keeps only the latest status. Agent numbers are credited to the conversation's
  current assignee, and messages sent before 17 Oct 2026 have no sender recorded.
- **Migration:** 065.

## Ad attribution

- **Where:** automatic. A badge ("Ad: <headline>") appears in the inbox header, contact panel and contact page; the
  dashboard has a **Lead sources** card (last 30 days).
- **What:** when a customer starts a chat from a Click-to-WhatsApp ad (or a post's Send message button), Meta adds a
  `referral` to their first message. The first touch is stored on the contact and the contact is tagged **Ad lead**.
  Automations can test the contact field `ad_source_type = ad`.
- **Setup:** the Meta app must deliver the `messages` webhook field (it carries `referral`).
- **Limits:** contacts who wrote before 17 Oct 2026 have no source; the click id (`ad_ctwa_clid`) is stored but no
  conversion events are sent back to Meta; Facebook Lead Ads are not supported.
- **Migration:** 062.

## WooCommerce

- **Where:** sidebar → Integrations → **WooCommerce**. **Who:** admin+.
- **Setup:** click **Get webhook URL and secret**; in WordPress go to WooCommerce → Settings → Advanced → Webhooks and
  add two webhooks, `order.created` and `order.updated` (status Active, REST API v3, that URL and secret). Create
  Utility templates, choose one per event (order placed, COD order placed, completed, cancelled, refunded), save, and
  use **Send test**.
- **Behaviour:** signature `X-WC-Webhook-Signature` is verified; replays are ignored; the customer is matched by the
  billing phone (then shipping phone); each message goes out at most once per order. Pending / failed checkouts send
  nothing.
- **Limits:** one store per account; no abandoned-cart message (WooCommerce has none); only the "completed" status
  covers shipping; custom statuses are not mapped. The order link assumes the standard `/checkout/order-received/` path.
- **Optional REST keys:** a card on the same page stores a consumer key / secret (encrypted) used only to sync products.
- **Migrations:** 063, 077.

## Razorpay payment links

- **Where:** Settings → **Orders & payments** → Razorpay card (connect); in a chat, the link icon in the chat header → **Request payment**.
- **Who:** admins connect; agent+ can request payments.
- **Setup:** Razorpay Dashboard → Account & Settings → API Keys → generate a key; paste the key id and secret in the
  card and **Connect** (it is tested with a read-only call). The app then shows a webhook URL and secret **once**: in
  Razorpay → Webhooks add them and tick `payment_link.paid`, `payment_link.expired`, `payment_link.cancelled`,
  `payment.failed`.
- **Behaviour:** the link (₹1 to ₹5,00,000, expires in 7 days) is sent in the chat; a paid link marks the payment and
  the linked order paid and sends a confirmation. If the WhatsApp send fails, the Razorpay link is cancelled.
- **Limits:** the confirmation is plain text, so it is skipped when the customer's 24-hour window is closed; the
  `payment.failed` match depends on Razorpay copying the link's notes onto the payment. This is for your customers'
  payments; Repeat Grow's own plan billing is still manual.
- **Migration:** 064.

## Shiprocket

- **Where:** sidebar → Integrations → **Shiprocket**. **Who:** admin+.
- **Setup:** click **Get webhook URL and token**; in Shiprocket → Settings → API → Webhooks paste the URL and the token
  (sent in `x-api-key`) and switch it on. Pick an approved template per event (shipped, in transit, out for delivery,
  delivered, delivery failed, return started). Shiprocket sends no phone number, so the order must also come from a
  connected Shopify or WooCommerce store (matched by order number).
- **Behaviour:** each message goes out once per shipment; partial-delivered, RTO-delivered, cancelled and lost send
  nothing; customer return shipments are ignored.
- **Limits:** only the statuses we know are mapped; field names follow Shiprocket's documented format but were not
  checked against live deliveries.
- **Migration:** 072.

## Cal.com

- **Where:** sidebar → Integrations → **Cal.com**. **Who:** admin+.
- **Setup:** click **Get webhook URL and secret** (change the Cal.com address first if you self-host); in Cal.com →
  Settings → Developer → Webhooks add the URL and secret with `BOOKING_CREATED`, `BOOKING_RESCHEDULED`,
  `BOOKING_CANCELLED`. Add a **Phone number** question to the event type (or set its name in the "Phone question
  name" box). Choose templates per event.
- **Behaviour:** signature `X-Cal-Signature-256` is verified; a reschedule marks the old booking cancelled; 24 h and
  1 h reminders run from the cron and skip bookings made too close to the start.
- **Limits:** reminders send only while a template can be sent, with no retry; no no-show message.
- **Migration:** 072.

## Inbound webhooks and team alerts

- **Where:** sidebar → Integrations → **Webhooks & alerts**. **Who:** admin+.
- **Inbound webhooks:** create a named hook and **copy its URL immediately** (it is shown once; only a hash is
  stored; **New URL** replaces it). Call it with `POST` and JSON (or form fields):
  `phone` (required), and optional `name`, `email`, `company`, `tags`, `custom_fields`, `note`,
  `message_template {name, language, params[]}`. In Zapier or Make use a "Webhooks → POST" step with those fields. The
  page shows a copy-paste `curl`.
  - Existing contacts only get blank name / email / company filled; tags are added, never removed; custom fields are
    filled only if a field with that exact name exists.
  - Sending a template is **off by default per hook**; opted-out contacts are skipped; the plan / trial rules apply.
  - Limits: 64 KB per request, 120 requests a minute per hook (30 template sends a minute), up to 10 hooks per
    account. Wrong tokens all return the same 404 and repeated bad tokens get your IP blocked.
- **Team alerts:** add up to 5 channels: a Slack or Discord webhook URL, or a Telegram bot token + chat id (stored
  encrypted, never shown again), tick the events (new conversation, reply overdue, ad lead, payment received, order
  placed) and press **Send test**. Only `hooks.slack.com`, `discord.com` and `api.telegram.org` are allowed.
  Failed alerts are not retried.
- **Migration:** 071.

## Website chat widget

- **Where:** Settings → **Website chat widget**. **Who:** admin+ to configure.
- **Setup:** choose position, colour, label, greeting, pre-filled message, which WhatsApp number to show, and
  optionally "ask their name first" and different text outside business hours. Check the live preview, then copy the
  one-line `<script src="https://repeatgrow.com/widget/<id>.js" async>` into your website.
- **Stats:** impressions, clicks and click-through rate for 30 days (no personal data or IP addresses stored).
- **Limits:** one widget and one number per account; changes can take a minute to appear; the widget's own fixed text is
  English only; it is not tied to plan status (it keeps showing after a trial ends).
- **Migration:** 073.

## Short links

- **Where:** Settings → **Short links**; in the inbox composer, the link button inserts one.
- **What:** create `repeatgrow.com/l/<code>` links (optional custom code and UTM tags) that redirect to a public web
  address, with total clicks, a 30-day chart, device types and top referrers, plus a QR code download. Bots and link
  previews are not counted. Up to 200 links per account.
- **Safety:** only http(s) addresses on the public internet; no `javascript:` / `data:`, no localhost or private IPs,
  and a link's target can't be edited after creation (so a printed QR can't be silently repointed).
- **Migration:** 073.

## Business hours and SLA

- **Where:** Settings → **Business hours**. **Who:** admin+ to change; everyone sees the SLA badge.
- **Setup:** set the weekly hours per day, the time zone (default Asia/Kolkata) and holidays; turn on the **welcome
  message** (first message of a new chat) and the **away message** (messages outside hours, at most once per cooldown,
  default 12 hours); set the **first-response target** (minutes) and, if you like, count only business-hours minutes.
  `{{name}}` is filled with the customer's first name.
- **Behaviour:** auto-replies are plain text inside the 24-hour window and are stored as `bot` messages (they never
  count as a human reply); they are skipped for opted-out contacts, expired plans, reactions and chats handled by a
  flow or STOP. If the customer waits past the target with no human reply, the assigned agent (or all admins if
  unassigned) gets one in-app notification and the chat shows an **SLA breached** badge. Alerts clear within about a
  minute of a reply.
- **Limits:** an auto-reply and an AI chatbot reply can both reach the same customer; SLA alerts are in-app only (no
  email or push); each cron run handles up to 200 accounts and 100 chats per account.
- **Migration:** 066.

## Notes, @mentions and bulk actions

- **Where:** the inbox composer (toggle **Reply | Internal note**) and the conversation list (**Select** mode).
- **Who:** agent+ to write notes and run bulk actions; viewers can read notes.
- **Notes:** visible only to your team, never sent to WhatsApp, never counted as an agent reply in Reports or SLA,
  never change the last-message preview or unread counts. Type `@` to mention a teammate; they get an in-app
  notification. Notes can be deleted by their author or an admin, not edited.
- **Bulk actions:** select up to 100 conversations → assign to an agent, change status / close, add a tag (applied to
  the contact), or mark read. Every id is checked against your account; an expired plan returns 402.
- **Sender:** messages now record which agent sent them; the thread shows the name on teams with more than one member.
- **Limits:** mention notifications can't be switched off per person yet; bulk tagging can't remove tags.
- **Migration:** 067.

## Segments and merge

- **Where:** Contacts page → the segments bar (saved lists with live counts), **Find duplicates**, and
  **Merge 2 selected** when exactly two contacts are ticked. Broadcasts → choose **Saved Segment** as the audience.
- **Who:** agent+ can create segments and merge.
- **Segments:** match **all** or **any** of up to 20 conditions on tags, name / phone / email / company, date added, ad
  source, opted out, has an open conversation, and custom fields. Opted-out contacts are dropped when a broadcast
  resolves a segment.
- **Duplicates and merge:** the finder groups contacts with the same email or the same last 10 phone digits. Merge shows
  a preview, then moves conversations, messages, deals, tags, notes, orders and other related rows to the primary
  contact (the primary's values win unless blank), keeps the earliest opt-out and creation date, and deletes the other
  contact, in one transaction. It is permanent.
- **Limits:** merging more than two at once and nested AND / OR groups are not supported; very large accounts can be
  slow because membership is re-evaluated on each page; a segment and the tag filter don't combine.
- **Migration:** 068.

## Scheduled messages

- **Where:** the clock button next to Send in the composer; a chat's pending scheduled messages are listed with Cancel.
- **Who:** agent+.
- **What:** text only, from 1 minute to 30 days ahead, up to 20 pending per chat, in your browser's time zone. You get a
  warning if the 24-hour window will probably be closed by then. The cron sends it as you, only if the customer hasn't
  opted out, the plan can send and the window is open; otherwise it is marked failed with a plain reason shown for 24
  hours. Rows stuck "sending" for 10 minutes are marked failed, not retried.
- **Limits:** no media or templates yet.
- **Migration:** 069.

## CSAT (satisfaction surveys)

- **Where:** Settings (CSAT card, admins) to turn on and edit the wording; the rating shows as a badge in the chat
  header; results are in **Reports → Customer satisfaction**.
- **What:** when a chat is closed (by an agent or an automation), the customer gets three buttons: Great, Okay, Bad. The
  first answer is saved, a thank-you follows, and later taps are ignored. One survey per conversation.
- **Limits:** only when the 24-hour window is open and the plan can send; Meta allows three buttons, so the scale is
  3-level, not 1–5; the badge doesn't update live; per-agent CSAT uses whoever was assigned at close time.
- **Migration:** 069.

## Journeys

- **Where:** sidebar → Automate & engage → **Journeys**. **Who:** agent+ create and edit; admins change the account-wide
  sending rules.
- **Types:** **date-based** (birthday, anniversary, renewal: read a contact date field or the date added, N days
  before / after, at a set time, yearly or once; a Feb 29 birthday goes out on Feb 28 in other years), **drip**
  (up to 10 messages with a delay before each; join by tag, segment or by hand; leave when they reply, get an exit
  tag or opt out) and **win-back** (contacts silent for N days, at most once per M days, cancelled if they write
  first).
- **Safety:** quiet hours (default 21:00–09:00 account time zone; messages wait, not dropped), one journey message per
  contact per 24 hours across journeys, per-journey and per-account daily caps, a monthly cap by plan, only **approved
  templates** outside the 24-hour window, opted-out contacts never receive anything, expired plans send nothing. A
  **Preview audience** button counts without sending. Switching a journey on checks the plan, the WhatsApp connection
  and that every template is approved. Messages are stored as `bot`.
- **Limits:** a send that fails is not retried; "replied" means any message within 7 days; editing a running sequence
  can shift contacts mid-way; a date journey switched on after its send time starts the next day.
- **Migration:** 075 (segment sequences also need 068).

## AI suggestions and lead score

- **Where:** the sparkle button in the composer (**Suggest reply**) and a badge on chats (intent, sentiment, 0–100 lead
  score). Translate, voice-note AI and the chat summary already existed.
- **Who:** agent+.
- **Behaviour:** Suggest reply drafts three short options from the last 15 messages in the customer's language and
  never sends anything. Lead scoring runs from the cron for open / pending chats active in the last 48 hours, a few
  per run, and on demand. Card numbers, OTPs, CVV / PIN, passwords, API keys and Aadhaar-style numbers are removed
  before text goes to the model, and customer text is treated as data, not instructions.
- **Daily caps per account** (suggest / lead scoring / summary): trial 40 / 40 / 20, Starter 100 / 100 / 50, Growth
  500 / 500 / 200, Pro 1,500 / 1,500 / 500, Enterprise 5,000 / 5,000 / 2,000, expired 0; resets at midnight IST.
- **AI chatbot replies** (automatic answers to customers) have their own daily cap: trial 200, Starter 1,000, Growth
  5,000, Pro 15,000, Enterprise 50,000, plus a cap per chat per hour. Over the cap the bot stays quiet and the chat
  waits in the inbox. The chatbot also removes card numbers, OTPs and passwords before the chat goes to Gemini.
- **Timeouts:** every AI request gives up after 60 seconds (3 minutes for voice notes and call recordings) and shows
  "AI took too long to answer. Try again."
- **Needs** `GEMINI_KEY`. Without it the buttons say "AI is not set up for this workspace yet" and nothing else breaks.
- **Limits:** no auto-suggest on every inbound message; scores aren't yet usable as segment or automation fields; the
  badge can lag about a minute.
- **Migration:** 074.

## Activity log

- **Where:** Settings → **Activity log**. **Who:** owners and admins.
- **What:** an append-only record (no one can edit or delete rows) of team role changes and removals, invites, API key
  creation / revocation, WhatsApp configuration changes, integration connects / disconnects (Shopify, WooCommerce,
  Razorpay, Calendly, Google Sheets), ownership transfer, account deletion requests, platform-admin plan edits and
  bulk contact deletes. Filter by action and date, page through, **Export CSV**. Secrets are redacted before storing.
- **Limits:** some disconnect actions are logged without an IP; rows are never pruned; contact merge is not logged yet;
  bulk contact deletes are reported by the browser (flagged as such).
- **Migration:** 070.

## Blog admin

- **Where:** `/admin/blog` (platform admins only). Public pages: `/blog` and `/blog/<slug>`.
- **What:** a markdown editor with toolbar and live preview, image upload (PNG / JPG / WebP / GIF up to 5 MB, to the
  public `blog-media` bucket) or pasted image links, an SEO panel (focus keyword, SEO title, meta description,
  Google preview and a checklist score), FAQ (also emitted as FAQ structured data), category, tags, author, canonical
  URL and noindex, a **featured** flag, and draft / publish / **schedule** (a future publish date keeps it hidden until
  then, with no cron needed). Posts appear on `/blog`, in the sitemap and related-posts lists.
- **Notes:** a slug can't reuse a hand-coded post's slug; the public pages refresh about once a minute; hand-coded posts
  are still edited in code (`src/lib/blog.ts`). Run migration `060` first.
- **Migration:** 060.

## Security report

- **Where:** `/admin/security` (platform admins only).
- **What:** the 2026-10-17 audit findings with status (fixed in code / needs the owner / planned / OK), the owner's next
  steps, and a six-layer playbook for preventing fraud, scams and fake trials. Edit the content in
  `src/lib/security-report.ts`.
- **Related protection that is live:** the sign-up abuse guard (disposable emails and one trial per real mailbox,
  migration 061), proxy-set client IPs for rate limits, a CSRF origin check, the audit log and generic API errors.
  Captcha is **not** on yet (see [ADMIN.md](./ADMIN.md)).

## Demo login

- **Where:** `/login`: type `demo` in both boxes.
- **How it works:** the page calls `POST /api/demo-login`, which signs in with the server variables
  `DEMO_LOGIN_EMAIL` / `DEMO_LOGIN_PASSWORD`. Today these should point to the demo workspace **admin**, which holds
  only sample data (12 contacts, 7 chats, 9 deals, broadcasts, automations). It is rate limited (20 per hour per IP)
  and returns 404 / "not enabled" when the variables are unset.
- **What it can't do:** change members, invitations, API keys, ownership, billing or delete the account; set up
  WhatsApp; send messages, broadcasts, calls, forms or reactions; change integrations, payment links or short links.
  These return 403 "This is turned off in the demo" (`src/lib/auth/demo-guard.ts`, checked in `src/proxy.ts`).
- **Risks:** anyone can use it; the visitor can still change demo data and use the AI features (capped daily), but
  cannot see other accounts or use `/admin`. Keep real data out of the demo workspace, and change the account's
  password to switch the public login off. For a read-only demo, point the variables at the demo viewer.
