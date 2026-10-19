# TODO

> **FEATURE FREEZE (decided 17 Oct 2026): no new features until we have paying/active customers.**
> The product already has far more than a first customer needs. Until then the work is only:
> finish the owner to-dos in [docs/ADMIN.md](./docs/ADMIN.md), test what exists on the live site,
> fix bugs, and get customers. New feature ideas below stay parked. Revisit when customers ask for them.


Gap list from the product review of 2026-10-13. Item numbers match that
review. #4 (opt-out / STOP handling) is done — see migration 036 and
`src/lib/contacts/opt-out.ts`.

## 🔴 Do first — the website promises these

- [ ] **#1 Billing — payment gateway. DECIDED 17 Oct 2026: NOT NOW, do not ask about it.** Plans are activated by hand after UPI / bank transfer until the owner decides otherwise. **NOT DONE (checked 2026-10-17).** Razorpay *payment links inside chats* shipped for customers, but Repeat Grow's own plan billing is still manual. Plans, Settings → Plan & billing
      and manual activation from /admin are done (migration 041); "Choose"
      opens WhatsApp/email to support and plans are activated by hand
      after UPI / bank transfer. Still to do: a gateway (Razorpay
      subscriptions: checkout, renewals, invoices, failed payments) and
      GST invoices once GST-registered.
- [x] **#2 Enforce plan limits.** Done (migration 041): database
      triggers enforce contacts (dashboard adds/imports), broadcasts per
      month, automations + flows, custom fields and team members, with
      usage meters in Settings → Plan & billing.
- [x] **#3 Free trial.** Done (migration 041): 7-day trial with Growth
      limits for new accounts (existing accounts got 14 days), a banner
      with days left, then read-only (sending paused). Follow-up: email
      reminders before the trial ends.
- [x] **#5 Background jobs (cron).** Done 2026-10-13:
      `AUTOMATION_CRON_SECRET` is set and Hostinger runs
      `/api/automations/cron` and `/api/flows/cron` every minute with the
      `x-cron-secret` header (both verified returning 200). Documented
      in the README ("Background jobs (cron)").

## 🔴 Important — WhatsApp platform (from Meta docs review, 2026-10-13)

- [ ] **#36 Save incoming media.** Inbound photos, voice notes and
      documents are proxied from Meta by media ID at view time
      (`src/app/api/whatsapp/media/[mediaId]/route.ts`), but Meta
      expires media IDs after 7 days (since Oct 2025), so older
      attachments stop loading. Download each file to Supabase Storage
      when the webhook receives it and store that URL instead.
- [x] **#37 WhatsApp Flows (native forms).** Shipped as WhatsApp forms
      (migration 052): builder, send from chat, answers saved to
      contacts. Follow-ups: send from automations, multi-screen flows,
      data endpoints.
- [x] **#38 Carousels.** Media-card carousel templates shipped (migration
      051) — builder, broadcasts, inbox, automations. Product-card
      carousels (from a catalog) come with #40.
- [x] **#39 Number quality & messaging-limit alerts.** Shipped (migration 049, Settings → WhatsApp → Number health). Handle
      `phone_number_quality_update` / `account_update` limit changes,
      show the number's quality rating and daily limit in Settings, and
      warn the owner (email / in-app) before Meta restricts sending.
- [x] **#40 Catalog, orders and payments (India).** Shipped (migration 053): WhatsApp Pay order_details + payment webhooks, UPI-ID orders, catalog / product sharing, catalog cart orders, order status updates.
      Follow-ups: multi-product messages, order-details templates (pay
      outside the 24-hour window), creating a deal from an order.
- [x] **#41 WhatsApp voice calls (Calling API).** Shipped: customers
      call the business number and agents answer in the browser
      (WebRTC), agents call customers, call-permission requests, recent
      calls in the contact panel (README → WhatsApp calling).
- [ ] **#41b Calling follow-ups.** Voicemail when nobody answers, call
      hours, a TURN server for strict networks, and call events inline
      in the chat thread.
- [x] **#41c Call a lead in one click** (2026-10-19). Call button on
      the Contacts list, the contact panel and pipeline deal cards; it
      opens the lead's chat if they have none (`contact_id` on
      GET /api/whatsapp/calls/permission).
