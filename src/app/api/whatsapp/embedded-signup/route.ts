import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import {
  exchangeCodeForToken,
  subscribeWabaToApp,
  verifyPhoneNumber,
} from '@/lib/whatsapp/meta-api'
import { encrypt } from '@/lib/whatsapp/encryption'

async function resolveAccountId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data?.account_id) return null
  return data.account_id as string
}

// Lazy-initialised service-role client, mirroring config/route.ts — needed
// to detect a phone_number_id already claimed by a *different* account
// (invisible under RLS from the caller's own session).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _adminClient: any = null
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _adminClient
}

/**
 * POST /api/whatsapp/embedded-signup
 *
 * Completes Meta's Embedded Signup flow. The client-side FB.login popup
 * hands back a short-lived authorization `code` (via its callback) plus
 * `waba_id`/`phone_number_id`/`business_id` (via the WA_EMBEDDED_SIGNUP
 * postMessage event) — see src/components/settings/embedded-signup-button.tsx.
 *
 * This exchanges the code for a Business Integration System User token
 * server-side (the code expires in 30s and the app secret can never
 * reach the browser), then runs the same verify → encrypt → subscribe →
 * save pipeline as the manual config form. It does NOT call /register —
 * the popup never collects a 2-step-verification PIN, so the row is
 * saved as "connected" but unregistered; the caller finishes by
 * providing a PIN through POST /api/whatsapp/config/register (surfaced
 * by the existing "Not registered" banner in the settings UI).
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accountId = await resolveAccountId(supabase, user.id)
    if (!accountId) {
      return NextResponse.json(
        { error: 'Your profile is not linked to an account.' },
        { status: 403 },
      )
    }

    const body = await request.json()
    const { code, waba_id, phone_number_id, business_id } = body

    if (!code || !phone_number_id || !waba_id) {
      return NextResponse.json(
        { error: 'code, waba_id, and phone_number_id are required' },
        { status: 400 },
      )
    }

    const appId = process.env.META_APP_ID
    const appSecret = process.env.META_APP_SECRET
    if (!appId || !appSecret) {
      console.error('Embedded Signup misconfigured: META_APP_ID/META_APP_SECRET not set')
      return NextResponse.json(
        { error: 'WhatsApp quick-connect is not configured on this server yet.' },
        { status: 500 },
      )
    }

    // Same single-tenant-per-number rule as the manual form (see
    // config/route.ts) — must hold regardless of how the number arrived.
    const { data: claimed, error: claimedError } = await supabaseAdmin()
      .from('whatsapp_config')
      .select('account_id')
      .eq('phone_number_id', phone_number_id)
      .neq('account_id', accountId)
      .maybeSingle()

    if (claimedError) {
      console.error('Error checking phone_number_id ownership:', claimedError)
      return NextResponse.json({ error: 'Failed to validate configuration' }, { status: 500 })
    }
    if (claimed) {
      return NextResponse.json(
        {
          error:
            'This WhatsApp phone number is already linked to another account on this instance.',
        },
        { status: 409 },
      )
    }

    let accessToken: string
    try {
      const exchanged = await exchangeCodeForToken({ code, appId, appSecret })
      accessToken = exchanged.accessToken
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Meta API error'
      console.error('Embedded Signup token exchange failed:', message)
      return NextResponse.json(
        { error: `Meta token exchange failed: ${message}. The signup popup may have timed out — try again.` },
        { status: 400 },
      )
    }

    // Doubles as proof the token is actually scoped to this phone
    // number — a mismatched/forged phone_number_id fails here.
    let phoneInfo
    try {
      phoneInfo = await verifyPhoneNumber({ phoneNumberId: phone_number_id, accessToken })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Meta API error'
      console.error('Embedded Signup phone verification failed:', message)
      return NextResponse.json({ error: `Meta API error: ${message}` }, { status: 400 })
    }

    let encryptedAccessToken: string
    try {
      encryptedAccessToken = encrypt(accessToken)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown encryption error'
      console.error('Encryption failed:', message)
      return NextResponse.json(
        {
          error:
            'Failed to encrypt token. Check that ENCRYPTION_KEY is a valid 64-character hex string.',
        },
        { status: 500 },
      )
    }

    let subscribedAppsAt: string | null = null
    try {
      await subscribeWabaToApp({ wabaId: waba_id, accessToken })
      subscribedAppsAt = new Date().toISOString()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn('WABA subscribed_apps failed (non-fatal):', message)
    }

    const { data: existing } = await supabase
      .from('whatsapp_config')
      .select('id')
      .eq('account_id', accountId)
      .maybeSingle()

    const baseRow = {
      phone_number_id,
      waba_id,
      business_id: business_id || null,
      access_token: encryptedAccessToken,
      verify_token: null,
      status: 'connected',
      connected_at: new Date().toISOString(),
      registered_at: null,
      subscribed_apps_at: subscribedAppsAt,
      last_registration_error: null,
      signup_method: 'embedded',
      updated_at: new Date().toISOString(),
    }

    if (existing) {
      const { error: updateError } = await supabase
        .from('whatsapp_config')
        .update(baseRow)
        .eq('account_id', accountId)
      if (updateError) {
        console.error('Error updating whatsapp_config (embedded signup):', updateError)
        return NextResponse.json({ error: 'Failed to save configuration' }, { status: 500 })
      }
    } else {
      const { error: insertError } = await supabase
        .from('whatsapp_config')
        .insert({ account_id: accountId, user_id: user.id, ...baseRow })
      if (insertError) {
        console.error('Error inserting whatsapp_config (embedded signup):', insertError)
        return NextResponse.json({ error: 'Failed to save configuration' }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      saved: true,
      registered: false,
      registration_skipped: true,
      phone_info: phoneInfo,
    })
  } catch (error) {
    console.error('Error in embedded-signup POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
