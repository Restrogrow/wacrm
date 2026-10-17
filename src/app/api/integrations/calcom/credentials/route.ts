// ============================================================
// GET /api/integrations/calcom/credentials - Admin+.
//
// Returns the webhook URL and signing secret so an admin can copy them
// into Cal.com again. Never cached; rate limited.
// ============================================================

import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { calcomWebhookUrl } from '@/lib/calcom/config';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { decrypt } from '@/lib/whatsapp/encryption';

export async function GET() {
  try {
    const ctx = await requireRole('admin');
    const limit = checkRateLimit(`calcom:credentials:${ctx.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const { data } = await supabaseAdmin()
      .from('calcom_connections')
      .select('ingest_token, webhook_secret')
      .eq('account_id', ctx.accountId)
      .maybeSingle();
    if (!data) return NextResponse.json({ error: 'Not connected' }, { status: 404 });

    let secret: string;
    try {
      secret = decrypt(data.webhook_secret);
    } catch {
      return NextResponse.json(
        { error: 'Stored secret could not be read. Generate a new one.' },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { webhook_url: calcomWebhookUrl(data.ingest_token), secret },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
