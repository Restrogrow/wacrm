// ============================================================
// /api/integrations/alerts — Settings -> Integrations -> Team alerts
//
//   GET   the account's alert channels. Secrets are never returned: only
//         the kind, name, events, status and a harmless description.   Any member.
//   POST  { kind, name, target, chat_id?, events[] }                    Admin+.
//         target = Slack/Discord webhook URL, or the Telegram bot token.
//
// The webhook URL / token is validated against the official hosts, then
// stored ENCRYPTED. alert_channels has RLS with no client policies, so all
// access is service-role after the role check, scoped to the account.
// ============================================================

import { NextResponse } from 'next/server';

import {
  ALERT_EVENTS,
  ALERT_EVENT_LABELS,
  MAX_ALERT_CHANNELS,
  isAlertKind,
  parseAlertEvents,
  validateAlertTarget,
  type AlertKind,
} from '@/lib/alerts/core';
import { CHANNEL_LIST_COLUMNS as LIST_COLUMNS, publicChannel, type ChannelListRow } from '@/lib/alerts/public';
import { recordAudit } from '@/lib/audit';
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { cleanHookName } from '@/lib/inbound-hooks/core';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { encrypt } from '@/lib/whatsapp/encryption';

export async function GET() {
  try {
    const ctx = await getCurrentAccount();
    const { data, error } = await supabaseAdmin()
      .from('alert_channels')
      .select(LIST_COLUMNS)
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: true });
    if (error && /alert_channels/.test(error.message)) {
      return NextResponse.json(
        {
          error: 'Alert tables are missing. Run supabase/migrations/071_inbound_hooks_alerts.sql in the Supabase SQL Editor.',
          code: 'missing_table',
        },
        { status: 503 }
      );
    }
    if (error) {
      console.error('[alerts] list failed:', error.message);
      return NextResponse.json({ error: 'Could not load alert channels' }, { status: 500 });
    }
    return NextResponse.json({
      channels: ((data ?? []) as ChannelListRow[]).map(publicChannel),
      events: ALERT_EVENTS.map((e) => ({ id: e, ...ALERT_EVENT_LABELS[e] })),
      max_channels: MAX_ALERT_CHANNELS,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const limit = checkRateLimit(`alert-manage:${ctx.userId}`, { limit: 20, windowMs: 60_000 });
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

    if (!isAlertKind(body.kind)) return NextResponse.json({ error: 'Choose Slack, Discord or Telegram' }, { status: 400 });
    const kind: AlertKind = body.kind;
    const name = cleanHookName(body.name) || { slack: 'Slack', discord: 'Discord', telegram: 'Telegram' }[kind];
    const check = validateAlertTarget(kind, body.target, body.chat_id);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
    const events = parseAlertEvents(body.events);
    if (events.length === 0) return NextResponse.json({ error: 'Pick at least one event to be alerted about' }, { status: 400 });

    const db = supabaseAdmin();
    const { count } = await db.from('alert_channels').select('id', { count: 'exact', head: true }).eq('account_id', ctx.accountId);
    if ((count ?? 0) >= MAX_ALERT_CHANNELS) {
      return NextResponse.json({ error: `You can have up to ${MAX_ALERT_CHANNELS} alert channels. Remove one first.` }, { status: 400 });
    }

    const { data, error } = await db
      .from('alert_channels')
      .insert({
        account_id: ctx.accountId,
        kind,
        name,
        target_enc: encrypt(check.target),
        chat_id: check.chatId,
        events,
        created_by: ctx.userId,
      })
      .select(LIST_COLUMNS)
      .single();
    if (error || !data) {
      console.error('[alerts] create failed:', error?.message);
      return NextResponse.json({ error: 'Could not save the channel' }, { status: 500 });
    }

    await recordAudit(
      { accountId: ctx.accountId, actorUserId: ctx.userId, action: 'integration.connected', targetType: 'integration', targetId: `alert_${kind}`, metadata: { name } },
      request
    );
    return NextResponse.json({ channel: publicChannel(data as ChannelListRow) }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
