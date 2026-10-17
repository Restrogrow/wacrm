// POST /api/integrations/inbound-hooks/:id/rotate — issue a fresh URL (Admin+).
// The old URL stops working immediately; the new one is returned ONCE.

import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { generateHookToken, hookUrl } from '@/lib/inbound-hooks/core';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRole('admin');
    const { id } = await params;
    if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const limit = checkRateLimit(`inbound-hook-manage:${ctx.userId}`, { limit: 20, windowMs: 60_000 });
    if (!limit.success) return rateLimitResponse(limit);

    const t = generateHookToken();
    const { data, error } = await supabaseAdmin()
      .from('inbound_hooks')
      .update({ token_hash: t.hash, token_prefix: t.prefix, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .select('id')
      .maybeSingle();
    if (error) {
      console.error('[inbound-hooks] rotate failed:', error.message);
      return NextResponse.json({ error: 'Could not create a new URL' }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ url: hookUrl(t.token), token_prefix: t.prefix });
  } catch (err) {
    return toErrorResponse(err);
  }
}
