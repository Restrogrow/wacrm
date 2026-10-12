# TODO

Gap list from the product review of 2026-10-13. Item numbers match that
review. #4 (opt-out / STOP handling) is done — see migration 036 and
`src/lib/contacts/opt-out.ts`.

## 🔴 Do first — the website promises these

- [ ] **#1 Billing.** Pricing page lists ₹499 / ₹999 / ₹1,999 plans but
      "Choose plan" only opens an email. Add Razorpay (or Stripe)
      subscriptions: checkout, renewals, invoices with GST, failed-payment
      handling, plan changes, and a Billing section in Settings.
- [ ] **#2 Enforce plan limits.** Nothing checks the published limits
      (contacts, broadcasts/month, automation flows, custom fields, team
      members). Add a `plan` on `accounts`, a limits table, server-side
      checks on create/send, and usage meters + upgrade prompts in the UI.
- [ ] **#3 Free trial.** "Start Free Trial" has no trial: add trial
      start/end on the account, reminders before it ends, and what happens
      after (read-only or downgrade).
- [x] **#5 Background jobs (cron).** Done 2026-10-13:
      `AUTOMATION_CRON_SECRET` is set and Hostinger runs
      `/api/automations/cron` and `/api/flows/cron` every minute with the
      `x-cron-secret` header (both verified returning 200).
      Still to do: document this setup in the README.

## 🟠 Customer-facing gaps

- [ ] **#6 Saved replies** in the inbox (type "/" to insert), shared per
      account, with variables like the contact's name.
- [ ] **#7 Scheduled broadcasts** ("send Friday 6 pm"); the type exists in
      `src/types` but there's no UI or scheduler.
- [ ] **#8 Notifications agents can't miss:** browser notifications +
      sound, email digests, and mobile push for new messages and
      assignments (today notifications only show inside the app).
- [ ] **#9 Contact export** to CSV (import exists, export doesn't);
      needed for data-protection requests too.
- [ ] **#10 Multiple WhatsApp numbers per account.** `whatsapp_config` is
      UNIQUE(account_id) (migration 017). Needs number selection in inbox,
      broadcasts, flows, automations, chatbot and the API.
- [ ] **#11 Catalog, orders and payments:** WhatsApp product catalog /
      multi-product messages, order messages, and payment links
      (Razorpay / UPI) for restaurants and shops.
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
- [ ] **#17 Error monitoring** (Sentry or similar) for the webhook,
      chatbot, broadcasts, Gemini and Meta calls, with alerts.
- [ ] **#18 End-to-end tests** (Playwright) for signup → connect WhatsApp
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
- [ ] **#25 Self-serve account & data deletion** (privacy law + our
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
- [ ] **#32 Daily WhatsApp summary.** Every day at 12 pm, send the
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
- [ ] **#29 Integrations:** Shopify / WooCommerce order updates, Google
      Sheets, Zapier / Make apps on top of the public API.
- [ ] **#30 Hindi interface and a mobile app** (or installable PWA with
      push notifications).
- [ ] **#31 Marketing:** submit the directory listings (G2, Capterra,
      Trustpilot, Product Hunt, …) and add their pricing once final; add
      screenshots and short videos to the Help Center.
