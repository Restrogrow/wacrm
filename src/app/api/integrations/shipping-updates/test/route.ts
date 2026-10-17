// ============================================================
// POST /api/integrations/shipping-updates/test - Admin+.
//
// { event, phone } -> send that event's saved template to `phone` with
// example values (Priya, #1001, Delhivery, ...), so the merchant can see
// the real WhatsApp message before switching the event on.
// ============================================================

import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { SHIPROCKET_SAMPLE_CONTEXT, isShiprocketEvent } from '@/lib/shiprocket/events';
import {
  SHIPROCKET_CONNECTION_COLUMNS,
  sendShiprocketEvent,
  type ShiprocketConnection,
} from '@/lib/shiprocket/process';

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const limit = checkRateLimit(`shiprocket:test:${ctx.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as {
      event?: unknown;
      phone?: unknown;
    } | null;
    if (!isShiprocketEvent(body?.event)) {
      return NextResponse.json({ error: 'Unknown event' }, { status: 400 });
    }
    const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';
    if (!phone) {
      return NextResponse.json({ error: 'Enter a phone number to send the test to' }, { status: 400 });
    }

    const { data: conn } = await supabaseAdmin()
      .from('shiprocket_connections')
      .select(SHIPROCKET_CONNECTION_COLUMNS)
      .eq('account_id', ctx.accountId)
      .maybeSingle<ShiprocketConnection>();
    if (!conn) {
      return NextResponse.json({ error: 'Connect Shiprocket first' }, { status: 400 });
    }

    const outcome = await sendShiprocketEvent(
      conn,
      {
        event: body.event,
        sendKey: `test:${body.event}:${Date.now()}`,
        topic: 'test',
        rawPhone: phone,
        customerName: null,
        ctx: SHIPROCKET_SAMPLE_CONTEXT,
        orderNumber: SHIPROCKET_SAMPLE_CONTEXT.order_number,
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
