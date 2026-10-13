# Changelog

User-visible changes in `wacrm`. Self-hosters: when pulling an update,
check this file for any **migration required** notes and apply the
matching SQL files from `supabase/migrations/` against your Supabase
project before restarting the app.

Versions follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Pre-1.0, `MINOR` bumps cover new modules; `PATCH` bumps cover bug fixes
and polish.

## [Unreleased]

### Added

- **Carousel templates.** Build Marketing templates with 2–10 swipeable
  cards — image or video, short text and up to two buttons each — in
  Settings → Templates (Template type → Carousel), and send them in
  broadcasts, the inbox and automations. **Migration required:**
  `supabase/migrations/051_carousel_templates.sql`.

- **Trial and renewal reminder emails.** Owners are emailed 2 days before
  the free trial ends, on its last day and when it ends, and 3 days
  before a paid plan's paid-until date and when it passes — with plans,
  prices and how to pay. Sent during the day in India time, once per
  stage. **Migration required:**
  `supabase/migrations/050_billing_reminders.sql`.

- **WhatsApp number health.** Settings → WhatsApp shows the number's
  quality rating, messaging limit, send status, display name and calling
  eligibility in plain words, with Check now. Checked daily; owners get
  an email and an in-app warning when quality drops or Meta limits the
  number, and /admin shows each account's health. **Migration
  required:** `supabase/migrations/049_whatsapp_number_health.sql`.

- **WhatsApp voice calls in the browser.** Customers call your WhatsApp
  number and every agent's browser rings — answer, mute and hang up
  without a phone. Call customers from the chat header (sends a call
  permission request when needed). Recent calls show in the contact
  panel. Turn it on in Settings → WhatsApp. **Migration required:**
  `supabase/migrations/048_whatsapp_calls.sql`; subscribe the `calls`
  webhook field in the Meta App Dashboard. If Meta won't enable calling
  on the number yet, the settings card keeps the switch and explains
  why (messaging limit, Cloud API-only number, webhook).

