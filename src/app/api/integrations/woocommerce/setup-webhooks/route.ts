// ============================================================
// POST /api/integrations/woocommerce/setup-webhooks — Admin+.
// Creates the "Order created" and "Order updated" webhooks in the store
// through its REST API, with the keys saved by the one-click flow.
// Idempotent; run after connecting and from "Set up order webhooks".
// ============================================================

import { NextResponse } from 'next/server'

import { recordAudit } from '@/lib/audit'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { decrypt } from '@/lib/whatsapp/encryption'
import { wooWebhookUrl } from '@/lib/woocommerce/config'
import { setupWooWebhooks } from '@/lib/woocommerce/setup-webhooks'

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin')
    const limit = checkRateLimit(`woocommerce:setup-webhooks:${ctx.userId}`, RATE_LIMITS.adminAction)
    if (!limit.success) return rateLimitResponse(limit)

    const { data: store } = await supabaseAdmin()
      .from('woocommerce_stores')
      .select('store_url, ingest_token, webhook_secret, api_consumer_key, api_consumer_secret')
      .eq('account_id', ctx.accountId)
      .maybeSingle()
    if (!store) return NextResponse.json({ error: 'Connect your WooCommerce store first.' }, { status: 400 })
    if (!store.api_consumer_key || !store.api_consumer_secret) {
      return NextResponse.json({ error: 'Connect the store in one click first, so Repeat Grow can create the webhooks.' }, { status: 400 })
    }

    let keys: { key: string; secret: string; webhookSecret: string }
    try {
      keys = {
        key: decrypt(store.api_consumer_key as string),
        secret: decrypt(store.api_consumer_secret as string),
        webhookSecret: decrypt(store.webhook_secret as string),
      }
    } catch {
      return NextResponse.json({ error: 'Stored keys could not be read. Connect the store again.' }, { status: 500 })
    }

    const result = await setupWooWebhooks({
      storeUrl: store.store_url as string,
      consumerKey: keys.key,
      consumerSecret: keys.secret,
      deliveryUrl: wooWebhookUrl(store.ingest_token as string),
      webhookSecret: keys.webhookSecret,
    })
    if (result.ok) {
      await recordAudit(
        { accountId: ctx.accountId, actorUserId: ctx.userId, action: 'integration.connected', targetType: 'woocommerce', metadata: { what: 'webhooks', created: result.created.length } },
        request,
      )
    }
    return NextResponse.json(result, { status: result.ok ? 200 : 502 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
