// ============================================================
// POST /api/whatsapp/commerce/share — share the catalog or a product.
// { conversation_id, kind: 'catalog' | 'product', retailer_id?, text? }
// Needs a catalog ID in Settings → Orders & payments and an open
// 24-hour window. Agents and above.
// ============================================================

import { NextResponse } from 'next/server'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'

import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { accountCanSend } from '@/lib/billing/server'
import { customerForConversation } from '@/lib/whatsapp/calling-server'
import { CallingError } from '@/lib/whatsapp/calling'
import { catalogMessage, loadCommerce, productMessage, sendWhatsApp } from '@/lib/whatsapp/commerce'
import { logOutgoing } from '@/lib/whatsapp/commerce-server'

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent')

    const sendLimit = checkRateLimit(`send:${ctx.userId}`, RATE_LIMITS.send)
    if (!sendLimit.success) return rateLimitResponse(sendLimit)
    const b = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>
    if (typeof b.conversation_id !== 'string') return NextResponse.json({ error: 'conversation_id is required' }, { status: 400 })
    if (!(await accountCanSend(ctx.accountId))) {
      return NextResponse.json({ error: 'Your plan is read-only. Choose a plan to send messages.' }, { status: 402 })
    }

    const db = supabaseAdmin()
    const { creds, settings } = await loadCommerce(db, ctx.accountId)
    if (!settings.catalog_id) {
      return NextResponse.json({ error: 'Add your catalog ID in Settings → Orders & payments first.' }, { status: 400 })
    }
    let customer
    try {
      customer = await customerForConversation(ctx.accountId, b.conversation_id)
    } catch (err) {
      if (err instanceof CallingError) return NextResponse.json({ error: err.message }, { status: err.status })
      throw err
    }

    const text = typeof b.text === 'string' && b.text.trim() ? b.text.trim() : 'Browse our catalog and order right here on WhatsApp.'
    const retailerId = typeof b.retailer_id === 'string' ? b.retailer_id.trim() : ''
    if (b.kind === 'product' && !retailerId) return NextResponse.json({ error: 'Enter the product’s content ID (SKU).' }, { status: 400 })

    let wamid: string | null
    try {
      wamid = await sendWhatsApp(
        creds,
        customer.phone,
        b.kind === 'product' ? productMessage(settings.catalog_id, retailerId, text) : catalogMessage(text, retailerId || undefined),
      )
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not send.' }, { status: 400 })
    }

    await logOutgoing(db, {
      conversationId: customer.conversationId,
      userId: ctx.userId,
      text: b.kind === 'product' ? `🛍️ Product shared: ${retailerId}\n${text}` : `🛍️ Catalog shared\n${text}`,
      wamid,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
