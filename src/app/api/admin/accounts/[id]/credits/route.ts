// ============================================================
// AI credits for one account — platform admin only.
//
//   GET   balance, whether it is enforced, and the recent ledger
//   POST  add credits  { credits, note?, kind? }
//   PATCH turn enforcement on or off  { enforced }
//
// There is no payment gateway, so a top-up is the same motion as a
// plan change today: the business pays by UPI or bank transfer and
// support adds the credits here. `kind` records which it was — an
// `admin_grant` (goodwill, make-good, trial extension) or a `topup`
// the account actually paid for — so the ledger still reconciles
// against money received.
// ============================================================

import { NextResponse } from 'next/server';

import { recordAudit } from '@/lib/audit';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { addCredits, creditState } from '@/lib/credits/server';
import { supabaseAdmin } from '@/lib/flows/admin-client';

/** The two a human adds by hand. The rest are written by the system. */
const ADMIN_KINDS = new Set(['admin_grant', 'topup']);

/** Enough for any real top-up, low enough that a typo cannot run away. */
const MAX_CREDITS_PER_GRANT = 1_000_000;

const LEDGER_LIMIT = 50;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requirePlatformAdmin();
  const { id } = await params;

  const state = await creditState(id);
  const { data: ledger } = await supabaseAdmin()
    .from('credit_ledger')
    .select('id, credits, kind, feature, note, created_at')
    .eq('account_id', id)
    .order('created_at', { ascending: false })
    .limit(LEDGER_LIMIT);

  return NextResponse.json({
    balance: state.balance,
    enforced: state.enforced,
    available: state.available,
    ledger: ledger ?? [],
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requirePlatformAdmin();
  const { id } = await params;

  const body = (await request.json().catch(() => null)) as {
    credits?: unknown;
    note?: unknown;
    kind?: unknown;
  } | null;

  const credits = Number(body?.credits);
  if (!Number.isInteger(credits) || credits <= 0) {
    return NextResponse.json(
      { error: 'Enter a whole number of credits above zero.' },
      { status: 400 }
    );
  }
  if (credits > MAX_CREDITS_PER_GRANT) {
    return NextResponse.json(
      {
        error: `That is more than ${MAX_CREDITS_PER_GRANT.toLocaleString('en-IN')} credits — check the number.`,
      },
      { status: 400 }
    );
  }

  const kind =
    typeof body?.kind === 'string' && ADMIN_KINDS.has(body.kind)
      ? body.kind
      : 'admin_grant';
  const note =
    typeof body?.note === 'string' ? body.note.trim().slice(0, 500) : '';

  const balance = await addCredits({
    accountId: id,
    credits,
    kind: kind as 'admin_grant' | 'topup',
    note: note || null,
    createdBy: admin.userId,
    // No key: an admin adding the same amount twice on purpose must
    // work. The confirmation in the UI is the guard against a slip.
  });
  if (balance === null) {
    return NextResponse.json(
      { error: 'Could not add credits. Has migration 100 been applied?' },
      { status: 503 }
    );
  }

  await recordAudit(
    {
      accountId: id,
      actorUserId: admin.userId,
      action: 'credits.added',
      targetType: 'account',
      targetId: id,
      metadata: { credits, kind, note: note || null, balance },
    },
    request
  );

  return NextResponse.json({ ok: true, balance });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requirePlatformAdmin();
  const { id } = await params;

  const body = (await request.json().catch(() => null)) as {
    enforced?: unknown;
  } | null;
  if (typeof body?.enforced !== 'boolean') {
    return NextResponse.json(
      { error: '`enforced` must be true or false' },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin()
    .from('accounts')
    .update({ credits_enforced: body.enforced })
    .eq('id', id);
  if (error) {
    console.error('[admin/credits] enforcement update failed:', error.message);
    return NextResponse.json(
      { error: 'Could not change enforcement. Has migration 100 been applied?' },
      { status: 503 }
    );
  }

  await recordAudit(
    {
      accountId: id,
      actorUserId: admin.userId,
      action: 'credits.enforcement_changed',
      targetType: 'account',
      targetId: id,
      metadata: { enforced: body.enforced },
    },
    request
  );

  return NextResponse.json({ ok: true, enforced: body.enforced });
}
