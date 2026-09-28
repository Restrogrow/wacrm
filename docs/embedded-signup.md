# WhatsApp Embedded Signup

Lets a customer connect their own WhatsApp Business Account via a
Facebook popup ("Connect with Facebook") instead of copy-pasting a
Phone Number ID, WABA ID, and access token by hand. Built for the
Meta App Review / Tech Provider approval stage.

> **Status:** code complete, not yet configured. The feature is live
> in the codebase but the "Connect with Facebook" button renders
> nothing until the env vars below are set — the manual credential
> form keeps working standalone either way.

## How it works

1. User clicks **Connect with Facebook** in Settings → WhatsApp
   connection. This loads the Facebook JS SDK and calls `FB.login`
   with our `config_id`, opening Meta's popup.
2. Inside the popup, the customer logs into Meta, picks (or creates)
   a Business Portfolio, a WhatsApp Business Account, and a phone
   number, and approves our app's access.
3. On completion, Meta sends back two things that have to be joined
   client-side before anything can happen (they can arrive in either
   order):
   - A `postMessage` (`type: "WA_EMBEDDED_SIGNUP"`) carrying
     `waba_id`, `phone_number_id`, `business_id`.
   - `FB.login`'s own callback, carrying a short-lived authorization
     `code` (expires in **30 seconds**).
4. The browser POSTs `{code, waba_id, phone_number_id, business_id}`
   to `POST /api/whatsapp/embedded-signup`.
5. That route exchanges the code for a **Business Integration System
   User (BISU) access token** (`GET /oauth/access_token` — a
   server-to-server call, since it needs the App Secret), verifies
   the token actually grants access to that phone number, encrypts
   and saves it, and subscribes the WABA to our app.
6. The row is saved as `connected` but **not registered** — the
   popup never collects a 2-step-verification PIN. The UI's existing
   "Not registered" banner picks this up and shows a PIN field;
   submitting it hits `POST /api/whatsapp/config/register`, which
   decrypts the already-stored token server-side and completes
   Meta's `/register` call. (This endpoint is also why manual-flow
   users no longer have to re-paste their access token just to add a
   PIN — a side benefit, not the main point.)

## Why no token ever reaches the browser twice

Meta's own guidance: store the BISU token encrypted, never return it
to the browser, never show it in the UI. That's why step 6 above is
a separate PIN-only endpoint instead of reusing the manual form's
"paste your access token to save" flow — an embedded-signup user has
no token to paste; they never see it.

## Setup checklist

1. **Meta for Developers → your app → Facebook Login for Business →
   Configurations** — create one scoped to WhatsApp Embedded Signup.
   Copy its **Configuration ID**.
2. **Client OAuth settings** (same app) — enable Client OAuth login,
   Web OAuth login, Enforce HTTPS, Embedded Browser OAuth Login,
   Login with the JavaScript SDK. Add your production domain to
   **Allowed domains** and **Valid OAuth Redirect URIs** (HTTPS
   only) — Meta silently refuses to return signup data to a domain
   that isn't listed here.
3. **Environment variables** (see `.env.local.example` for the full
   comments):
   ```
   META_APP_ID=...              # already required for template image headers
   META_APP_SECRET=...          # already required for webhook signature verification
   NEXT_PUBLIC_META_APP_ID=...  # same value as META_APP_ID
   NEXT_PUBLIC_META_CONFIG_ID=...  # the Configuration ID from step 1
   ```
4. **Run migration `031_embedded_signup.sql`** against Supabase
   (`supabase db push` or paste into the SQL editor) — adds
   `business_id` and `signup_method` to `whatsapp_config`. Not
   applied automatically; nothing in this feature works until it is.
5. **Onboarding limits**: by default Meta caps you at 10 new business
   customers per rolling 7-day window. Completing Business
   Verification + App Review + Access Verification raises that to
   200/week — relevant since this is being built for the App Review
   stage.

## Files

| File | Purpose |
|---|---|
| `supabase/migrations/031_embedded_signup.sql` | adds `business_id`, `signup_method` columns |
| `src/lib/whatsapp/meta-api.ts` → `exchangeCodeForToken()` | the `/oauth/access_token` exchange |
| `src/app/api/whatsapp/embedded-signup/route.ts` | exchanges code, verifies, saves the config row |
| `src/app/api/whatsapp/config/register/route.ts` | PIN-only `/register` completion (no token re-entry) |
| `src/components/settings/embedded-signup-button.tsx` | FB SDK loader + `FB.login` + postMessage listener |
| `src/components/settings/whatsapp-config.tsx` | "Quick connect" card + PIN field wired in |

## Known gaps / things to verify against a live Meta app

- Not yet tested end-to-end against a real Meta app + WABA (no
  `META_APP_ID`/`NEXT_PUBLIC_META_CONFIG_ID` configured in this
  environment) — the code path is right per Meta's documented
  contract, but the popup flow itself hasn't been clicked through.
- `subscribeWabaToApp` failures are treated as non-fatal (matches
  the existing manual-flow behavior) — check server logs if events
  don't show up after a signup.
- No `debug_token` call after exchange (would double-check granted
  scopes/WABA before trusting the client-supplied `waba_id`/
  `phone_number_id`). Not currently needed because `verifyPhoneNumber`
  already fails closed if the token doesn't actually grant access to
  the claimed phone number — but worth adding if Meta review flags it.

## Sources

- [Embedded Signup overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview/)
- [Embedded Signup implementation](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation)
- [Access tokens guide](https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens/)
