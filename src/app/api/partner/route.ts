import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { publicOrigin } from '@/lib/public-origin'
import { PAYOUT_METHODS } from '@/lib/partners/program'
import { createApplication, getPartnerByUser, loadPartnerLedger, type PartnerRow } from '@/lib/partners/server'

/**
 * The signed-in partner's own data, for the /agent portal.
 *
 *   GET   â†’ { partner, link, earnings, referrals, commissions, payouts }
 *   PATCH â†’ update { phone?, company?, website?, payout_method?, payout_details? }
 *
 * Applying is NOT here any more: it happens on the public /partners
 * page via /api/partners/apply, because an applicant has no login yet.
 *
 * Partners see only their own rows; admin-only fields (admin_note) are
 * never returned.
 */

async function currentUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

const text = (v: unknown, max: number) =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null

function publicPartner(p: PartnerRow) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { admin_note, user_id, ...rest } = p
  return rest
}

export async function GET() {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const partner = await getPartnerByUser(user.id)
    if (!partner) return NextResponse.json({ partner: null, email: user.email ?? null })
    const ledger = partner.status === 'pending' ? null : await loadPartnerLedger(partner.id)
    return NextResponse.json({
      partner: publicPartner(partner),
      link: `${publicOrigin()}/r/${partner.code}`,
      earnings: ledger?.earnings ?? { pending: 0, paid: 0, total: 0 },
      referrals: ledger?.referrals ?? [],
      commissions: (ledger?.commissions ?? []).filter((c) => c.status !== 'void'),
      payouts: ledger?.payouts ?? [],
    })
  } catch (err) {
    console.error('[partner] load failed:', err)
    return NextResponse.json({ error: 'Could not load your partner details' }, { status: 500 })
  }
}

function payoutFields(body: Record<string, unknown>) {
  const method = typeof body.payout_method === 'string' && (PAYOUT_METHODS as readonly string[]).includes(body.payout_method)
    ? body.payout_method
    : null
  return { payout_method: method, payout_details: text(body.payout_details, 300) }
}

export async function PATCH(request: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>

  const partner = await getPartnerByUser(user.id).catch(() => null)
  if (!partner) return NextResponse.json({ error: 'Apply first' }, { status: 404 })

  const updates: Record<string, string | null> = { updated_at: new Date().toISOString() }
  if ('phone' in body) {
    const phone = text(body.phone, 30)
    if (!phone) return NextResponse.json({ error: 'Phone is required' }, { status: 400 })
    updates.phone = phone
  }
  if ('company' in body) updates.company = text(body.company, 120)
  if ('website' in body) updates.website = text(body.website, 200)
  if ('payout_method' in body || 'payout_details' in body) Object.assign(updates, payoutFields(body))

  const { error } = await supabaseAdmin().from('partners').update(updates).eq('id', partner.id)
  if (error) {
    console.error('[partner] update failed:', error.message)
    return NextResponse.json({ error: 'Could not save' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
