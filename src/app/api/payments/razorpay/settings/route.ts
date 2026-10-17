// ============================================================
// /api/payments/razorpay/settings — connect Razorpay for payment links.
//
//   GET     → { connected, key_id_masked, webhook_url }       (any member)
//   PUT     { key_id, key_secret } → verifies the keys with Razorpay, stores
//           them encrypted and returns the webhook secret ONCE. (admins)
//   POST    { action: 'regenerate_secret' } → new webhook secret, ONCE. (admins)
//   DELETE  → disconnect (admins)
//
// Secrets are never returned except the freshly generated webhook secret
// in the PUT / POST response, so the merchant can paste it into Razorpay.
// ============================================================

import { NextResponse } from 'next/server'

import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { publicOrigin } from '@/lib/public-origin'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import {
  RazorpayError,
  encryptSecret,
  generateWebhookSecret,
  maskKeyId,
  verifyRazorpayCredentials,
} from '@/lib/payments/razorpay'

const webhookUrl = () => `${publicOrigin()}/api/payments/razorpay/webhook`

export async function GET() {
  try {
    const ctx = await getCurrentAccount()
    const { data, error } = await supabaseAdmin()
      .from('razorpay_credentials')
      .select('key_id')
      .eq('account_id', ctx.accountId)
      .maybeSingle()
    // Table missing (migration 064 not applied) reads as "not available".
    if (error) return NextResponse.json({ available: false, connected: false, webhook_url: webhookUrl() })
    return NextResponse.json({
      available: true,
      connected: !!data,
      key_id_masked: data ? maskKeyId(data.key_id as string) : null,
      webhook_url: webhookUrl(),
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function PUT(request: Request) {
  try {
    const ctx = await requireRole('admin')
    const limit = checkRateLimit(`razorpay-connect:${ctx.userId}`, { limit: 10, windowMs: 60_000 })
    if (!limit.success) return rateLimitResponse(limit)

    const b = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>
    const keyId = typeof b.key_id === 'string' ? b.key_id.trim() : ''
    const keySecret = typeof b.key_secret === 'string' ? b.key_secret.trim() : ''
    if (!/^rzp_(live|test)_[A-Za-z0-9]{8,30}$/.test(keyId)) {
      return NextResponse.json({ error: 'Enter your Razorpay Key ID (it starts with rzp_live_ or rzp_test_).' }, { status: 400 })
    }
    if (keySecret.length < 8 || keySecret.length > 80) {
      return NextResponse.json({ error: 'Enter your Razorpay Key Secret.' }, { status: 400 })
    }

    try {
      await verifyRazorpayCredentials({ keyId, keySecret })
    } catch (err) {
      if (err instanceof RazorpayError) return NextResponse.json({ error: err.message }, { status: err.status })
      throw err
    }

    const webhookSecret = generateWebhookSecret()
    const { error } = await supabaseAdmin()
      .from('razorpay_credentials')
      .upsert(
        {
          account_id: ctx.accountId,
          key_id: keyId,
          key_secret_enc: encryptSecret(keySecret),
          webhook_secret_enc: encryptSecret(webhookSecret),
          connected_by: ctx.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'account_id' },
      )
    if (error) {
      console.error('[razorpay] save credentials failed:', error.message)
      return NextResponse.json({ error: 'Could not save. Run migration 064_razorpay_payment_links.sql first.' }, { status: 500 })
    }

    return NextResponse.json({
      connected: true,
      key_id_masked: maskKeyId(keyId),
      webhook_url: webhookUrl(),
      webhook_secret: webhookSecret,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin')
    const b = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>
    if (b.action !== 'regenerate_secret') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

    const webhookSecret = generateWebhookSecret()
    const { data, error } = await supabaseAdmin()
      .from('razorpay_credentials')
      .update({ webhook_secret_enc: encryptSecret(webhookSecret), updated_at: new Date().toISOString() })
      .eq('account_id', ctx.accountId)
      .select('account_id')
      .maybeSingle()
    if (error || !data) return NextResponse.json({ error: 'Connect Razorpay first.' }, { status: 400 })
    return NextResponse.json({ webhook_url: webhookUrl(), webhook_secret: webhookSecret })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function DELETE() {
  try {
    const ctx = await requireRole('admin')
    const { error } = await supabaseAdmin().from('razorpay_credentials').delete().eq('account_id', ctx.accountId)
    if (error) return NextResponse.json({ error: 'Could not disconnect.' }, { status: 500 })
    return NextResponse.json({ connected: false })
  } catch (err) {
    return toErrorResponse(err)
  }
}
