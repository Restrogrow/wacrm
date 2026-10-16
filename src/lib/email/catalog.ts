// ============================================================
// The catalogue of every email the platform sends (or should send),
// each renderable with sample data. Drives /admin/emails — the preview
// + test-send page — and the tests that keep every template healthy.
// ============================================================

import { demoRequestEmail } from './demo-email'
import {
  SUPABASE_AUTH_TEMPLATES,
  deletionDecisionEmail,
  deletionRequestAdminEmail,
  fillSupabaseVars,
  numberHealthAlertEmail,
  teamInviteEmail,
  testEmail,
  welcomeEmail,
  type BuiltEmail,
} from './content'
import { brandedReminderEmail, type ReminderStage } from '@/lib/billing/reminders'
import { renderSummaryEmail } from '@/lib/summary/report'
import { SITE_URL } from '@/lib/seo'

export type EmailCategory = 'Sign-in & security' | 'Team' | 'Billing' | 'Reports & alerts' | 'Sales & admin' | 'System'

/** Who actually sends it. */
export type EmailSender = 'app' | 'supabase'

export interface CatalogEntry {
  id: string
  name: string
  category: EmailCategory
  sender: EmailSender
  /** Plain-English: what causes this email. */
  trigger: string
  /** Who receives it. */
  audience: string
  /** Cron / schedule, if it is automated. */
  schedule?: string
  /** True when something in the product sends it today. */
  live: boolean
  /** When not live: what is missing. */
  note?: string
  /** Supabase only: where to paste it. */
  supabaseTemplate?: string
  render: () => BuiltEmail
}

const sampleAccount = {
  id: 'sample',
  name: 'Demo Store',
  plan: 'trial' as const,
  trial_ends_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
  plan_expires_at: null as string | null,
  billing_reminder_key: null as string | null,
}
const samplePaid = {
  ...sampleAccount,
  plan: 'growth' as const,
  trial_ends_at: null as string | null,
  plan_expires_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
}

function reminder(stage: ReminderStage): () => BuiltEmail {
  return () => brandedReminderEmail(stage.startsWith('paid') ? samplePaid : sampleAccount, stage)
}

function supa(key: keyof typeof SUPABASE_AUTH_TEMPLATES, live: boolean, trigger: string, note?: string): CatalogEntry {
  const t = SUPABASE_AUTH_TEMPLATES[key]
  return {
    id: `auth-${key.replace(/_/g, '-')}`,
    name: t.dashboardName,
    category: 'Sign-in & security',
    sender: 'supabase',
    trigger,
    audience: 'The person signing in / signing up',
    live,
    note,
    supabaseTemplate: t.dashboardName,
    render: () => {
      const raw = t.build()
      return { subject: fillSupabaseVars(raw.subject), html: fillSupabaseVars(raw.html), text: fillSupabaseVars(raw.text) }
    },
  }
}

/** The raw template (with {{ .Token }} etc.) to paste into the Supabase dashboard. */
export function supabaseTemplateSource(key: keyof typeof SUPABASE_AUTH_TEMPLATES): BuiltEmail {
  return SUPABASE_AUTH_TEMPLATES[key].build()
}