- [x] **#41d AI voice agent for outbound calls** (2026-10-19, freeze
      lifted for this). Runs in the agent's browser (no VPS): WebRTC
      with Meta ↔ Gemini Live, AI call button, take over, call script in
      Settings → AI chatbot (README → AI calls). Only for contacts who
      gave call permission.
- [ ] **#41e AI calls: test live.** Run migration 080, then place a real
      AI call: greeting, Hindi switch, interruptions, take over, hang-up,
      AI notes. Check the Gemini Live model id and voice names still work.
      AI on incoming calls added 2026-10-20 (migration 081, browser tab
      must be open). Later: run the agent server-side (VPS) so no tab
      needs to stay open, bulk AI call campaigns.
- [ ] **#42 Usernames / BSUID follow-ups.** Core support shipped
      (migration 038: contacts store `whatsapp_user_id`; sends fall back
      to the BSUID via `recipient`). Still to do: broadcasts to
      username-only contacts (broadcasts are phone-only today), handle
      the `user_id_update` webhook when a BSUID changes, show the
      username in the public API contact serializer, and support
      parent BSUIDs if the portfolio is enrolled.
- [ ] **#43 Read receipts & typing indicator.** Mark inbound messages
      read when an agent opens the conversation and show "typing…"
      while an agent or the chatbot composes a reply.
- [ ] **#44 Shared contacts & order messages in the inbox.** Render
      inbound `contacts` (vCards) and `order` messages instead of
      "[Unsupported message type]".

## 🟠 Customer-facing gaps

- [x] **#33 Google users can't set a password.** Done: the form offers
      "Set password" for Google-only accounts. Was: The Settings password
      form re-authenticates with the current password
      (`src/components/settings/password-form.tsx`); Google sign-ups
      have none. Let them set a first password without it.
- [x] **#34 Edit business details in Settings.** Done: owner-only
      Business details card under Settings → Your profile. Was: Mobile number, nature
      of business, and team size can only be entered at signup or on
      `/onboarding`; owners can't change them afterwards.
- [ ] **#35 Google consent screen branding.** Google shows
      "continue to <project-ref>.supabase.co". A Supabase custom auth
      domain would show repeatgrow.com instead.

- [x] **#6 Saved replies.** Done (migration 042): type "/" in the inbox;
      managed in Settings → Saved replies; {{name}}, {{full_name}},
      {{agent}} variables.
- [x] **#7 Scheduled broadcasts.** Done (migration 043): "Schedule for
      later" in the wizard; the server cron sends in batches; cancel from
      the broadcast page.
- [x] **#47 Trial-ending reminders.** Shipped as emails (migration 050); WhatsApp reminders could follow. WhatsApp and/or
      email to the owner 2 days before, on the last day, and 1 day after
      the trial ends, with a "Choose a plan" link.
- [ ] **#8 Notifications agents can't miss:** browser notifications +
      sound for new messages are done (2026-10-16, MessageNotifier). Still
      to do: email digests and mobile push.
- [x] **#9 Contact export.** Done: Export on the Contacts page (CSV
      with tags and custom fields, formula-safe).
- [ ] **#10 Multiple WhatsApp numbers per account.** `whatsapp_config` is
      UNIQUE(account_id) (migration 017). Needs number selection in inbox,
      broadcasts, flows, automations, chatbot and the API.
