// ============================================================
// POST /api/integrations/calcom/webhooks/<ingest_token>
//
// Booking webhooks from Cal.com (Settings > Developer > Webhooks). The
// unguessable token in the URL identifies the account; the delivery is
// verified with X-Cal-Signature-256, the hex HMAC-SHA256 of the raw body
// using the secret Repeat Grow generated for that account.
//
// Abuse handling: IPs that keep sending unknown URLs or bad signatures are
// blocked (webhookBlocked / recordWebhookRejection), and each
// trigger + booking + time is processed once, so a captured request cannot
// be replayed to resend messages.
// ============================================================

import { NextResponse, after } from 'next/server';

import { verifyCalComWebhook } from '@/lib/calcom/verify';
import {
  CALCOM_CONNECTION_COLUMNS,
  handleCalComWebhook,
  type CalComConnection,
} from '@/lib/calcom/process';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { recordWebhookRejection, webhookBlocked } from '@/lib/rate-limit';
import { decrypt } from '@/lib/whatsapp/encryption';

export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const blocked = webhookBlocked(request, 'calcom');
  if (blocked) return blocked;

  const { token } = await params;
  const rawBody = await request.text();

  const { data: row } = await supabaseAdmin()
    .from('calcom_connections')
    .select(`${CALCOM_CONNECTION_COLUMNS}, webhook_secret`)
    .eq('ingest_token', token)
    .maybeSingle<CalComConnection & { webhook_secret: string }>();

  if (!row) {
    recordWebhookRejection(request, 'calcom');
    return NextResponse.json({ error: 'Unknown webhook URL' }, { status: 404 });
  }

  let secret: string;
  try {
    secret = decrypt(row.webhook_secret);
  } catch {
    return NextResponse.json({ error: 'Connection misconfigured' }, { status: 500 });
  }
  if (!verifyCalComWebhook(rawBody, request.headers.get('x-cal-signature-256'), secret)) {
    recordWebhookRejection(request, 'calcom');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Disconnected in Repeat Grow but the webhook still exists in Cal.com:
  // acknowledge and ignore.
  if (row.status !== 'active') return NextResponse.json({ ok: true });

  let body: { triggerEvent?: unknown; createdAt?: unknown; payload?: unknown };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  // Cal.com's "Ping test" and any trigger we don't use: acknowledge.
  const trigger = typeof body.triggerEvent === 'string' ? body.triggerEvent : '';
  const payload = body.payload;
  if (
    !['BOOKING_CREATED', 'BOOKING_RESCHEDULED', 'BOOKING_CANCELLED'].includes(trigger) ||
    !payload ||
    typeof payload !== 'object'
  ) {
    return NextResponse.json({ ok: true });
  }

  const { webhook_secret: _secret, ...conn } = row;
  void _secret;
  const createdAt = typeof body.createdAt === 'string' ? body.createdAt : null;
  after(() => handleCalComWebhook(conn, trigger, createdAt, payload as Record<string, unknown>));
  return NextResponse.json({ ok: true });
}
