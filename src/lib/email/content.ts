// ============================================================
// Pure email builders (no I/O) shared by the senders and by the
// /admin/emails preview + test page. Every email the app sends goes
// through the branded shell in ./branded.ts so they all look the same.
// ============================================================

import { SITE_URL, SUPPORT_EMAIL } from '@/lib/seo'
import {
  brandedEmailHtml,
  brandedEmailText,
  type BrandedEmailInput,
  type EmailButton,
  type EmailRow,
} from './branded'

export interface BuiltEmail {
  subject: string
  html: string
  text: string
}

function build(subject: string, input: BrandedEmailInput): BuiltEmail {
  return { subject, html: brandedEmailHtml(input), text: brandedEmailText(input) }
}

/**
 * Turn the plain-text body the app already writes ("Hi,\n\n…\n\n• A: x\n• B: y\n\n…")
 * into a branded email without changing the wording: bullet lines become a
 * label/value table, the first paragraph is the intro, the rest is a note.
 */
export function autoBrandedEmail(args: {
  subject: string
  text: string
  eyebrow?: string
  title?: string
  buttons?: EmailButton[]
  reason: string
  noteLabel?: string
}): BuiltEmail {
  const paragraphs = args.text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !/^hi,?$/i.test(p))

  const rows: EmailRow[] = []
  const prose: string[] = []
  for (const p of paragraphs) {
    const lines = p.split('\n')
    const bullets = lines.filter((l) => l.startsWith('•'))
    if (bullets.length > 0 && bullets.length >= lines.length - 1) {
      for (const b of bullets) {
        const body = b.replace(/^•\s*/, '')
        const i = body.indexOf(':')
        rows.push(i > 0 ? { label: body.slice(0, i).trim(), value: body.slice(i + 1).trim() } : { label: '•', value: body })
      }
    } else {
      prose.push(p)
    }
  }
  const [intro, ...rest] = prose
  return build(args.subject, {
    preheader: (intro ?? args.subject).slice(0, 140),
    eyebrow: args.eyebrow,
    title: args.title ?? args.subject,
    intro,
    rows: rows.length ? rows : undefined,
    note: rest.length ? { label: args.noteLabel ?? 'More', text: rest.join('\n\n') } : undefined,
    buttons: args.buttons,
    reason: args.reason,
  })
}

// ------------------------------------------------------------
// WhatsApp number health alert (owner)
// ------------------------------------------------------------

export function numberHealthAlertEmail(a: {
  level: 'warning' | 'critical'
  displayPhone: string | null
  accountName: string
  reasons: string[]
}): BuiltEmail {
  const text = [
    `Your WhatsApp number ${a.displayPhone ?? ''} for ${a.accountName} needs attention:`,
    ...a.reasons.map((r) => `• ${r}`),
    '',
    'What helps: only message customers who opted in, keep templates relevant, honour STOP requests, and slow down broadcasts until quality recovers.',
    '',
    `See the details in Repeat Grow: ${SITE_URL}/settings?tab=whatsapp`,
  ].join('\n')
  const subject = `${a.level === 'critical' ? 'Action needed' : 'Heads up'}: your WhatsApp number's health`
  const brandedInput: BrandedEmailInput = {
    preheader: `Your WhatsApp number ${a.displayPhone ?? ''} needs attention.`.trim(),
    eyebrow: a.level === 'critical' ? 'Action needed' : 'Heads up',
    title: `Your WhatsApp number needs attention`,
    intro: `Your WhatsApp number ${a.displayPhone ?? ''} for ${a.accountName} has these issues:`.replace('  ', ' '),
    rows: a.reasons.map((r, i) => ({ label: `Issue ${i + 1}`, value: r })),
    note: {
      label: 'What helps',
      text: 'Only message customers who opted in, keep templates relevant, honour STOP requests, and slow down broadcasts until quality recovers.',
    },
    buttons: [{ label: 'Open number health', href: `${SITE_URL}/settings?tab=whatsapp` }],
    reason: 'You are receiving this because you own this Repeat Grow account. Number health is checked every day.',
  }
  return { subject, html: brandedEmailHtml(brandedInput), text }
}

