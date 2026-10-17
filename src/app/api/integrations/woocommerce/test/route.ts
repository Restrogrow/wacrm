// ============================================================
// POST /api/integrations/woocommerce/test - Admin+.
//
// { event, phone } -> send that event's saved template to `phone` with
// example values (Priya, #1001, Rs 1,299.00, ...), so the merchant can see
// the real WhatsApp message before switching the event on.
// ============================================================

import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { WOO_SAMPLE_CONTEXT, isWooEvent } from '@/lib/woocommerce/events';
import {
  WOO_STORE_COLUMNS,
  sendWooEvent,
  type WooStore,
} from '@/lib/woocommerce/process';

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const limit = checkRateLimit(`woocommerce:test:${ctx.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as {
      event?: unknown;
      phone?: unknown;
    } | null;
    if (!isWooEvent(body?.event)) {
      return NextResponse.json({ error: 'Unknown event' }, { status: 400 });
    }
    const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';
    if (!phone) {
      return NextResponse.json(
        { error: 'Enter a phone number to send the test to' },
        { status: 400 }
      );
    }

    const { data: store } = await supabaseAdmin()
      .from('woocommerce_stores')
      .select(WOO_STORE_COLUMNS)
      .eq('account_id', ctx.accountId)
      .maybeSingle<WooStore>();
    if (!store) {
      return NextResponse.json(
        { error: 'Connect your WooCommerce store first' },
        { status: 400 }
      );
    }

    const outcome = await sendWooEvent(
      store,
      {
        event: body.event,
        sendKey: `test:${body.event}:${Date.now()}`,
        topic: 'test',
        rawPhone: phone,
        countryCode: null,
        customerName: null,
        ctx: {
          ...WOO_SAMPLE_CONTEXT,
          shop_name: store.store_name ?? WOO_SAMPLE_CONTEXT.shop_name,
        },
        orderNumber: WOO_SAMPLE_CONTEXT.order_number,
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
