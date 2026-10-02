/**
 * Handlers for Meta's WhatsApp coexistence webhook fields.
 *
 * When a business customer's existing WhatsApp Business app number is
 * onboarded onto Cloud API by a Tech Provider ("coexistence"), Meta
 * delivers three additional webhook fields on the WABA webhook:
 *
 *   - smb_app_state_sync — WhatsApp contacts from the business's phone
 *     address book (initial one-shot sync + ongoing add/remove).
 *   - smb_message_echoes — messages the business SENT from the
 *     WhatsApp Business app or a supported companion device (or
 *     edited/revoked there).
 *   - history            — up to 180 days of past chat history,
 *     streamed in phases/chunks after the one-shot sync is initiated.
 *
 * The route handler at /api/whatsapp/webhook receives every change and
 * delegates here when `change.field` is one of the three (plus
 * `account_update` for PARTNER_REMOVED coexistence disconnects).
 *
 * Payload references:
 *   https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/smb_app_state_sync
 *   https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/smb_message_echoes
 *   https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users#history
 *
 * ─── Setup requirement (out-of-band) ──────────────────────────────
 * These fields must be toggled in Meta App Dashboard → WhatsApp →
 * Configuration → Webhooks (no API exists for Cloud API apps).
 * history + smb_app_state_sync + smb_message_echoes.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizePhone } from './phone-utils'

const COEXISTENCE_WEBHOOK_FIELDS = new Set([
  'history',
  'smb_app_state_sync',
  'smb_message_echoes',
])

export function isCoexistenceWebhookField(field: string): boolean {
  return COEXISTENCE_WEBHOOK_FIELDS.has(field)
}

// ============================================================
// Config lookup (shared by all three fields)
// ============================================================

interface ConfigRow {
  id: string
  account_id: string
  user_id: string
}

/**
 * Resolve the whatsapp_config row for a webhook payload's
 * phone_number_id. All coexistence payloads carry
 * value.metadata.phone_number_id.
 */
async function findConfigByPhoneNumberId(
  supabase: SupabaseClient,
  phoneNumberId: string,
): Promise<ConfigRow | null> {
  const { data, error } = await supabase
    .from('whatsapp_config')
    .select('id, account_id, user_id')
    .eq('phone_number_id', phoneNumberId)
    .maybeSingle()

  if (error) {
    console.error('[smb-webhook] config lookup failed:', error.message)
    return null
  }
  if (!data) {
    console.warn(
      '[smb-webhook] no whatsapp_config for phone_number_id:',
      phoneNumberId,
    )
  }
  return (data as ConfigRow) ?? null
}

// ============================================================
// smb_app_state_sync — WhatsApp contacts
// ============================================================

interface StateSyncEntry {
  type?: string
  action?: 'add' | 'remove'
  contact?: {
    full_name?: string
    first_name?: string
    phone_number?: string
  }
  metadata?: { timestamp?: string }
}

interface SmbAppStateSyncValue {
  metadata?: { phone_number_id?: string }
  state_sync?: StateSyncEntry[]
}

/**
 * Upsert/remove a WhatsApp contact of the business. Contacts synced
 * from the Business app are attributed to the config owner (same
 * convention as the inbound-message path) and created with
 * sender_type-equivalent defaults — they are regular contacts rows.
 */