// ------------------------------------------------------------
// Account deletion
// ------------------------------------------------------------

export function deletionRequestAdminEmail(req: {
  email: string | null
  businessName: string | null
  isOwner: boolean
  reason: string | null
}): BuiltEmail {
  const text = [
    `${req.email ?? 'A user'} asked to delete their Repeat Grow account.`,
    req.isOwner
      ? `They own "${req.businessName}". Approving deletes the business and all of its data.`
      : `They are a teammate in "${req.businessName}". Approving deletes only their login.`,
    req.reason ? `Reason: ${req.reason}` : '',
    `Review it on ${SITE_URL}/admin#deletion-requests`,
  ]
    .filter(Boolean)
    .join('\n\n')
  return {
    subject: `Account deletion request — ${req.businessName ?? req.email ?? 'a user'}`,
    text,
    html: brandedEmailHtml({
      preheader: `${req.email ?? 'A user'} asked to delete their account.`,
      eyebrow: 'Account deletion request',
      title: `${req.email ?? 'A user'} wants to delete their account`,
      intro: req.isOwner
        ? `They own "${req.businessName}". Approving deletes the business and all of its data.`
        : `They are a teammate in "${req.businessName}". Approving deletes only their login.`,
      rows: [
        ...(req.email ? [{ label: 'Email', value: req.email, href: `mailto:${req.email}` }] : []),
        ...(req.businessName ? [{ label: 'Business', value: req.businessName }] : []),
        { label: 'Role', value: req.isOwner ? 'Owner' : 'Teammate' },
      ],
      note: req.reason ? { label: 'Their reason', text: req.reason } : undefined,
      buttons: [{ label: 'Review the request', href: `${SITE_URL}/admin#deletion-requests` }],
      reason: 'You are receiving this because you are on the Repeat Grow admin alert list.',
    }),
  }
}

export function deletionDecisionEmail(decision: 'approved' | 'rejected', note: string | null): BuiltEmail {
  const approved = decision === 'approved'
  const text = approved
    ? `Your request was approved and your Repeat Grow account has been deleted.\n\nIf you didn't ask for this, reply to this email straight away.`
    : `We didn't delete your Repeat Grow account.${note ? `\n\n${note}` : ''}\n\nReply to this email or write to ${SUPPORT_EMAIL} if you have questions. You can file a new request any time in Settings → Your data.`
  return {
    subject: approved ? 'Your Repeat Grow account has been deleted' : 'About your Repeat Grow account deletion request',
    text,
    html: brandedEmailHtml({
      preheader: approved ? 'Your Repeat Grow account has been deleted.' : "We didn't delete your Repeat Grow account.",
      eyebrow: 'Account deletion',
      title: approved ? 'Your account has been deleted' : "We didn't delete your account",
      intro: approved
        ? 'Your request was approved and your Repeat Grow account has been deleted.'
        : "We didn't delete your Repeat Grow account.",
      note: approved
        ? { label: "Didn't ask for this?", text: 'Reply to this email straight away.' }
        : {
            label: 'Details',
            text: `${note ? `${note}\n\n` : ''}You can file a new request any time in Settings → Your data.`,
          },
      buttons: approved ? undefined : [{ label: 'Contact support', href: `mailto:${SUPPORT_EMAIL}`, variant: 'secondary' }],
      reason: 'You are receiving this because of a deletion request on your Repeat Grow account.',
    }),
  }
}

// ------------------------------------------------------------
// Team invite (sent to the invitee when an admin enters their email)
// ------------------------------------------------------------

