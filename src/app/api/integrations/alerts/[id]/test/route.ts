// POST /api/integrations/alerts/:id/test — send a test alert to one channel (Admin+).

import { NextResponse } from 'next/server';

import type { AlertChannelRow } from '@/lib/alerts/server';
import { deliverAndRecord } from '@/lib/alerts/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRole('admin');
    const { id } = await params;
    if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const limit = checkRateLimit(`alert-test:${ctx.userId}`, { limit: 10, windowMs: 60_000 });
    if (!limit.success) return rateLimitResponse(limit);

    const { data: channel } = await supabaseAdmin()
      .from('alert_channels')
      .select('id, account_id, kind, name, target_enc, chat_id, events, enabled')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle<AlertChannelRow>();
    if (!channel) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const result = await deliverAndRecord(channel, '🔔 Test alert from Repeat Grow: your team alerts are working.');
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
