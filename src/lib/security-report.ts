// Content for /admin/security. Edit this file as things get fixed.
// Audit date: 2026-10-17 (static review of code + migrations; no live penetration test).

export type Severity = 'High' | 'Medium' | 'Low' | 'Info';
export type FindingStatus = 'fixed' | 'action' | 'planned' | 'accepted';

export interface Finding {
  id: string;
  severity: Severity;
  area: 'Fraud & abuse' | 'API & access' | 'Database' | 'Secrets & config';
  title: string;
  risk: string;
  status: FindingStatus;
  /** What was done, or what you still need to do. */
  note: string;
}

export const AUDIT_DATE = '17 Oct 2026';

export const FINDINGS: Finding[] = [
  {
    id: 'F1',
    severity: 'High',
    area: 'Fraud & abuse',
    title: 'Rate limits could be dodged by faking the visitor IP',
    risk: 'The limiter trusted the first x-forwarded-for value, which the visitor controls. A script could send unlimited demo requests, invite guesses and webhook probes by changing one header.',
    status: 'fixed',
    note: 'One shared getClientIp() now uses the proxy-set address (cf-connecting-ip, x-real-ip or the LAST x-forwarded-for entry). The three duplicate copies were removed and a test locks the behaviour in.',
  },
  {
    id: 'F2',
    severity: 'High',
    area: 'Fraud & abuse',
    title: 'No captcha or bot protection on signup, login and password reset',
    risk: 'Bots can create unlimited trial accounts and use your Google mailbox to mail-bomb victims with confirmation and reset emails (hurting your sending quota and domain reputation).',
    status: 'action',
    note: 'The Turnstile widget exists and the forms (signup, login, forgot password, Settings password, demo login) already send the token. To switch it on: add NEXT_PUBLIC_TURNSTILE_SITE_KEY on Hostinger and redeploy, check the box shows on /login, then Supabase → Authentication → Attack Protection → Turnstile + the secret key. Also lower Auth → Rate Limits (emails per hour, sign-ins per 5 min).',
  },
  {
    id: 'F3',
    severity: 'Medium',
    area: 'Fraud & abuse',
    title: 'Free trial could be re-claimed with a new email alias',
    risk: 'a+1@gmail.com, a.b@gmail.com and throwaway inboxes each got a fresh 7-day trial with Growth limits.',
    status: 'action',
    note: 'Migration 061 blocks ~70 disposable-email domains and allows one signup per real mailbox (Gmail dots and +tags are collapsed). Run supabase/migrations/061_security_hardening.sql in the Supabase SQL editor to switch it on. Add more domains to the blocked_email_domains table any time.',
  },
  {
    id: 'F4',
    severity: 'Medium',
    area: 'Fraud & abuse',
    title: 'Broadcast send API had no recipient cap',
    risk: 'A trial account could POST an unlimited list straight to /api/whatsapp/broadcast, skipping the monthly broadcast limit and risking a Meta ban on the shared setup.',
    status: 'fixed',
    note: 'Requests are now capped at 1,000 recipients. Still open: the monthly broadcast count is only enforced in the dashboard path — see F13.',
  },
  {
    id: 'F5',
    severity: 'Medium',
    area: 'API & access',
    title: 'Webhook delivery can be tricked by DNS rebinding',
    risk: 'A customer-chosen webhook URL is checked, then fetched with a second DNS lookup. A hostile domain could point at an internal address the second time.',
    status: 'planned',
    note: 'Needs an IP-pinned HTTP client or an egress proxy. Low likelihood (needs webhook-manage role and a custom DNS server); scheduled as follow-up work.',
  },
  {
    id: 'F6',
    severity: 'Medium',
    area: 'Database',
    title: 'Some database helper functions were callable from the public API',
    risk: 'Anyone who knew another customer’s ID could disable their webhook endpoint through the REST API.',
    status: 'action',
    note: 'record_webhook_failure is now locked to the server (in migration 061). Three other helpers (broadcast counters, plan lookup) are also exposed but are used inside triggers, so revoking them needs a staging test first.',
  },
  {
    id: 'F7',
    severity: 'Low',
    area: 'API & access',
    title: 'Raw database error text returned to the browser',
    risk: 'Error messages could reveal table and column names to an attacker probing the API.',
    status: 'fixed',
    note: 'Automations, flows, AI chatbot and blog routes now log the real error on the server and return a generic message.',
  },
  {
    id: 'F8',
    severity: 'Low',
    area: 'API & access',
    title: 'Contact search could be given extra filter syntax',
    risk: 'A signed-in user could alter their own search query. It cannot reach other accounts (database rules still apply).',
    status: 'fixed',
    note: 'The dashboard search now strips filter characters, matching the public API.',
  },
  {
    id: 'F9',
    severity: 'Low',
    area: 'API & access',
    title: 'Shopify "shop redact" could delete manual store connections',
    risk: 'A signed Shopify privacy request for a domain could also remove another account’s manually added store row.',
    status: 'fixed',
    note: 'Both compliance handlers are now limited to OAuth-connected stores.',
  },
  {
    id: 'F10',
    severity: 'Low',
    area: 'API & access',
    title: 'Flow settings accepted unchecked values',
    risk: 'Bad trigger type or entry node values could corrupt a customer’s own flow.',
    status: 'fixed',
    note: 'trigger_type is checked against the allowed list and entry_node_id must be text or empty.',
  },
  {
    id: 'F11',
    severity: 'Low',
    area: 'API & access',
    title: 'No cross-site (CSRF) origin check on cookie-based API calls',
    risk: 'Defence in depth: cookies are SameSite=Lax already, but a mis-set cookie could allow forged requests from another site.',
    status: 'fixed',
    note: 'Any state-changing /api request that carries a session cookie and a foreign Origin header is now rejected with 403. Webhooks and API-key clients are unaffected.',
  },
  {
    id: 'F12',
    severity: 'Low',
    area: 'Secrets & config',
    title: 'Demo passwords stored in plain files in OneDrive',
    risk: 'Files .env.demo-login and demo-login.txt hold working passwords for 5 accounts and sync to cloud storage. If those accounts exist on the live database, anyone with the file can log in.',
    status: 'action',
    note: 'Move the passwords to a password manager and delete both files. If the demo workspace is on the production database, change those 5 passwords now.',
  },
  {
    id: 'F13',
    severity: 'Low',
    area: 'Fraud & abuse',
    title: 'Monthly broadcast limit not enforced on the direct send API',
    risk: 'Plan limits on broadcasts per month apply to dashboard-created broadcasts only.',
    status: 'planned',
    note: 'Needs the send route to create a broadcast record and check the plan limit server-side.',
  },
  {
    id: 'F14',
    severity: 'Low',
    area: 'Fraud & abuse',
    title: 'Team-invite and demo-request emails have no daily cap',
    risk: 'A trial user can send up to 30 invitation emails a minute from your domain; the demo form can fill your inbox.',
    status: 'planned',
    note: 'Add a daily per-account cap and a captcha (the same Turnstile from F2 covers the demo form).',
  },
  {
    id: 'F15',
    severity: 'Low',
    area: 'Secrets & config',
    title: 'Content-Security-Policy only reports, it does not block',
    risk: 'If an XSS bug is ever introduced, the browser will not stop it.',
    status: 'planned',
    note: 'Review the report logs for two weeks, then switch the header to enforcing and move to nonces.',
  },
  {
    id: 'F16',
    severity: 'Low',
    area: 'Database',
    title: 'Viewers can read the encrypted WhatsApp token column',
    risk: 'The value is encrypted and useless without the server key, but viewers do not need it.',
    status: 'planned',
    note: 'Hide the column from non-admin roles or move it to a server-only table.',
  },
  {
    id: 'F17',
    severity: 'Info',
    area: 'Secrets & config',
    title: 'Dependencies, secrets in code, headers, encryption',
    risk: 'None found.',
    status: 'accepted',
    note: 'npm audit: 0 vulnerabilities. No secrets committed. HSTS, nosniff and frame protection are on. Tokens use AES-256-GCM. Row-level security is on for every table and enforced by a CI test. Webhooks verify signatures with constant-time checks.',
  },
];