- [x] **#11 Catalog, orders and payments** — moved to the WhatsApp
      platform section above (#40).
- [ ] **#12 Conversation cost tracking:** show Meta's per-conversation
      charges (from the `pricing` object in status webhooks) per account,
      per broadcast and per month.
- [ ] **#13 Cap AI usage per account.** Every chatbot reply and AI
      template is a paid Gemini call on our key; only a 30-replies/hour
      per-conversation cap exists. Add monthly per-account quotas tied to
      plans (#2), usage counters, and a clear message when exceeded.

## 🟡 Reliability and scaling

- [ ] **#14 Broadcast queue.** Sends run inside one request (`after()`,
      `maxDuration` 60s); ~1,000 recipients can time out and leave the
      broadcast stuck on "sending" (`src/app/api/v1/broadcasts/route.ts`).
      Move fan-out to a durable queue / cron drain with resume.
- [ ] **#15 Webhook delivery retries** with backoff and a delivery log
      (`src/lib/webhooks/deliver.ts` sends once today).
- [ ] **#16 Shared rate limiting.** `src/lib/rate-limit.ts` is in-memory
      per process; move to Redis/Upstash before running more than one
      instance.
- [x] **#17 Error monitoring.** Done: Sentry (`src/instrumentation*.ts`),
      off until `NEXT_PUBLIC_SENTRY_DSN` is set; set up alert rules in
      Sentry.
- [x] **#18 End-to-end tests** (Playwright) — public, auth and health tests in CI; signed-in smoke tests with E2E_EMAIL. for signup → connect WhatsApp
      → send → broadcast → template, run in CI.
- [ ] **#19 Block dry-run in production.** Ignore
      `WHATSAPP_TEMPLATES_DRY_RUN` when `NODE_ENV=production` (it already
      stopped real templates reaching Meta once).
- [ ] **#20 OneDrive locks `.next`.** Exclude `.next` and `node_modules`
      from OneDrive sync, or move the project out of OneDrive.

## 🟡 Security and trust

- [ ] **#21 Two-factor login** (Supabase MFA / TOTP), optionally
      required by the owner for the whole team. *Built on 2026-10-17 and
      then removed at the owner's request; no 2FA code remains. Not
      planned unless asked again.*
- [x] **#22 Audit log.** Done 2026-10-17 (migration 070, Settings →
      Activity log): role changes, API keys, WhatsApp config, integration
      connects, ownership transfer, deletion requests, plan edits and
      bulk contact deletes. Gaps: some disconnect handlers log without an
      IP; rows are never pruned; contact merge is not logged yet.
- [ ] **#23 Enforce the CSP.** `next.config.mjs` ships it as
      report-only. Fix violations, then enforce (add partner redirect
      origins such as restrogrow.com to `form-action` for Connect).
- [x] **#25 Self-serve account & data deletion** — Settings → Your data (admin-approved deletion). (privacy law + our
      privacy policy).

### #24 Rename leftover `wacrm` identifiers to Repeat Grow

These still use the old `wacrm` name. They were left as-is because
renaming them breaks existing API keys and webhook integrations, so
each needs a backwards-compatible rollout.

- [x] **API key prefix** `wacrm_live_` → `RG-XXXX-XXXX-…`
      (`src/lib/api-keys/keys.ts`). Old `wacrm_live_` keys are rejected.
- [ ] **Webhook headers** `X-Wacrm-Event`, `X-Wacrm-Webhook-Id`,
      `X-Wacrm-Signature` → e.g. `X-RepeatGrow-*`
      (`src/lib/webhooks/deliver.ts`). Send both the old and new headers
      for a transition period, announce the change, then drop the old
      ones.
- [ ] **Browser storage keys** `wacrm.theme`, `wacrm.mode`,
      `wacrm.flowEditor.view`, `wacrm:inbox:contact-panel-open`,
      `wacrm.staleBuildReloadAt`. Renaming them resets users' saved
      preferences unless the old value is read once and migrated.
- [ ] **Package name** `whatsapp-crm` in `package.json` and the GitHub
      repo name `Restrogrow/wacrm` (cosmetic).
- [ ] After each rename, update the docs: `docs/public-api.md`,
      `/docs/api` (`src/app/docs/api/page.tsx`), and the OpenAPI spec
      (`src/lib/api/v1/openapi.ts`).

## 🟢 Growth

- [ ] **#26 Smarter AI:** chatbot creates leads/deals and tags
      customers; knowledge base from a website URL or PDF instead of
      pasted text. (Reply suggestions, lead scoring and chat summaries
      shipped; migration 074. Not yet: suggestions on every inbound
      message, scores usable as segment / automation fields.)