export const EMAIL_CATALOG: CatalogEntry[] = [
  // ---- Sign-in & security (Supabase Auth) ----
  supa('confirm_signup', true, 'Someone creates an account with email + password.', 'Paste the template into Supabase to get the branded look with the 6-digit code.'),
  supa('magic_link', true, 'Someone asks for a magic link / one-time login code.', 'Only used if you turn on email-code login.'),
  supa('recovery', true, 'Someone clicks "Forgot password".', 'Paste the template into Supabase for the branded look.'),
  supa('invite', false, 'You invite a user straight from the Supabase dashboard.', 'The app invites teammates with its own "Team invite" email instead.'),
  supa('email_change', true, 'Someone changes their email address.'),
  supa('reauthentication', false, 'A sensitive action asks the user to re-confirm with a code.', 'Enable "Secure password change" in Supabase to use it.'),

  // ---- Team ----
  {
    id: 'team-invite',
    name: 'Team invite',
    category: 'Team',
    sender: 'app',
    trigger: 'An admin invites a teammate and types their email (Settings → Team members → Invite member).',
    audience: 'The invited teammate',
    live: true,
    render: () =>
      teamInviteEmail({
        inviterName: 'Priya Sharma',
        accountName: 'Demo Store',
        role: 'agent',
        url: `${SITE_URL}/join/sample-token`,
        expiresInDays: 7,
      }),
  },
  {
    id: 'welcome',
    name: 'Welcome',
    category: 'Sign-in & security',
    sender: 'app',
    trigger: 'Right after a new account is created.',
    audience: 'The new account owner',
    live: false,
    note: 'Template is ready but nothing sends it yet — it needs a "welcome sent" flag in the database so it goes out once.',
    render: () => welcomeEmail({ name: 'Aarav Sharma' }),
  },

  // ---- Billing ----
  ...(
    [
      ['trial-2d', 'Trial ends in 2 days', 'Two days before the free trial ends.'],
      ['trial-today', 'Last day of trial', 'On the last day of the free trial.'],
      ['trial-ended', 'Trial ended', 'The day the trial ends (account becomes read-only).'],
      ['paid-3d', 'Plan renews in 3 days', 'Three days before a paid plan expires.'],
      ['paid-ended', 'Plan expired', 'The day a paid plan expires.'],
    ] as const
  ).map(
    ([stage, name, trigger]): CatalogEntry => ({
      id: `billing-${stage}`,
      name,
      category: 'Billing',
      sender: 'app',
      trigger,
      audience: 'The account owner',
      schedule: 'Cron · every minute (sends during Indian daytime, once per stage)',
      live: true,
      render: reminder(stage),
    }),
  ),

  // ---- Reports & alerts ----
  {
    id: 'daily-summary',
    name: 'Daily summary',
    category: 'Reports & alerts',
    sender: 'app',
    trigger: 'Every day at the hour each account chose (Settings → Daily summary).',
    audience: 'Emails chosen in Daily summary (default: the owner)',
    schedule: 'Cron · every minute (picks accounts whose hour has arrived)',
    live: true,
    render: () =>
      renderSummaryEmail({
        accountName: 'Demo Store',
        window: { from: new Date(), to: new Date(), label: 'Yesterday, 13 Oct' },
        stats: {
          messagesReceived: 184,
          messagesSent: 203,
          newContacts: 12,
          newConversations: 17,
          awaitingReply: 5,
          broadcastsSent: 2,
          dealsCreated: 4,
          dealsWon: 2,
          dealsWonValue: '₹41,500',
          optOuts: 1,
        },
        appUrl: SITE_URL,
      }),
  },
  {
    id: 'number-health-warning',
    name: 'WhatsApp number health — heads up',
    category: 'Reports & alerts',
    sender: 'app',
    trigger: "Meta's quality rating or messaging limit for the number drops.",
    audience: 'The account owner',
    schedule: 'Cron · daily check per account',
    live: true,
    render: () =>
      numberHealthAlertEmail({
        level: 'warning',
        displayPhone: '+91 98765 43210',
        accountName: 'Demo Store',
        reasons: ['Quality rating dropped to Medium.', 'Messaging limit is 1,000 customers a day.'],
      }),
  },
  {
    id: 'number-health-critical',
    name: 'WhatsApp number health — action needed',
    category: 'Reports & alerts',
    sender: 'app',
    trigger: 'The number is flagged or blocked from sending.',
    audience: 'The account owner',
    schedule: 'Cron · daily check per account',
    live: true,
    render: () =>
      numberHealthAlertEmail({
        level: 'critical',
        displayPhone: '+91 98765 43210',
        accountName: 'Demo Store',
        reasons: ['Quality rating is Low.', 'Meta has limited this number from sending messages.'],
      }),
  },

  // ---- Sales & admin ----
  {
    id: 'demo-request',
    name: 'New demo request',
    category: 'Sales & admin',
    sender: 'app',
    trigger: 'A visitor submits the form on repeatgrow.com/demo.',
    audience: 'Your sales inbox (DEMO_REQUEST_EMAIL)',
    live: true,
    render: () =>
      demoRequestEmail({
        name: 'Aarav Sharma',
        businessName: 'Sharma Traders',
        whatsapp: '+91 98100 00001',
        email: 'aarav@example.com',
        teamSize: '2-5',
        useCase: 'Broadcasts & order updates',
        message: 'We sell festive gift boxes and want to message past buyers.',
        sourcePage: '/pricing',
      }),
  },
  {
    id: 'deletion-request',
    name: 'Account deletion request',
    category: 'Sales & admin',
    sender: 'app',
    trigger: 'A user asks to delete their account (Settings → Your data).',
    audience: 'Your admin inbox (ADMIN_ALERT_EMAIL)',
    live: true,
    render: () =>
      deletionRequestAdminEmail({
        email: 'owner@example.com',
        businessName: 'Demo Store',
        isOwner: true,
        reason: 'We stopped using WhatsApp for sales.',
      }),
  },
  {
    id: 'deletion-approved',
    name: 'Account deleted (approved)',
    category: 'Sales & admin',
    sender: 'app',
    trigger: 'You approve a deletion request in the admin dashboard.',
    audience: 'The user who asked',
    live: true,
    render: () => deletionDecisionEmail('approved', null),
  },
  {
    id: 'deletion-rejected',
    name: 'Deletion request declined',
    category: 'Sales & admin',
    sender: 'app',
    trigger: 'You decline a deletion request in the admin dashboard.',
    audience: 'The user who asked',
    live: true,
    render: () => deletionDecisionEmail('rejected', 'Please transfer ownership to another admin first.'),
  },

  // ---- System ----
  {
    id: 'smtp-test',
    name: 'SMTP test',
    category: 'System',
    sender: 'app',
    trigger: 'You press a test button on this page.',
    audience: 'restrogrow@gmail.com',
    live: true,
    render: testEmail,
  },
]