export interface Layer {
  title: string;
  why: string;
  inPlace: string[];
  todo: string[];
}

/** The fraud / fake-trial prevention playbook shown on the page. */
export const PLAYBOOK: Layer[] = [
  {
    title: '1. Stop fake signups at the door',
    why: 'Bots and serial trial-claimers are cheapest to stop before an account exists.',
    inPlace: [
      'Signup guard in the database: disposable-email domains and repeat mailboxes are refused (after you run migration 061).',
      'Email confirmation required, so a typo or fake address never becomes a working account.',
      'Supabase blocks plan, trial-end and owner changes from the browser (migration 055).',
    ],
    todo: [
      'Turn on Turnstile captcha in Supabase Attack Protection after adding the public site key on Hostinger and redeploying (the forms already send the token).',
      'Lower Supabase Auth rate limits: emails per hour (start at 10), sign-ins per 5 minutes.',
      'Optional: require a mobile number OTP before starting the trial.',
    ],
  },
  {
    title: '2. Make a second free trial not worth it',
    why: 'Honest businesses stay; trial-hoppers move on to the next email.',
    inPlace: [
      'One trial per real mailbox: a+1@gmail.com and a.b@gmail.com count as the same person.',
      'Expired trials cannot send WhatsApp messages (the app returns 402).',
      'Trial accounts get Growth limits for 7 days only, then become read-only.',
    ],
    todo: [
      'Record the WhatsApp business ID (WABA) and refuse a second trial on the same one — the strongest signal, because a real business keeps its number.',
      'Limit trial accounts to a daily message cap (e.g. 200/day) until their first payment.',
      'Watch /admin for many sign-ups sharing a phone number, IP or business name.',
    ],
  },
  {
    title: '3. Stop customers using you to spam',
    why: 'A spammer on your platform can get the shared Meta setup flagged and hurt every customer.',
    inPlace: [
      'Broadcasts skip contacts who opted out, and a single send request is capped at 1,000 recipients.',
      'API keys are hashed, scoped and rate-limited per key.',
      'Meta itself caps messaging tiers and bans abusive numbers.',
    ],
    todo: [
      'Add a daily send cap per trial account and a review step for the first large broadcast.',
      'Add a one-click "suspend account" on /admin/accounts/[id] for confirmed abusers.',
      'Terms of Service: forbid unsolicited marketing and say you may suspend without refund.',
    ],
  },
  {
    title: '4. Protect your own mailbox and reputation',
    why: 'Signup and reset emails go out under your name; abuse burns your Google quota and lands you in spam.',
    inPlace: [
      'Per-user limits on invitation emails and per-IP limits on the demo form (now harder to dodge, see F1).',
      'Honeypot field on the demo request form.',
    ],
    todo: [
      'Set up SPF, DKIM and DMARC on repeatgrow.com (in your Email to-do).',
      'Captcha on demo and contact forms.',
      'Daily cap on team-invite emails per account.',
    ],
  },
  {
    title: '5. Payments and refund fraud',
    why: 'Stolen cards and chargebacks cost money and can get your payment account frozen.',
    inPlace: ['Plans are changed only by a platform admin through /admin; customers cannot edit billing fields.'],
    todo: [
      'Use your payment provider’s fraud tools (Razorpay: 3-D Secure on, risk rules on, block repeated failed cards).',
      'Do not auto-upgrade on a payment; confirm the payment webhook first, and keep an audit note when you change a plan.',
      'Keep a simple refund policy and screenshot-style evidence for disputes.',
    ],
  },
  {
    title: '6. Watch, alert, respond',
    why: 'You cannot stop everything, so catch it fast.',
    inPlace: [
      'Sentry error tracking, /admin/system health, webhook rejection blocking.',
      'Account deletion needs admin approval.',
    ],
    todo: [
      'Daily admin email: sign-ups in the last 24h, count from the same IP/phone, accounts that sent over 500 messages.',
      'Alert yourself when sign-ups jump above 3x normal.',
      'Keep a written incident checklist: suspend account, rotate keys, tell Meta/Google if needed.',
    ],
  },
];

export const CUSTOMER_SCAM_TIPS: string[] = [
  'We will never ask for your password, OTP or Meta access token on WhatsApp, phone or email.',
  'Billing messages only come from support@repeatgrow.com. Anything else is fake.',
  'Never share your API key. If one leaks, revoke it in Settings and create a new one.',
  'Pay only through the invoice link inside your dashboard.',
];
