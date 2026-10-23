// ============================================================
// POST /api/integrations/woocommerce/wc-auth/callback — PUBLIC.
//
// WooCommerce calls this (server to server) after the merchant clicks
// Approve on /wc-auth/v1/authorize, with a new REST key pair and the
// `user_id` we passed, which is our signed state. We verify the state,
// check it matches the account's saved store and save the keys ENCRYPTED.
//
// Webhooks are NOT created here: WooCommerce is still waiting for this
// response, and on small hosts calling back into the store now can hang.
// The merchant lands on /integrations/woocommerce?wc_return=1, which runs
// /setup-webhooks.
// ============================================================

import { NextResponse } from 'next/server'

import { recordAudit } from '@/lib/audit'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { encrypt } from '@/lib/whatsapp/encryption'
import { parseWooCallback, type WooAuthCallback } from '@/lib/woocommerce/one-click'

export async function POST(request: Request) {
  const limit = checkRateLimit(`woocommerce:wc-auth:${getClientIp(request)}`, { limit: 20, windowMs: 60_000 })
  if (!limit.success) return rateLimitResponse(limit)

  const raw = await request.text().catch(() => '')
  if (raw.length > 10_000) return NextResponse.json({ error: 'Too large' }, { status: 413 })
  let body: WooAuthCallback | null = null
  try {
    body = raw ? (JSON.parse(raw) as WooAuthCallback) : null
  } catch {
    body = null
  }

  const parsed = parseWooCallback(body)
  if (!parsed.ok) {
    console.warn('[woocommerce/wc-auth] rejected callback:', parsed.error)
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  const db = supabaseAdmin()
  const { data: store } = await db
    .from('woocommerce_stores')
    .select('id, store_url')
    .eq('account_id', parsed.state.accountId)
    .maybeSingle()
  if (!store || store.store_url !== parsed.state.storeUrl) {
    return NextResponse.json({ error: 'This store is not waiting to be connected. Start again from Repeat Grow.' }, { status: 400 })
  }

  const { error } = await db
    .from('woocommerce_stores')
    .update({
      api_consumer_key: encrypt(parsed.consumerKey),
      api_consumer_secret: encrypt(parsed.consumerSecret),
      status: 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('id', store.id)
  if (error) {
    console.error('[woocommerce/wc-auth] save keys failed:', error.message)
    return NextResponse.json({ error: 'Could not save the keys' }, { status: 500 })
  }

  await recordAudit(
    {
      accountId: parsed.state.accountId,
      actorUserId: parsed.state.userId,
      action: 'integration.connected',
      targetType: 'woocommerce',
      metadata: { what: 'one_click_keys' },
    },
    request,
  )
  return NextResponse.json({ ok: true })
}
