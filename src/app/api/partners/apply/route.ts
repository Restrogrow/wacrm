// ============================================================
// POST /api/partners/apply — PUBLIC.
//
// The partner application from the /partners landing page. No login:
// applicants aren't customers yet, and most never will be — they're
// agencies and resellers who bring customers. They get an auth user
// only if an admin approves them (see ensurePartnerLogin).
//
// Same shape as /api/demo-request, which is the other public form on
// the marketing site: rate limited per IP, with a hidden honeypot
// field, writing through the service role.
//
//   { name, email, phone, company?, website_url?, pitch,
//     website? (honeypot) }
//
// Note `website_url` vs `website`: the honeypot has to own the name a
// bot would autofill, so the real "your website" field is the renamed
// one. (The partners table column is still `website`.)
// ============================================================

import { NextResponse } from 'next/server';

import { createApplication, getPartnerByEmail } from '@/lib/partners/server';
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function POST(request: Request) {
  const limit = checkRateLimit(
    `partner-apply:${getClientIp(request)}`,
    RATE_LIMITS.demoRequest
  );
  if (!limit.success) return rateLimitResponse(limit);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  // Bots fill every field. Pretend it worked and drop it.
  if (clean(b.website, 200)) return NextResponse.json({ ok: true });

  const name = clean(b.name, 100);
  const email = clean(b.email, 200);
  const phone = clean(b.phone, 30);
  const pitch = clean(b.pitch, 1000);

  if (!name || !email || !phone || !pitch) {
    return NextResponse.json(
      { error: 'Please fill in your name, email, phone and how you will find clients.' },
      { status: 400 }
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: 'That email address does not look right.' },
      { status: 400 }
    );
  }
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) {
    return NextResponse.json(
      { error: 'Please enter a valid phone number.' },
      { status: 400 }
    );
  }

  try {
    // One live application per address. A rejected applicant may
    // re-apply — people fix a thin pitch and come back, and refusing
    // that forever would be worse than the duplicate.
    const existing = await getPartnerByEmail(email);
    if (existing && existing.status !== 'rejected') {
      return NextResponse.json(
        {
          error:
            existing.status === 'pending'
              ? 'We already have your application — we review them within 2 working days.'
              : 'You are already a partner. Check your email for your dashboard link.',
        },
        { status: 409 }
      );
    }

    await createApplication(null, {
      name,
      email,
      phone,
      company: clean(b.company, 120) || null,
      website: clean(b.website_url, 200) || null,
      pitch,
      // Collected later, in the portal — asking for bank details
      // before anyone has been approved is a reason not to apply.
      payout_method: null,
      payout_details: null,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[partners/apply] failed:', err);
    return NextResponse.json(
      { error: 'Could not send your application. Please try again.' },
      { status: 500 }
    );
  }
}
