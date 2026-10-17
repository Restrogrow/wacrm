// ============================================================
// POST /api/integrations/shipping-updates/webhooks/<ingest_token>
//
// Tracking webhooks from Shiprocket (Settings > API > Webhooks). The
// unguessable token in the URL identifies the account; the delivery is
// verified with the x-api-key header, which must equal the token Repeat
// Grow generated for that account.
//
// Abuse handling: IPs that keep sending unknown URLs or wrong tokens are
// blocked (webhookBlocked / recordWebhookRejection), and each
// awb + status + time is processed once, so a captured request cannot be
// replayed to resend messages.
// ============================================================

import { NextResponse, after } from 'next/server';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import { recordWebhookRejection, webhookBlocked } from '@/lib/rate-limit';
import {
  SHIPROCKET_CONNECTION_COLUMNS,
  handleShiprocketWebhook,
  type ShiprocketConnection,
} from '@/lib/shiprocket/process';
import { verifyShiprocketWebhook } from '@/lib/shiprocket/verify';
import { decrypt } from '@/lib/whatsapp/encryption';

export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const blocked = webhookBlocked(request, 'shiprocket');
  if (blocked) return blocked;

  const { token } = await params;
  const rawBody = await request.text();

  const { data: row } = await supabaseAdmin()
    .from('shiprocket_connections')
    .select(`${SHIPROCKET_CONNECTION_COLUMNS}, webhook_token`)
    .eq('ingest_token', token)
    .maybeSingle<ShiprocketConnection & { webhook_token: string }>();

  if (!row) {
    recordWebhookRejection(request, 'shiprocket');
    return NextResponse.json({ error: 'Unknown webhook URL' }, { status: 404 });
  }

  let secret: string;
  try {
    secret = decrypt(row.webhook_token);
  } catch {
    return NextResponse.json({ error: 'Connection misconfigured' }, { status: 500 });
  }
  if (!verifyShiprocketWebhook(request.headers.get('x-api-key'), secret)) {
    recordWebhookRejection(request, 'shiprocket');
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  // Disconnected in Repeat Grow but the webhook still exists in Shiprocket:
  // acknowledge and ignore.
  if (row.status !== 'active') return NextResponse.json({ ok: true });

  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    payload = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { webhook_token: _token, ...conn } = row;
  void _token;
  after(() => handleShiprocketWebhook(conn, payload));
  return NextResponse.json({ ok: true });
}
