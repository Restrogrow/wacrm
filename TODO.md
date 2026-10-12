# TODO

## Rename leftover `wacrm` identifiers to Repeat Grow

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

## Pricing

- [ ] Add pricing to the directory and review-site listings (G2,
      Capterra, Trustpilot, Product Hunt, …) once it's final.
