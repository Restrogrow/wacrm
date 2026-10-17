// ============================================================
// /api/integrations/calendly — Settings → Calendly
//
//   GET     connection (no secrets), event rules, recent sends.  Any member.
//   PATCH   { default_country_code?, phone_question? }            Admin+.
//   DELETE  remove the webhook subscription and disconnect.       Admin+.
//
// calendly_* tables have RLS with no client policies (they hold the
// token and signing key): service role after the role check, scoped
// to the caller's account.
// ============================================================

import { NextResponse } from 'next/server';
import { recordAudit } from '@/lib/audit';

import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { decrypt } from '@/lib/whatsapp/encryption';
import {
  deleteWebhookSubscription,
  friendlyCalendlyError,
} from '@/lib/calendly/api';

export async function GET() {
  try {
    const ctx = await getCurrentAccount();
    const db = supabaseAdmin();

    const [{ data: conn, error: connErr }, { data: rules }, { data: events }] =
      await Promise.all([
        db
          .from('calendly_connections')
          .select(
            'user_name, user_email, scheduling_url, default_country_code, phone_question, last_event_at, created_at'
          )
          .eq('account_id', ctx.accountId)
          .maybeSingle(),
        db
          .from('calendly_event_rules')
          .select(
            'event, enabled, template_name, template_language, body_variables'
          )
          .eq('account_id', ctx.accountId),
        db
          .from('calendly_events')
          .select(
            'id, topic, event, invitee_name, phone, status, detail, created_at'
          )
          .eq('account_id', ctx.accountId)
          .like('delivery_id', 'send:%')
          .order('created_at', { ascending: false })
          .limit(25),
      ]);

    if (connErr && /calendly_connections/.test(connErr.message)) {
      return NextResponse.json(
        {
          error:
            'Calendly tables are missing. Run supabase/migrations/040_calendly_integration.sql in the Supabase SQL Editor.',
          code: 'missing_table',
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      connection: conn ?? null,
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
      phone_question?: unknown;
    } | null;

    const updates: Record<string, string | null> = {};
    if (body?.default_country_code !== undefined) {
      const code = String(body.default_country_code).replace(/\D/g, '');
      if (!/^\d{1,4}$/.test(code)) {
        return NextResponse.json(
          { error: 'Country code must be 1–4 digits, e.g. 91' },
          { status: 400 }
        );
      }
      updates.default_country_code = code;
    }
    if (body?.phone_question !== undefined) {
      const q =
        typeof body.phone_question === 'string'
          ? body.phone_question.trim()
          : '';
      if (q.length > 200) {
        return NextResponse.json(
          { error: 'Question is too long' },
          { status: 400 }
        );
      }
      updates.phone_question = q || null;
    }

    const { error } = await supabaseAdmin()
      .from('calendly_connections')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('account_id', ctx.accountId);
    if (error)
      return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE() {
  try {
    const ctx = await requireRole('admin');
    const db = supabaseAdmin();
    const { data: conn } = await db
      .from('calendly_connections')
      .select('access_token, webhook_subscription_uri')
      .eq('account_id', ctx.accountId)
      .maybeSingle();

    if (conn?.webhook_subscription_uri) {
      try {
        await deleteWebhookSubscription(
          decrypt(conn.access_token),
          conn.webhook_subscription_uri
        );
      } catch (err) {
        // Token revoked etc. — disconnect anyway; deliveries to the old
        // URL now 404 and Calendly stops sending.
        console.warn(
          '[calendly] subscription not removed:',
          friendlyCalendlyError(err)
        );
      }
    }

    // Cascades to bookings and the activity log; rules are kept.
    const { error } = await db
      .from('calendly_connections')
      .delete()
      .eq('account_id', ctx.accountId);
    if (error)
      return NextResponse.json(
        { error: 'Failed to disconnect' },
        { status: 500 }
      );
    await recordAudit({ accountId: ctx.accountId, actorUserId: ctx.userId, action: 'integration.disconnected', targetType: 'integration', targetId: 'calendly' })
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
