// ============================================================
// /api/integrations/google-sheets - Google Sheets page
//
//   GET     connection state (never tokens).                 Any member.
//   PATCH   { sync_contacts?, sync_messages? }               Admin+.
//   DELETE  disconnect (forgets tokens + chosen sheet).      Admin+.
//
// The table has RLS with no client policies (it holds tokens), so
// every query uses the service role after the role check.
// ============================================================

import { NextResponse } from 'next/server';
import { recordAudit } from '@/lib/audit';

import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { googleCredentials, redirectUri } from '@/lib/google-sheets/config';

export async function GET() {
  try {
    const ctx = await getCurrentAccount();
    const { data, error } = await supabaseAdmin()
      .from('google_sheets_connections')
      .select(
        'google_email, spreadsheet_id, spreadsheet_url, spreadsheet_title, sync_contacts, sync_messages, status, last_sync_at, last_error, rows_synced, created_at'
      )
      .eq('account_id', ctx.accountId)
      .maybeSingle();

    if (error && /google_sheets_connections/.test(error.message)) {
      return NextResponse.json(
        {
          error:
            'Google Sheets table is missing. Run supabase/migrations/059_google_sheets.sql in the Supabase SQL Editor.',
          code: 'missing_table',
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      oauth_available: googleCredentials() !== null,
      redirect_uri: redirectUri(),
      connection: data ?? null,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const body = (await request.json().catch(() => null)) as {
      sync_contacts?: unknown;
      sync_messages?: unknown;
    } | null;
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body?.sync_contacts === 'boolean') update.sync_contacts = body.sync_contacts;
    if (typeof body?.sync_messages === 'boolean') update.sync_messages = body.sync_messages;
    if (Object.keys(update).length === 1) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }
    const { error } = await supabaseAdmin()
      .from('google_sheets_connections')
      .update(update)
      .eq('account_id', ctx.accountId);
    if (error) return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE() {
  try {
    const ctx = await requireRole('admin');
    const { error } = await supabaseAdmin()
      .from('google_sheets_connections')
      .delete()
      .eq('account_id', ctx.accountId);
    if (error) return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 });
    await recordAudit({ accountId: ctx.accountId, actorUserId: ctx.userId, action: 'integration.disconnected', targetType: 'integration', targetId: 'google_sheets' })
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
