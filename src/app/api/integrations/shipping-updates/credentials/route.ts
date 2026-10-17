// ============================================================
// GET /api/integrations/shipping-updates/credentials - Admin+.
//
// Returns the webhook URL and token so an admin can copy them into
// Shiprocket again. Never cached; rate limited.
// ============================================================

import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { shippingWebhookUrl } from '@/lib/shiprocket/config';
import { decrypt } from '@/lib/whatsapp/encryption';

export async function GET() {
  try {
    const ctx = await requireRole('admin');
    const limit = checkRateLimit(`shiprocket:credentials:${ctx.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const { data } = await supabaseAdmin()
      .from('shiprocket_connections')
      .select('ingest_token, webhook_token')
      .eq('account_id', ctx.accountId)
      .maybeSingle();
    if (!data) return NextResponse.json({ error: 'Not connected' }, { status: 404 });

    let secret: string;
    try {
      secret = decrypt(data.webhook_token);
    } catch {
      return NextResponse.json(
        { error: 'Stored token could not be read. Generate a new one.' },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { webhook_url: shippingWebhookUrl(data.ingest_token), secret },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
