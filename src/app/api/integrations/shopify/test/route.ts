// ============================================================
// POST /api/integrations/shopify/test — Admin+.
//
// { event, phone } → send that event's saved template to `phone` with
// example values (Priya, #1001, ₹1,299.00, …), so the merchant can see
// the real WhatsApp message before switching the event on.
// ============================================================

import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { SAMPLE_CONTEXT, isShopifyEvent } from '@/lib/shopify/events';
import {
  STORE_COLUMNS,
  sendShopifyEvent,
  type ShopifyStore,
} from '@/lib/shopify/process';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const limit = checkRateLimit(
      `shopify:test:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as {
      event?: unknown;
      phone?: unknown;
    } | null;
    if (!isShopifyEvent(body?.event)) {
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
      .from('shopify_stores')
      .select(STORE_COLUMNS)
      .eq('account_id', ctx.accountId)
      .maybeSingle<ShopifyStore>();
    if (!store) {
      return NextResponse.json(
        { error: 'Connect your Shopify store first' },
        { status: 400 }
      );
    }

    const outcome = await sendShopifyEvent(
      store,
      {
        event: body.event,
        sendKey: `test:${body.event}:${Date.now()}`,
        topic: 'test',
        rawPhone: phone,
        countryCode: null,
        customerName: null,
        ctx: {
          ...SAMPLE_CONTEXT,
          shop_name: store.shop_name ?? SAMPLE_CONTEXT.shop_name,
        },
        orderName: SAMPLE_CONTEXT.order_number,
      },
      { test: true }
    );

    switch (outcome.status) {
      case 'sent':
        return NextResponse.json({ ok: true });
      case 'no_rule':
        return NextResponse.json(
          { error: 'Choose a template for this event and save first' },
          { status: 400 }
        );
      case 'duplicate':
        return NextResponse.json({ ok: true });
      default:
        return NextResponse.json({ error: outcome.detail }, { status: 400 });
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}
