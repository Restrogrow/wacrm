// ============================================================
// /api/integrations/alerts/:id   (Admin+)
//
//   PATCH   { name?, events?, enabled?, target?, chat_id? }
//           Sending a new `target` replaces the stored (encrypted) secret.
//   DELETE  remove the channel.
// POST /api/integrations/alerts/:id/test sends a test message.
// ============================================================

import { NextResponse } from 'next/server';

import { isAlertKind, parseAlertEvents, validateAlertTarget } from '@/lib/alerts/core';
import { CHANNEL_LIST_COLUMNS, publicChannel, type ChannelListRow } from '@/lib/alerts/public';
import { recordAudit } from '@/lib/audit';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { cleanHookName } from '@/lib/inbound-hooks/core';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { encrypt } from '@/lib/whatsapp/encryption';

type Ctx = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const ctx = await requireRole('admin');
    const { id } = await params;
    if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const limit = checkRateLimit(`alert-manage:${ctx.userId}`, { limit: 20, windowMs: 60_000 });
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

    const db = supabaseAdmin();
    const { data: current } = await db
      .from('alert_channels')
      .select('id, kind, chat_id')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle();
    if (!current || !isAlertKind(current.kind)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) {
      const name = cleanHookName(body.name);
      if (!name) return NextResponse.json({ error: 'The name cannot be empty' }, { status: 400 });
      patch.name = name;
    }
    if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
    if (body.events !== undefined) {
      const events = parseAlertEvents(body.events);
      if (events.length === 0) return NextResponse.json({ error: 'Pick at least one event' }, { status: 400 });
      patch.events = events;
    }
    if (body.target !== undefined || body.chat_id !== undefined) {
      // A new target replaces the secret. Changing only the Telegram chat id keeps it.
      if (body.target !== undefined && body.target !== '') {
        const check = validateAlertTarget(current.kind, body.target, body.chat_id ?? current.chat_id);
        if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
        patch.target_enc = encrypt(check.target);
        patch.chat_id = check.chatId;
        patch.last_status = null;
        patch.last_error = null;
      } else if (current.kind === 'telegram' && typeof body.chat_id === 'string') {
        if (!/^(-?\d{3,20}|@[A-Za-z][A-Za-z0-9_]{4,31})$/.test(body.chat_id.trim())) {
          return NextResponse.json({ error: 'Enter the chat id (a number like -1001234567890) or @channelname' }, { status: 400 });
        }
        patch.chat_id = body.chat_id.trim();
      }
    }

    const { data, error } = await db
      .from('alert_channels')
      .update(patch)
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .select(CHANNEL_LIST_COLUMNS)
      .maybeSingle();
    if (error) {
      console.error('[alerts] update failed:', error.message);
      return NextResponse.json({ error: 'Could not save changes' }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ channel: publicChannel(data as ChannelListRow) });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(request: Request, { params }: Ctx) {
  try {
    const ctx = await requireRole('admin');
    const { id } = await params;
    if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data, error } = await supabaseAdmin()
      .from('alert_channels')
      .delete()
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .select('kind, name')
      .maybeSingle();
    if (error) {
      console.error('[alerts] delete failed:', error.message);
      return NextResponse.json({ error: 'Could not remove the channel' }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await recordAudit(
      { accountId: ctx.accountId, actorUserId: ctx.userId, action: 'integration.disconnected', targetType: 'integration', targetId: `alert_${data.kind}`, metadata: { name: data.name } },
      request
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