- **Download my data and delete my account** (Settings → Your data), for
  India's DPDP Act and GDPR. Everyone can download their data as JSON
  (owners and admins also get the business's data; secrets are never
  included) and request account deletion by typing their email.
  **Deletion only happens after a platform admin approves the request on
  /admin** (approve / reject with a note; the user is emailed and can
  cancel while it's pending). A teammate's deletion keeps the business's
  data; an owner's deletion deletes the business once no teammates
  remain. Privacy Policy updated. **Migrations required:**
  `supabase/migrations/046_account_deletion.sql` and
  `supabase/migrations/047_account_deletion_requests.sql`. Optional env:
  `ADMIN_ALERT_EMAIL` (who gets request emails).

- **System health and monitoring.** `GET /api/health` for uptime
  monitors (503 when the database or the cron jobs stop working), and
  `/admin/system` showing every background job's last run and error and
  recent failed WhatsApp / Shopify / Calendly webhooks. Errors from jobs
  and webhooks are tagged in Sentry. **Migration required:**
  `supabase/migrations/045_monitoring_and_indexes.sql`.
- **Pagination.** The inbox loads 50 conversations at a time ("Load older
  conversations"), message threads load the latest 50 messages ("Load
  earlier messages") and the broadcasts list pages by 25. Opening a link
  to an older conversation still works.
- **Faster queries.** New indexes for the inbox, message threads,
  contacts and broadcasts lists, and trigram indexes for contact search
  (migration 045).
- **End-to-end tests** with Playwright, run in CI.

- **Blog redesign and two new articles.** `/blog` now has a featured post
  and cards with cover images, categories, dates and reading times.
  New guides: Shopify WhatsApp order notifications and WhatsApp
  appointment reminders. Every post has a cover, table of contents, FAQ,
  related posts, a per-post social image and Article/FAQ structured data.

- **Saved replies.** Type "/" in the inbox message box to pick a saved
  reply (arrow keys + Enter); {{name}}, {{full_name}} and {{agent}} are
  filled in. Admins manage them in Settings → Saved replies.
  **Migration required:** `supabase/migrations/042_saved_replies.sql`.
- **Scheduled broadcasts.** "Schedule for later" in the broadcast
  wizard; the server sends at that time in batches (no open browser
  needed), skipping opted-out contacts and respecting the plan. Cancel
  from the broadcast page (back to a draft). **Migration required:**
  `supabase/migrations/043_scheduled_broadcasts.sql`.
- **Contact export.** Export on the Contacts page downloads a CSV of
  every contact with tags and custom fields (spreadsheet-formula safe).
- **Daily summary email** (Settings → Daily summary). Owners choose
  on/off, the hour (IST) and up to 5 recipients; morning emails cover
  yesterday, afternoon/evening ones today so far. Includes messages
  received/sent, new conversations and contacts, chats waiting,
  broadcasts, deals created/won and opt-outs; "Send a test now".
  **Migration required:** `supabase/migrations/044_daily_summary.sql`.
  Env: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
- **Sentry error monitoring**, off until `NEXT_PUBLIC_SENTRY_DSN` is set.

- **Admin dashboard** (`/admin`). Sign-ups today, last 7 and 30 days
  (with change vs the previous period) and a 30-day daily chart in India
  time; WhatsApp-connected, active-in-7-days, messages today and
  logged-in-today counts; paying / trial / trial-ended accounts;
  Shopify and Calendly connections; an activation funnel; breakdowns by
  plan, sign-up method, nature of business and team size; and an
  accounts table with search (business, owner, email, phone), filters
  (plan, WhatsApp, sign-up method) and sorting (newest, recently active,
  most members), showing last chat and last login per account.

- **Plans, free trial and plan limits** (Settings → Plan & billing).
  New accounts get a 7-day free trial with Growth limits; a banner shows
  the days left. When the trial (or a paid period) ends, the account is
  read-only: messages still arrive, but sending is paused everywhere
  until a plan is active. Plan limits from /pricing — contacts, monthly
  broadcasts, automations + flows, custom fields, team members — are
  enforced by database triggers, with usage meters and clear "upgrade"
  messages. No payment gateway yet: "Choose plan" opens WhatsApp/email
  to support, and platform admins activate plans (with a paid-until date
  and note) in `/admin`. Existing accounts get a one-time 14-day trial.
  **Migration required:** apply
  `supabase/migrations/041_plans_and_trials.sql`.

- **Calendly → WhatsApp booking messages** (Settings → Calendly).
  Connect with a Calendly personal access token; Repeat Grow creates the
  webhook subscription with its own signing key. Map approved templates
  to: booking confirmed, rescheduled, cancelled, no-show follow-up, and
  reminders 24 h and 1 h before the meeting (sent by the every-minute
  cron, skipped for last-minute bookings and cancelled meetings).
  Variables include the invitee's name, meeting name, date and time in
  their time zone, meeting link, host, and reschedule/cancel links.
  Phone numbers come from a "Phone number" booking question, the
  SMS-reminder number, or an outbound-call location. Includes test
  sends and a recent-activity list. Needs a paid Calendly plan.
  **Migration required:** apply
  `supabase/migrations/040_calendly_integration.sql`.
- **Shopify → WhatsApp order messages** (Settings → Shopify). Connect a
  store with one click (OAuth via Repeat Grow's Shopify app; webhooks
  are registered automatically) or with webhooks created in Shopify
  admin. Map approved templates to: order placed, COD order placed,
  shipped (with tracking), out for delivery, delivered, cancelled, and
  abandoned cart (sent by the every-minute cron after a configurable
  idle time; skips opted-out customers). Template variables are filled
  from the order (customer name, order number, total, items, tracking
  link, checkout link, …), Indian numbers without +91 are fixed, sends
  are de-duplicated across Shopify retries, and messages appear in the
  inbox. Includes test sends, a recent-activity list, and Shopify's
  mandatory privacy webhooks. **Migration required:** apply
  `supabase/migrations/039_shopify_integration.sql`. Optional env:
  `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`. A merchant installing from
  Shopify while logged out logs in or signs up (email, Google, or the
  email-confirmation link) and the connection then continues
  automatically. The Shopify app's configuration is versioned in
  `shopify/shopify.app.toml` (public distribution, not embedded,
  compliance webhooks).
- **Sign in with Google** on `/login` and `/signup` (Supabase OAuth via
  `/auth/callback`). Invite links survive the Google round-trip. Setup
  steps are in the README under "Google sign-in".
- **`/onboarding` business-details step.** Account owners missing a
  mobile number, nature of business, or team size (Google sign-ups, and
  accounts created before migration 029) are asked for them, plus a
  business name, before entering the app. Saved by
  `POST /api/account/onboarding` (owner only) into the same columns the
  signup form uses. No migration required.
- **Platform admin (`/admin`) shows more account details:** owner
  mobile, nature of business, team size, signup method (Google /
  email), and a complete / incomplete profile badge. The account page
  adds a Business details panel and a "Signed up via" column for each
  member.
- **WhatsApp usernames (BSUID).** Meta now identifies senders by a
  business-scoped user ID and hides the phone number of users who adopt
  a username. Inbound messages are matched to contacts by BSUID first,
  then phone; username-only contacts are created with an empty phone and
  shown as "@username"; inbox replies, automations, flows, the chatbot
  and reactions send to the BSUID (Meta's `recipient` field) when no
  phone is known. **Migration required:** apply
  `supabase/migrations/038_contacts_whatsapp_user_id.sql`.

### Changed

- Smaller page script: Sentry performance tracing is no longer bundled
  (errors are still reported).
- Better contrast on the pricing toggle, blog buttons and login links;
  bigger show-password button.
- The automations cron compares its secret in constant time, and one
  failing task no longer stops the others.
- **Owners can edit business details** (business name, mobile number,
  nature of business, team size) in Settings → Your profile.

- The admin account page's "Signup method" card is renamed "WhatsApp
  signup" (it shows how WhatsApp was connected, not how the user signed
  up).
- `/login` shows an error when `/auth/callback` fails
  (`?error=auth-callback-failed`) instead of failing silently.
- **INR is the default currency** for new accounts and deals (was USD),
  and Indian Rupee is first in the currency picker. Existing USD
  accounts are switched to INR. **Migration required:** apply
  `supabase/migrations/037_default_currency_inr.sql`.

### Fixed

- **Google sign-up users can set a password.** Settings → Login &
  security shows "Set password" (no current password) for accounts that
  signed up with Google.

- An auth `code` that lands on the homepage (Supabase falls back to the
  Site URL when a redirect isn't allow-listed) is now forwarded to
  `/auth/callback` instead of leaving the user signed out.
- Taps on template quick-reply buttons (e.g. "Stop promotions",
  "Yes, confirm") showed as "[Unsupported message type: button]" and
  didn't trigger anything. They now appear as the button text, fire
  keyword automations and the chatbot like typed text, and "Stop
  promotions" opts the contact out.

## [0.4.0] — 2026-07-01

Completes the public API (#245): **outbound event webhooks** so
automations can *react* to activity instead of polling.

### Added

- **Outbound event webhooks (`/api/v1/webhooks`).** Register an HTTPS
  endpoint (scope `webhooks:manage`) to be POSTed to when an event
  happens in your account — `message.received`, `message.status_updated`,
  or `conversation.created`. Manage endpoints with
  `GET/POST /api/v1/webhooks` and `GET/PATCH/DELETE /api/v1/webhooks/{id}`.
  Each delivery is signed with an `X-Wacrm-Signature`
  (HMAC-SHA256 over `timestamp.body`) so receivers can verify
  authenticity and reject replays; the signing secret is returned once
  at creation and stored encrypted. Delivery is best-effort — an
  endpoint that fails repeatedly is auto-disabled after a threshold of
  consecutive failures. See `docs/public-api.md`.
  **Migration required:** apply
  `supabase/migrations/028_webhook_endpoints.sql`.
  ([#245](https://github.com/ArnasDon/wacrm/issues/245))

## [0.3.0] — 2026-07-01

Multi-user accounts ship. Every wacrm install is multi-tenant on the
database side: a single user's signup creates a fresh "account", and
every row is scoped to that account rather than to the user directly.
This release also opens the user-visible **Members** surface — invite
teammates by link, manage their roles, transfer ownership — to all
users. The `'account_sharing'` beta gate that hid it during
development is removed (mirrors the Flows soft-GA in 0.2.0). Existing
self-hosted instances keep working: every existing user is backfilled
as the sole owner of their own account and sees identical data, and a
solo owner who never invites anyone sees the same single-user app they
always did.

### Added

- **Public REST API (`/api/v1`) — groundwork.** A scoped, revocable
  **API key** system so you can drive wacrm from your own scripts and
  automations. Create keys under **Settings → API keys** (admin+),
  grant only the scopes each integration needs, and authenticate with
  `Authorization: Bearer <key>`. Keys are account-scoped and stored
  hashed (plaintext shown once). This release ships the auth layer,
  scopes, per-key rate limiting, the management UI, and a
  `GET /api/v1/me` probe to verify a key. See
  `docs/public-api.md`. **Migration required:** apply
  `supabase/migrations/026_api_keys.sql`. ([#245](https://github.com/ArnasDon/wacrm/issues/245))
- **Public REST API — data endpoints.** Built on the key auth above,
  so external automations can read and drive the CRM:
  - `POST /api/v1/messages` — send a text / template / media message to
    a phone number; finds-or-creates the contact + conversation
    (`messages:send`).
  - `GET/POST /api/v1/contacts`, `GET/PATCH /api/v1/contacts/{id}` —
    list (search + tag filter), create (find-or-create by phone), read,
    and update contacts, including tags (`contacts:read` /
    `contacts:write`).
  - `GET /api/v1/conversations`, `GET /api/v1/conversations/{id}`, and
    `GET /api/v1/conversations/{id}/messages` — browse conversations and
    their message history with delivery status (`conversations:read` /
    `messages:read`).
  - `POST /api/v1/broadcasts` + `GET /api/v1/broadcasts/{id}` — launch a
    template broadcast to a recipient list and poll its progress
    (`broadcasts:send`).
  All list endpoints share one cursor-pagination contract
  (`{ data, meta: { next_cursor } }`). No migration required — the
  scopes already existed and the tables are unchanged. Outbound event
  webhooks (react to inbound messages) are the remaining roadmap item.
  See `docs/public-api.md`. ([#245](https://github.com/ArnasDon/wacrm/issues/245))

### Changed

- **Tenancy moves from per-user to per-account.** RLS on every
  domain table (contacts, conversations, messages, broadcasts,
  automations, flows, pipelines, templates, tags, …) now checks
  account membership via a new SECURITY DEFINER helper
  `is_account_member(account_id, min_role)` instead of
  `auth.uid() = user_id`. The `user_id` columns stay on every row
  for assignment / audit but no longer enforce isolation.
- **WhatsApp config is one-per-account, not one-per-user.** The
  `whatsapp_config.UNIQUE(user_id)` constraint is replaced by
  `UNIQUE(account_id)`.
- **`flow_runs` idempotency key swaps to `(account_id, contact_id)`**
  so two accounts sharing a contact phone number can each run their
  own flows independently.
- **The signup trigger (`handle_new_user`) now also creates a
  personal account** and links the new profile to it as `owner`.

### Changed

- **Flow-media storage is now account-scoped.** Migration 016
  pathed uploaded files under `auth.uid()/...`, which orphaned
  flow media when a teammate left a shared account. New uploads
  go under `account-<account_id>/...` and any account member
  with the right role can edit them. Legacy paths remain
  writable by the original uploader for backward compatibility.
- **Webhook contact lookup now pre-filters in SQL.** Previously
  pulled every contact in an account just to JS-filter to one
  row by phone — fine when account = one user, painful when
  account = team. Pre-filter by phone suffix on the database
  side; re-apply `phonesMatch` on the (typically 0-2 row)
  candidate set.

### Migration required

- `supabase/migrations/020_account_sharing_followups.sql` —
  composite partial indexes on `automations(account_id,
  trigger_type) WHERE is_active` and `flows(account_id) WHERE
  status='active'` for the engine dispatch hot path; updated
  `flow-media` storage RLS to allow account-member writes under
  the new path convention. Idempotent.

- **Role-aware UI gating across the app.** The inbox composer's
  send button + textarea, the "New broadcast / automation / flow"
  buttons, the "Add pipeline / deal" buttons, and the "Add /
  Import contact" buttons are now disabled-with-tooltip for
  viewers (and for agents on settings-class actions). Choice:
  show-but-disable rather than hide, so the UI never feels
  silently broken to a teammate looking at a feature they don't
  yet have permission for.
- **Sidebar surfaces the active account** above the user info
  whenever the account name differs from your own — i.e. once
  you've renamed the account or joined a shared one. A default
  solo account is named after you, so the strip stays hidden to
  avoid duplicating your name in the footer.
- **Members is open to all users.** The `account_sharing` beta
  flag that hid the Settings → Members tab and the sidebar
  account strip during development is gone; the multi-user
  surface is now part of the standard app. (Same soft-GA move as
  Flows in 0.2.0.)

### Fixed

- **Inbound WhatsApp messages now land in the shared inbox.** The
  webhook + automations + flows engines used to route inbound
  events by `user_id`, which after the 017 migration only matched
  the WhatsApp config owner's automations / flows — teammates'
  rules never fired. PR 8 of the multi-user series flips every
  lookup to `account_id` so any member of the account sees the
  inbound message and any teammate's automation or flow can react
  to it. Also fixes incipient NOT NULL violations on
  `automation_logs`, `automation_pending_executions`, `flow_runs`,
  and `deals` — those tables gained `account_id NOT NULL` in 017
  but the engines hadn't yet been updated to populate it.

### Added

- **Duplicate phone numbers are now prevented across contacts.** A
  phone number can no longer become more than one contact in the same
  account. Adding a contact whose number already exists is blocked
  with a link to the existing record (and a softer warning for
  near-matches that share their last 8 digits); CSV import de-dupes
  within the file and against existing contacts, reporting
  "X imported, Y duplicates skipped". The rule is enforced by a
  database unique index on the normalized number, so the WhatsApp
  webhook, the form, import, and any future path all agree. Existing
  duplicates are merged into the oldest contact on upgrade (their
  conversations, deals, notes, and tags are re-pointed, nothing is
  lost). Closes #212.
- **Configurable default deal currency.** Each account can now pick
  its default currency under **Settings → Deals** (admin+); the app
  previously hardcoded USD throughout. New deals default to it, and
  pipeline-stage totals, the dashboard "Open Deals Value" card, the
  pipeline-value donut, and automation-created deals all use it.
  Existing deals keep the currency they were saved with — totals are
  shown in the account default with no exchange-rate conversion (one
  currency per account). Full guide:
  [Default currency](https://wacrm.tech/docs/settings#deals).
- **Members tab in Settings.** The user-facing surface for the
  multi-user APIs below, available to everyone (no beta flag). From
  Settings → **Members** an admin or owner can: see who's on the
  account with their role and join date, invite teammates by
  generating a one-time share link (pick the role + optional
  expiry), revoke pending invites, change a member's role, remove a
  member, and — as owner — transfer ownership. Recipients accept via
  a public `/join/[token]` page. Full guide:
  [Members docs](https://wacrm.tech/docs/members).
- **Account & member management API** — server-side endpoints
  backing the Members tab. All routes are role-gated and
  return Supabase-RLS-scoped data.
  - `GET /api/account` — caller's account + role. Any member.
  - `PATCH /api/account` — rename the account. Admin+.
  - `GET /api/account/members` — list members. Email visible to
    admin+ only; agents/viewers see name + avatar + role +
    joined date.
  - `PATCH /api/account/members/[userId]` — change a member's
    role. Admin+. Owner promotion/demotion goes through the
    transfer endpoint instead.
  - `DELETE /api/account/members/[userId]` — remove a member.
    Admin+. The removed user keeps their login and is moved to a
    freshly-created personal account (mirror of the signup flow).
  - `POST /api/account/transfer-ownership` — owner only. Atomic
    swap with the named member.
- **Invitation API + redeem flow** — the no-email, link-only
  invite path that powers the Members tab's "Invite member" button
  and the `/join/[token]` accept page.
  - `GET /api/account/invitations` — list outstanding (admin+).
  - `POST /api/account/invitations` — create an invite, returns
    the plaintext token + share URL **exactly once** (we store
    only the SHA-256 hash on the row). Body
    `{ role, expiresInDays?, label? }`. Admin+.
  - `DELETE /api/account/invitations/[id]` — revoke (admin+).
  - `GET /api/invitations/[token]/peek` — public, per-IP
    rate-limited. Returns `{ ok, account_name, role, expires_at }`
    or `{ ok: false, reason }` so the join page can render
    "You're being invited to <Account> as <Role>".
  - `POST /api/invitations/[token]/redeem` — authenticated.
    Atomically moves the caller's profile to the inviter's
    account and cleans up the orphan personal account. Refuses
    with 409 if the caller's current account already contains
    domain data (no silent data loss).

### Migration required

Apply against your Supabase project before deploying this version:

- `supabase/migrations/017_account_sharing.sql` — introduces the
  `accounts` and `account_invitations` tables plus an
  `account_role_enum` type; adds `account_id` to every
  user-scoped table and backfills it; rewrites every RLS policy;
  replaces the new-user trigger. Idempotent. **No data loss** —
  every existing user is mapped to a freshly-created account
  with role `owner` and every existing row of theirs is linked
  to that account.
- `supabase/migrations/018_account_member_rpcs.sql` — adds three
  `SECURITY DEFINER` RPCs (`set_member_role`,
  `remove_account_member`, `transfer_account_ownership`) that
  back the member-management API. They self-check the caller's
  role and raise SQLSTATE `42501` / `22023` on forbidden / bad
  input so the API layer can map cleanly to 403 / 400.
  Idempotent.
- `supabase/migrations/019_invitation_rpcs.sql` — adds two
  `SECURITY DEFINER` RPCs: `peek_invitation` (anonymous read by
  token hash, returns a fixed-shape JSON envelope) and
  `redeem_invitation` (authenticated atomic move + orphan
  cleanup, with a domain-data safety check). Both bypass the
  RLS that would otherwise block their reads/writes. Idempotent.
- `supabase/migrations/021_account_default_currency.sql` — adds
  `accounts.default_currency` (`TEXT NOT NULL DEFAULT 'USD'`, with a
  3-letter-code `CHECK`) backing the configurable default currency.
  Idempotent; existing accounts backfill to `USD`. **Apply before
  deploying** — the app now reads this column when loading the
  account, so an un-migrated database breaks account loading.
- `supabase/migrations/022_contact_phone_dedup.sql` — adds the
  generated `contacts.phone_normalized` column, **merges existing
  duplicate contacts into the oldest** (re-pointing conversations,
  deals, notes, tags, custom values, and broadcast recipients — no
  data loss), then adds a `UNIQUE (account_id, phone_normalized)`
  index. Idempotent. **Apply before deploying** — CSV import reads
  `phone_normalized`, and the index is what enforces de-duplication
  for every write path. The one-shot merge runs inside the migration.

## [0.2.2] — 2026-05-29

Flow nodes can now send media. Closes the most-requested gap from user
feedback after the v0.2.0 Flows launch — flows were text-only and
couldn't deliver an invoice, receipt, product photo, or short demo
video mid-conversation.

### Added

- **`send_media` flow node.** Send an image (PNG / JPEG / WebP), video
  (MP4 / 3GP), or document (PDF, Word, Excel, PowerPoint, TXT) to the
  customer from any point in a flow. Pick a file in the builder, it
  uploads to the new `flow-media` Supabase Storage bucket, and Meta
  fetches the public URL at send time. Optional caption (1024 char cap,
  supports `{{vars.X}}` interpolation); documents also take an optional
  filename shown in the recipient's chat. Auto-advances after send —
  same suspend semantics as `send_message`.
  ([#156](https://github.com/ArnasDon/wacrm/pull/156))

### Migration required

Apply against your Supabase project before deploying this version:

- `supabase/migrations/016_flow_media.sql` — does two things:
  1. Adds `'send_media'` to the `flow_nodes.node_type` CHECK
     constraint. Without this the `send_media` node fails to save with
     a constraint violation.
  2. Creates the public `flow-media` Supabase Storage bucket (16 MB
     file-size cap, image / video / document MIME allowlist) plus
     per-user RLS policies (path prefix = `auth.uid()`). Without this
     the builder's file picker fails on upload. Same shape as the
     `avatars` bucket from migration 008 — the bucket is **public** so
     Meta can fetch the URL without credentials.

The migration is idempotent and safe to re-run.

## [0.2.1] — 2026-05-26

Bug-fix release. Plugs a silent inbound-message drop that triggered
when two users on the same instance saved the same WhatsApp
`phone_number_id`.

### Fixed

- **Inbound WhatsApp messages no longer silently disappear** when two
  users have claimed the same `phone_number_id`. Previously the
  webhook used `.single()` to look up the owning config, which errors
  `PGRST116` for both 0 rows *and* ≥2 rows — the second user's save
  put the DB into the ≥2-row state and every inbound message was
  dropped while the log misleadingly reported *"No config found for
  phone_number_id"*. Three layers of fix: `POST /api/whatsapp/config`
  now returns **409** when another user has already claimed the
  number, the webhook lookup distinguishes 0 rows from ≥2 rows and
  logs the conflicting `user_id`s, and a new DB constraint
  (`UNIQUE(phone_number_id)`) prevents the bad state at the storage
  layer. Reported in
  [#136](https://github.com/ArnasDon/wacrm/issues/136), fixed in
  [#143](https://github.com/ArnasDon/wacrm/pull/143).

### Migration required

Apply against your Supabase project before deploying this version:

- `supabase/migrations/013_whatsapp_config_phone_number_id_unique.sql`
  — adds `UNIQUE(phone_number_id)` to `whatsapp_config`. **Fails
  loudly with a copy-pasteable resolution hint** if duplicate rows
  already exist; auto-deduping would destroy encrypted tokens, so
  the operator picks which row keeps the number. To check first:

  ```sql
  SELECT phone_number_id, array_agg(user_id) AS owners, count(*) AS n
  FROM whatsapp_config
  GROUP BY phone_number_id
  HAVING count(*) > 1;
  ```

  If that returns rows, `DELETE` the duplicate row(s) you want to
  drop, then re-run the migration.

### Note on multi-user setups

wacrm is intentionally **single-tenant per WhatsApp number**. RLS on
`conversations`/`messages` is `auth.uid() = user_id`, so a second
user physically cannot read messages routed to a different owner —
two users sharing one number was never supported. If you need
multiple humans handling the same inbox, run them under one shared
account.

## [0.2.0] — 2026-05-22

The **Flows** release. Adds a no-code, branching, button-driven WhatsApp
conversation engine that runs alongside Automations. Also ships a
5-theme color picker in Settings and opens Flows to all users.

### Added

#### Flows — branching chatbot conversations

- **Module + schema.** New `flows`, `flow_nodes`, `flow_runs`,
  `flow_run_events` tables with partial unique indexes that enforce
  one active run per contact. Widened `messages.content_type` CHECK
  to accept `'interactive'`; added `interactive_reply_id` column so
  the inbox can render button/list taps.
  ([#112](https://github.com/ArnasDon/wacrm/pull/112))
- **Runner engine.** `dispatchInboundToFlows` parses every inbound
  webhook, decides whether the message is a reply on an active run
  or a fresh trigger, advances the state machine, and reports back
  to the webhook so consumed messages don't also fire automations.
  Idempotent on Meta's `message_id`.
  ([#114](https://github.com/ArnasDon/wacrm/pull/114))
- **No-code builder UI** at `/flows`. Linear-list editor with
  per-node config forms, live validator, draft/active/archived
  status, and a 5-route REST API (`GET/POST /api/flows`,
  `GET/PUT/DELETE /api/flows/[id]`, `POST /api/flows/[id]/activate`,
  `GET /api/flows/[id]/runs`, `GET /api/flows/templates`).
  ([#115](https://github.com/ArnasDon/wacrm/pull/115))
- **Templates + v1.5 node types.** Three starter templates
  (Welcome menu, FAQ bot, Lead capture) cloneable from the New-flow
  dialog. Three new node types: `collect_input` (capture customer
  text into a variable), `condition` (branch on var / tag / contact
  field), `set_tag` (add or remove a tag). `{{vars.X}}` interpolation
  in send_message + collect_input prompts. Per-flow run-history
  viewer at `/flows/[id]/runs`.
  ([#117](https://github.com/ArnasDon/wacrm/pull/117))
- **Stale-run sweep cron** at `GET /api/flows/cron` — marks runs
  past their configured timeout (default 24h) as `timed_out` so
  abandoned conversations free up the contact for new triggers.
  Reuses `AUTOMATION_CRON_SECRET`.
  ([#114](https://github.com/ArnasDon/wacrm/pull/114))

#### Color themes

- **5 color themes** (Violet default, Emerald, Cobalt, Amber, Rose)
  selectable from a new **Appearance** tab in Settings. CSS variables
  scoped under `html[data-theme="..."]`, applied at runtime via
  `dataset.theme`, persisted to `localStorage`. Inline boot script in
  `layout.tsx` replays the choice before first paint so there's no
  flash of the default.
  ([#132](https://github.com/ArnasDon/wacrm/pull/132))
- **Theme tokenization sweep** — every previously hard-coded
  `violet-*` Tailwind class replaced with `primary` tokens across
  ~49 files. Picking a non-violet theme now themes the whole app,
  not just the chrome.
  ([#133](https://github.com/ArnasDon/wacrm/pull/133))

### Changed

#### Flows — soft-GA

- **Flows is now available to every authenticated user.** The
  per-account beta gate is gone; the sidebar entry + page header
  carry a small "Beta" chip as the only remaining signal.
  ([#134](https://github.com/ArnasDon/wacrm/pull/134))
- **Editor UX**:
  - Internal `node_key` + per-button/row `reply_id` identifiers
    hidden behind a per-node "Show advanced" disclosure.
    ([#118](https://github.com/ArnasDon/wacrm/pull/118))
  - `send_list` nodes can have multiple sections.
    ([#119](https://github.com/ArnasDon/wacrm/pull/119))
  - Collapsed node cards show a 1-line content preview per node
    type (text excerpt, button titles, condition summary, etc.).
    ([#120](https://github.com/ArnasDon/wacrm/pull/120))
  - Validation issues are clickable: jump to + flash the offending
    node.
    ([#121](https://github.com/ArnasDon/wacrm/pull/121))
  - Unsaved-changes "● Edited" indicator + `beforeunload` reload
    guard.
    ([#122](https://github.com/ArnasDon/wacrm/pull/122))
  - New-flow dialog actually widens to fit the 3 template cards
    (was capped at 384px by a baked-in `sm:max-w-sm` from shadcn).
    ([#129](https://github.com/ArnasDon/wacrm/pull/129),
    [#131](https://github.com/ArnasDon/wacrm/pull/131))
  - Validation panel pinned to the viewport bottom so
    activate-readiness follows the user as they scroll through nodes.
    ([#130](https://github.com/ArnasDon/wacrm/pull/130))

#### Engine reliability

- **Atomic `execution_count` increment** via SECURITY DEFINER RPC —
  prevents lost counts when two webhooks start runs concurrently.
  Mirrors the automations engine pattern.
  ([#124](https://github.com/ArnasDon/wacrm/pull/124))
- **Preload all flow_nodes once per dispatch** — one SELECT per
  inbound instead of one per advance-loop iteration. A 5-node
  auto-advance chain now costs 1 round trip, not 5.
  ([#125](https://github.com/ArnasDon/wacrm/pull/125))
- **Wasted re-read dropped** after reprompt reset; `loadActiveRun`
  switched to defensive `.limit(1)` so a migration glitch producing
  duplicates can't crash dispatch.
  ([#126](https://github.com/ArnasDon/wacrm/pull/126))

### Security

- **PII redacted from `reply_received` event payload** — customer
  text is no longer persisted to `flow_run_events.payload`; only
  the length is. A `collect_input` prompt asking "what's your card
  number?" used to leave the PAN sitting in the events table.
  ([#123](https://github.com/ArnasDon/wacrm/pull/123))
- **Constant-time cron-secret compare** on `/api/flows/cron`
  (`crypto.timingSafeEqual`) to close a theoretical
  timing-side-channel on the `x-cron-secret` header check.
  ([#127](https://github.com/ArnasDon/wacrm/pull/127))

### Fixed

- **`/flows` no longer spuriously redirects to `/dashboard`** when
  navigating in. Root cause: `useAuth` flipped `loading: false`
  before the profile fetch resolved. `use-auth` now exposes a
  separate `profileLoading` boolean.
  ([#128](https://github.com/ArnasDon/wacrm/pull/128))

### Migration required

Apply, in order, against your Supabase project:

1. `supabase/migrations/010_flows.sql` — Flows core tables, indexes,
   RLS policies, and the `messages` schema widening.
2. `supabase/migrations/011_profile_beta_features.sql` — adds the
   `profiles.beta_features` column. Surviving for future betas;
   Flows no longer reads it.
3. `supabase/migrations/012_flows_increment_counter.sql` — atomic
   counter RPC. Without this the engine still runs but
   `flows.execution_count` is racy.

Each migration is idempotent — safe to re-run if you're not sure
whether you applied a previous one.

### Removed

- **`src/lib/flows/feature-flag.ts`** + its tests. Flows is open to
  all users; the `profiles.beta_features` column itself survives
  for future beta gates.
  ([#134](https://github.com/ArnasDon/wacrm/pull/134))

---

## [0.1.1] — 2026-05-19

### Added

- Chat actions in the inbox: emoji reactions, reply-with-quote, and
  copy-text on individual messages. Hover on desktop, long-press on
  touch. Outbound reactions and replies forward to WhatsApp via the
  Cloud API; inbound reactions and swipe-replies from customers
  arrive through the webhook and appear in real time.

### Migration required

- Apply `supabase/migrations/009_message_actions.sql` to your
  Supabase project. It adds `messages.reply_to_message_id` and the
  new `message_reactions` table (with RLS and realtime). The
  migration is idempotent — safe to re-run.

### Changed

- The webhook no longer stores inbound customer reactions as fake
  text messages. They are written to `message_reactions` instead,
  so any custom queries that counted reactions as messages will
  need updating.

---

## [0.1.0]

Initial template release. Core CRM: inbox, contacts, pipelines,
broadcasts, automations (with a Wait-step cron drain), WhatsApp
Cloud API integration, Supabase auth + RLS.
