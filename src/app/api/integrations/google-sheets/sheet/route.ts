// ============================================================
// POST /api/integrations/google-sheets/sheet   Admin+
//
//   { action: 'create', title? }   create a new spreadsheet with the
//                                  Contacts + Messages tabs
//   { action: 'link', url }        use an existing spreadsheet (URL or ID)
// ============================================================

import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { createSpreadsheet, getAccessToken, parseSpreadsheetId, prepareExistingSpreadsheet } from '@/lib/google-sheets/api';
import { getConnectionAnyState } from '@/lib/google-sheets/sync';

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const body = (await request.json().catch(() => null)) as {
      action?: string;
      title?: string;
      url?: string;
    } | null;

    const conn = await getConnectionAnyState(ctx.accountId);
    if (!conn) return NextResponse.json({ error: 'Connect your Google account first.' }, { status: 400 });
    const token = await getAccessToken(conn);

    let sheet;
    if (body?.action === 'create') {
      const title = (body.title ?? '').trim().slice(0, 100) || 'Repeat Grow - WhatsApp CRM';
      sheet = await createSpreadsheet(token, title);
    } else if (body?.action === 'link') {
      const id = parseSpreadsheetId(body.url ?? '');
      if (!id) return NextResponse.json({ error: 'That does not look like a Google Sheets link.' }, { status: 400 });
      sheet = await prepareExistingSpreadsheet(token, id);
    } else {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    const { error } = await supabaseAdmin()
      .from('google_sheets_connections')
      .update({
        spreadsheet_id: sheet.id,
        spreadsheet_url: sheet.url,
        spreadsheet_title: sheet.title,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('account_id', ctx.accountId);
    if (error) return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
    return NextResponse.json({ ok: true, spreadsheet_url: sheet.url, spreadsheet_title: sheet.title });
  } catch (err) {
    if (err instanceof Error && !/Unauthorized|Forbidden/i.test(err.name + err.message)) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return toErrorResponse(err);
  }
}
