// ============================================================
// POST /api/whatsapp/commerce/share — share the catalog or a product.
// { conversation_id, kind: 'catalog' | 'product', retailer_id?, text? }
// { conversation_id, kind: 'product_list', retailer_ids?: string[], collection_id?: string, text? }
//   → interactive multi-product message (1-30 products, grouped by category).
// Needs a catalog ID in Orders & payments and an open
// 24-hour window. Agents and above.
// ============================================================

import { NextResponse } from 'next/server'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'

import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { accountCanSend } from '@/lib/billing/server'
import { customerForConversation } from '@/lib/whatsapp/calling-server'
import { CallingError } from '@/lib/whatsapp/calling'
import { WhatsAppSendError, catalogMessage, loadCommerce, productMessage, sendWhatsApp, type CommerceCreds } from '@/lib/whatsapp/commerce'
import { explainProductSendFailure, fetchCatalogFacts } from '@/lib/catalog/meta-diagnose'
import { logOutgoing } from '@/lib/whatsapp/commerce-server'
import {
  ProductListError,
  buildProductListMessage,
  groupIntoSections,
  normaliseRetailerIds,
  type ProductListSection,
} from '@/lib/catalog/messages'

/**
 * A product or list send failed: log what we sent (no token, no customer
 * number) and, for Meta's vague "parameter not valid", ask Meta why.
 */
async function explainSendError(err: unknown, creds: CommerceCreds, catalogId: string, kind: string, retailerIds: string[]): Promise<string> {
  const message = err instanceof Error ? err.message : 'Could not send.'
  const code = err instanceof WhatsAppSendError ? err.code : null
  console.error('[commerce/share] Meta refused', { kind, code, message, catalogId, retailerIds, phoneNumberId: creds.phoneNumberId })
  if (code !== 131009 || !retailerIds.length) return message
  const facts = await fetchCatalogFacts(creds.accessToken, creds.wabaId ?? null, catalogId, retailerIds, creds.phoneNumberId)
  return (
    explainProductSendFailure(catalogId, retailerIds, facts) ??
    `${message}. Use "Check catalog connection" on the Orders & payments page to see what Meta has linked to your number.`
  )
}

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
      return NextResponse.json({ error: 'Add your catalog ID in Orders & payments first.' }, { status: 400 })
    }
    let customer
    try {
      customer = await customerForConversation(ctx.accountId, b.conversation_id)
    } catch (err) {
      if (err instanceof CallingError) return NextResponse.json({ error: err.message }, { status: err.status })
      throw err
    }

    // Several products in one message (picked in the inbox, or a saved collection).
    if (b.kind === 'product_list') {
      let sections: ProductListSection[] = []
      let header = 'Our products'
      try {
        if (typeof b.collection_id === 'string' && b.collection_id) {
          const { data: collection } = await db
            .from('catalog_collections')
            .select('id, name')
            .eq('id', b.collection_id)
            .eq('account_id', ctx.accountId)
            .maybeSingle()
          if (!collection) return NextResponse.json({ error: 'Collection not found.' }, { status: 404 })
          const { data: items } = await db
            .from('catalog_collection_items')
            .select('retailer_id, position')
            .eq('collection_id', collection.id)
            .eq('account_id', ctx.accountId)
            .order('position', { ascending: true })
          header = collection.name as string
          sections = [{ title: collection.name as string, retailer_ids: normaliseRetailerIds((items ?? []).map((i) => i.retailer_id)) }]
        } else {
          const ids = normaliseRetailerIds(b.retailer_ids)
          // Group by category when the product library knows them.
          const { data: known } = ids.length
            ? await db.from('products').select('retailer_id, category').eq('account_id', ctx.accountId).in('retailer_id', ids)
            : { data: [] as { retailer_id: string; category: string | null }[] }
          const category = new Map((known ?? []).map((k) => [k.retailer_id as string, (k.category as string | null) ?? null]))
          sections = groupIntoSections(ids.map((id) => ({ retailer_id: id, category: category.get(id) ?? null })))
        }
        const body = typeof b.text === 'string' && b.text.trim() ? b.text.trim() : 'Take a look and order right here on WhatsApp.'
        const message = buildProductListMessage({ catalogId: settings.catalog_id, header, body, sections })
        const wamid = await sendWhatsApp(creds, customer.phone, message)
        const count = sections.reduce((n, s) => n + s.retailer_ids.length, 0)
        await logOutgoing(db, {
          conversationId: customer.conversationId,
          userId: ctx.userId,
          text: `🛍️ ${count} product${count === 1 ? '' : 's'} shared: ${header}
${body}`,
          wamid,
        })
        return NextResponse.json({ ok: true })
      } catch (err) {
        if (err instanceof ProductListError) return NextResponse.json({ error: err.message }, { status: 400 })
        const ids = sections.flatMap((s) => s.retailer_ids)
        return NextResponse.json({ error: await explainSendError(err, creds, settings.catalog_id, 'product_list', ids) }, { status: 400 })
      }
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
      const ids = b.kind === 'product' ? [retailerId] : []
      return NextResponse.json({ error: await explainSendError(err, creds, settings.catalog_id, String(b.kind), ids) }, { status: 400 })
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