export function teamInviteEmail(a: {
  inviterName: string
  accountName: string
  role: string
  url: string
  expiresInDays: number
}): BuiltEmail {
  return build(`${a.inviterName} invited you to ${a.accountName} on Repeat Grow`, {
    preheader: `Join ${a.accountName} on Repeat Grow as ${a.role}.`,
    eyebrow: "You're invited",
    title: `Join ${a.accountName} on Repeat Grow`,
    intro: `${a.inviterName} invited you to work together on WhatsApp conversations, contacts and deals.`,
    rows: [
      { label: 'Team', value: a.accountName },
      { label: 'Your role', value: a.role.charAt(0).toUpperCase() + a.role.slice(1) },
      { label: 'Invited by', value: a.inviterName },
      { label: 'Link valid for', value: `${a.expiresInDays} day${a.expiresInDays === 1 ? '' : 's'}` },
    ],
    buttons: [{ label: 'Accept invitation', href: a.url }],
    reason: `This invitation link is personal to you — don't forward it. If you weren't expecting it, you can ignore this email.`,
  })
}

// ------------------------------------------------------------
// Welcome
// ------------------------------------------------------------

export function welcomeEmail(a: { name: string }): BuiltEmail {
  return build(`Welcome to Repeat Grow, ${a.name.split(' ')[0] || 'there'}!`, {
    preheader: 'Connect your WhatsApp number and send your first message in minutes.',
    eyebrow: 'Welcome',
    title: `Welcome to Repeat Grow, ${a.name.split(' ')[0] || 'there'}!`,
    intro: "You're in. Here's the fastest way to get your first customer conversation flowing:",
    rows: [
      { label: '1. Connect WhatsApp', value: 'Settings → WhatsApp → Quick connect' },
      { label: '2. Add contacts', value: 'Import a CSV or add them one by one' },
      { label: '3. Send a broadcast', value: 'Use an approved template to reach everyone' },
      { label: '4. Invite your team', value: 'Settings → Team members' },
    ],
    buttons: [
      { label: 'Open Repeat Grow', href: `${SITE_URL}/dashboard` },
      { label: 'Read the guide', href: `${SITE_URL}/docs`, variant: 'secondary' },
    ],
    reason: `Need a hand? Reply to this email or write to ${SUPPORT_EMAIL}.`,
  })
}

// ------------------------------------------------------------
// Test email
// ------------------------------------------------------------

export function testEmail(): BuiltEmail {
  return build('Repeat Grow test email', {
    preheader: 'If you can read this, outgoing email works.',
    eyebrow: 'Test',
    title: 'Email is working',
    intro: 'This message was sent from the Repeat Grow email test page. Outgoing SMTP is set up correctly.',
    reason: 'Sent from /admin/emails.',
  })
}

// ------------------------------------------------------------
// Supabase Auth templates
//
// These are NOT sent by the app: Supabase sends them through the SMTP
// settings in the Supabase dashboard. Paste each one into
// Authentication → Email Templates. They contain Supabase's Go-template
// variables ({{ .ConfirmationURL }}, {{ .Token }}, …); the preview page
// swaps in sample values.
// ------------------------------------------------------------

export const SUPABASE_SAMPLE_VARS: Record<string, string> = {
  '{{ .ConfirmationURL }}': `${SITE_URL}/auth/confirm?token_hash=sample`,
  '{{ .Token }}': '482915',
  '{{ .Email }}': 'you@example.com',
  '{{ .NewEmail }}': 'new.address@example.com',
  '{{ .SiteURL }}': SITE_URL,
}

export function fillSupabaseVars(s: string): string {
  let out = s
  for (const [k, v] of Object.entries(SUPABASE_SAMPLE_VARS)) out = out.split(k).join(v)
  return out
}

const CODE_HINT = 'Enter this code on the Repeat Grow page. It expires in an hour.'

export const SUPABASE_AUTH_TEMPLATES: Record<
  'confirm_signup' | 'magic_link' | 'recovery' | 'invite' | 'email_change' | 'reauthentication',
  { dashboardName: string; subject: string; build: () => BuiltEmail }
