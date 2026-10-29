// ============================================================
// /api/whatsapp/billing-hold (lib/whatsapp/billing-hold.ts)
//   GET  — is the account on hold, and how much is waiting (any member)
//   POST — Resume: end the hold and send what's waiting now (admin+).
//          If Meta still can't charge, the first send puts it back on
//          hold; nothing is lost either way.
// ============================================================

import { NextResponse, after } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { clearBillingHold, getBillingHold } from '@/lib/whatsapp/billing-hold';
import { processBillingHolds } from '@/lib/whatsapp/billing-hold-process';
import { processScheduledBroadcasts } from '@/lib/broadcasts/scheduled';

export async function GET() {
  try {
    const { accountId } = await requireRole('viewer');
    const hold = await getBillingHold(accountId);
    if (!hold) return NextResponse.json({ on_hold: false });

    const db = supabaseAdmin();
    const [{ count: messages }, { count: recipients }] = await Promise.all([
      db
        .from('held_messages')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId)
        .eq('status', 'held'),
      db
        .from('broadcast_recipients')
        .select('id, broadcasts!inner(account_id, status)', { count: 'exact', head: true })
        .eq('broadcasts.account_id', accountId)
        .eq('broadcasts.status', 'sending')
        .eq('status', 'pending'),
    ]);
    return NextResponse.json({
      on_hold: true,
      since: hold.since,
      reason: hold.reason,
      waiting_messages: messages ?? 0,
      waiting_broadcast_recipients: recipients ?? 0,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST() {
  try {
    const { accountId } = await requireRole('admin');
    await clearBillingHold(accountId);
    // Send right away instead of waiting for the next cron run.
    after(async () => {
      await processBillingHolds().catch((err) => console.error('[billing-hold] resume release failed:', err));
      await processScheduledBroadcasts().catch((err) => console.error('[billing-hold] resume broadcasts failed:', err));
    });
    return NextResponse.json({ resumed: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
