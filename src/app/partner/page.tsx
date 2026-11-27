// Server Component: resolves the signed-in partner's data (or confirms
// signed-out) during the initial render, mirroring GET /api/partner's
// logic exactly. The previous version fetched everything client-side on
// mount; when that fetch failed during Google's render pass, the page's
// "Could not load the partner program" error text got indexed and the
// page was flagged a Soft 404 in Search Console — despite crawl/fetch/
// indexing permissions all being fine. Rendering real content up front
// removes that dependency on a successful client fetch.

import { createClient } from '@/lib/supabase/server'
import { getPartnerByUser, loadPartnerLedger, publicPartner, type CommissionRow } from '@/lib/partners/server'
import { publicOrigin } from '@/lib/public-origin'
import PartnerClient, { type Commission, type PortalData } from './partner-client'

export default async function PartnerPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return <PartnerClient initialData={null} initialLoggedOut />
  }

  const partner = await getPartnerByUser(user.id)
  if (!partner) {
    const initialData: PortalData = { partner: null, email: user.email ?? null }
    return <PartnerClient initialData={initialData} initialLoggedOut={false} />
  }

  const ledger = partner.status === 'pending' ? null : await loadPartnerLedger(partner.id)
  const commissions: Commission[] = (ledger?.commissions ?? []).filter(
    (c): c is CommissionRow & { status: 'pending' | 'paid' } => c.status !== 'void'
  )
  const initialData: PortalData = {
    partner: publicPartner(partner),
    link: `${publicOrigin()}/r/${partner.code}`,
    earnings: ledger?.earnings ?? { pending: 0, paid: 0, total: 0 },
    referrals: ledger?.referrals ?? [],
    commissions,
    payouts: ledger?.payouts ?? [],
  }

  return <PartnerClient initialData={initialData} initialLoggedOut={false} />
}