- [ ] **#32 Daily WhatsApp summary.** Email version done (migration
      044, Settings → Daily summary, owner picks on/off, hour, recipients).
      Still to do: the WhatsApp version. Original note: every day at 12 pm, send the
      business owner a WhatsApp message with the day's numbers: messages
      sent and received, new contacts, conversations opened / closed /
      pending, average first-response time, broadcasts sent (delivered,
      read, replied, failed), templates approved or rejected, chatbot
      replies and hand-offs, deals won and pipeline value, and opt-outs.
      Notes: run it from the existing every-minute cron (or a new
      `/api/reports/daily` cron route); per-account on/off, time and
      recipient number(s) in Settings; use the account's time zone
      (`CHATBOT_TIMEZONE` today); needs an approved UTILITY template
      because the owner may not have messaged the number in the last
      24 hours; record each send so it isn't sent twice in a day.
- [x] **#27 Analytics.** Done 2026-10-17 (migration 065, `/reports`):
      volume, delivery, response / resolution times, per-agent table,
      broadcasts, deals, orders, CSAT, CSV export. Some figures are
      approximate (no per-status timestamps); broadcast click / revenue
      tracking and an inbox → won-deal funnel are still open.
- [x] **#28 More ways in.** Done 2026-10-17: Click-to-WhatsApp ad
      attribution (migration 062), website chat widget and short links
      (migration 073), QR codes. Still open: Facebook Lead Ads (needs Meta
      app review).
- [ ] **#29 Integrations.** Shipped: Shopify (#45), WooCommerce,
      Razorpay payment links in chat, Shiprocket, Cal.com, Google Sheets,
      Calendly, **inbound webhooks** (Zapier / Make / n8n / Google Forms /
      Typeform can call them) and Slack / Discord / Telegram alerts.
      Still open: Cashfree, Wix, Dukaan, BigCommerce, Google Calendar,
      Zoom / Google Meet, and native Zapier / Make / Pabbly apps. Plan and
      keys: `docs/INTEGRATIONS.md`.
- [ ] **#46 Calendly follow-ups.** Token integration shipped (Settings
      → Calendly, migration 040); Cal.com shipped 2026-10-17 (migration
      072). Next: Google Calendar reminders, one-click Calendly OAuth,
      organization-wide subscriptions for team accounts, and configurable
      reminder times.
- [ ] **#45 Shopify follow-ups.** Core integration shipped (Settings →
      Shopify, migration 039). Next: write COD "Confirm / Cancel" replies
      back to Shopify (tag or cancel the order; needs `write_orders`),
      finish the App Store submission (public distribution chosen,
      listing in draft — checklist in `shopify/README.md`), uninstall
      the app via the Admin API on
      Disconnect, support more than one store per account, refund
      messages (`refunds/create`), and ready-made template suggestions
      per event.
- [ ] **#30 Hindi interface and a mobile app** (or installable PWA with
      push notifications).
- [ ] **#31 Marketing:** submit the directory listings (G2, Capterra,
      Trustpilot, Product Hunt, …) and add their pricing once final; add
      screenshots and short videos to the Help Center.

## 🔵 SEO and content plan (added 2026-10-16)

Done so far: `/demo` page, comparison pages (WATI / Interakt / AiSensy),
GA4 (`G-L56ZRQGJ67`), AI crawler rules, `llms.txt`, FAQ schema, short
titles and descriptions, LinkedIn + Trustpilot in `sameAs` and footer.

### Blog posts, one a week (answer first, a table, an FAQ, link to /demo)
- [ ] **WhatsApp Business API pricing in India (2026):** per-message
      costs, GST, worked examples. Check Meta's official rate card first
      (marketing ~₹0.86 before GST since 2026-01-01); add "last updated".
- [ ] **How to send bulk WhatsApp messages in India without getting banned.**
- [ ] **How to get the WhatsApp green tick (blue tick) in India.**
- [ ] **WhatsApp Business app vs WhatsApp Business API** (expand the
      existing comparison page into a full guide with a decision table).
- [ ] **COD order confirmation on WhatsApp to cut RTO** (Shopify stores).
- [ ] **20 WhatsApp marketing templates that get approved** (India examples).
- [ ] **WhatsApp chatbot for business without code** (AI chatbot included).
- [ ] **Click-to-WhatsApp ads: working Meta ad leads in a WhatsApp CRM.**
- [ ] **WhatsApp CRM for real estate: site-visit follow-ups.**
- [ ] **WhatsApp for coaching institutes: admissions, fees, parent updates.**
- [ ] **Abandoned cart recovery on WhatsApp for Indian stores.**
- [ ] **DPDP Act and WhatsApp marketing: consent rules.**

