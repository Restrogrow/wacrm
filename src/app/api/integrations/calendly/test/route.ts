// ============================================================
// POST /api/integrations/calendly/test — Admin+.
//
// { event, phone } → send that event's saved template to `phone` with
// example booking values, so the business sees the real WhatsApp
// message before switching the event on.
// ============================================================

import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { SAMPLE_BOOKING_CONTEXT, isCalendlyEvent } from '@/lib/calendly/events';
import {
  CONNECTION_COLUMNS,
  sendCalendlyEvent,
  type CalendlyConnection,
} from '@/lib/calendly/process';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const limit = checkRateLimit(
      `calendly:test:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as {
      event?: unknown;
      phone?: unknown;
    } | null;
    if (!isCalendlyEvent(body?.event)) {
      return NextResponse.json({ error: 'Unknown event' }, { status: 400 });
    }
    const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';
    if (!phone) {
      return NextResponse.json(
        { error: 'Enter a phone number to send the test to' },
        { status: 400 }
      );
    }

    const { data: conn } = await supabaseAdmin()
      .from('calendly_connections')
      .select(CONNECTION_COLUMNS)
      .eq('account_id', ctx.accountId)
      .maybeSingle<CalendlyConnection>();
    if (!conn) {
      return NextResponse.json(
        { error: 'Connect Calendly first' },
        { status: 400 }
      );
    }

    const outcome = await sendCalendlyEvent(
      conn,
      {
        event: body.event,
        sendKey: `test:${body.event}:${Date.now()}`,
        topic: 'test',
        rawPhone: phone,
        inviteeName: null,
        ctx: {
          ...SAMPLE_BOOKING_CONTEXT,
          booking_page:
            conn.scheduling_url ?? SAMPLE_BOOKING_CONTEXT.booking_page,
        },
      },
      { test: true }
    );

    switch (outcome.status) {
      case 'sent':
      case 'duplicate':
        return NextResponse.json({ ok: true });
      case 'no_rule':
        return NextResponse.json(
          { error: 'Choose a template for this event and save first' },
          { status: 400 }
        );
      default:
        return NextResponse.json({ error: outcome.detail }, { status: 400 });
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}
