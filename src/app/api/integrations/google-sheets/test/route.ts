// POST /api/integrations/google-sheets/test   Admin+
// Appends a clearly-labelled test row to the Contacts tab.

import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { appendRows, getAccessToken } from '@/lib/google-sheets/api';
import { CONTACTS_TAB } from '@/lib/google-sheets/config';
import { getConnection } from '@/lib/google-sheets/sync';

export async function POST() {
  try {
    const ctx = await requireRole('admin');
    const conn = await getConnection(ctx.accountId);
    if (!conn) return NextResponse.json({ error: 'Choose a spreadsheet first.' }, { status: 400 });
    await appendRows(await getAccessToken(conn), conn.spreadsheet_id!, CONTACTS_TAB, [
      ['Test contact (safe to delete)', '+0000000000', '', 'Repeat Grow', new Date().toISOString()],
    ]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && !/Unauthorized|Forbidden/i.test(err.name + err.message)) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return toErrorResponse(err);
  }
}
