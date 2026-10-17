// ============================================================
// POST /api/hooks/in/<token> — inbound webhook for Zapier / Make / n8n /
// Google Forms / Typeform and anything else that can send a POST.
//
// The unguessable token in the URL identifies the account's hook; only its
// SHA-256 hash is stored (verifyInboundHookToken). Unknown, revoked and
// malformed tokens all get the same 404, and IPs that keep guessing are
// blocked (webhookBlocked / recordWebhookRejection), so the endpoint cannot
// be used to discover accounts or hooks.
//
// Body: JSON (or form-encoded). See lib/inbound-hooks/core.ts.
// ============================================================

import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  MAX_HOOK_BODY_BYTES,
  formToPayload,
  hashHookToken,
  isPlausibleHookToken,
  parseHookPayload,
  verifyInboundHookToken,
} from '@/lib/inbound-hooks/core';
import { HOOK_COLUMNS, processInboundHook, type HookRow } from '@/lib/inbound-hooks/process';
import { checkRateLimit, rateLimitResponse, recordWebhookRejection, webhookBlocked } from '@/lib/rate-limit';

export const maxDuration = 30;

const SOURCE = 'inbound-hook';

function unknown(request: Request) {
  recordWebhookRejection(request, SOURCE);
  return NextResponse.json({ error: 'Unknown webhook URL' }, { status: 404 });
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const blocked = webhookBlocked(request, SOURCE);
  if (blocked) return blocked;

  const { token } = await params;
  if (!isPlausibleHookToken(token)) return unknown(request);

  const db = supabaseAdmin();
  const { data: hook } = await db
    .from('inbound_hooks')
    .select(HOOK_COLUMNS)
    .eq('token_hash', hashHookToken(token))
    .maybeSingle<HookRow & { token_hash: string }>();
  if (!hook || !verifyInboundHookToken(token, hook.token_hash)) return unknown(request);

  if (!hook.enabled) {
    return NextResponse.json({ error: 'This webhook is turned off' }, { status: 403 });
  }

  const limit = checkRateLimit(`hook-in:${hook.id}`, { limit: 120, windowMs: 60_000 });
  if (!limit.success) return rateLimitResponse(limit);

  // Size cap, checked from the header first and again on what was actually read.
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_HOOK_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }
  const raw = await request.text().catch(() => '');
  if (raw.length > MAX_HOOK_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  let body: unknown;
  const contentType = (request.headers.get('content-type') ?? '').toLowerCase();
  if (contentType.includes('application/x-www-form-urlencoded')) {
    body = formToPayload(new URLSearchParams(raw));
  } else {
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Body must be valid JSON' }, { status: 400 });
    }
  }

  const parsed = parseHookPayload(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  // Bookkeeping only; a failure here must not fail the delivery.
  void db
    .from('inbound_hooks')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', hook.id)
    .then(() => undefined, () => undefined);

  const result = await processInboundHook(hook, parsed.value);
  return NextResponse.json(result.body, { status: result.httpStatus });
}
