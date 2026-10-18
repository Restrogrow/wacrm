# Repeat Grow mobile app (iOS and Android)

A native app built with **Expo (React Native)** in [`mobile/`](../mobile). It talks to the same backend as the website: the app signs in with Supabase, reads and writes through the same row-level-security rules, and calls the same `/api/...` routes with the user's access token as `Authorization: Bearer <token>` (see `src/lib/supabase/server.ts`). Nothing about roles, plan limits or WhatsApp sending is duplicated in the app.

## What is in the app

| Area | What it does |
|---|---|
| Getting started | 4-slide intro, sign up (2 steps), sign in, forgot password, "Try the demo" |
| Inbox | Live conversation list with filters and search, chat thread, send text and photos, saved replies, AI suggestions, internal notes, templates when the 24-hour window is closed, assign / close / reopen, bulk actions. Split view on tablets |
| Contacts | Search, tags, saved segments, contact detail with notes, orders and deals, add and edit |
| Overview | Key numbers, message chart, response time, deals and orders, needs-attention list; pipeline board |
| Notifications | Push for new messages, mentions and assignments, with deep links into the chat |
| More | Profile, appearance (system / light / dark), notifications, change password, help, legal, delete account, sign out |

Not in the app (use the website): billing and plans, automations and flows builder, broadcasts, template creation, integrations, catalog management, admin pages. This is deliberate: the app shows **no pricing and no purchase buttons**, which keeps it compliant with App Store rule 3.1.3(c) (enterprise services sold outside the app).

## Accounts you need (owner only)

1. **Expo account** (free): https://expo.dev/signup. Builds run in Expo's cloud (EAS), so you do not need a Mac or Android Studio.
2. **Apple Developer Program**: US$99 per year, https://developer.apple.com/programs/. Needed for the App Store and TestFlight.
3. **Google Play Console**: one-time US$25, https://play.google.com/console. New personal accounts must run a closed test with 12 testers for 14 days before production. A business (organisation) account skips that.
4. For push notifications: an Apple push key (created automatically by EAS when you sign in with your Apple account) and a Firebase project (Cloud Messaging V1) for Android.

## One-time setup (about 20 minutes)

From the `mobile` folder:

```bash
npm install
npm install -g eas-cli
eas login
eas init                 # creates the Expo project and writes its id into app.json (extra.eas.projectId)
```

Then:

```bash
eas credentials          # iOS: let EAS create the distribution certificate and push key (sign in with your Apple ID)
                         # Android: create/upload the FCM V1 service account key (Firebase > Project settings > Service accounts)
```

Run the push-token migration once in Supabase (`supabase/migrations/078_device_push_tokens.sql`, with `node scripts/run-migration.mjs 078_device_push_tokens.sql` from the web project).

## Try it on your phone today (no stores needed)

1. Install **Expo Go** from the App Store or Play Store.
2. In `mobile/`, copy `.env.example` to `.env` and fill the two Supabase values from `wacrm/.env.local`. Set `EXPO_PUBLIC_API_BASE_URL` to your computer's LAN address while testing against a local server, or `https://repeatgrow.com` for production.
3. `npx expo start` and scan the QR code.

Expo Go cannot receive push notifications on all platforms; use a development build (below) for the full experience.

## Build for testing

```bash
eas build -p android --profile preview      # installable .apk, share the link with testers
eas build -p ios --profile preview          # internal ad-hoc build (needs registered devices)
eas build -p ios --profile production       # then: eas submit -p ios  -> TestFlight
```

## Release

```bash
eas build -p android --profile production   # produces an .aab
eas build -p ios --profile production       # produces an .ipa
eas submit -p android                       # uploads to the Play Console (internal track, draft)
eas submit -p ios                           # uploads to App Store Connect / TestFlight
```

Then complete the store pages with [`mobile/store/LISTING.md`](../mobile/store/LISTING.md) (names, description, keywords, data-safety and privacy answers, App Review notes, screenshot list) and submit for review. Typical review time: Apple 1 to 2 days, Google a few hours to 7 days.

Set the Apple app id in `mobile/eas.json` (`submit.production.ios.ascAppId`) after creating the app in App Store Connect.

## Versioning

`app.json` holds the marketing version (`version`). Build numbers are incremented automatically by EAS (`autoIncrement` in `eas.json`).

## Server requirements

- `DEMO_LOGIN_EMAIL` / `DEMO_LOGIN_PASSWORD` set on the server (powers "Try the demo", which App Review will use).
- Supabase captcha is enabled, so the app shows the Cloudflare Turnstile check inside a web view (hostname `repeatgrow.com`, already allowed).
- Optional `EXPO_ACCESS_TOKEN` on the server if you turn on enhanced push security in Expo.

## Security notes

- The session is stored in the device keychain / keystore (chunked secure storage), never in plain app storage.
- Only the public Supabase URL and anon key ship in the app. The service-role key never leaves the server.
- Sign-out removes this device's push token.
- Account deletion is reachable in the app (App Store rule 5.1.1(v)).

## Known limits (v1)

- No Google or Apple sign-in (email and password only).
- No call handling, broadcasts, flows builder or catalog editing in the app.
- Android and iOS builds have been type-checked and bundled but not run on physical devices from this workspace: do a full pass on a real iPhone and Android phone (TestFlight and the internal Play track) before you submit.

## Building on this PC (no Expo login needed)

This PC has JDK 17 and the Android SDK in `C:\Users\INDIA\dev` (the same ones the RestroGrow apps use). Windows has a 260-character path limit, so build from a **short copy** of the project, for example `C:\rgm`:

1. Copy `wacrm\mobile` to `C:\rgm` (include `node_modules` with all its folders; skip `android\app\build`).
2. `npx expo prebuild --platform android --no-install` (once). In `android\gradle.properties` set `reactNativeArchitectures=armeabi-v7a,arm64-v8a` and add the Windows certificate lines (`-Djavax.net.ssl.trustStoreType=Windows-ROOT`).
3. In `android\app\build.gradle`, inside `defaultConfig`, add: `externalNativeBuild { cmake { arguments "-DCMAKE_OBJECT_PATH_MAX=100" } }`.
4. Point `android\gradle\wrapper\gradle-wrapper.properties` at the local `gradle-9.4.1-bin.zip` in `C:\Users\INDIA\dev` (check its SHA-256 against services.gradle.org).
5. Run with `JAVA_HOME=C:\Users\INDIA\dev\jdk17`, `ANDROID_HOME=C:\Users\INDIA\dev\android-sdk`, `JAVA_TOOL_OPTIONS=-Djavax.net.ssl.trustStoreType=Windows-ROOT` and the `EXPO_PUBLIC_*` values from `mobile\.env`: `gradlew assembleRelease --max-workers=2 --no-daemon`.
6. The APK is `android\app\build\outputs\apk\release\app-release.apk`. It is debug-signed, so it is for your own testing only. Google Play needs the EAS production `.aab`.

## Why the first launch showed "Unmatched Route"

The app needs a start page for `/` (`mobile/app/index.tsx`) and a `+not-found` fallback. Both exist since v1.0.1.