async function handleSmbAppStateSync(
  value: SmbAppStateSyncValue,
  supabase: SupabaseClient,
): Promise<void> {
  const phoneNumberId = value.metadata?.phone_number_id
  if (!phoneNumberId) {
    console.warn('[smb-webhook] state_sync missing metadata.phone_number_id')
    return
  }
  const config = await findConfigByPhoneNumberId(supabase, phoneNumberId)
  if (!config) return

  const entries = value.state_sync ?? []
  for (const entry of entries) {
    if (entry.type !== 'contact' || !entry.contact?.phone_number) continue

    const phone = normalizePhone(entry.contact.phone_number)
    if (!phone) continue
    const name =
      entry.contact.full_name || entry.contact.first_name || phone

    if (entry.action === 'remove') {
      // Remove: only flips the name to the bare phone so the row is
      // recognisable as removed — wacrm never hard-deletes contacts
      // (they anchor conversation history). Best-effort.
      const existing = await findExistingContactRow(supabase, config.account_id, phone)
      if (!existing) continue
      const { error } = await supabase
        .from('contacts')
        .update({ name: phone, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
      if (error) {
        console.error('[smb-webhook] contact remove failed:', error.message)
      }
      continue
    }

    // add (also fires for edits)
    const existing = await findExistingContactRow(supabase, config.account_id, phone)
    if (existing) {
      // Only overwrite the local name when Meta sends a fuller one.
      if (name && name !== existing.name) {
        const { error } = await supabase
          .from('contacts')
          .update({ name, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
        if (error) {
          console.error('[smb-webhook] contact update failed:', error.message)
        }
      }
      continue
    }

    const { error } = await supabase.from('contacts').insert({
      account_id: config.account_id,
      user_id: config.user_id,
      phone,
      name,
    })
    if (error) {
      // Lost a race with a concurrent insert — safe to ignore.
      if ((error as { code?: string }).code !== '23505') {
        console.error('[smb-webhook] contact insert failed:', error.message)
      }
    }
  }
}

/**
 * Local contact lookup mirroring findExistingContact from
 * lib/contacts/dedupe (inlined so this module stays dependency-light
 * and unit-testable): last-8-digit SQL pre-filter + strict digits
 * comparison in JS.
 */
async function findExistingContactRow(
  supabase: SupabaseClient,
  accountId: string,
  phone: string,
): Promise<{ id: string; name?: string | null } | null> {
  const suffix = phone.length >= 8 ? phone.slice(-8) : phone
  const { data, error } = await supabase
    .from('contacts')
    .select('id, name, phone')
    .eq('account_id', accountId)
    .like('phone', `%${suffix}`)
  if (error || !data) return null
  const match = (data as Array<{ id: string; name?: string | null; phone: string }>).find(
    (c) => c.phone.replace(/\D/g, '') === phone,
  )
  return match ?? null
}

// ============================================================
// smb_message_echoes — messages sent FROM the Business app
// ============================================================

interface MessageEcho {
  from?: string
  to?: string
  id?: string
  timestamp?: string
  type?: string
  text?: { body?: string }
  image?: { id?: string; caption?: string }
  video?: { id?: string; caption?: string }
  document?: { id?: string; filename?: string; caption?: string }
  audio?: { id?: string }
  sticker?: { id?: string }
  location?: { latitude?: number; longitude?: number; name?: string; address?: string }
  /** type=revoke — the business deleted a sent message. */
  revoke?: { original_message_id?: string }
  /** type=edit — the business edited a sent message. */
  edit?: { original_message_id?: string; message?: EchoEditedMessage }
}

interface EchoEditedMessage {
  type?: string
  text?: { body?: string }
  image?: { caption?: string }
  document?: { caption?: string }
}

interface SmbMessageEchoesValue {
  metadata?: { phone_number_id?: string }
  message_echoes?: MessageEcho[]
}

/**
 * Persist a message the business sent from the WhatsApp Business app
 * as an agent-side message in the matching conversation. Keeps the
 * shared inbox in sync when teammates reply from their phones.
 *
 * Dedup: Meta guarantees echoed ids are unique, but history import may
 * have already stored the same message (same wamid) — the insert uses
 * a pre-lookup rather than a DB constraint (message_id is NOT unique
 * in this schema; see migration 009).
 */
async function handleSmbMessageEchoes(
  value: SmbMessageEchoesValue,
  supabase: SupabaseClient,
): Promise<void> {
  const phoneNumberId = value.metadata?.phone_number_id
  if (!phoneNumberId) {
    console.warn('[smb-webhook] message_echoes missing metadata.phone_number_id')
    return
  }
  const config = await findConfigByPhoneNumberId(supabase, phoneNumberId)
  if (!config) return

  const echoes = value.message_echoes ?? []
  for (const echo of echoes) {
    if (!echo.id || !echo.to) continue

    // revoke: mark the original message deleted-for-everyone.
    if (echo.type === 'revoke') {
      await applyEchoRevoke(supabase, config.account_id, echo.revoke?.original_message_id)
      continue
    }

    // edit: overwrite the stored text of the original message.
    if (echo.type === 'edit') {
      await applyEchoEdit(supabase, config.account_id, echo)
      continue
    }

    const phone = normalizePhone(echo.to)
    if (!phone) continue

    // Don't double-store a wamid that the history import (or an
    // earlier echo) already persisted.
    const { data: dupe } = await supabase
      .from('messages')
      .select('id')
      .eq('message_id', echo.id)
      .limit(1)
      .maybeSingle()
    if (dupe) continue

    const contact = await ensureEchoContact(supabase, config, phone)
    if (!contact) continue
    const conversation = await ensureEchoConversation(supabase, config, contact.id)
    if (!conversation) continue

    const { contentText, contentType } = parseEchoContent(echo)
    const createdAt = echo.timestamp
      ? new Date(parseInt(echo.timestamp, 10) * 1000).toISOString()
      : new Date().toISOString()

    const { error } = await supabase.from('messages').insert({
      conversation_id: conversation.id,
      // The business itself sent this from the Business app — agent
      // attribution, not customer. sender_id stays null: the echo
      // payload carries no acting user.
      sender_type: 'agent',
      content_type: contentType,
      content_text: contentText,
      message_id: echo.id,
      status: 'delivered',
      created_at: createdAt,
    })
    if (error) {
      console.error('[smb-webhook] echo insert failed:', error.message)
      continue
    }

    await supabase
      .from('conversations')
      .update({
        last_message_text: contentText || `[${echo.type}]`,
        last_message_at: createdAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversation.id)
  }
}

function parseEchoContent(echo: MessageEcho): {
  contentText: string | null
  contentType: string
} {
  switch (echo.type) {
    case 'text':
      return { contentText: echo.text?.body ?? null, contentType: 'text' }
    case 'image':
      return { contentText: echo.image?.caption ?? null, contentType: 'image' }
    case 'video':
      return { contentText: echo.video?.caption ?? null, contentType: 'video' }
    case 'document':
      return {
        contentText: echo.document?.caption ?? echo.document?.filename ?? null,
        contentType: 'document',
      }
    case 'audio':
      return { contentText: null, contentType: 'audio' }
    case 'sticker':
      return { contentText: null, contentType: 'image' }
    case 'location': {
      const loc = echo.location
      const text = loc
        ? [loc.name, loc.address, `${loc.latitude ?? ''},${loc.longitude ?? ''}`]
            .filter(Boolean)
            .join(' - ')
        : null
      return { contentText: text, contentType: 'location' }
    }
    default:
      return { contentText: `[Unsupported echo type: ${echo.type}]`, contentType: 'text' }
  }
}

async function applyEchoRevoke(
  supabase: SupabaseClient,
  accountId: string,
  originalMessageId: string | undefined,
): Promise<void> {
  if (!originalMessageId) return
  // Scope the update via conversation account to avoid touching rows
  // of other tenants that happen to share a wamid (message_id is not
  // globally unique — migration 009).
  const { data: msg } = await supabase
    .from('messages')
    .select('id, conversation_id, conversations(account_id)')
    .eq('message_id', originalMessageId)
    .limit(1)
    .maybeSingle()
  const conv = msg?.conversations as { account_id?: string } | null | undefined
  if (!msg || conv?.account_id !== accountId) return

  await supabase
    .from('messages')
    .update({ content_text: '[Message deleted]', content_type: 'text', media_url: null })
    .eq('id', msg.id)
}

async function applyEchoEdit(
  supabase: SupabaseClient,
  accountId: string,
  echo: MessageEcho,
): Promise<void> {
  const originalMessageId = echo.edit?.original_message_id
  if (!originalMessageId) return
  const { data: msg } = await supabase
    .from('messages')
    .select('id, conversation_id, conversations(account_id)')
    .eq('message_id', originalMessageId)
    .limit(1)
    .maybeSingle()
  const conv = msg?.conversations as { account_id?: string } | null | undefined
  if (!msg || conv?.account_id !== accountId) return

  const edited = echo.edit?.message
  let newText: string | null = null
  if (edited?.type === 'text') newText = edited.text?.body ?? null
  else if (edited?.type === 'image') newText = edited.image?.caption ?? null
  else if (edited?.type === 'document') newText = edited.document?.caption ?? null

  if (newText !== null) {
    await supabase
      .from('messages')
      .update({ content_text: newText })
      .eq('id', msg.id)
  }
}

async function ensureEchoContact(
  supabase: SupabaseClient,
  config: ConfigRow,
  phone: string,
): Promise<{ id: string } | null> {
  const existing = await findExistingContactRow(supabase, config.account_id, phone)
  if (existing) return existing
  const { data, error } = await supabase
    .from('contacts')
    .insert({
      account_id: config.account_id,
      user_id: config.user_id,
      phone,
      name: phone,
    })
    .select('id')
    .single()
  if (error) {
    // Lost a race — re-resolve instead of failing the echo.
    if ((error as { code?: string }).code === '23505') {
      const raced = await findExistingContactRow(supabase, config.account_id, phone)
      if (raced) return raced
    }
    console.error('[smb-webhook] echo contact create failed:', error.message)
    return null
  }
  return data
}

async function ensureEchoConversation(
  supabase: SupabaseClient,
  config: ConfigRow,
  contactId: string,
): Promise<{ id: string } | null> {
  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .eq('account_id', config.account_id)
    .eq('contact_id', contactId)
    .maybeSingle()
  if (existing) return existing

  const { data, error } = await supabase
    .from('conversations')
    .insert({
      account_id: config.account_id,
      user_id: config.user_id,
      contact_id: contactId,
    })
    .select('id')
    .single()
  if (error) {
    console.error('[smb-webhook] echo conversation create failed:', error.message)
    return null
  }
  return data
}

// ============================================================
// history — one-shot past-chat import
// ============================================================

interface HistoryMessage {
  from?: string
  /** Only present on SMB echo messages (sent by the business). */
  to?: string
  id?: string
  timestamp?: string
  type?: string
  text?: { body?: string }
  image?: { id?: string; caption?: string }
  video?: { id?: string; caption?: string }
  document?: { id?: string; filename?: string; caption?: string }
  audio?: { id?: string }
  sticker?: { id?: string }
  location?: { latitude?: number; longitude?: number; name?: string; address?: string }
  history_context?: { status?: string }
}

interface HistoryThread {
  /** WhatsApp user phone number this thread is with. */
  id?: string
  messages?: HistoryMessage[]
}

interface HistoryBlock {
  metadata?: { phase?: number; chunk_order?: number; progress?: number }
  threads?: HistoryThread[]
  errors?: Array<{ code?: number; message?: string; title?: string }>
}

interface HistoryValue {
  metadata?: { phone_number_id?: string }
  history?: HistoryBlock[]
}

/** Meta's code for "the business declined history sharing". */
export const HISTORY_DECLINED_ERROR_CODE = 2593109

/**
 * Import a chunk of past chat history. Messages keep their original
 * wamid + timestamps; direction (customer vs agent) is derived from
 * `from` vs the business's display number. Media older than 14 days
 * arrive as type "media_placeholder" with no asset id — stored as a
 * text placeholder.
 */
async function handleHistory(
  value: HistoryValue,
  supabase: SupabaseClient,
): Promise<void> {
  const phoneNumberId = value.metadata?.phone_number_id
  if (!phoneNumberId) {
    console.warn('[smb-webhook] history missing metadata.phone_number_id')
    return
  }
  const config = await findConfigByPhoneNumberId(supabase, phoneNumberId)
  if (!config) return

  const blocks = value.history ?? []
  for (const block of blocks) {
    // Declined sharing — record it so the UI can explain the gap.
    const declined = (block.errors ?? []).find(
      (e) => e.code === HISTORY_DECLINED_ERROR_CODE,
    )
    if (declined) {
      await supabase
        .from('whatsapp_config')
        .update({ smb_sync_error: declined.message ?? declined.title ?? null })
        .eq('id', config.id)
      continue
    }

    const progress = block.metadata?.progress
    if (typeof progress === 'number') {
      await supabase
        .from('whatsapp_config')
        .update({ smb_sync_progress: Math.round(progress) })
        .eq('id', config.id)
    }

    const threads = block.threads ?? []
    for (const thread of threads) {
      const peerRaw = thread.id
      if (!peerRaw) continue
      const peerPhone = normalizePhone(peerRaw)
      if (!peerPhone) continue

      const contact = await ensureEchoContact(supabase, config, peerPhone)
      if (!contact) continue
      const conversation = await ensureEchoConversation(supabase, config, contact.id)
      if (!conversation) continue

      for (const msg of thread.messages ?? []) {
        if (!msg.id) continue
        const { data: dupe } = await supabase
          .from('messages')
          .select('id')
          .eq('message_id', msg.id)
          .limit(1)
          .maybeSingle()
        if (dupe) continue

        // Direction: per Meta's history reference, `to` is only
        // present on SMB echo messages — i.e. messages the BUSINESS
        // sent from the Business app. Everything else came from the
        // WhatsApp user (the customer, whose number is thread.id).
        const isBusiness = Boolean(msg.to)
        const senderType = isBusiness ? 'agent' : 'customer'

        const { contentText, contentType } = parseHistoryContent(msg)
        const createdAt = msg.timestamp
          ? new Date(parseInt(msg.timestamp, 10) * 1000).toISOString()
          : new Date().toISOString()

        const { error } = await supabase.from('messages').insert({
          conversation_id: conversation.id,
          sender_type: senderType,
          content_type: contentType,
          content_text: contentText,
          message_id: msg.id,
          status: 'delivered',
          created_at: createdAt,
        })
        if (error) {
          console.error('[smb-webhook] history insert failed:', error.message)
          continue
        }

        // Keep conversation previews pointing at the newest message —
        // history chunks may arrive out of order (chunk_order), so
        // only move the pointer forward.
        await supabase
          .from('conversations')
          .update({
            last_message_text: contentText || `[${msg.type}]`,
            last_message_at: createdAt,
            updated_at: new Date().toISOString(),
          })
          .eq('id', conversation.id)
          // Postgres compares timestamptz lexicographically in ISO
          // (UTC) form, so this guards against an older chunk
          // regressing the preview after a newer chunk landed.
          .lt('last_message_at', createdAt)
      }
    }
  }
}

function parseHistoryContent(msg: HistoryMessage): {
  contentText: string | null
  contentType: string
} {
  switch (msg.type) {
    case 'text':
      return { contentText: msg.text?.body ?? null, contentType: 'text' }
    case 'image':
      return { contentText: msg.image?.caption ?? null, contentType: 'image' }
    case 'video':
      return { contentText: msg.video?.caption ?? null, contentType: 'video' }
    case 'document':
      return {
        contentText: msg.document?.caption ?? msg.document?.filename ?? null,
        contentType: 'document',
      }
    case 'audio':
      return { contentText: null, contentType: 'audio' }
    case 'sticker':
      return { contentText: null, contentType: 'image' }
    case 'location': {
      const loc = msg.location
      const text = loc
        ? [loc.name, loc.address, `${loc.latitude ?? ''},${loc.longitude ?? ''}`]
            .filter(Boolean)
            .join(' - ')
        : null
      return { contentText: text, contentType: 'location' }
    }
    case 'media_placeholder':
      // Media older than 14 days loses its asset — render a marker.
      return { contentText: '[Media message]', contentType: 'text' }
    default:
      return { contentText: `[Unsupported history type: ${msg.type}]`, contentType: 'text' }
  }
}

// ============================================================
// account_update — coexistence disconnection (PARTNER_REMOVED)
// ============================================================

interface AccountUpdateValue {
  event?: string
  phone_number?: string
  disconnection_info?: { reason?: string; initiated_by?: string }
}

/**
 * Handle PARTNER_REMOVED / ACCOUNT_OFFBOARDED — the business
 * disconnected the number from Cloud API via the Business app
 * (Settings → Account → Business Platform) or re-registered elsewhere.
 * Flip the matching coexistence config row to disconnected so the UI
 * stops sending. Coexistence numbers cannot be deregistered via the
 * API — disconnection always comes through this webhook.
 *
 * Matched on the ENTRY-level WABA id (`wabaId`) — account_update
 * payloads carry only the display phone number in `value`, but the
 * enclosing entry id is the WABA the change happened on.
 */
export async function handleCoexistenceAccountUpdate(
  value: AccountUpdateValue,
  supabase: SupabaseClient,
  wabaId?: string,
): Promise<void> {
  const event = value.event
  if (event !== 'PARTNER_REMOVED' && event !== 'ACCOUNT_OFFBOARDED') return

  let query = supabase
    .from('whatsapp_config')
    .select('id')
    .eq('is_on_biz_app', true)
  if (wabaId) {
    query = query.eq('waba_id', wabaId)
  }

  const { data: configs, error } = await query
  if (error) {
    console.error('[smb-webhook] account_update config lookup failed:', error.message)
    return
  }
  if (!configs || configs.length === 0) {
    console.warn(
      '[smb-webhook]',
      event,
      'received but no coexistence config matched; leaving rows untouched.',
    )
    return
  }

  for (const cfg of configs) {
    await supabase
      .from('whatsapp_config')
      .update({
        status: 'disconnected',
        smb_sync_error: `Disconnected from Cloud API (${value.disconnection_info?.reason ?? event})`,
      })
      .eq('id', cfg.id)
  }
}

// ============================================================
// Entry point
// ============================================================

export interface CoexistenceWebhookChange {
  field: string
  value: unknown
}

/**
 * Dispatch a single change record to the matching coexistence handler.
 * Returns silently on unrecognised fields — the caller pre-filters via
 * isCoexistenceWebhookField, but stay defensive like template-webhook.
 */
export async function handleCoexistenceWebhookChange(
  change: CoexistenceWebhookChange,
  supabase: SupabaseClient,
): Promise<void> {
  switch (change.field) {
    case 'smb_app_state_sync':
      await handleSmbAppStateSync(
        change.value as SmbAppStateSyncValue,
        supabase,
      )
      return
    case 'smb_message_echoes':
      await handleSmbMessageEchoes(
        change.value as SmbMessageEchoesValue,
        supabase,
      )
      return
    case 'history':
      await handleHistory(change.value as HistoryValue, supabase)
      return
  }
}
