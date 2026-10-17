// ============================================================
// /api/integrations/calcom - Integrations -> Cal.com
//
//   GET     connection (no secret), event rules, recent sends.   Any member.
//   PATCH   { default_country_code?, phone_field?, booking_page? } Admin+.
//   DELETE  disconnect (rules are kept for reconnecting).        Admin+.
//
// The calcom_* tables have RLS with no client policies (they hold the
// signing secret and attendee phones), so every query here uses the service
// role after the role check, scoped to the caller's account.
// ============================================================

import { NextResponse } from 'next/server';

import { recordAudit } from '@/lib/audit';
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account';
import { CALCOM_TRIGGERS, calcomWebhookUrl } from '@/lib/calcom/config';
import { normalizeBookingHost } from '@/lib/calcom/verify';
import { supabaseAdmin } from '@/lib/flows/admin-client';

export async function GET() {
  try {
    const ctx = await getCurrentAccount();
    const db = supabaseAdmin();

    const [{ data: conn, error: connErr }, { data: rules }, { data: events }] = await Promise.all([
      db
        .from('calcom_connections')
        .select('ingest_token, default_country_code, phone_field, booking_page, status, last_event_at, created_at')
        .eq('account_id', ctx.accountId)
        .maybeSingle(),
      db
        .from('calcom_event_rules')
        .select('event, enabled, template_name, template_language, body_variables')
        .eq('account_id', ctx.accountId),
      db
        .from('calcom_events')
        .select('id, topic, event, attendee_name, phone, status, detail, created_at')
        .eq('account_id', ctx.accountId)
        .like('delivery_id', 'send:%')
        .order('created_at', { ascending: false })
        .limit(25),
    ]);

    if (connErr && /calcom_connections/.test(connErr.message)) {
      return NextResponse.json(
        {
          error:
            'Cal.com tables are missing. Run supabase/migrations/072_shiprocket_calcom.sql in the Supabase SQL Editor.',
          code: 'missing_table',
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      triggers: CALCOM_TRIGGERS,
      connection: conn
        ? {
            default_country_code: conn.default_country_code,
            phone_field: conn.phone_field,
            booking_page: conn.booking_page,
            status: conn.status,
            last_event_at: conn.last_event_at,
            created_at: conn.created_at,
            webhook_url: calcomWebhookUrl(conn.ingest_token),
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
      phone_field?: unknown;
      booking_page?: unknown;
    } | null;

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body?.default_country_code !== undefined) {
      const code = String(body.default_country_code).replace(/\D/g, '');
      if (!/^\d{1,4}$/.test(code)) {
        return NextResponse.json({ error: 'Country code must be 1-4 digits, e.g. 91' }, { status: 400 });
      }
      patch.default_country_code = code;
    }
    if (body?.phone_field !== undefined) {
      const field = typeof body.phone_field === 'string' ? body.phone_field.trim() : '';
      if (field.length > 60 || /[^\w .-]/.test(field)) {
        return NextResponse.json({ error: 'That field name looks wrong' }, { status: 400 });
      }
      patch.phone_field = field || null;
    }
    if (body?.booking_page !== undefined) {
      const host = normalizeBookingHost(typeof body.booking_page === 'string' ? body.booking_page : null);
      if (!host) {
        return NextResponse.json({ error: 'Enter your Cal.com address, e.g. https://cal.com' }, { status: 400 });
      }
      patch.booking_page = host;
    }
    if (Object.keys(patch).length === 1) {
      return NextResponse.json({ error: 'Nothing to save' }, { status: 400 });
    }

    const { error } = await supabaseAdmin()
      .from('calcom_connections')
      .update(patch)
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
    // Cascades to stored bookings and the activity log. Deliveries from a
    // webhook that still exists in Cal.com get a 404 afterwards.
    const { error } = await supabaseAdmin().from('calcom_connections').delete().eq('account_id', ctx.accountId);
    if (error) return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 });
    await recordAudit({
      accountId: ctx.accountId,
      actorUserId: ctx.userId,
      action: 'integration.disconnected',
      targetType: 'integration',
      targetId: 'calcom',
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
