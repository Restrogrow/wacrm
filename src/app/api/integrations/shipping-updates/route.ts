// ============================================================
// /api/integrations/shipping-updates - Integrations -> Shiprocket
// (the path avoids the word "shiprocket" on purpose: Shiprocket rejects
// webhook URLs containing it)
//
//   GET     connection (no token), event rules, recent sends.  Any member.
//   PATCH   { default_country_code }                           Admin+.
//   DELETE  disconnect (rules are kept for reconnecting).      Admin+.
//
// The shiprocket_* tables have RLS with no client policies (they hold the
// webhook token and customer phones), so every query here uses the service
// role after the role check, scoped to the caller's account.
// ============================================================

import { NextResponse } from 'next/server';

import { recordAudit } from '@/lib/audit';
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { shippingWebhookUrl } from '@/lib/shiprocket/config';

export async function GET() {
  try {
    const ctx = await getCurrentAccount();
    const db = supabaseAdmin();

    const [{ data: conn, error: connErr }, { data: rules }, { data: events }] = await Promise.all([
      db
        .from('shiprocket_connections')
        .select('ingest_token, default_country_code, status, last_event_at, created_at')
        .eq('account_id', ctx.accountId)
        .maybeSingle(),
      db
        .from('shiprocket_event_rules')
        .select('event, enabled, template_name, template_language, body_variables')
        .eq('account_id', ctx.accountId),
      db
        .from('shiprocket_events')
        .select('id, topic, event, order_number, phone, status, detail, created_at')
        .eq('account_id', ctx.accountId)
        .like('delivery_id', 'send:%')
        .order('created_at', { ascending: false })
        .limit(25),
    ]);

    if (connErr && /shiprocket_connections/.test(connErr.message)) {
      return NextResponse.json(
        {
          error:
            'Shiprocket tables are missing. Run supabase/migrations/072_shiprocket_calcom.sql in the Supabase SQL Editor.',
          code: 'missing_table',
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      connection: conn
        ? {
            default_country_code: conn.default_country_code,
            status: conn.status,
            last_event_at: conn.last_event_at,
            created_at: conn.created_at,
            webhook_url: shippingWebhookUrl(conn.ingest_token),
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
    const body = (await request.json().catch(() => null)) as { default_country_code?: unknown } | null;
    const code = String(body?.default_country_code ?? '').replace(/\D/g, '');
    if (!/^\d{1,4}$/.test(code)) {
      return NextResponse.json({ error: 'Country code must be 1-4 digits, e.g. 91' }, { status: 400 });
    }
    const { error } = await supabaseAdmin()
      .from('shiprocket_connections')
      .update({ default_country_code: code, updated_at: new Date().toISOString() })
      .eq('account_id', ctx.accountId);
    if (error) return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE() {
  try {
    const ctx = await requireRole('admin');
    // Cascades to shipments and the activity log. Deliveries from a webhook
    // that still exists in Shiprocket get a 404 afterwards.
    const { error } = await supabaseAdmin()
      .from('shiprocket_connections')
      .delete()
      .eq('account_id', ctx.accountId);
    if (error) return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 });
    await recordAudit({
      accountId: ctx.accountId,
      actorUserId: ctx.userId,
      action: 'integration.disconnected',
      targetType: 'integration',
      targetId: 'shiprocket',
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
