// ============================================================
// POST /api/integrations/calcom/test - Admin+.
//
// { event, phone } -> send that event's saved template to `phone` with
// example values (Priya, "30 Minute Demo", a date and time, ...), so the
// merchant can see the real WhatsApp message before switching it on.
// ============================================================

import { NextResponse } from 'next/server';

import { CALCOM_SAMPLE_CONTEXT, isCalComEvent } from '@/lib/calcom/events';
import {
  CALCOM_CONNECTION_COLUMNS,
  sendCalComEvent,
  type CalComConnection,
} from '@/lib/calcom/process';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const limit = checkRateLimit(`calcom:test:${ctx.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as {
      event?: unknown;
      phone?: unknown;
    } | null;
    if (!isCalComEvent(body?.event)) {
      return NextResponse.json({ error: 'Unknown event' }, { status: 400 });
    }
    const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';
    if (!phone) {
      return NextResponse.json({ error: 'Enter a phone number to send the test to' }, { status: 400 });
    }

    const { data: conn } = await supabaseAdmin()
      .from('calcom_connections')
      .select(CALCOM_CONNECTION_COLUMNS)
      .eq('account_id', ctx.accountId)
      .maybeSingle<CalComConnection>();
    if (!conn) {
      return NextResponse.json({ error: 'Connect Cal.com first' }, { status: 400 });
    }

    const outcome = await sendCalComEvent(
      conn,
      {
        event: body.event,
        sendKey: `test:${body.event}:${Date.now()}`,
        topic: 'test',
        rawPhone: phone,
        attendeeName: null,
        ctx: { ...CALCOM_SAMPLE_CONTEXT, booking_page: conn.booking_page },
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
