// ============================================================
// POST /api/integrations/woocommerce/authorize — start the one-click
// connection. Admin+.
//
//   { store_url } → { authorize_url }
//
// Saves (or keeps) the store's webhook URL and secret, then returns the
// store's own WooCommerce "Approve Repeat Grow" URL with a signed state.
// WooCommerce posts the REST keys to /wc-auth/callback and sends the
// merchant back to /integrations/woocommerce?wc_return=1.
// ============================================================

import { NextResponse } from 'next/server'

import { recordAudit } from '@/lib/audit'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { publicOrigin } from '@/lib/public-origin'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { signWooState, WOO_CALLBACK_PATH, wooAuthorizeUrl } from '@/lib/woocommerce/one-click'
import { ensureWooStore } from '@/lib/woocommerce/store-connection'
import { normalizeStoreUrl } from '@/lib/woocommerce/verify'

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin')
    const limit = checkRateLimit(`woocommerce:authorize:${ctx.userId}`, RATE_LIMITS.adminAction)
    if (!limit.success) return rateLimitResponse(limit)

    const body = (await request.json().catch(() => null)) as { store_url?: unknown } | null
    const storeUrl = normalizeStoreUrl(typeof body?.store_url === 'string' ? body.store_url : null)
    if (!storeUrl) {
      return NextResponse.json({ error: 'Enter your store address, e.g. https://shop.example.com' }, { status: 400 })
    }
    if (!storeUrl.startsWith('https://')) {
      return NextResponse.json({ error: 'One-click connect needs your store on https://. Use the manual setup below instead.' }, { status: 400 })
    }

    const saved = await ensureWooStore(supabaseAdmin(), { accountId: ctx.accountId, userId: ctx.userId, storeUrl })
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 500 })

    const origin = publicOrigin()
    const authorizeUrl = wooAuthorizeUrl({
      storeUrl,
      state: signWooState({ accountId: ctx.accountId, userId: ctx.userId, storeUrl }),
      returnUrl: `${origin}/integrations/woocommerce?wc_return=1`,
      callbackUrl: `${origin}${WOO_CALLBACK_PATH}`,
    })
    await recordAudit(
      { accountId: ctx.accountId, actorUserId: ctx.userId, action: 'integration.connected', targetType: 'woocommerce', metadata: { what: 'one_click_started', store: new URL(storeUrl).hostname } },
      request,
    )
    return NextResponse.json({ authorize_url: authorizeUrl })
  } catch (err) {
    return toErrorResponse(err)
  }
}
