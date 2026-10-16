import { NextResponse } from 'next/server'

import { requirePlatformAdmin } from '@/lib/auth/platform-admin'
import { EMAIL_CATALOG, getCatalogEntry } from '@/lib/email/catalog'
import { isEmailConfigured, sendEmail } from '@/lib/email/mailer'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

/**
 * POST /api/admin/emails/test — platform admin only.
 *
 *   { id: "<catalog id>" }   → send that one sample email
 *   { id: "all" }            → send every sample email, one after another
 *
 * Always goes to the fixed test inbox (EMAIL_TEST_RECIPIENT, default
 * restrogrow@gmail.com) — the recipient is never taken from the request,
 * so this cannot be used to mail anyone else.
 */
const TEST_RECIPIENT = () => process.env.EMAIL_TEST_RECIPIENT || 'restrogrow@gmail.com'

export async function POST(request: Request) {
  const admin = await requirePlatformAdmin()

  // 10 test sends a minute; "all" counts as one request but is bounded by the catalogue size.
  const limit = checkRateLimit(`email-test:${admin.userId}`, { limit: 10, windowMs: 60_000 })
  if (!limit.success) return rateLimitResponse(limit)

  if (!isEmailConfigured()) {
    return NextResponse.json(
      {
        error:
          'Email (SMTP) is not configured on this server. Set SMTP_HOST, SMTP_USER and SMTP_PASS (and SMTP_FROM) in the server environment.',
      },
      { status: 503 },
    )
  }

  const body = (await request.json().catch(() => null)) as { id?: unknown } | null
  const id = typeof body?.id === 'string' ? body.id : ''
  const entries = id === 'all' ? EMAIL_CATALOG : [getCatalogEntry(id)].filter((e): e is NonNullable<typeof e> => !!e)
  if (entries.length === 0) return NextResponse.json({ error: 'Unknown email' }, { status: 400 })

  const to = TEST_RECIPIENT()
  const results: { id: string; ok: boolean; error?: string }[] = []
  for (const entry of entries) {
    try {
      const mail = entry.render()
      await sendEmail({ to: [to], subject: `[TEST] ${mail.subject}`, html: mail.html, text: mail.text })
      results.push({ id: entry.id, ok: true })
    } catch (err) {
      results.push({ id: entry.id, ok: false, error: err instanceof Error ? err.message : 'send failed' })
    }
    // Be gentle with Gmail's per-second limits when sending the whole set.
    if (entries.length > 1) await new Promise((r) => setTimeout(r, 700))
  }

  const failed = results.filter((r) => !r.ok)
  return NextResponse.json({ to, sent: results.length - failed.length, failed, results })
}