> = {
  confirm_signup: {
    dashboardName: 'Confirm signup',
    subject: 'Confirm your Repeat Grow email',
    build: () =>
      build('Confirm your Repeat Grow email', {
        preheader: 'Your verification code is {{ .Token }}.',
        eyebrow: 'Verify your email',
        title: 'Confirm your email to get started',
        intro: 'Thanks for signing up for Repeat Grow. Use the button below, or enter the code on the sign-up page.',
        code: { label: 'Verification code', value: '{{ .Token }}', hint: CODE_HINT },
        buttons: [{ label: 'Confirm my email', href: '{{ .ConfirmationURL }}' }],
        reason: "If you didn't create a Repeat Grow account, you can safely ignore this email.",
      }),
  },
  magic_link: {
    dashboardName: 'Magic link / login code',
    subject: 'Your Repeat Grow login code',
    build: () =>
      build('Your Repeat Grow login code', {
        preheader: 'Your login code is {{ .Token }}.',
        eyebrow: 'Sign in',
        title: 'Sign in to Repeat Grow',
        intro: 'Use this one-time code, or tap the button, to sign in. No password needed.',
        code: { label: 'Login code', value: '{{ .Token }}', hint: CODE_HINT },
        buttons: [{ label: 'Sign in', href: '{{ .ConfirmationURL }}' }],
        reason: "If you didn't try to sign in, ignore this email — nobody can sign in without this code.",
      }),
  },
  recovery: {
    dashboardName: 'Reset password',
    subject: 'Reset your Repeat Grow password',
    build: () =>
      build('Reset your Repeat Grow password', {
        preheader: 'Use this link to choose a new password.',
        eyebrow: 'Password reset',
        title: 'Reset your password',
        intro: 'We got a request to reset the password for {{ .Email }}. Tap the button to choose a new one.',
        code: { label: 'Recovery code', value: '{{ .Token }}', hint: CODE_HINT },
        buttons: [{ label: 'Choose a new password', href: '{{ .ConfirmationURL }}' }],
        reason: "If you didn't ask for this, you can ignore this email — your password won't change.",
      }),
  },
  invite: {
    dashboardName: 'Invite user',
    subject: "You've been invited to Repeat Grow",
    build: () =>
      build("You've been invited to Repeat Grow", {
        preheader: 'Accept your invitation to join Repeat Grow.',
        eyebrow: "You're invited",
        title: 'Join Repeat Grow',
        intro: "You've been invited to create an account on Repeat Grow, the WhatsApp CRM for Indian businesses.",
        buttons: [{ label: 'Accept the invite', href: '{{ .ConfirmationURL }}' }],
        reason: "If you weren't expecting this invitation, you can ignore this email.",
      }),
  },
  email_change: {
    dashboardName: 'Change email address',
    subject: 'Confirm your new email address',
    build: () =>
      build('Confirm your new email address', {
        preheader: 'Confirm the change to {{ .NewEmail }}.',
        eyebrow: 'Email change',
        title: 'Confirm your new email address',
        intro: 'You asked to change your Repeat Grow email from {{ .Email }} to {{ .NewEmail }}.',
        code: { label: 'Confirmation code', value: '{{ .Token }}', hint: CODE_HINT },
        buttons: [{ label: 'Confirm the change', href: '{{ .ConfirmationURL }}' }],
        reason: "If you didn't request this change, secure your account and contact support.",
      }),
  },
  reauthentication: {
    dashboardName: 'Reauthentication',
    subject: 'Your Repeat Grow security code',
    build: () =>
      build('Your Repeat Grow security code', {
        preheader: 'Your security code is {{ .Token }}.',
        eyebrow: 'Security check',
        title: 'Confirm it’s you',
        intro: 'Enter this code to confirm a sensitive change on your account.',
        code: { label: 'Security code', value: '{{ .Token }}', hint: 'Never share this code with anyone.' },
        reason: "If you didn't request this, change your password and contact support.",
      }),
  },
}
