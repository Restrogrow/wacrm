// ============================================================
// /api/account/daily-summary — Settings → Daily summary
//
//   GET   settings + whether the server can send email.   Any member.
//   PUT   { enabled, hour, emails }                         Admin+.
//   POST  send the summary now (a test) to the recipients.  Admin+.
// ============================================================

import { NextResponse } from 'next/server';

import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { isEmailConfigured } from '@/lib/email/mailer';
import { sendSummaryNow } from '@/lib/summary/daily';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_RECIPIENTS = 5;

export async function GET() {
  try {
    const ctx = await getCurrentAccount();
    const db = supabaseAdmin();
    const { data, error } = await db
      .from('accounts')
      .select(
        'summary_enabled, summary_hour, summary_emails, summary_last_sent_on, owner_user_id'
      )
      .eq('id', ctx.accountId)
      .maybeSingle();
    if (error || !data) {
      return NextResponse.json({
        available: false,
        email_configured: isEmailConfigured(),
      });
    }
    const { data: owner } = await db
      .from('profiles')
      .select('email')
      .eq('user_id', data.owner_user_id)
      .maybeSingle();
    return NextResponse.json({
      available: true,
      email_configured: isEmailConfigured(),
      enabled: data.summary_enabled,
      hour: data.summary_hour,
      emails: data.summary_emails ?? [],
      last_sent_on: data.summary_last_sent_on,
      owner_email: owner?.email ?? null,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PUT(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const body = (await request.json().catch(() => null)) as {
      enabled?: unknown;
      hour?: unknown;
      emails?: unknown;
    } | null;

    const hour = Number(body?.hour);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      return NextResponse.json({ error: 'Choose a time' }, { status: 400 });
    }
    const emails = Array.isArray(body?.emails)
      ? [
          ...new Set(
            body.emails
              .map((e) => String(e).trim().toLowerCase())
              .filter(Boolean)
          ),
        ]
      : [];
    if (emails.length > MAX_RECIPIENTS) {
      return NextResponse.json(
        { error: `Up to ${MAX_RECIPIENTS} email addresses` },
        { status: 400 }
      );
    }
    const bad = emails.find((e) => !EMAIL_RE.test(e));
    if (bad) {
      return NextResponse.json(
        { error: `"${bad}" isn't a valid email address` },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin()
      .from('accounts')
      .update({
        summary_enabled: body?.enabled === true,
        summary_hour: hour,
        summary_emails: emails,
      })
      .eq('id', ctx.accountId);
    if (error) {
      return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST() {
  try {
    const ctx = await requireRole('admin');
    const limit = checkRateLimit(
      `daily-summary:test:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);
    if (!isEmailConfigured()) {
      return NextResponse.json(
        {
          error:
            'Email sending is not set up on the server yet (SMTP settings).',
        },
        { status: 503 }
      );
    }
    try {
      const to = await sendSummaryNow(ctx.accountId);
      return NextResponse.json({ ok: true, to });
    } catch (err) {
      return NextResponse.json(
        {
          error:
            err instanceof Error ? err.message : 'Could not send the email',
        },
        { status: 400 }
      );
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}