### Bigger pieces
- [ ] **WhatsApp API pricing calculator** page (`/whatsapp-api-pricing-calculator`).
- [ ] **"Best WhatsApp Business API providers in India"** roundup (fair, includes us).
- [ ] Refresh `src/lib/compare.ts` competitor prices every quarter
      (update `PRICES_CHECKED`).
- [ ] Add `AggregateRating` schema once there are real Trustpilot reviews.
- [ ] Founder name/photo, real customer quotes and usage numbers on
      `/about` and the home page (never invented).

### Owner tasks (not code)
- [ ] Test the demo form end to end: row in `demo_requests`, email to
      sales@, shows in `/admin`.
- [ ] GA4: mark `generate_lead` as a key event; check Realtime works.
- [ ] Search Console: request indexing for the 4 comparison pages and the
      blog posts; resubmit the sitemap; check Queries after 4–6 weeks.
- [ ] Get 5–10 Trustpilot reviews from real customers.
- [ ] Complete the LinkedIn page and post weekly (share each blog post).
- [ ] Directory listings with backlinks (G2, Capterra, SaaSworthy,
      Product Hunt, Indian startup directories).
- [ ] Optional: Google Keyword Planner volumes for the blog list above.

## 🔵 Security leftovers (after the 2026-10-16 audit)

All confirmed audit findings are fixed (migration 055, role guards, SSRF,
media proxy, webhook block). Still open, lower risk:
- [ ] Enforce the CSP (now report-only) after testing every page.
- [x] Rate limits keyed on the leftmost `X-Forwarded-For` (spoofable):
      fixed 2026-10-17, they now use `cf-connecting-ip`, `x-real-ip` or
      the last `x-forwarded-for` entry. **Verify on production** that
      Hostinger's proxy puts the visitor last (submit the demo form twice
      from a normal browser; it must not be throttled for everyone).
- [ ] Shared rate-limit store (Redis/Upstash) if we run more than one instance.
- [ ] Optional recipient cap on dashboard broadcasts.
- [ ] Dev-only npm advisories (shadcn CLI, eslint-config-next): upgrade
      when non-breaking versions ship.
- [ ] Clear the 26 React lint warnings (set-state-in-effect, memoization).
- [ ] Click through the main app screens in a browser to find UI bugs.
- [ ] External penetration test before scaling paid customers.

## 🟣 Feature backlog (competitor gap review, 2026-10-16)

Picked from the review against WATI, Interakt and AiSensy. Items that
already have an entry above are linked by number.

- [ ] **Online payment + auto-renewal for our plans** (Razorpay
      subscriptions, GST invoices; monthly / quarterly / yearly). See #1.
- [ ] **Mobile app or installable PWA with push notifications.** See #30.
- [x] **AI conversation summary:** (done 2026-10-16, sparkles icon in the chat header) one-click summary of a chat for the
      agent who picks it up (uses the existing Gemini setup).
- [x] **Auto-translate chats** (done 2026-10-16: message → English, reply → 14 languages) both ways (Hindi, Tamil, Marathi, etc.):
      agent writes in English, customer gets their language.
- [ ] **Broadcast failed-message auto-retry** with a retry log.
- [x] **Saved audience segments** (done 2026-10-17, migration 068; usable as
      a broadcast audience).
- [x] **Agent performance reports + downloadable reports** (done 2026-10-17,
      `/reports`; per-agent numbers are accurate for assigned chats; messages
      sent before 2026-10-17 have no sender recorded). See #27.
- [x] **Customer satisfaction rating** after a chat is closed (done
      2026-10-17, migration 069; 3 levels: Great / Okay / Bad, because Meta
      allows three reply buttons).
- [x] **QR code + wa.me link generator** (done 2026-10-16, Settings → QR & WhatsApp link) with a pre-filled message, for
      shops, flyers and packaging (Settings → Growth tools).
- [ ] **Zapier, Make, Pabbly** native connectors. Inbound webhooks and
      Google Sheets shipped (migrations 071, 059). See #29.
