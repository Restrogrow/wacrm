# Shopify app configuration

`shopify.app.toml` is the configuration of Repeat Grow's Shopify app
(Dev Dashboard → Repeat Grow). Released as version `repeat-grow-2`.

| Setting | Value |
|---|---|
| Distribution | Public (Shopify App Store) — permanent |
| App URL | `https://repeatgrow.com/api/integrations/shopify/install` |
| Embedded | No (Repeat Grow runs on its own site) |
| Redirect URL | `https://repeatgrow.com/api/integrations/shopify/callback` |
| Scopes | `read_orders`, `read_fulfillments` |
| Install flow | Authorization code grant (`use_legacy_install_flow = true`) |
| Compliance webhooks | `https://repeatgrow.com/api/integrations/shopify/webhooks` |
| Webhooks API version | `2026-10` |

## Deploying a change

Edit `shopify.app.toml`, then from this folder:

```bash
# Token: Dev Dashboard → Repeat Grow → Settings → App automation token.
# Pass it only as an environment variable; never commit it.
SHOPIFY_CLI_PARTNERS_TOKEN=atkn_... npx @shopify/cli app deploy \
  --allow-updates --client-id 8c7214736524cd94400c17d2232b2515 \
  --message "what changed"
```

This releases a new app version immediately. The distribution method
and the App Store listing can't be set from the CLI — use the Partner
Dashboard (partners.shopify.com → App distribution → Repeat Grow).

## App Store submission checklist

- [x] Public distribution selected
- [x] Compliance webhooks configured (handled in
      `src/app/api/integrations/shopify/webhooks/route.ts`)
- [x] Not embedded; install → OAuth consent immediately (Shopify-signed
      install, no login first) → sign in / sign up → `/claim` attaches the
      store → Settings → Shopify. Needs migration `082_shopify_pending_installs.sql`
- [x] Pricing: one Free plan. Shopify order messages are plan-exempt
      (`planExempt` in `send-message.ts`), so they keep sending after the trial
- [ ] Protected customer data access requested (Level 2: name, email,
      phone, address) with justifications
- [ ] App Store listing: name, tagline, description, icon (1200×1200),
      screenshots, demo video, pricing ("Free to install"), support
      email, privacy policy URL (https://repeatgrow.com/privacy)
- [ ] Reviewer test account with WhatsApp connected, written test steps
      and a screen recording
- [ ] Submit for review (Partner Dashboard → App distribution → Repeat Grow)
