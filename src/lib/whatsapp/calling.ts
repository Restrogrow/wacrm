// ============================================================
// WhatsApp Calling API — browser voice calls (migration 048).
//
// Signalling goes through Meta's Graph API + the `calls` webhook;
// audio is WebRTC straight between the agent's browser and Meta
// (components/calls/call-provider.tsx).
//
//   Inbound:  webhook `connect` (SDP offer) → row 'ringing' → an agent
//             answers in the browser → pre_accept + accept with the
//             browser's SDP answer → 'connected' → webhook `terminate`.
//   Outbound: browser SDP offer → POST /calls action=connect → webhook
//             `connect` carries Meta's SDP answer → statuses RINGING /
//             ACCEPTED / REJECTED → webhook `terminate`.
//
// Business-initiated calls need the customer's call permission
// (call_permission_request message, or callback permission when they
// call you). Docs:
// https://developers.facebook.com/documentation/business-messaging/whatsapp/calling
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'

import { decrypt } from '@/lib/whatsapp/encryption'
import { resolveConversationByPhone } from '@/lib/whatsapp/resolve-conversation'
import { findExistingContact } from '@/lib/contacts/dedupe'

const GRAPH = 'https://graph.facebook.com/v21.0'

export class CallingError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly metaCode?: number,
  ) {
    super(message)
    this.name = 'CallingError'
  }
}

/** Meta error 138006: the customer hasn't given call permission. */
export const NO_CALL_PERMISSION = 138006

export interface CallingConfig {
  accountId: string
  phoneNumberId: string
  accessToken: string
}

/** The account's WhatsApp number + decrypted token. */
export async function loadCallingConfig(db: SupabaseClient, accountId: string): Promise<CallingConfig> {
  const { data: config } = await db
    .from('whatsapp_config')
    .select('phone_number_id, access_token')
    .eq('account_id', accountId)
    .maybeSingle()
  if (!config?.phone_number_id || !config.access_token) {
    throw new CallingError('Connect WhatsApp first (Settings → WhatsApp).', 400, 'whatsapp_not_configured')
  }
  return { accountId, phoneNumberId: config.phone_number_id, accessToken: decrypt(config.access_token) }
}