export function getCatalogEntry(id: string): CatalogEntry | undefined {
  return EMAIL_CATALOG.find((e) => e.id === id)
}

export interface AutomatedJob {
  name: string
  endpoint: string
  schedule: string
  /** What it does each run, one line each. */
  tasks: { label: string; email?: string }[]
}

/** Background jobs (what runs by itself, and which emails it triggers). */
export const AUTOMATED_JOBS: AutomatedJob[] = [
  {
    name: 'Main cron',
    endpoint: 'GET /api/automations/cron',
    schedule: 'Every minute · header x-cron-secret: $AUTOMATION_CRON_SECRET',
    tasks: [
      { label: 'Run delayed automation steps' },
      { label: 'Send scheduled broadcasts (batched)' },
      { label: 'Shopify abandoned-cart reminders' },
      { label: 'Calendly 24 h / 1 h booking reminders' },
      { label: 'Daily summary emails', email: 'Daily summary' },
      { label: 'WhatsApp number health check (daily per account)', email: 'Number health alerts' },
      { label: 'Trial / renewal reminders (Indian daytime only)', email: 'Billing reminders (5)' },
    ],
  },
  {
    name: 'Flows cron',
    endpoint: 'GET /api/flows/cron',
    schedule: 'Every 5 minutes is enough · header x-cron-secret',
    tasks: [{ label: 'Time out abandoned flow runs so customers can re-trigger flows' }],
  },
  {
    name: 'Health check (for uptime monitors)',
    endpoint: 'GET /api/health',
    schedule: 'Every 1–5 minutes from an uptime monitor (UptimeRobot etc.)',
    tasks: [{ label: 'Reports database + cron heartbeats; same data as /admin/system' }],
  },
]
