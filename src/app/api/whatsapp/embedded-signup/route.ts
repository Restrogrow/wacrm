import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import {
  exchangeCodeForToken,
  initiateSmbAppDataSync,
  subscribeWabaToApp,
  verifyPhoneNumber,
  checkCoexistenceStatus,
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
 * GET /{waba_id}/phone_numbers — list the numbers on the WABA the
 * customer just connected. Used by the coexistence path where Meta's
 * session event only carries waba_id (no phone_number_id).
 */
async function listWabaPhoneNumbers(
  wabaId: string,
  accessToken: string,
): Promise<Array<{ id: string }>> {
  const url = `https://graph.facebook.com/v21.0/${wabaId}/phone_numbers?fields=id&limit=100`
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) {
    throw new Error(`Meta API error fetching WABA phone numbers: ${response.status}`)
  }
  const data = (await response.json()) as { data?: Array<{ id: string }> }
  return data.data ?? []
}

/**
 * Kick off the ONE-SHOT SMB app data syncs for a coexistence number.
 *
 * Meta gives 24h after onboarding to call POST /{phone_number_id}/
 * smb_app_data for contacts ("smb_app_state_sync") and chat history
 * ("history") — each exactly once. Both fire here, back to back; the
 * data itself streams back asynchronously via the history /
 * smb_app_state_sync webhooks (handled in smb-webhook.ts).
 *
 * Fire-and-forget from the request's perspective, but awaited by the
 * serverless runtime through `after()`-style semantics is NOT
 * available on this route — so failures are persisted to the row
 * (smb_sync_error) and can be retried via POST /api/whatsapp/smb-sync
 * (which only retries syncs that never succeeded).
 */
async function startSmbSyncs(
  configId: string,
  phoneNumberId: string,
  accessToken: string,
): Promise<void> {
  const requestIds: Record<string, string> = {}
  const errors: string[] = []

  // Contacts first — cheap, and echoes/state-sync webhooks for them
  // are small.
  try {
    const contacts = await initiateSmbAppDataSync({
      phoneNumberId,
      accessToken,
      syncType: 'smb_app_state_sync',
    })
    requestIds.contacts = contacts.requestId
  } catch (err) {
    errors.push(`contacts: ${err instanceof Error ? err.message : String(err)}`)
  }

  // History second. If the business declined sharing, Meta answers
  // the request fine and delivers the decline via a history webhook
  // (error 2593109) — nothing to do here.
  try {
    const history = await initiateSmbAppDataSync({
      phoneNumberId,
      accessToken,
      syncType: 'history',
    })
    requestIds.history = history.requestId
  } catch (err) {
    errors.push(`history: ${err instanceof Error ? err.message : String(err)}`)
  }

  const update: Record<string, unknown> = {
    smb_sync_request_ids: requestIds,
    updated_at: new Date().toISOString(),
  }
  if (requestIds.contacts) update.smb_contacts_synced_at = new Date().toISOString()
  if (requestIds.history) update.smb_history_synced_at = new Date().toISOString()
  if (errors.length > 0) update.smb_sync_error = errors.join('; ')

  await supabaseAdmin()
    .from('whatsapp_config')
    .update(update)
    .eq('id', configId)
}

