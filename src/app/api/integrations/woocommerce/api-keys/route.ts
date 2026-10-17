// ============================================================
// /api/integrations/woocommerce/api-keys — OPTIONAL REST API keys that let
// Repeat Grow pull your WooCommerce products into the catalog. Order
// messages keep working without them. Admin+ only.
//   GET    — { has_keys }
//   PUT    — { consumer_key, consumer_secret } verified against the store, stored ENCRYPTED
//   DELETE — remove the keys
// The keys are never returned to the browser.
// ============================================================

import { NextResponse } from 'next/server'

import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { recordAudit } from '@/lib/audit'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { readBodyCapped, safeFetch, UnsafeUrlError } from '@/lib/webhooks/ssrf'
import { encrypt } from '@/lib/whatsapp/encryption'

export async function GET() {
  try {
    const ctx = await requireRole('admin')
    const { data } = await supabaseAdmin().from('woocommerce_stores').select('api_consumer_key').eq('account_id', ctx.accountId).maybeSingle()
    return NextResponse.json({ connected: !!data, has_keys: !!data?.api_consumer_key }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function PUT(request: Request) {
  try {
    const ctx = await requireRole('admin')
    const limit = checkRateLimit(`woocommerce:api-keys:${ctx.userId}`, RATE_LIMITS.adminAction)
    if (!limit.success) return rateLimitResponse(limit)

    const body = (await request.json().catch(() => null)) as { consumer_key?: unknown; consumer_secret?: unknown } | null
    const key = typeof body?.consumer_key === 'string' ? body.consumer_key.trim() : ''
    const secret = typeof body?.consumer_secret === 'string' ? body.consumer_secret.trim() : ''
    if (!/^ck_[A-Za-z0-9]{20,80}$/.test(key) || !/^cs_[A-Za-z0-9]{20,80}$/.test(secret)) {
      return NextResponse.json(
        { error: 'Paste the consumer key (starts with ck_) and consumer secret (starts with cs_) from WooCommerce → Settings → Advanced → REST API.' },
        { status: 400 },
      )
    }

    const db = supabaseAdmin()
    const { data: store } = await db.from('woocommerce_stores').select('id, store_url').eq('account_id', ctx.accountId).maybeSingle()
    if (!store) return NextResponse.json({ error: 'Connect your WooCommerce store first.' }, { status: 400 })

    // Prove the keys work before saving them.
    try {
      const res = await safeFetch(
        `${String(store.store_url).replace(/\/+$/, '')}/wp-json/wc/v3/products?per_page=1`,
        { headers: { Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`, Accept: 'application/json' } },
        { httpsOnly: true, timeoutMs: 15_000 },
      )
      await readBodyCapped(res, 2 * 1024 * 1024).catch(() => null)
      if (res.status === 401 || res.status === 403) {
        return NextResponse.json({ error: 'WooCommerce rejected those keys. Check them and that the key has Read access.' }, { status: 400 })
      }
      if (!res.ok) return NextResponse.json({ error: `Could not reach the WooCommerce API (HTTP ${res.status}).` }, { status: 400 })
    } catch (err) {
      if (err instanceof UnsafeUrlError) return NextResponse.json({ error: err.message }, { status: 400 })
      return NextResponse.json({ error: 'Could not reach your store. Check the store URL and try again.' }, { status: 400 })
    }

    const { error } = await db
      .from('woocommerce_stores')
      .update({ api_consumer_key: encrypt(key), api_consumer_secret: encrypt(secret), updated_at: new Date().toISOString() })
      .eq('id', store.id)
    if (error) {
      console.error('[woocommerce] save api keys failed:', error.message)
      return NextResponse.json({ error: 'Could not save the keys.' }, { status: 500 })
    }
    await recordAudit(
      { accountId: ctx.accountId, actorUserId: ctx.userId, action: 'integration.connected', targetType: 'woocommerce', metadata: { what: 'rest_api_keys' } },
      request,
    )
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await requireRole('admin')
    const { error } = await supabaseAdmin()
      .from('woocommerce_stores')
      .update({ api_consumer_key: null, api_consumer_secret: null, updated_at: new Date().toISOString() })
      .eq('account_id', ctx.accountId)
    if (error) return NextResponse.json({ error: 'Could not remove the keys.' }, { status: 500 })
    await recordAudit(
      { accountId: ctx.accountId, actorUserId: ctx.userId, action: 'integration.disconnected', targetType: 'woocommerce', metadata: { what: 'rest_api_keys' } },
      request,
    )
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
