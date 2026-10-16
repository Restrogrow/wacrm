// ============================================================
// POST /api/demo-request
//
// Public: the form on /demo. Saves the request to `demo_requests`
// (service role; the table has no RLS policies) and emails the team,
// best effort. Rate limited per IP, with a hidden honeypot field that
// real visitors never fill in.
//
// Body: { name, business_name, whatsapp, email?, team_size?,
//         use_case?, message?, source_page?, website? (honeypot) }
// ============================================================

import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/automations/admin-client'
import { demoRequestEmail } from '@/lib/email/demo-email'
import { isEmailConfigured, sendEmail } from '@/lib/email/mailer'
import {
  checkRateLimit,
  getClientIp,
  RATE_LIMITS,
  rateLimitResponse,
} from '@/lib/rate-limit'

const SALES_EMAIL = 'sales@repeatgrow.com'

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function recipients(): string[] {
  const raw = process.env.DEMO_REQUEST_EMAIL || SALES_EMAIL
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export async function POST(request: Request) {
  const limit = checkRateLimit(`demo:${getClientIp(request)}`, RATE_LIMITS.demoRequest)
  if (!limit.success) return rateLimitResponse(limit)

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const b = body as Record<string, unknown>

  // Bots fill every field. Pretend it worked and drop it.
  if (clean(b.website, 200)) return NextResponse.json({ ok: true })

  const name = clean(b.name, 120)
  const businessName = clean(b.business_name, 160)
  const whatsapp = clean(b.whatsapp, 32)
  const email = clean(b.email, 200)
  const teamSize = clean(b.team_size, 40)
  const useCase = clean(b.use_case, 80)
  const message = clean(b.message, 1000)
  const sourcePage = clean(b.source_page, 200)

  if (!name || !businessName) {
    return NextResponse.json({ error: 'Please enter your name and business name.' }, { status: 400 })
  }
  const digits = whatsapp.replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 15) {
    return NextResponse.json({ error: 'Please enter a valid WhatsApp number.' }, { status: 400 })
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'That email address does not look right.' }, { status: 400 })
  }

  const { error } = await supabaseAdmin().from('demo_requests').insert({
    name,
    business_name: businessName,
    whatsapp,
    email: email || null,
    team_size: teamSize || null,
    use_case: useCase || null,
    message: message || null,
    source_page: sourcePage || null,
  })
  if (error) {
    console.error('[demo-request] insert failed:', error.message)
    return NextResponse.json({ error: 'Something went wrong. Please try again or WhatsApp us.' }, { status: 500 })
  }

  if (isEmailConfigured()) {
    const mail = demoRequestEmail({
      name,
      businessName,
      whatsapp,
      email,
      teamSize,
      useCase,
      message,
      sourcePage,
    })
    try {
      await sendEmail({ to: recipients(), replyTo: email || undefined, ...mail })
    } catch (err) {
      console.warn('[demo-request] email not sent:', err instanceof Error ? err.message : err)
    }
  }

  return NextResponse.json({ ok: true })
}
