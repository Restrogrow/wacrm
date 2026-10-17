// ============================================================
// /api/integrations/inbound-hooks — Settings -> Integrations -> Inbound webhooks
//
//   GET   the account's hooks (no tokens) and the 25 most recent deliveries.  Any member.
//   POST  { name, allow_send?, default_tags?, default_country_code? }          Admin+.
//         Creates a hook and returns its full URL ONCE.
//
// The tables have RLS with no client policies, so every query uses the
// service role after the role check, scoped to the caller's account.
// ============================================================

import { NextResponse } from 'next/server';

import { recordAudit } from '@/lib/audit';
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  MAX_HOOKS_PER_ACCOUNT,
  cleanCountryCode,
  cleanHookName,
  cleanTags,
  generateHookToken,
  hookUrl,
} from '@/lib/inbound-hooks/core';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

const HOOK_LIST_COLUMNS =
  'id, name, token_prefix, allow_send, default_tags, default_country_code, enabled, last_used_at, created_at';

export async function GET() {
  try {
    const ctx = await getCurrentAccount();
    const db = supabaseAdmin();
    const [{ data: hooks, error }, { data: deliveries }] = await Promise.all([
      db.from('inbound_hooks').select(HOOK_LIST_COLUMNS).eq('account_id', ctx.accountId).order('created_at', { ascending: true }),
      db
        .from('inbound_hook_deliveries')
        .select('id, hook_id, status, phone, detail, created_at')
        .eq('account_id', ctx.accountId)
        .order('created_at', { ascending: false })
        .limit(25),
    ]);
    if (error && /inbound_hooks/.test(error.message)) {
      return NextResponse.json(
        {
          error: 'Inbound webhook tables are missing. Run supabase/migrations/071_inbound_hooks_alerts.sql in the Supabase SQL Editor.',
          code: 'missing_table',
        },
        { status: 503 }
      );
    }
    if (error) {
      console.error('[inbound-hooks] list failed:', error.message);
      return NextResponse.json({ error: 'Could not load webhooks' }, { status: 500 });
    }
    return NextResponse.json({ hooks: hooks ?? [], deliveries: deliveries ?? [], max_hooks: MAX_HOOKS_PER_ACCOUNT });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const limit = checkRateLimit(`inbound-hook-manage:${ctx.userId}`, { limit: 20, windowMs: 60_000 });
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const name = cleanHookName(body?.name);
    if (!name) return NextResponse.json({ error: 'Give the webhook a name, e.g. "Website form"' }, { status: 400 });

    const db = supabaseAdmin();
    const { count } = await db.from('inbound_hooks').select('id', { count: 'exact', head: true }).eq('account_id', ctx.accountId);
    if ((count ?? 0) >= MAX_HOOKS_PER_ACCOUNT) {
      return NextResponse.json({ error: `You can have up to ${MAX_HOOKS_PER_ACCOUNT} inbound webhooks. Delete one first.` }, { status: 400 });
    }

    const t = generateHookToken();
    const { data: hook, error } = await db
      .from('inbound_hooks')
      .insert({
        account_id: ctx.accountId,
        name,
        token_hash: t.hash,
        token_prefix: t.prefix,
        allow_send: body?.allow_send === true,
        default_tags: cleanTags(body?.default_tags),
        default_country_code: cleanCountryCode(body?.default_country_code),
        created_by: ctx.userId,
      })
      .select(HOOK_LIST_COLUMNS)
      .single();
    if (error || !hook) {
      console.error('[inbound-hooks] create failed:', error?.message);
      return NextResponse.json({ error: 'Could not create the webhook' }, { status: 500 });
    }

    await recordAudit(
      { accountId: ctx.accountId, actorUserId: ctx.userId, action: 'integration.connected', targetType: 'integration', targetId: 'inbound_hook', metadata: { name } },
      request
    );

    return NextResponse.json({ hook, url: hookUrl(t.token) }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
