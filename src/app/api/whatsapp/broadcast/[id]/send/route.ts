import { after, NextResponse } from 'next/server'

import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { accountCanSend } from '@/lib/billing/server'
import { PLAN_EXPIRED_MESSAGE } from '@/lib/billing/plans'
import { sendBroadcastNow } from '@/lib/broadcasts/scheduled'
import { getBillingHold } from '@/lib/whatsapp/billing-hold'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'

// POST /api/whatsapp/broadcast/:id/send
//
// "Send now" from the wizard. The browser has already stored the
// broadcast (status 'sending', scheduled_at = now) and its recipients
// with their template values; this starts sending on the server right
// away. Anything that doesn't fit in this request is continued by the
// every-minute cron (lib/broadcasts/scheduled.ts), so closing the tab
// never stops a broadcast.
export const maxDuration = 60

type Ctx = { params: Promise<{ id: string }> }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(_request: Request, { params }: Ctx) {
  try {
    const { userId, accountId, supabase } = await requireRole('agent')
    const { id } = await params
    if (!UUID.test(id)) return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 })

    const limit = checkRateLimit(`broadcast:${userId}`, RATE_LIMITS.broadcast)
    if (!limit.success) return rateLimitResponse(limit)

    const { data: broadcast } = await supabase
      .from('broadcasts')
      .select('id, status')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle()
    if (!broadcast) return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 })
    if (broadcast.status !== 'sending') {
      return NextResponse.json({ error: 'This broadcast is not waiting to be sent.' }, { status: 409 })
    }

    if (!(await accountCanSend(accountId))) {
      // The sender marks it failed with the same reason.
      after(() => sendBroadcastNow(id))
      return NextResponse.json({ error: PLAN_EXPIRED_MESSAGE, code: 'plan_expired' }, { status: 402 })
    }

    // Billing hold (Meta can't charge): the broadcast is saved and waits;
    // it starts by itself once billing works. Tell the sender up front.
    if (await getBillingHold(accountId)) {
      return NextResponse.json({ ok: true, billing_hold: true }, { status: 202 })
    }

    after(() => sendBroadcastNow(id))
    return NextResponse.json({ ok: true }, { status: 202 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
