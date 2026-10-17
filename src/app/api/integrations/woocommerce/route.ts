// ============================================================
// /api/integrations/woocommerce - Integrations -> WooCommerce
//
//   GET     store connection (no secret), event rules, recent sends.  Any member.
//   PATCH   { default_country_code }                                  Admin+.
//   DELETE  disconnect the store (rules are kept for reconnecting).   Admin+.
//
// The woocommerce_* tables have RLS with no client policies (they hold
// the signing secret), so every query here uses the service role after
// the role check, scoped to the caller's account.
// ============================================================

import { NextResponse } from 'next/server';
import { recordAudit } from '@/lib/audit';

import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { WOO_TOPICS, wooWebhookUrl } from '@/lib/woocommerce/config';

export async function GET() {
  try {
    const ctx = await getCurrentAccount();
    const db = supabaseAdmin();

    const [
      { data: store, error: storeErr },
      { data: rules },
      { data: events },
    ] = await Promise.all([
      db
        .from('woocommerce_stores')
        .select(
          'store_url, store_name, ingest_token, default_country_code, status, last_event_at, created_at'
        )
        .eq('account_id', ctx.accountId)
        .maybeSingle(),
      db
        .from('woocommerce_event_rules')
        .select('event, enabled, template_name, template_language, body_variables')
        .eq('account_id', ctx.accountId),
      db
        .from('woocommerce_events')
        .select('id, topic, event, order_number, phone, status, detail, created_at')
        .eq('account_id', ctx.accountId)
        .like('delivery_id', 'send:%')
        .order('created_at', { ascending: false })
        .limit(25),
    ]);

    if (storeErr && /woocommerce_stores/.test(storeErr.message)) {
      return NextResponse.json(
        {
          error:
            'WooCommerce tables are missing. Run supabase/migrations/063_woocommerce.sql in the Supabase SQL Editor.',
          code: 'missing_table',
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      topics: WOO_TOPICS,
      store: store
        ? {
            store_url: store.store_url,
            store_name: store.store_name,
            default_country_code: store.default_country_code,
            status: store.status,
            last_event_at: store.last_event_at,
            created_at: store.created_at,
            webhook_url: wooWebhookUrl(store.ingest_token),
          }
        : null,
      rules: rules ?? [],
      events: events ?? [],
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const body = (await request.json().catch(() => null)) as {
      default_country_code?: unknown;
    } | null;
    const code = String(body?.default_country_code ?? '').replace(/\D/g, '');
    if (!/^\d{1,4}$/.test(code)) {
      return NextResponse.json(
        { error: 'Country code must be 1-4 digits, e.g. 91' },
        { status: 400 }
      );
    }
    const { error } = await supabaseAdmin()
      .from('woocommerce_stores')
      .update({
        default_country_code: code,
        updated_at: new Date().toISOString(),
      })
      .eq('account_id', ctx.accountId);
    if (error) {
      return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE() {
  try {
    const ctx = await requireRole('admin');
    // Cascades to stored orders and the activity log. Deliveries from a
    // webhook that still exists in WooCommerce get a 404 afterwards.
    const { error } = await supabaseAdmin()
      .from('woocommerce_stores')
      .delete()
      .eq('account_id', ctx.accountId);
    if (error) {
      return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 });
    }
    await recordAudit({ accountId: ctx.accountId, actorUserId: ctx.userId, action: 'integration.disconnected', targetType: 'integration', targetId: 'woocommerce' })
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
