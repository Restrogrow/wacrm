// POST /api/integrations/google-sheets/export   Admin+
// Writes every existing contact to the Contacts tab.

import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { exportAllContacts } from '@/lib/google-sheets/sync';

export async function POST() {
  try {
    const ctx = await requireRole('admin');
    const count = await exportAllContacts(ctx.accountId);
    return NextResponse.json({ ok: true, count });
  } catch (err) {
    if (err instanceof Error && !/Unauthorized|Forbidden/i.test(err.name + err.message)) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return toErrorResponse(err);
  }
}
