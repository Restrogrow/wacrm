// ============================================================
// /api/integrations/inbound-hooks/:id
//
//   PATCH   { name?, enabled?, allow_send?, default_tags?, default_country_code? }   Admin+.
//   DELETE  delete the hook; its URL stops working immediately.                      Admin+.
//
// POST /api/integrations/inbound-hooks/:id/rotate issues a new URL.
// ============================================================

import { NextResponse } from 'next/server';

import { recordAudit } from '@/lib/audit';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { cleanCountryCode, cleanHookName, cleanTags } from '@/lib/inbound-hooks/core';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

type Ctx = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const ctx = await requireRole('admin');
    const { id } = await params;
    if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const limit = checkRateLimit(`inbound-hook-manage:${ctx.userId}`, { limit: 20, windowMs: 60_000 });
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) {
      const name = cleanHookName(body.name);
      if (!name) return NextResponse.json({ error: 'The name cannot be empty' }, { status: 400 });
      patch.name = name;
    }
    if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
    if (typeof body.allow_send === 'boolean') patch.allow_send = body.allow_send;
    if (body.default_tags !== undefined) patch.default_tags = cleanTags(body.default_tags);
    if (body.default_country_code !== undefined) patch.default_country_code = cleanCountryCode(body.default_country_code);

    const { data, error } = await supabaseAdmin()
      .from('inbound_hooks')
      .update(patch)
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .select('id, name, token_prefix, allow_send, default_tags, default_country_code, enabled, last_used_at, created_at')
      .maybeSingle();
    if (error) {
      console.error('[inbound-hooks] update failed:', error.message);
      return NextResponse.json({ error: 'Could not save changes' }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ hook: data });
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
      .from('inbound_hooks')
      .delete()
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .select('name')
      .maybeSingle();
    if (error) {
      console.error('[inbound-hooks] delete failed:', error.message);
      return NextResponse.json({ error: 'Could not delete the webhook' }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await recordAudit(
      { accountId: ctx.accountId, actorUserId: ctx.userId, action: 'integration.disconnected', targetType: 'integration', targetId: 'inbound_hook', metadata: { name: data.name } },
      request
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
