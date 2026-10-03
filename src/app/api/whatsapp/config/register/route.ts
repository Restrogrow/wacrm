import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { registerPhoneNumber, isSmbRegistrationRejection } from '@/lib/whatsapp/meta-api'
import { decrypt } from '@/lib/whatsapp/encryption'

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

/**
 * POST /api/whatsapp/config/register
 *
 * Completes Cloud API registration (the `/register` + PIN step) for an
 * already-saved config, without requiring the caller to re-supply the
 * access token. The full config POST route needs a plaintext token in
 * the request body to re-verify with Meta; that's fine for the manual
 * copy-paste flow, but Embedded Signup never shows the customer their
 * access token (it's a Business Integration System User token, exchanged
 * server-side and stored encrypted, per Meta's guidance to never surface
 * it in the UI). This endpoint decrypts the already-stored token
 * server-side instead, so "finish connecting" after Embedded Signup is
 * just "enter the 2-step PIN you set on the number" — no credential
 * re-entry needed. Manual-flow users get the same convenience as a
 * side effect.
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
    const { pin } = body

    if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) {
      return NextResponse.json({ error: 'PIN must be exactly 6 digits.' }, { status: 400 })
    }

    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select('phone_number_id, access_token')
      .eq('account_id', accountId)
      .maybeSingle()

    if (configError) {
      console.error('Error fetching whatsapp_config for registration:', configError)
      return NextResponse.json({ error: 'Failed to load configuration' }, { status: 500 })
    }
    if (!config) {
      return NextResponse.json(
        { error: 'No WhatsApp configuration saved yet.' },
        { status: 404 },
      )
    }

    let accessToken: string
    try {
      accessToken = decrypt(config.access_token)
    } catch (err) {
      console.error('[whatsapp/config/register] Token decryption failed:', err)
      return NextResponse.json(
        {
          error:
            'The stored access token cannot be decrypted. Reset the configuration and reconnect.',
        },
        { status: 409 },
      )
    }

    try {
      await registerPhoneNumber({
        phoneNumberId: config.phone_number_id,
        accessToken,
        pin,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Meta API error'

      // Meta rejecting /register with "not available for SMB
      // businesses" isn't a failure — it confirms this number is on
      // the WhatsApp Business app, discovered only now because the
      // manual form has no way to know that up front. Messaging
      // already works (metadata + WABA subscription don't need
      // /register), so mark it and clear the scary error.
      //
      // We deliberately do NOT auto-start the contacts/history sync
      // here like Embedded Signup's coexistence path does: Meta's
      // smb_app_data API requires the number to have gone through the
      // actual FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING handshake in
      // the Embedded Signup popup first — confirmed live, it rejects
      // with "not onboarded on to WhatsApp Business Platform" for a
      // number that only arrived via the manual form. There's no
      // server-side way to trigger that handshake retroactively.
      if (isSmbRegistrationRejection(message)) {
        await supabase
          .from('whatsapp_config')
          .update({
            is_on_biz_app: true,
            last_registration_error: null,
            status: 'connected',
            updated_at: new Date().toISOString(),
          })
          .eq('account_id', accountId)

        return NextResponse.json({
          success: true,
          registered: false,
          coexistence: true,
          message:
            'This number is managed by the WhatsApp Business app — no PIN needed, and messages already work. To also auto-import existing contacts and chat history, reconnect using "Connect with Facebook" instead — only that flow can complete the handshake Meta requires for the import.',
        })
      }

      console.error('Phone number /register failed:', message)
      await supabase
        .from('whatsapp_config')
        .update({ last_registration_error: message, updated_at: new Date().toISOString() })
        .eq('account_id', accountId)
      return NextResponse.json({ success: false, registered: false, error: message })
    }

    const { error: updateError } = await supabase
      .from('whatsapp_config')
      .update({
        registered_at: new Date().toISOString(),
        last_registration_error: null,
        status: 'connected',
        updated_at: new Date().toISOString(),
      })
      .eq('account_id', accountId)

    if (updateError) {
      console.error('Error updating whatsapp_config after registration:', updateError)
      return NextResponse.json({ error: 'Registered with Meta but failed to save locally' }, { status: 500 })
    }

    return NextResponse.json({ success: true, registered: true })
  } catch (error) {
    console.error('Error in WhatsApp config/register POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
