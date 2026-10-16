# TODO

Gap list from the product review of 2026-10-13. Item numbers match that
review. #4 (opt-out / STOP handling) is done — see migration 036 and
`src/lib/contacts/opt-out.ts`.

## 🔴 Do first — the website promises these

- [ ] **#1 Billing — payment gateway.** Plans, Settings → Plan & billing
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
      sound, email digests, and mobile push for new messages and
      assignments (today notifications only show inside the app).
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
      required by the owner for the whole team.
- [ ] **#22 Audit log:** who deleted contacts, exported data, changed
      roles, created/revoked keys, connected/disconnected apps.
- [ ] **#23 Enforce the CSP.** `next.config.mjs` ships it as
      report-only. Fix violations, then enforce (add partner redirect
      origins such as restrogrow.com to `form-action` for Connect).
- [x] **#25 Self-serve account & data deletion** — Settings → Your data (admin-approved deletion). (privacy law + our
      privacy policy).

### #24 Rename leftover `wacrm` identifiers to Repeat Grow

These still use the old `wacrm` name. They were left as-is because
renaming them breaks existing API keys and webhook integrations, so
each needs a backwards-compatible rollout.

- [ ] **API key prefix** `wacrm_live_` → e.g. `rg_live_`
      (`src/lib/api-keys/keys.ts`, `API_KEY_PREFIX`).
      Issue new keys with the new prefix but keep accepting
      `wacrm_live_` keys until every customer has rotated. Update the
      key-format check in the same file (the `startsWith(API_KEY_PREFIX)`
      test) and the `bearerFormat` in `src/lib/api/v1/openapi.ts`.
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
      customers; reply suggestions and chat summaries for agents;
      knowledge base from a website URL or PDF instead of pasted text.
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
- [ ] **#27 Analytics:** per-agent response times, broadcast
      click/revenue tracking, inbox → won-deal funnel.
- [ ] **#28 More ways in:** Click-to-WhatsApp ad leads (Facebook /
      Instagram), website chat widget, QR codes.
- [ ] **#29 Integrations:** WooCommerce, Razorpay / Cashfree, Wix,
      Dukaan, BigCommerce, Google Forms / Typeform / Tally, Google
      Calendar / Calendly, Zoom / Google Meet, Zapier / Make / Pabbly
      Connect, Google Sheets. Plan and keys: `docs/INTEGRATIONS.md`.
      (Shopify shipped — see #45.)
- [ ] **#46 Calendly follow-ups.** Token integration shipped (Settings
      → Calendly, migration 040). Next: Cal.com (free webhooks, same
      engine), Google Calendar reminders, one-click Calendly OAuth,
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