async function graph<T>(
  cfg: CallingConfig,
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown },
): Promise<T> {
  const res = await fetch(`${GRAPH}/${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${cfg.accessToken}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const json = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; code?: number; error_user_msg?: string; error_data?: { details?: string } }
  } & T
  if (!res.ok || json.error) {
    const e = json.error ?? {}
    const message = e.error_user_msg || e.error_data?.details || e.message || `WhatsApp returned ${res.status}`
    throw new CallingError(message, res.status >= 500 ? 502 : 400, 'meta_error', e.code)
  }
  return json
}

// ---------- Call actions ----------

export interface SdpSession {
  sdp_type: 'offer' | 'answer'
  sdp: string
}

export async function startCall(cfg: CallingConfig, to: string, offerSdp: string, ref?: string) {
  const res = await graph<{ calls?: { id: string }[] }>(cfg, `${cfg.phoneNumberId}/calls`, {
    method: 'POST',
    body: {
      messaging_product: 'whatsapp',
      to,
      action: 'connect',
      session: { sdp_type: 'offer', sdp: offerSdp },
      ...(ref ? { biz_opaque_callback_data: ref.slice(0, 512) } : {}),
    },
  })
  const callId = res.calls?.[0]?.id
  if (!callId) throw new CallingError('WhatsApp did not return a call id.', 502)
  return callId
}

export async function callAction(
  cfg: CallingConfig,
  callId: string,
  action: 'pre_accept' | 'accept' | 'reject' | 'terminate',
  answerSdp?: string,
) {
  await graph(cfg, `${cfg.phoneNumberId}/calls`, {
    method: 'POST',
    body: {
      messaging_product: 'whatsapp',
      call_id: callId,
      action,
      ...(answerSdp ? { session: { sdp_type: 'answer', sdp: answerSdp } } : {}),
    },
  })
}

// ---------- Permissions ----------

export interface CallPermission {
  status: 'no_permission' | 'temporary' | 'permanent'
  expiresAt: string | null
  canCall: boolean
  canRequest: boolean
}

interface PermissionResponse {
  permission?: { status?: string; expiration_time?: number; expiration?: number }
  actions?: { action_name: string; can_perform_action: boolean }[]
}

export function parsePermission(res: PermissionResponse): CallPermission {
  const status = (res.permission?.status ?? 'no_permission') as CallPermission['status']
  const exp = res.permission?.expiration_time ?? res.permission?.expiration
  const can = (name: string) => res.actions?.find((a) => a.action_name === name)?.can_perform_action ?? false
  return {
    status,
    expiresAt: exp ? new Date(exp * 1000).toISOString() : null,
    canCall: status !== 'no_permission' && can('start_call'),
    canRequest: can('send_call_permission_request'),
  }
}

export async function getCallPermission(cfg: CallingConfig, waId: string): Promise<CallPermission> {
  const res = await graph<PermissionResponse>(
    cfg,
    `${cfg.phoneNumberId}/call_permissions?user_wa_id=${encodeURIComponent(waId)}`,
    { method: 'GET' },
  )
  return parsePermission(res)
}

export const DEFAULT_PERMISSION_TEXT = 'We would like to call you on WhatsApp about your enquiry. Is that okay?'

export async function sendCallPermissionRequest(cfg: CallingConfig, to: string, bodyText: string) {
  const res = await graph<{ messages?: { id: string }[] }>(cfg, `${cfg.phoneNumberId}/messages`, {
    method: 'POST',
    body: {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'call_permission_request',
        action: { name: 'call_permission_request' },
        body: { text: bodyText.slice(0, 1024) },
      },
    },
  })
  return res.messages?.[0]?.id ?? null
}

// ---------- Number settings ----------

export interface CallingSettings {
  status: 'ENABLED' | 'DISABLED'
  callIconVisibility: string | null
  callbackPermissionStatus: string | null
}

/** Meta's "calling not enabled for this phone number" family of errors. */
export function isCallingNotEnabledError(err: unknown): boolean {
  return err instanceof CallingError && /calling (is )?not (enabled|available)|not eligible/i.test(err.message)
}

/** What to tell an admin when Meta won't switch calling on. */
export const CALLING_NOT_ALLOWED_HELP =
  'WhatsApp hasn’t allowed calling on this number yet. Meta requires a messaging limit of at least 2,000 customers a day (check WhatsApp Manager → Phone numbers), the number must use only the Cloud API (not also the WhatsApp Business app), and the calls webhook field must be subscribed in your Meta app.'

export async function getCallingSettings(cfg: CallingConfig): Promise<CallingSettings> {
  const res = await graph<{
    calling?: { status?: string; call_icon_visibility?: string; callback_permission_status?: string }
  }>(cfg, `${cfg.phoneNumberId}/settings`, { method: 'GET' })
  return {
    status: res.calling?.status === 'ENABLED' ? 'ENABLED' : 'DISABLED',
    callIconVisibility: res.calling?.call_icon_visibility ?? null,
    callbackPermissionStatus: res.calling?.callback_permission_status ?? null,
  }
}

export async function setCallingEnabled(cfg: CallingConfig, enabled: boolean) {
  await graph(cfg, `${cfg.phoneNumberId}/settings`, {
    method: 'POST',
    body: {
      calling: enabled
        ? { status: 'ENABLED', call_icon_visibility: 'DEFAULT', callback_permission_status: 'ENABLED' }
        : { status: 'DISABLED' },
    },
  })
}

// ---------- Webhook (`calls` field) ----------

interface CallWebhookCall {
  id: string
  from?: string
  to?: string
  from_user_id?: string
  event?: 'connect' | 'terminate' | string
  direction?: 'USER_INITIATED' | 'BUSINESS_INITIATED' | string
  timestamp?: string
  session?: { sdp_type?: string; sdp?: string }
  status?: string | string[]
  start_time?: string
  end_time?: string
  duration?: number | string
}

interface CallWebhookStatus {
  id: string
  type?: string
  status?: string
  recipient_id?: string
}

export interface CallWebhookValue {
  metadata?: { phone_number_id?: string }
  contacts?: { wa_id?: string; profile?: { name?: string } }[]
  calls?: CallWebhookCall[]
  statuses?: CallWebhookStatus[]
}

function toIso(ts?: string | number | null): string | null {
  if (ts === undefined || ts === null || ts === '') return null
  const n = Number(ts)
  return Number.isFinite(n) ? new Date(n * 1000).toISOString() : null
}

function terminateStatus(call: CallWebhookCall): string {
  const raw = Array.isArray(call.status) ? call.status.join(',') : (call.status ?? '')
  return raw.toLowerCase()
}

/** Handle a `calls` webhook change. Never throws for a single bad call. */
export async function handleCallsWebhook(db: SupabaseClient, value: CallWebhookValue): Promise<void> {
  const phoneNumberId = value.metadata?.phone_number_id
  if (!phoneNumberId) return

  const { data: config } = await db
    .from('whatsapp_config')
    .select('account_id')
    .eq('phone_number_id', phoneNumberId)
    .maybeSingle()
  const accountId = config?.account_id as string | undefined
  if (!accountId) {
    console.warn('[calls] no account for phone_number_id', phoneNumberId)
    return
  }

  for (const call of value.calls ?? []) {
    try {
      if (call.event === 'connect') await onConnect(db, accountId, phoneNumberId, call, value)
      else if (call.event === 'terminate') await onTerminate(db, call)
    } catch (err) {
      console.error('[calls] webhook handling failed for', call.id, err)
    }
  }

  for (const s of value.statuses ?? []) {
    if (s.type && s.type !== 'call') continue
    const status = (s.status ?? '').toUpperCase()
    const updates: Record<string, unknown> =
      status === 'ACCEPTED'
        ? { status: 'connected', answered_at: new Date().toISOString() }
        : status === 'REJECTED'
          ? { status: 'rejected', ended_at: new Date().toISOString() }
          : status === 'RINGING'
            ? { status: 'ringing' }
            : {}
    if (Object.keys(updates).length === 0) continue
    await db
      .from('whatsapp_calls')
      .update(updates)
      .eq('call_id', s.id)
      .not('status', 'in', '(ended,missed,rejected,failed)')
  }
}

async function onConnect(
  db: SupabaseClient,
  accountId: string,
  phoneNumberId: string,
  call: CallWebhookCall,
  value: CallWebhookValue,
) {
  if (call.direction === 'BUSINESS_INITIATED') {
    // Meta's SDP answer for a call an agent started. The row may not
    // exist yet if this webhook beats the API response — upsert by
    // call_id and let the API route fill in the rest.
    await db.from('whatsapp_calls').upsert(
      {
        call_id: call.id,
        account_id: accountId,
        phone_number_id: phoneNumberId,
        direction: 'outbound',
        sdp_answer: call.session?.sdp ?? null,
      },
      { onConflict: 'call_id' },
    )
    return
  }

  // Customer is calling the business.
  const customerNumber = call.from ?? value.contacts?.[0]?.wa_id ?? null
  const customerName = value.contacts?.[0]?.profile?.name ?? null
  let conversationId: string | null = null
  let contactId: string | null = null
  if (customerNumber) {
    try {
      const existing = await findExistingContact(db, accountId, customerNumber)
      const resolved = await resolveConversationByPhone(
        db,
        accountId,
        `+${customerNumber.replace(/^\+/, '')}`,
        existing ? undefined : customerName,
      )
      conversationId = resolved.conversationId
      contactId = resolved.contactId
    } catch (err) {
      console.warn('[calls] could not link call to a conversation:', err instanceof Error ? err.message : err)
    }
  }

  await db.from('whatsapp_calls').upsert(
    {
      call_id: call.id,
      account_id: accountId,
      phone_number_id: phoneNumberId,
      direction: 'inbound',
      status: 'ringing',
      customer_number: customerNumber,
      customer_name: customerName,
      conversation_id: conversationId,
      contact_id: contactId,
      sdp_offer: call.session?.sdp ?? null,
      created_at: toIso(call.timestamp) ?? new Date().toISOString(),
    },
    { onConflict: 'call_id', ignoreDuplicates: true },
  )
}

async function onTerminate(db: SupabaseClient, call: CallWebhookCall) {
  const { data: row } = await db
    .from('whatsapp_calls')
    .select('id, status, answered_at')
    .eq('call_id', call.id)
    .maybeSingle()
  if (!row) return

  const failed = terminateStatus(call).includes('fail')
  const duration = call.duration !== undefined ? Number(call.duration) : null
  const wasAnswered = !!row.answered_at || row.status === 'connected' || (duration ?? 0) > 0
  const finalStatus =
    row.status === 'rejected' ? 'rejected' : wasAnswered ? 'ended' : failed ? 'failed' : 'missed'

  await db
    .from('whatsapp_calls')
    .update({
      status: finalStatus,
      ended_at: toIso(call.end_time) ?? new Date().toISOString(),
      answered_at: row.answered_at ?? toIso(call.start_time),
      duration_seconds: Number.isFinite(duration) ? duration : null,
      // SDPs aren't needed once the call is over.
      sdp_offer: null,
      sdp_answer: null,
    })
    .eq('id', row.id)
}