/**
 * POST /api/whatsapp/embedded-signup
 *
 * Completes Meta's Embedded Signup flow. The client-side FB.login popup
 * hands back a short-lived authorization `code` (via its callback) plus
 * `waba_id`/`phone_number_id`/`business_id` (via the WA_EMBEDDED_SIGNUP
 * postMessage event) — see src/components/settings/embedded-signup-button.tsx.
 *
 * Two flavours:
 *
 * 1. Standard Cloud API signup (event FINISH / FINISH_ONLY_WABA):
 *    verify → encrypt → subscribe → save. Does NOT call /register —
 *    the popup never collects a 2-step-verification PIN, so the row is
 *    saved as "connected" but unregistered; the caller finishes by
 *    providing a PIN through POST /api/whatsapp/config/register.
 *
 * 2. Coexistence onboarding (event FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING,
 *    `business_app_onboarding: true`): the customer connected their
 *    EXISTING WhatsApp Business app number. Meta's session event only
 *    carries waba_id, so the phone number is resolved from the WABA's
 *    phone_numbers edge. /register MUST be skipped (the number is
 *    already registered — the Business app owns the registration), so
 *    registered_at is set here and no PIN is needed. The one-shot
 *    contacts + history syncs are kicked off immediately (24h deadline).
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
    const {
      code,
      waba_id,
      phone_number_id,
      business_id,
      business_app_onboarding,
    } = body

    if (!code || !waba_id) {
      return NextResponse.json(
        { error: 'code and waba_id are required' },
        { status: 400 },
      )
    }
    // Coexistence events may omit phone_number_id; the standard flow
    // requires it (the WABA edge may hold several numbers, and only
    // the standard flow can create a brand-new one — ambiguous there).
    if (!phone_number_id && !business_app_onboarding) {
      return NextResponse.json(
        { error: 'phone_number_id is required' },
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

    // ── Resolve the phone number ──────────────────────────────────
    // Coexistence: Meta only sends waba_id in the session event.
    // Verify each candidate number and take the one that's actually
    // on the Business app (is_on_biz_app). Single-number WABAs (the
    // overwhelming majority) resolve trivially.
    let resolvedPhoneNumberId: string = phone_number_id ?? null
    let coexistence = false

    if (business_app_onboarding && !resolvedPhoneNumberId) {
      try {
        const candidates = await listWabaPhoneNumbers(waba_id, accessToken)
        for (const candidate of candidates) {
          try {
            const status = await checkCoexistenceStatus({
              phoneNumberId: candidate.id,
              accessToken,
            })
            if (status.isOnBizApp) {
              resolvedPhoneNumberId = candidate.id
              coexistence = true
              break
            }
          } catch {
            // Unreadable candidate — try the next one.
          }
        }
        // Fall back to the sole number when none reports coexistence
        // yet (Meta can lag flagging is_on_biz_app right after the
        // customer taps Confirm in the Business app).
        if (!resolvedPhoneNumberId && candidates.length === 1) {
          resolvedPhoneNumberId = candidates[0].id
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('WABA phone number resolution failed:', message)
        return NextResponse.json(
          { error: `Meta API error: ${message}` },
          { status: 400 },
        )
      }
    } else if (business_app_onboarding && resolvedPhoneNumberId) {
      // Client sent both — confirm the number really is a coexistence
      // number so the /register skip below is justified.
      try {
        const status = await checkCoexistenceStatus({
          phoneNumberId: resolvedPhoneNumberId,
          accessToken,
        })
        coexistence = status.isOnBizApp
      } catch {
        // Probe failed — treat as coexistence anyway (the client saw
        // the coexistence finish event; a false negative here must
        // not push us into a PIN flow the Business app can't do).
        coexistence = true
      }
    }

    if (!resolvedPhoneNumberId) {
      console.error(
        'Coexistence onboarding could not resolve a phone number:',
        waba_id,
      )
      return NextResponse.json(
        {
          error:
            'Connected the WhatsApp Business account, but no phone number could be identified on it. Re-run the connection flow.',
        },
        { status: 400 },
      )
    }

    // Same single-tenant-per-number rule as the manual form (see
    // config/route.ts) — must hold regardless of how the number arrived.
    const { data: claimed, error: claimedError } = await supabaseAdmin()
      .from('whatsapp_config')
      .select('account_id')
      .eq('phone_number_id', resolvedPhoneNumberId)
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

    // Doubles as proof the token is actually scoped to this phone
    // number — a mismatched/forged phone_number_id fails here.
    let phoneInfo
    try {
      phoneInfo = await verifyPhoneNumber({
        phoneNumberId: resolvedPhoneNumberId,
        accessToken,
      })
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

    // Coexistence numbers are pre-registered by the Business app —
    // /register would fail and is never needed. Standard numbers stay
    // unregistered until the user supplies a PIN.
    const registeredAt = coexistence ? new Date().toISOString() : null

    const { data: existing } = await supabase
      .from('whatsapp_config')
      .select('id')
      .eq('account_id', accountId)
      .maybeSingle()

    // Meta's dashboard requires a verify token to validate the webhook
    // callback URL. Embedded Signup rows previously stored null (the
    // popup never collects one) — generate a strong one here so the
    // number is webhook-ready immediately. Stored encrypted; the
    // plaintext is returned to the admin once and always re-readable
    // via the verify-registration diagnostics.
    const webhookVerifyToken = randomBytes(24).toString('hex')

    const baseRow = {
      phone_number_id: resolvedPhoneNumberId,
      waba_id,
      business_id: business_id || null,
      access_token: encryptedAccessToken,
      verify_token: encrypt(webhookVerifyToken),
      status: 'connected',
      connected_at: new Date().toISOString(),
      registered_at: registeredAt,
      subscribed_apps_at: subscribedAppsAt,
      last_registration_error: null,
      signup_method: 'embedded',
      is_on_biz_app: coexistence,
      updated_at: new Date().toISOString(),
    }

    let configId: string
    if (existing) {
      const { data: updated, error: updateError } = await supabase
        .from('whatsapp_config')
        .update(baseRow)
        .eq('account_id', accountId)
        .select('id')
        .single()
      if (updateError || !updated) {
        console.error('Error updating whatsapp_config (embedded signup):', updateError)
        return NextResponse.json({ error: 'Failed to save configuration' }, { status: 500 })
      }
      configId = updated.id
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('whatsapp_config')
        .insert({ account_id: accountId, user_id: user.id, ...baseRow })
        .select('id')
        .single()
      if (insertError || !inserted) {
        console.error('Error inserting whatsapp_config (embedded signup):', insertError)
        return NextResponse.json({ error: 'Failed to save configuration' }, { status: 500 })
      }
      configId = inserted.id
    }

    // One-shot contacts + history sync — must happen within 24h of
    // onboarding. Started eagerly; results/errors land on the row and
    // the data streams back via webhooks.
    if (coexistence) {
      await startSmbSyncs(configId, resolvedPhoneNumberId, accessToken)
    }

    return NextResponse.json({
      success: true,
      saved: true,
      registered: coexistence,
      registration_skipped: !coexistence,
      coexistence,
      phone_info: phoneInfo,
      webhook_verify_token: webhookVerifyToken,
    })
  } catch (error) {
    console.error('Error in embedded-signup POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
