// ============================================================
// POST /api/integrations/calendly/webhooks/<ingest_token>
//
// Calendly webhook deliveries for one connection. The unguessable
// token identifies the connection; Calendly-Webhook-Signature is
// checked with the signing key we set on the subscription. Respond
// 200 fast and process in after().
// ============================================================

import { NextResponse, after } from 'next/server';
import { recordWebhookRejection, webhookBlocked } from '@/lib/rate-limit';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import { decrypt } from '@/lib/whatsapp/encryption';
import {
  CONNECTION_COLUMNS,
  handleCalendlyWebhook,
  type CalendlyConnection,
} from '@/lib/calendly/process';
import { verifyCalendlySignature } from '@/lib/calendly/verify';

export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const blocked = webhookBlocked(request, 'calendly');
  if (blocked) return blocked;

  const { token } = await params;
  const rawBody = await request.text();

  const { data: row } = await supabaseAdmin()
    .from('calendly_connections')
    .select(`${CONNECTION_COLUMNS}, signing_key`)
    .eq('ingest_token', token)
    .maybeSingle<CalendlyConnection & { signing_key: string }>();
  if (!row) {
    recordWebhookRejection(request, 'calendly');
    return NextResponse.json({ error: 'Unknown webhook URL' }, { status: 404 });
  }

  let signingKey: string;
  try {
    signingKey = decrypt(row.signing_key);
  } catch {
    return NextResponse.json(
      { error: 'Connection misconfigured' },
      { status: 500 }
    );
  }
  if (
    !verifyCalendlySignature(
      rawBody,
      request.headers.get('calendly-webhook-signature'),
      signingKey
    )
  ) {
    recordWebhookRejection(request, 'calendly');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let body: {
    event?: string;
    created_at?: string;
    payload?: Record<string, unknown>;
  };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.event || !body.payload) return NextResponse.json({ ok: true });

  const { signing_key: _key, ...conn } = row;
  void _key;
  const { event, created_at, payload } = body;
  after(() => handleCalendlyWebhook(conn, event, created_at ?? null, payload));
  return NextResponse.json({ ok: true });
}
