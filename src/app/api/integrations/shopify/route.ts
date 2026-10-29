// ============================================================
// /api/integrations/shopify — Settings → Shopify
//
//   GET     store connection (no secrets), event rules, recent sends.  Any member.
//   PATCH   { default_country_code }                                   Admin+.
//   DELETE  disconnect the store (rules are kept for reconnecting).    Admin+.
//
// The shopify_* tables have RLS with no client policies (they hold
// tokens), so every query here uses the service role after the role
// check, scoped to the caller's account.
// ============================================================

import { NextResponse } from 'next/server';
import { recordAudit } from '@/lib/audit';

import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { manualWebhookUrl, missingScopes, shopifyAppCredentials } from '@/lib/shopify/config';
import { SYNC_INTERVAL_MINUTES } from '@/lib/shopify/auto-sync';
import { SHOPIFY_TOPICS } from '@/lib/shopify/events';

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
        .from('shopify_stores')
        .select(
          'shop_domain, shop_name, connection_type, ingest_token, default_country_code, status, last_event_at, created_at'
        )
        .eq('account_id', ctx.accountId)
        .maybeSingle(),
      db
        .from('shopify_event_rules')
        .select(
          'event, enabled, template_name, template_language, body_variables, delay_minutes'
        )
        .eq('account_id', ctx.accountId),
      db
        .from('shopify_events')
        .select(
          'id, topic, event, order_name, phone, status, detail, created_at'
        )
        .eq('account_id', ctx.accountId)
        .like('delivery_id', 'send:%')
        .order('created_at', { ascending: false })
        .limit(25),
    ]);

    if (storeErr && /shopify_stores/.test(storeErr.message)) {
      return NextResponse.json(
        {
          error:
            'Shopify tables are missing. Run supabase/migrations/039_shopify_integration.sql in the Supabase SQL Editor.',
          code: 'missing_table',
        },
        { status: 503 }
      );
    }

    // Auto-sync state (migration 090), read on its own so the page still
    // works before that migration runs.
    const { data: sync } = store
      ? await db
          .from('shopify_stores')
          .select('scopes, last_synced_at, last_sync_error, last_sync_summary')
          .eq('account_id', ctx.accountId)
          .maybeSingle()
      : { data: null };

    return NextResponse.json({
      oauth_available: shopifyAppCredentials() !== null,
      sync: sync
        ? {
            interval_minutes: SYNC_INTERVAL_MINUTES,
            last_synced_at: sync.last_synced_at,
            last_sync_error: sync.last_sync_error,
            summary: sync.last_sync_summary,
            missing_scopes:
              store?.connection_type === 'oauth' ? missingScopes(sync.scopes) : [],
          }
        : null,
      topics: SHOPIFY_TOPICS,
      store: store
        ? {
            shop_domain: store.shop_domain,
            shop_name: store.shop_name,
            connection_type: store.connection_type,
            default_country_code: store.default_country_code,
            status: store.status,
            last_event_at: store.last_event_at,
            created_at: store.created_at,
            webhook_url:
              store.connection_type === 'webhook'
                ? manualWebhookUrl(store.ingest_token)
                : null,
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
        { error: 'Country code must be 1–4 digits, e.g. 91' },
        { status: 400 }
      );
    }
    const { error } = await supabaseAdmin()
      .from('shopify_stores')
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
    // Cascades to stored orders, checkouts and the activity log. OAuth
    // stores keep receiving webhooks until the app is uninstalled in
    // Shopify; the receiver ignores shops with no active store.
    const { error } = await supabaseAdmin()
      .from('shopify_stores')
      .delete()
      .eq('account_id', ctx.accountId);
    if (error) {
      return NextResponse.json(
        { error: 'Failed to disconnect' },
        { status: 500 }
      );
    }
    await recordAudit({ accountId: ctx.accountId, actorUserId: ctx.userId, action: 'integration.disconnected', targetType: 'integration', targetId: 'shopify' })
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
