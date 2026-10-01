import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/whatsapp/encryption'
import { initiateSmbAppDataSync, type SmbSyncType } from '@/lib/whatsapp/meta-api'

/**
 * POST /api/whatsapp/smb-sync
 *
 * Retry the ONE-SHOT WhatsApp Business app data syncs (contacts and/or
 * chat history) for a coexistence number. The initial calls happen
 * automatically right after Embedded Signup completes; this endpoint
 * covers the failure case (Meta 5xx, transient network error) —
 * a sync_type that already succeeded must NOT be re-requested
 * (Meta rejects duplicates), so each pending type is detected from
 * its *_synced_at column.
 *
 * Returns which syncs were started and which were already done, so
 * the UI can show precise state instead of a generic success toast.
 */
export async function POST() {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .maybeSingle()
  const accountId = profile?.account_id as string | undefined
  if (!accountId) {
    return NextResponse.json(
      { error: 'Your profile is not linked to an account.' },
      { status: 403 },
    )
  }

  const { data: config } = await supabase
    .from('whatsapp_config')
    .select('id, phone_number_id, access_token, is_on_biz_app, smb_contacts_synced_at, smb_history_synced_at')
    .eq('account_id', accountId)
    .maybeSingle()

  if (!config) {
    return NextResponse.json(
      { error: 'No WhatsApp configuration saved yet.' },
      { status: 404 },
    )
  }
  if (!config.is_on_biz_app) {
    return NextResponse.json(
      { error: 'This number is not a WhatsApp Business app (coexistence) number.' },
      { status: 400 },
    )
  }

  let accessToken: string
  try {
    accessToken = decrypt(config.access_token)
  } catch {
    return NextResponse.json(
      { error: "Stored access token can't be decrypted — likely ENCRYPTION_KEY changed." },
      { status: 500 },
    )
  }

  const started: SmbSyncType[] = []
  const alreadyDone: SmbSyncType[] = []
  const failed: Array<{ sync_type: SmbSyncType; error: string }> = []
  const requestIds: Record<string, string> = {}
  let hadError = false

  const pending: Array<{ type: SmbSyncType; doneAt: string | null; column: string }> = [
    { type: 'smb_app_state_sync', doneAt: config.smb_contacts_synced_at ?? null, column: 'smb_contacts_synced_at' },
    { type: 'history', doneAt: config.smb_history_synced_at ?? null, column: 'smb_history_synced_at' },
  ]

  for (const item of pending) {
    if (item.doneAt) {
      alreadyDone.push(item.type)
      continue
    }
    try {
      const result = await initiateSmbAppDataSync({
        phoneNumberId: config.phone_number_id,
        accessToken,
        syncType: item.type,
      })
      started.push(item.type)
      requestIds[item.type === 'smb_app_state_sync' ? 'contacts' : 'history'] = result.requestId
      await supabase
        .from('whatsapp_config')
        .update({ [item.column]: new Date().toISOString() })
        .eq('id', config.id)
    } catch (err) {
      hadError = true
      const message = err instanceof Error ? err.message : String(err)
      failed.push({ sync_type: item.type, error: message })
    }
  }

  if (Object.keys(requestIds).length > 0 || hadError) {
    // Merge request ids with any previously stored ones.
    const { data: current } = await supabase
      .from('whatsapp_config')
      .select('smb_sync_request_ids')
      .eq('id', config.id)
      .maybeSingle()
    const merged = { ...(current?.smb_sync_request_ids ?? {}), ...requestIds }
    await supabase
      .from('whatsapp_config')
      .update({
        smb_sync_request_ids: merged,
        smb_sync_error: hadError
          ? failed.map((f) => `${f.sync_type}: ${f.error}`).join('; ')
          : null,
      })
      .eq('id', config.id)
  }

  return NextResponse.json({
    success: !hadError,
    started,
    already_done: alreadyDone,
    failed,
  })
}
