# Store listing (copy and paste)

Everything you need to paste into **App Store Connect** and **Google Play Console**. Edit freely; keep the claims true.

## Names

| Field | Value |
|---|---|
| App name (both stores, 30 chars max) | `Repeat Grow: WhatsApp CRM` |
| iOS subtitle (30) | `Team inbox, leads & sales` |
| Android short description (80) | `Reply to customers on WhatsApp, manage leads and your team from one inbox.` |
| Category | Business (iOS primary), Business (Android) |
| Bundle ID / package | `com.repeatgrow.app` |
| Support email | support@repeatgrow.com |
| Support URL | https://repeatgrow.com/contact |
| Marketing URL | https://repeatgrow.com |
| Privacy policy URL | https://repeatgrow.com/privacy |
| Terms URL | https://repeatgrow.com/terms |

## Full description (both stores, 4000 chars max)

Run your WhatsApp customer chats from your phone.

Repeat Grow is the WhatsApp CRM for growing Indian businesses. The mobile app puts your shared team inbox, contacts and sales pipeline in your pocket, so no lead waits for a reply.

WHAT YOU CAN DO
- Shared team inbox: see every WhatsApp conversation, reply in real time, assign chats to teammates and close them when done.
- Never miss a customer: instant push notifications for new messages, mentions and assignments.
- Reply faster: saved replies, AI-suggested replies and ready templates when the 24-hour window has closed.
- Work as a team: private internal notes that customers never see, @mentions, and bulk actions.
- Know your customers: search contacts, see tags, notes, orders and deals in one place.
- Track sales: move deals through your pipeline and see revenue at a glance.
- See how you are doing: response times, conversations and messages, deals and orders.
- Safe by design: your team's roles decide who can reply, edit or delete.

BUILT FOR WHATSAPP BUSINESS
Repeat Grow works with the official WhatsApp Business API (Meta Cloud API), so your business number stays safe.

Note: You need a Repeat Grow account to sign in. Create one in the app or at repeatgrow.com. WhatsApp is a trademark of Meta. Repeat Grow is not affiliated with or endorsed by WhatsApp or Meta.

## Keywords (iOS, 100 chars max, comma separated, no spaces)

`whatsapp,crm,business,inbox,leads,sales,team,customer,support,broadcast,pipeline,contacts,chat`

## What's new (first release)

Welcome to Repeat Grow on mobile: team inbox, contacts, sales pipeline, notifications and more.

## Screenshots to capture (both stores)

Use the demo workspace (tap "Try the demo" on the login screen). Capture on:
- iPhone 6.9" (1320x2868) and 6.5" (1284x2778), iPad 13" (2064x2752) if you ship the iPad layout
- Android phone (1080x1920 or taller), plus a 7" and 10" tablet if you want the tablet badge

Suggested order: 1) Inbox list, 2) A conversation, 3) Quick replies and AI suggestions, 4) Contact details, 5) Pipeline, 6) Overview dashboard, 7) Dark mode inbox.
Add a one-line caption over each (for example "Every customer chat in one inbox").

## Google Play: data safety answers

| Question | Answer |
|---|---|
| Collects data? | Yes |
| Shared with third parties? | No (service providers only: hosting, push delivery, error monitoring) |
| Encrypted in transit? | Yes (HTTPS) |
| Can users request deletion? | Yes, in the app under More, Delete account, and at repeatgrow.com |
| Data collected | Name, email address, phone number (account holder and the business's customer contacts), messages (customer chats the business handles), user IDs, device identifier for push notifications (Expo push token), app interactions/diagnostics if error monitoring is enabled |
| Purpose | App functionality, account management, communications. Not used for advertising |
| Ads | No ads |
| Target audience | 18+ (business users) |
| Content rating | Everyone / Business app questionnaire; no user-generated public content |

## Apple: App Privacy ("nutrition label") answers

Data linked to the user, **not** used for tracking:
- Contact Info: name, email address, phone number
- User Content: messages (customer chats), photos if the user attaches one
- Identifiers: user ID, device ID (push token)
- Usage/Diagnostics: only if error monitoring is enabled

Tracking: **No**. (The app does not track users across other companies' apps or websites.)

## Apple App Review notes (paste into "Notes")

```
Repeat Grow is a B2B tool that lets a business answer its customers' WhatsApp messages with a team.

HOW TO TEST WITHOUT AN ACCOUNT
On the login screen tap "Try the demo". This signs in to a sample workspace containing fake contacts and conversations. No credentials are needed.

SIGN UP / SIGN IN
Email and password only (no third-party sign-in, so Sign in with Apple is not required).

ACCOUNT DELETION (Guideline 5.1.1(v))
More tab > Delete account (requires typing the account email to confirm).

PAYMENTS
The app contains no in-app purchases and shows no pricing. Plans are sold to organisations outside the app (Guideline 3.1.3(c), enterprise services).

NOTIFICATIONS
Push notifications tell staff about new customer messages. Permission is requested with an explanation.

PERMISSIONS
Photos/Camera: only when the user chooses to attach a picture to a chat.
```

## Before you submit (reviewer checklist)

- [ ] "Try the demo" works against the production site (needs `DEMO_LOGIN_EMAIL` / `DEMO_LOGIN_PASSWORD` set on the server, which you did)
- [ ] The app opens signed-out without crashing and onboarding appears once
- [ ] Delete account screen reachable from More
- [ ] Privacy policy and Terms open from inside the app
- [ ] No placeholder text, no "todo" screens, no test data in the production build
- [ ] Notifications permission prompt explains why before the system dialog