- [x] **WooCommerce integration** (done 2026-10-17, migration 063; no
      abandoned-cart event because WooCommerce has none). See #29.
- [x] **Drip sequences screen** (done 2026-10-17 as **Journeys**,
      migration 075: date-based, drip and win-back).
- [ ] **Conversation cost tracking:** Meta's per-message fees per chat
      and per campaign. See #12.
- [ ] **Instagram DM and Facebook Messenger** in the same shared inbox.

## 🚀 Big AI features (picked 2026-10-16)

- [x] **AI call notes** (done 2026-10-16): record a call (opt-in per call),
      AI writes summary, to-dos and follow-up into the contact's notes.
- [ ] **AI Sales Agent:** qualifies leads, answers in the customer's
      language, recommends catalog products, sends the order with UPI /
      WhatsApp Pay, chases unpaid orders, hands hot leads to a human with
      a summary. Builds on the chatbot, catalog, orders and summary.
- [x] **Voice-note AI** (done 2026-10-16): transcribe, translate, summarise
      and suggest a reply under customer voice notes, kept on the message.
      Still to do: let the chatbot answer voice notes, auto-transcribe, and
      #36 (save incoming media) so audio older than 7 days can be replayed.
- [ ] **Win-back radar** (the basic win-back message exists in Journeys,
      migration 075; the scoring part is not built): score customers (likely to buy again, about to
      churn, gone quiet) from chats, orders and Shopify, then send each
      group a personalised WhatsApp written by AI from their history.
- [ ] **Business brain:** owner asks questions about their chats and data
      ("which product do people complain about most?") and gets answers
      with numbers and links to chats.
- [ ] **AI catalog stylist:** customer sends a photo or a need ("red kurta
      under ₹1,500"), AI finds matching catalog products and sends them as a
      carousel with Buy now and in-chat payment.

## 🧱 Not built yet (known gaps after the 2026-10-17 release)

Security and abuse
- [ ] **Captcha (Cloudflare Turnstile)** on signup, login and forgot
      password. Needs the site key, then widget wiring, deploy, and only
      then enabling it in Supabase (enabling it first locks everyone out).
- [ ] **Monthly broadcast cap on the direct send API**
      (`/api/whatsapp/broadcast` only caps one request at 1,000 recipients;
      the plan's monthly broadcast count is enforced in the dashboard path).
- [ ] **Daily caps on invite emails and trial-account sends** (trial users
      can send up to 30 invitation emails a minute through our SMTP).
- [ ] **Suspend-account button** for confirmed abusers on
      `/admin/accounts/[id]`.
- [ ] **Enforce the CSP** (report-only today; also replace
      `unsafe-inline` / `unsafe-eval` with nonces later).
- [ ] **Hide the encrypted WhatsApp token column from viewers**
      (`whatsapp_config_select` lets any member read the ciphertext).
- [ ] **DNS-rebinding guard for outbound webhooks** (resolve once and pin
      the IP, or use an egress proxy).
- [ ] **Exposed database helper functions:** `_bcast_bump`,
      `recompute_broadcast_counts`, `account_effective_plan` are callable by
      signed-in users; revoke after a staging test (some run inside
      triggers).
- [ ] **Validate `ENCRYPTION_KEY` length at startup** and retire the legacy
      AES-CBC read path.

Product
- [ ] **Un-tagging in inbox bulk actions** (bulk tag only adds).
- [ ] **Mention notification preferences** (mentions can't be switched off
      per person yet).
- [ ] **Media and templates in scheduled messages** (text only today).
- [ ] **Shopify `read_products` scope** so product sync can read stock
      counts (today it uses the public product feed without stock).
- [ ] **Facebook Lead Ads** into contacts (needs Meta app review).
- [ ] **Instagram DM and Messenger** in the shared inbox (needs Meta app
      review).
- [ ] **Per-account time zone setting** (scheduled messages use the
      browser's time zone; business hours and journeys have their own).
- [ ] **Hindi / regional-language interface** and the installable PWA
      (see #30).
- [ ] **Retry for failed team alerts** (Slack / Discord / Telegram) and a
      retry log for failed broadcast sends.
