import { syncMessage, syncNewContact } from '@/lib/google-sheets/sync'
import { NextResponse, after } from 'next/server'
import { recordWebhookRejection, webhookBlocked } from '@/lib/rate-limit'
import { createClient } from '@supabase/supabase-js'
import { decrypt, encrypt, isLegacyFormat } from '@/lib/whatsapp/encryption'
import { getMediaUrl } from '@/lib/whatsapp/meta-api'
import { normalizePhone } from '@/lib/whatsapp/phone-utils'
import { findExistingContact, isUniqueViolation } from '@/lib/contacts/dedupe'
import { verifyMetaWebhookSignature } from '@/lib/whatsapp/webhook-signature'
import { runAutomationsForTrigger } from '@/lib/automations/engine'
import { dispatchInboundToFlows } from '@/lib/flows/engine'
import { maybeReplyWithAI } from '@/lib/ai-chatbot/respond'
import { recordAdAttribution } from '@/lib/ad-attribution-server'
import { maybeSendAutoReply } from '@/lib/business-hours/auto-reply'
import { notifyInboundMessage } from '@/lib/push/expo'
import { fireTeamAlert } from '@/lib/alerts/server'
import {
  detectOptKeyword,
  OPT_IN_CONFIRMATION,
  OPT_OUT_CONFIRMATION,
  setContactOptOut,
} from '@/lib/contacts/opt-out'
import { engineSendText } from '@/lib/flows/meta-send'
import { dispatchWebhookEvent } from '@/lib/webhooks/deliver'
import { recordWebhookFailure } from '@/lib/ops/monitoring'
import { handleCallsWebhook, type CallWebhookValue } from '@/lib/whatsapp/calling'
import { handleFormReply } from '@/lib/whatsapp/forms'
import { handleCsatReply } from '@/lib/csat/server'
import {
  createOrderFromCatalog,
  handlePaymentStatus,
  type CatalogOrderMessage,
  type PaymentStatusEvent,
} from '@/lib/whatsapp/commerce'
import {
  handleTemplateWebhookChange,
  isTemplateWebhookField,
} from '@/lib/whatsapp/template-webhook'
import {
  handleCoexistenceAccountUpdate,
  handleCoexistenceWebhookChange,
  isCoexistenceWebhookField,
} from '@/lib/whatsapp/smb-webhook'

// The `after()` callback in POST runs within this route's max duration.
// Inbound processing can fan out to per-media Meta verification calls, so
// give it headroom beyond the platform default (Vercel clamps this to the
// plan's ceiling). Tune as needed.
export const maxDuration = 60

// Lazy-initialized to avoid build-time crash when env vars are missing
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _adminClient: any = null
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _adminClient
}

interface WhatsAppMessage {
  id: string
  /**
   * Sender's phone number. Omitted when the user has a WhatsApp
   * username and Meta can't share their number — `from_user_id` (the
   * business-scoped user ID, BSUID) is always present instead.
   */
  from?: string
  from_user_id?: string
  timestamp: string
  type: string
  /** A cart the customer sent from the business's WhatsApp catalog. */
  order?: CatalogOrderMessage
  text?: { body: string }
  image?: { id: string; mime_type: string; caption?: string }
  video?: { id: string; mime_type: string; caption?: string }
  document?: { id: string; mime_type: string; filename?: string; caption?: string }
  audio?: { id: string; mime_type: string }
  sticker?: { id: string; mime_type: string }
  location?: { latitude: number; longitude: number; name?: string; address?: string }
  reaction?: { message_id: string; emoji: string }
  /**
   * Set when the customer taps a quick-reply button on a TEMPLATE
   * message (e.g. "Stop promotions", "Yes, confirm"). `payload` is the
   * button's payload, or its text when none was set at send time.
   */
  button?: { payload?: string; text?: string }
  /**
   * Set when the customer taps a button or list row on an interactive
   * message we sent. `button_reply.id` / `list_reply.id` is whatever id
   * we put on the button/row when sending — the Flows engine uses this
   * to advance the per-contact run.
   */
  interactive?: {
    type: 'button_reply' | 'list_reply' | 'call_permission_reply' | 'nfm_reply'
    /** Customer submitted a WhatsApp form (Flow). */
    nfm_reply?: { name?: string; body?: string; response_json?: string }
    button_reply?: { id: string; title: string }
    list_reply?: { id: string; title: string; description?: string }
    /** Customer answered a call permission request (Calling API). */
    call_permission_reply?: {
      response?: 'accept' | 'reject'
      is_permanent?: boolean
      expiration_timestamp?: string | number
    }
  }
  /** Present when the customer swipe-replies to one of our messages. */
  context?: { id: string }
  /** Click-to-WhatsApp ad / post referral (first message of an ad chat). Untrusted; parsed in ad-attribution.ts. */
  referral?: unknown
}

interface WhatsAppWebhookEntry {
  id: string
  changes: Array<{
    value: {
      messaging_product: string
      metadata: {
        display_phone_number: string
        phone_number_id: string
      }
      contacts?: Array<WebhookContact>
      messages?: WhatsAppMessage[]
      statuses?: Array<{
        id: string
        status: string
        timestamp: string
        recipient_id?: string
      }>
    }
    field: string
  }>
}

/** Sender profile. `wa_id` is omitted when the phone number is hidden
 *  behind a username; `user_id` (BSUID) is always present. */
interface WebhookContact {
  profile?: { name?: string; username?: string }
  wa_id?: string
  user_id?: string
}

// Coexistence fields (history / smb_app_state_sync / smb_message_echoes)
// and account_update arrive on the same WABA webhook object but with
// value shapes the messaging branches must not touch.
interface LooseWebhookEntry {
  id?: string
  changes?: Array<{
    value?: unknown
    field: string
  }>
}

// GET - Webhook verification
export async function GET(request: Request) {
  // Public and costly (decrypts every account's verify token), so a
  // caller that keeps failing verification gets blocked for a while.
  const blocked = webhookBlocked(request, 'whatsapp-verify')
  if (blocked) return blocked

  try {
    const { searchParams } = new URL(request.url)
    const mode = searchParams.get('hub.mode')
    const challenge = searchParams.get('hub.challenge')
    const verifyToken = searchParams.get('hub.verify_token')

    // Meta's challenge is a number; echoing anything else back would
    // let this endpoint reflect arbitrary text.
    if (mode !== 'subscribe' || !challenge || !/^\d{1,64}$/.test(challenge) || !verifyToken) {
      recordWebhookRejection(request, 'whatsapp-verify')
      return NextResponse.json(
        { error: 'Missing verification parameters' },
        { status: 400 }
      )
    }

    // Fetch all whatsapp configs to check verify tokens
    const { data: configs, error: configError } = await supabaseAdmin()
      .from('whatsapp_config')
      .select('id, verify_token')

    if (configError || !configs) {
      console.error('Error fetching configs for verification:', configError)
      return NextResponse.json(
        { error: 'Verification failed' },
        { status: 403 }
      )
    }

    // Check if any config's verify_token matches. Also collect the
    // matching row so we can opportunistically upgrade its token to
    // GCM if it was still in the legacy CBC format.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let matchedConfig: any = null
    for (const config of configs) {
      if (!config.verify_token) continue
      try {
        if (decrypt(config.verify_token) === verifyToken) {
          matchedConfig = config
          break
        }
      } catch {
        // Malformed / wrong-key token row — skip it and keep checking.
      }
    }

    if (matchedConfig) {
      // Fire-and-forget GCM upgrade. Safe to run on every subscribe
      // since it's a no-op once the column is already GCM.
      if (isLegacyFormat(matchedConfig.verify_token)) {
        void supabaseAdmin()
          .from('whatsapp_config')
          .update({ verify_token: encrypt(verifyToken) })
          .eq('id', matchedConfig.id)
          .then(({ error }: { error: unknown }) => {
            if (error) {
              console.warn(
                '[webhook] verify_token GCM upgrade failed:',
                (error as { message?: string })?.message ?? error,
              )
            }
          })
      }
      // Return challenge as plain text
      return new Response(challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      })
    }

    recordWebhookRejection(request, 'whatsapp-verify')
    return NextResponse.json(
      { error: 'Verification token mismatch' },
      { status: 403 }
    )
  } catch (error) {
    console.error('Error in webhook GET verification:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Receive messages
export async function POST(request: Request) {
  // An IP that keeps sending bad signatures is blocked for a while;
  // genuine Meta deliveries are never limited.
  const blocked = webhookBlocked(request, 'whatsapp')
  if (blocked) return blocked

  // Read raw body first so we can HMAC-verify the exact bytes Meta
  // signed. request.json() would re-encode and break the signature.
  const rawBody = await request.text()
  const signature = request.headers.get('x-hub-signature-256')

  if (!verifyMetaWebhookSignature(rawBody, signature)) {
    // 401 (not 200) — we want Meta's delivery dashboard to show failures
    // loudly if a misconfiguration causes signatures to stop matching,
    // rather than silently eating events.
    console.warn('[webhook] rejected request with invalid signature')
    recordWebhookRejection(request, 'whatsapp')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let body: { entry?: WhatsAppWebhookEntry[] }
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Process AFTER the response so we ack Meta within their ~20s timeout
  // (a slow ack triggers Meta retries + duplicate inserts), while still
  // guaranteeing the work runs to completion.
  //
  // This MUST use `after()` rather than a detached `processWebhook(body)`
  // promise: on serverless platforms (we run on Vercel) the function can
  // be frozen or terminated the moment the response is sent, so a floating
  // promise's DB writes are not guaranteed to finish. That dropped a
  // non-deterministic *subset* of inbound messages — contacts/conversations
  // were created but the message insert never landed, leaving conversations
  // that show in the inbox with an empty thread, and no logs to explain it
  // (see issue #301). `after()` hands the callback to the runtime, which
  // keeps the function alive until it resolves (within the route's
  // maxDuration).
  after(async () => {
    try {
      await processWebhook(body)
    } catch (error) {
      console.error('Error processing webhook:', error)
      await recordWebhookFailure('whatsapp', error, {
        context: { entries: Array.isArray(body?.entry) ? body.entry.length : 0 },
      })
    }
  })

  return NextResponse.json({ status: 'received' }, { status: 200 })
}

async function processWebhook(body: { entry?: WhatsAppWebhookEntry[] }) {
  if (!body.entry) return

  for (const entry of body.entry) {
    for (const change of entry.changes) {
      // Template-lifecycle events (status / quality / components
      // updates from Meta) come in on a different change.field and
      // have a different value shape — route them through the
      // dedicated handler. Skip the messaging branches below so we
      // don't try to read message-shaped fields off a template event.
      // WhatsApp voice calls (Calling API): incoming calls, SDP answers
      // for agent-started calls, call statuses and hang-ups.
      if (change.field === 'calls') {
        await handleCallsWebhook(supabaseAdmin(), change.value as unknown as CallWebhookValue)
        continue
      }

      if (isTemplateWebhookField(change.field)) {
        await handleTemplateWebhookChange(
          { field: change.field, value: change.value as unknown },
          supabaseAdmin(),
        )
        continue
      }

      // Coexistence events (WhatsApp Business app + Cloud API on one
      // number): contact sync, message echoes, history import, and
      // the PARTNER_REMOVED/ACCOUNT_OFFBOARDED disconnects that come
      // in on account_update. Same reasoning as templates — distinct
      // value shapes, dedicated handlers.
      if (isCoexistenceWebhookField(change.field)) {
        await handleCoexistenceWebhookChange(
          { field: change.field, value: change.value as unknown },
          supabaseAdmin(),
        )
        continue
      }
      if (change.field === 'account_update') {
        await handleCoexistenceAccountUpdate(
          (change.value ?? {}) as { event?: string; phone_number?: string },
          supabaseAdmin(),
          (entry as LooseWebhookEntry).id,
        )
        continue
      }

      const value = change.value

      // Handle status updates
      if (value.statuses) {
        for (const status of value.statuses) {
          // WhatsApp Pay payment updates ride on statuses with type=payment.
          if ((status as { type?: string }).type === 'payment') {
            await handlePaymentStatus(
              supabaseAdmin(),
              value.metadata.phone_number_id,
              status as unknown as PaymentStatusEvent,
            ).catch((err) => console.error('[webhook] payment status failed:', err))
            continue
          }
          await handleStatusUpdate(status)
        }
      }

      // Handle incoming messages
      if (!value.messages || !value.contacts) continue

      const phoneNumberId = value.metadata.phone_number_id

      // Find user's config by phone_number_id. `.single()` returns
      // PGRST116 for both 0 rows AND ≥2 rows — distinguish them so
      // operators see the real cause in logs. ≥2 rows shouldn't happen
      // post-migration 013 (UNIQUE constraint), but a row created
      // before the constraint, or a race, would still surface here.
      const { data: configRows, error: configError } = await supabaseAdmin()
        .from('whatsapp_config')
        .select('*')
        .eq('phone_number_id', phoneNumberId)

      if (configError) {
        console.error(
          'Error fetching whatsapp_config for phone_number_id:',
          phoneNumberId,
          configError
        )
        continue
      }

      if (!configRows || configRows.length === 0) {
        console.error('No config found for phone_number_id:', phoneNumberId)
        continue
      }

      if (configRows.length > 1) {
        console.error(
          `Multiple configs (${configRows.length}) found for phone_number_id:`,
          phoneNumberId,
          '— inbound message dropped. Resolve duplicates so each number maps to a single account.',
          'Account owners:',
          configRows.map((r: { account_id: string; user_id: string }) => `${r.account_id} (admin ${r.user_id})`)
        )
        continue
      }

      const config = configRows[0]

      const decryptedAccessToken = decrypt(config.access_token)

      for (let i = 0; i < value.messages.length; i++) {
        const message = value.messages[i]
        const contact =
          value.contacts.find(
            (c) =>
              (message.from_user_id && c.user_id === message.from_user_id) ||
              (message.from && c.wa_id === message.from)
          ) ||
          value.contacts[i] ||
          value.contacts[0]

        await processMessage(
          message,
          contact,
          // Tenancy — drives every contact / conversation lookup
          // and the engines' active-row dispatch.
          config.account_id,
          // Audit / sender-of-record — used as the user_id on row
          // inserts that need it for NOT NULL FK compliance. Always
          // the admin who saved the WhatsApp config.
          config.user_id,
          decryptedAccessToken
        )
      }
    }
  }
}

// The happy-path status ladder — pending → sent → delivered → read →
// replied. Webhook replays must never regress a recipient back down
// this ladder.
//
// `failed` is NOT on this ladder. It's a terminal side branch that is
// only valid from the early states (pending / sent) — once Meta has
// delivered or the user has read or replied, a later "failed" status
// event is a bug in Meta's pipeline or a spoof attempt and must be
// ignored.
const RECIPIENT_STATUS_LADDER = [
  'pending',
  'sent',
  'delivered',
  'read',
  'replied',
] as const

function ladderLevel(s: string): number {
  const idx = (RECIPIENT_STATUS_LADDER as readonly string[]).indexOf(s)
  return idx < 0 ? -1 : idx
}

/**
 * Can a recipient transition from `current` to `incoming`?
 *   - Along the ladder, only forward moves are allowed.
 *   - `failed` is accepted only from `pending` or `sent`; it's refused
 *     once the recipient has reached any of the success states.
 */
function isValidStatusTransition(current: string, incoming: string): boolean {
  if (incoming === 'failed') {
    return current === 'pending' || current === 'sent'
  }
  if (current === 'failed') {
    return false // failed is terminal
  }
  const ci = ladderLevel(current)
  const ii = ladderLevel(incoming)
  if (ii < 0) return false // unknown incoming status
  if (ci < 0) return true // unknown current — accept anything on the ladder
  return ii > ci
}

async function handleStatusUpdate(status: {
  id: string
  status: string
  timestamp: string
  recipient_id?: string
}) {
  // 1) Mirror onto messages (legacy behavior) — Meta's status values
  //    already match the CHECK constraint on messages.status. No
  //    `.select()`: message_id is NOT unique (migration 009 — Meta ids
  //    repeat across numbers), so this updates 0..N rows and must not
  //    assume a single row.
  const { error: msgErr } = await supabaseAdmin()
    .from('messages')
    .update({ status: status.status })
    .eq('message_id', status.id)

  if (msgErr) {
    console.error('Error updating message status:', msgErr)
  }

  // Webhook fan-out for this status change happens at the END of this
  // handler (after the broadcast mirror below), so a slow subscriber
  // endpoint can't delay the broadcast_recipients update.

  // 2) Mirror onto broadcast_recipients via whatsapp_message_id
  //    (added in migration 003). The aggregate trigger on
  //    broadcast_recipients re-derives the parent broadcast's
  //    sent/delivered/read/failed counts automatically.
  const tsIso = new Date(parseInt(status.timestamp) * 1000).toISOString()

  const { data: recipient, error: recFetchErr } = await supabaseAdmin()
    .from('broadcast_recipients')
    .select('id, status')
    .eq('whatsapp_message_id', status.id)
    .maybeSingle()

  if (recFetchErr) {
    console.error('Error fetching broadcast recipient:', recFetchErr)
  } else if (
    recipient &&
    // Guard transitions — forward-only on the success ladder, and
    // `failed` only from pre-delivered states.
    isValidStatusTransition(recipient.status, status.status)
  ) {
    const update: Record<string, unknown> = { status: status.status }
    if (status.status === 'sent' && !('sent_at' in update)) update.sent_at = tsIso
    if (status.status === 'delivered') update.delivered_at = tsIso
    if (status.status === 'read') update.read_at = tsIso

    const { error: recUpdateErr } = await supabaseAdmin()
      .from('broadcast_recipients')
      .update(update)
      .eq('id', recipient.id)

    if (recUpdateErr) {
      console.error('Error updating broadcast recipient status:', recUpdateErr)
    }
  }

  // 3) Webhook fan-out for messages we store (inbox / API sends).
  //    Runs last so a slow subscriber can't delay the mirrors above.
  //    Bounded to one row (message_id isn't unique) purely to resolve
  //    the owning account for delivery.
  const { data: msgRow } = await supabaseAdmin()
    .from('messages')
    .select('conversation_id, conversations(account_id)')
    .eq('message_id', status.id)
    .limit(1)
    .maybeSingle()

  if (msgRow) {
    const conv = msgRow.conversations as { account_id: string } | null
    const accountId = conv?.account_id
    if (accountId) {
      await dispatchWebhookEvent(
        supabaseAdmin(),
        accountId,
        'message.status_updated',
        {
          whatsapp_message_id: status.id,
          conversation_id: msgRow.conversation_id,
          status: status.status,
        }
      )
    }
  }
}

/**
 * If an inbound message's sender is on a still-unreplied
 * broadcast_recipients row, flip it to `replied` so the reply count
 * advances on the parent broadcast.
 *
 * Runs on a best-effort basis — failures here must not break the
 * main inbound-message flow, so errors are swallowed with a log.
 */
async function flagBroadcastReplyIfAny(accountId: string, contactId: string) {
  try {
    // Most recent outbound broadcast in this account that hasn't
    // been replied to yet. Account-scoped so a shared inbox reply
    // marks the broadcast as replied regardless of which teammate
    // sent it.
    const { data: recs, error } = await supabaseAdmin()
      .from('broadcast_recipients')
      .select('id, status, broadcast_id, broadcasts!inner(account_id)')
      .eq('contact_id', contactId)
      .eq('broadcasts.account_id', accountId)
      .in('status', ['sent', 'delivered', 'read'])
      .order('created_at', { ascending: false })
      .limit(1)

    if (error || !recs || recs.length === 0) return

    const row = recs[0]
    const { error: updErr } = await supabaseAdmin()
      .from('broadcast_recipients')
      .update({ status: 'replied', replied_at: new Date().toISOString() })
      .eq('id', row.id)

    if (updErr) {
      console.error('Error marking broadcast recipient replied:', updErr)
    }
  } catch (err) {
    console.error('flagBroadcastReplyIfAny failed:', err)
  }
}

/**
 * Resolve a Meta-side message_id into the matching internal UUID, scoped
 * to one conversation. Returns null when we never received the parent
 * (e.g. a swipe-reply to a message older than this CRM install).
 */
async function lookupInternalIdByMetaId(
  metaId: string,
  conversationId: string
): Promise<string | null> {
  const { data, error } = await supabaseAdmin()
    .from('messages')
    .select('id')
    .eq('message_id', metaId)
    .eq('conversation_id', conversationId)
    .maybeSingle()
  if (error) {
    console.error('[webhook] lookupInternalIdByMetaId failed:', error.message)
    return null
  }
  return data?.id ?? null
}

/**
 * Persist an inbound reaction. WhatsApp reactions are not new messages —
 * they're per-(target, actor) state. We upsert / delete on
 * `message_reactions`, never write a row into `messages`.
 *
 * Best-effort: a missing parent (we never received it) is logged and
 * skipped so the webhook still acks 200 to Meta.
 */
async function handleReaction(
  message: WhatsAppMessage,
  conversationId: string,
  contactId: string
) {
  const reaction = message.reaction
  if (!reaction?.message_id) return

  const targetInternalId = await lookupInternalIdByMetaId(
    reaction.message_id,
    conversationId
  )
  if (!targetInternalId) {
    console.warn(
      '[webhook] reaction target message not found; skipping',
      reaction.message_id
    )
    return
  }

  // Empty emoji = removal (per Meta's Cloud API spec).
  if (!reaction.emoji) {
    const { error: delError } = await supabaseAdmin()
      .from('message_reactions')
      .delete()
      .eq('message_id', targetInternalId)
      .eq('actor_type', 'customer')
      .eq('actor_id', contactId)
    if (delError) {
      console.error('[webhook] reaction delete failed:', delError.message)
    }
    return
  }

  const { error: upsertError } = await supabaseAdmin()
    .from('message_reactions')
    .upsert(
      {
        message_id: targetInternalId,
        conversation_id: conversationId,
        actor_type: 'customer',
        actor_id: contactId,
        emoji: reaction.emoji,
      },
      { onConflict: 'message_id,actor_type,actor_id' }
    )
  if (upsertError) {
    console.error('[webhook] reaction upsert failed:', upsertError.message)
  }
}

async function processMessage(
  message: WhatsAppMessage,
  contact: WebhookContact,
  // Tenancy. Resolved from the matched whatsapp_config row; every
  // contact / conversation / message row created downstream is
  // stamped with this so any member of the account can see it.
  accountId: string,
  // Sender-of-record for inserts that need a NOT NULL user_id FK
  // (contacts, conversations). Always the admin who saved the
  // WhatsApp config; the choice is arbitrary post-017 but stable.
  configOwnerUserId: string,
  accessToken: string
) {
  // A username user may hide their number: then only the BSUID
  // arrives and the phone is empty. Meta sends the BSUID either way.
  const senderPhone = normalizePhone(message.from ?? contact.wa_id ?? '')
  const senderUserId = message.from_user_id ?? contact.user_id ?? null
  if (!senderPhone && !senderUserId) {
    console.error('[webhook] inbound message has no phone or BSUID; skipping', message.id)
    return
  }

  // Find or create contact
  const contactOutcome = await findOrCreateContact(accountId, configOwnerUserId, {
    phone: senderPhone,
    whatsappUserId: senderUserId,
    username: contact.profile?.username ?? null,
    name: contact.profile?.name ?? '',
  })
  if (!contactOutcome) return
  const contactRecord = contactOutcome.contact

  // Click-to-WhatsApp: remember which ad/post this customer came from
  // (first touch only) and tag them. Never blocks the message.
  if (message.referral) {
    await recordAdAttribution(supabaseAdmin(), {
      accountId,
      ownerUserId: configOwnerUserId,
      contactId: contactRecord.id,
      alreadyAttributed: !!contactRecord.ad_first_seen_at,
      rawReferral: message.referral,
    })
  }

  // Find or create conversation
  const convResult = await findOrCreateConversation(
    accountId,
    configOwnerUserId,
    contactRecord.id
  )
  if (!convResult) return
  const conversation = convResult.conversation

  // Emit conversation.created as soon as the thread is opened — BEFORE
  // the reaction short-circuit below — so a conversation first opened by
  // a reaction still fires the event, and a subscriber always sees the
  // thread open before its first message.received.
  if (convResult.created) {
    await dispatchWebhookEvent(supabaseAdmin(), accountId, 'conversation.created', {
      conversation_id: conversation.id,
      contact_id: contactRecord.id,
    })
    // Team alert (Slack / Discord / Telegram). Never throws.
    await fireTeamAlert(accountId, 'new_conversation', {
      contactName: contactRecord.name,
      phone: contactRecord.phone,
    })
  }

  // Reactions short-circuit here — they aren't messages. We never insert
  // into `messages`, never bump unread_count, never update last_message_text.
  // Done before parseMessageContent so the media-URL fetch is skipped.
  if (message.type === 'reaction') {
    await handleReaction(message, conversation.id, contactRecord.id)
    return
  }

  // Parse message content based on type
  const { contentText, mediaUrl, mediaType, interactiveReplyId } =
    await parseMessageContent(message, accessToken)

  // Resolve swipe-reply context if present. A missing parent is fine —
  // we just store NULL and the UI renders the message without a quote.
  let replyToInternalId: string | null = null
  if (message.context?.id) {
    replyToInternalId = await lookupInternalIdByMetaId(
      message.context.id,
      conversation.id
    )
    if (!replyToInternalId) {
      console.warn(
        '[webhook] reply context parent not found:',
        message.context.id
      )
    }
  }

  // Insert message — field names MUST match the messages table schema
  // (see supabase/migrations/001_initial_schema.sql):
  //   conversation_id, sender_type, content_type, content_text,
  //   media_url, template_name, message_id, status, created_at
  // `mediaType` is intentionally unused — the schema has no media_type
  // column; the MIME type is only used to construct the proxy URL during
  // parseMessageContent. Silence the unused-var warning:
  void mediaType

  // The messages.content_type CHECK constraint (widened in migration 010
  // to add 'interactive' for button/list taps) allows:
  //   text, image, document, audio, video, location, template, interactive
  // Map incoming WhatsApp types that aren't in that list to the closest
  // allowed value so the INSERT doesn't fail with a constraint error.
  const ALLOWED_CONTENT_TYPES = new Set([
    'text', 'image', 'document', 'audio', 'video',
    'location', 'template', 'interactive',
  ])
  const contentType = ALLOWED_CONTENT_TYPES.has(message.type)
    ? message.type
    : message.type === 'sticker'
      ? 'image'   // stickers are images
      : message.type === 'button'
        ? 'interactive' // template quick-reply tap
        : 'text'    // reaction, unknown → text fallback

  // A template quick-reply tap is handled like typed text below:
  // there's no Flows step waiting on its payload, and taps such as
  // "Stop promotions" must reach the opt-out check.
  const isTemplateButtonTap = message.type === 'button'
  const isTypedText =
    (message.type === 'text' && !interactiveReplyId) || isTemplateButtonTap

  // Determine whether this is the contact's very first inbound message
  // BEFORE we insert, so the count is accurate. Covers the case where
  // the contact row already exists (manual add / CSV import) but they've
  // never messaged us before — which new_contact_created wouldn't catch.
  const { count: priorCustomerMsgCount } = await supabaseAdmin()
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversation.id)
    .eq('sender_type', 'customer')
  const isFirstInboundMessage = (priorCustomerMsgCount ?? 0) === 0

  const { error: msgError } = await supabaseAdmin().from('messages').insert({
    conversation_id: conversation.id,
    sender_type: 'customer',
    content_type: contentType,
    content_text: contentText,
    media_url: mediaUrl,
    message_id: message.id,
    status: 'delivered',
    created_at: new Date(parseInt(message.timestamp) * 1000).toISOString(),
    reply_to_message_id: replyToInternalId,
    // Only populated for content_type='interactive'. Migration 010 added
    // the column; null for every other content_type so existing inserts
    // behave identically.
    interactive_reply_id: interactiveReplyId,
  })

  if (msgError) {
    console.error('Error inserting message:', msgError)
    if (!isUniqueViolation(msgError)) {
      await recordWebhookFailure('whatsapp', new Error(`Inbound message not saved: ${msgError.message}`), {
        accountId: (conversation as { account_id?: string }).account_id ?? null,
        context: { wamid: message.id, conversation_id: conversation.id },
      })
    }
    return
  }

  // Update conversation
  const { error: convError } = await supabaseAdmin()
    .from('conversations')
    .update({
      last_message_text: contentText || `[${message.type}]`,
      last_message_at: new Date().toISOString(),
      unread_count: (conversation.unread_count || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversation.id)

  if (convError) {
    console.error('Error updating conversation:', convError)
  }

  // Cart sent from the catalog: create a pending order.
  if (message.type === 'order' && message.order) {
    try {
      const summary = await createOrderFromCatalog(supabaseAdmin(), {
        accountId,
        contactId: contactRecord.id,
        conversationId: conversation.id,
        messageId: message.id,
        order: message.order,
      })
      if (summary) {
        await supabaseAdmin().from('messages').update({ content_text: summary }).eq('message_id', message.id)
        await supabaseAdmin()
          .from('conversations')
          .update({ last_message_text: summary.split('\n')[0] })
          .eq('id', conversation.id)
      }
    } catch (err) {
      console.error('[webhook] catalog order handling failed:', err)
    }
  }

  // WhatsApp form submitted: save the answers, copy mapped ones onto
  // the contact, and replace the bubble text with the labelled answers.
  if (message.type === 'interactive' && message.interactive?.type === 'nfm_reply') {
    try {
      const summary = await handleFormReply(supabaseAdmin(), {
        accountId,
        contactId: contactRecord.id,
        conversationId: conversation.id,
        messageId: message.id,
        responseJson: message.interactive.nfm_reply?.response_json,
      })
      if (summary) {
        await supabaseAdmin().from('messages').update({ content_text: summary }).eq('message_id', message.id)
        await supabaseAdmin()
          .from('conversations')
          .update({ last_message_text: summary.split('\n')[0] })
          .eq('id', conversation.id)
      }
    } catch (err) {
      console.error('[webhook] form reply handling failed:', err)
    }
  }

  // If this contact was a recent broadcast recipient, flag the reply
  // so the broadcast's `replied_count` advances (via the aggregate
  // trigger installed in migration 003).
  await flagBroadcastReplyIfAny(accountId, contactRecord.id)

  // ============================================================
  // Opt-out (STOP) / opt-in (START). WhatsApp policy requires
  // honouring opt-outs; the contact is then skipped by broadcasts.
  // A handled keyword is answered with a confirmation and treated as
  // consumed, so flows, keyword automations and the AI chatbot don't
  // also reply to it.
  // ============================================================
  const optKeyword = isTypedText
    ? detectOptKeyword(contentText ?? message.text?.body)
    : null
  let optHandled = false
  if (optKeyword) {
    optHandled = await setContactOptOut(supabaseAdmin(), contactRecord.id, optKeyword === 'opt_out')
    if (optHandled) {
      await engineSendText({
        accountId,
        userId: configOwnerUserId,
        conversationId: conversation.id,
        contactId: contactRecord.id,
        text: optKeyword === 'opt_out' ? OPT_OUT_CONFIRMATION : OPT_IN_CONFIRMATION,
      }).catch((err) => console.error('[opt-out] confirmation failed:', err))
    }
  }

  // A tap on the CSAT rating buttons is the customer's answer to our
  // "how did we do?" message: store it and stop flows/automations/the
  // chatbot from also reacting to it. Failure-safe (never throws).
  if (interactiveReplyId && !optHandled) {
    optHandled = await handleCsatReply({
      accountId,
      conversationId: conversation.id,
      contactId: contactRecord.id,
      userId: configOwnerUserId,
      replyId: interactiveReplyId,
    })
  }

  // ============================================================
  // Flow runner dispatch.
  //
  // If the runner consumes the message (it either advanced an active
  // run or started a new one), we suppress the `new_message_received`
  // + `keyword_match` automation triggers for this inbound. Customer
  // is navigating the bot menu, not sending a fresh trigger word
  // that should fork into automations.
  //
  // The relationship-level triggers (`new_contact_created`,
  // `first_inbound_message`) still fire even when consumed — those
  // are about WHO is messaging, not what they said.
  //
  // Awaited (not fire-and-forget) because we need the `consumed`
  // result before deciding whether to dispatch automations. The
  // runner has its own try/catch and never throws. Accounts with
  // no active flows take the runner's early-exit "no_match" path
  // basically for free (one indexed SELECT for the active run).
  // ============================================================
  const flowResult = optHandled ? { consumed: true } : await dispatchInboundToFlows({
    accountId,
    userId: configOwnerUserId,
    contactId: contactRecord.id,
    conversationId: conversation.id,
    message:
      interactiveReplyId && !isTemplateButtonTap
        ? {
            kind: 'interactive_reply',
            reply_id: interactiveReplyId,
            reply_title: contentText ?? '',
            meta_message_id: message.id,
          }
        : {
            kind: 'text',
            text: contentText ?? message.text?.body ?? '',
            meta_message_id: message.id,
          },
    isFirstInboundMessage,
  })
  const flowConsumed = flowResult.consumed

  // Fire any automations that react to this webhook event. All dispatches
  // run here (not earlier) so the contact, conversation, and inbound
  // message all exist before any step — including send_message — runs.
  // They run concurrently and are awaited below: we're inside the route's
  // `after()` block (Meta already has its 200), which only keeps the
  // function alive for promises it can see — detached promises could be
  // frozen mid-automation on serverless hosts.
  const inboundText = contentText ?? message.text?.body ?? ''
  const automationTriggers: (
    | 'new_contact_created'
    | 'first_inbound_message'
    | 'new_message_received'
    | 'keyword_match'
  )[] = []
  // Content-level triggers are suppressed when a flow consumed the
  // message — see the comment block above.
  if (!flowConsumed) {
    automationTriggers.push('new_message_received', 'keyword_match')
  }
  // new_contact_created fires only when the webhook just auto-created the
  // contact row. first_inbound_message fires whenever this is the contact's
  // first-ever customer-sent message — a superset that also catches
  // manually-imported contacts sending for the first time. We dispatch both
  // so users can pick whichever semantic they want; an automation that
  // listens to only one trigger runs only when that trigger matches.
  if (contactOutcome.wasCreated) automationTriggers.unshift('new_contact_created')
  // Google Sheets sync - runs after the response; errors are recorded on
  // the connection and never affect message handling.
  if (contactOutcome.wasCreated) {
    after(() => syncNewContact(accountId, {
      name: contactRecord.name,
      phone: contactRecord.phone,
      email: contactRecord.email,
      company: contactRecord.company,
      created_at: contactRecord.created_at,
    }))
  }
  after(() => syncMessage(accountId, {
    direction: 'Inbound',
    contactName: contactRecord.name,
    phone: contactRecord.phone,
    type: contentType,
    text: contentText,
    at: new Date(parseInt(message.timestamp) * 1000).toISOString(),
  }))
  if (isFirstInboundMessage) automationTriggers.unshift('first_inbound_message')
  const automationRuns = automationTriggers.map((triggerType) =>
    runAutomationsForTrigger({
      accountId,
      triggerType,
      contactId: contactRecord.id,
      context: {
        message_text: inboundText,
        conversation_id: conversation.id,
      },
    }).catch((err) => console.error('[automations] dispatch failed:', err))
  )

  // AI chatbot: answers typed messages no flow handled, from the
  // account's knowledge base. Never throws; no-op when disabled.
  const chatbotRun = maybeReplyWithAI({
    accountId,
    userId: configOwnerUserId,
    contactId: contactRecord.id,
    conversationId: conversation.id,
    text: inboundText,
    isText: isTypedText,
    isMedia: ['image', 'audio', 'video', 'document'].includes(message.type),
    flowConsumed,
  })

  // message.received webhook (public API). Awaited — not fire-and-forget
  // — because we're inside the route's `after()` block, which only keeps
  // the function alive for promises it can see; a detached promise could
  // be frozen before it delivers. `dispatchWebhookEvent` early-exits
  // when the account has no matching endpoint and never throws. It runs
  // alongside the chatbot so the bot's reply debounce doesn't delay it.
  // (conversation.created is emitted earlier, right after the thread is
  // opened.)
  const messageReceived = dispatchWebhookEvent(supabaseAdmin(), accountId, 'message.received', {
    conversation_id: conversation.id,
    contact_id: contactRecord.id,
    whatsapp_message_id: message.id,
    content_type: contentType,
    text: contentText,
  })

  // Welcome / away auto-reply (Settings → Business hours). Never throws.
  const autoReply = maybeSendAutoReply({
    accountId,
    ownerUserId: configOwnerUserId,
    contactId: contactRecord.id,
    conversationId: conversation.id,
    contactName: contactRecord.name,
    messageType: message.type,
    isFirstInboundMessage,
    suppressed: optHandled || flowConsumed,
  })

  // Mobile push for the team (assigned agent, or everyone if unassigned).
  // Never throws; a no-op when nobody has registered a phone.
  const pushRun = notifyInboundMessage({
    accountId,
    conversationId: conversation.id,
    messageType: message.type,
    text: inboundText || null,
  })

  await Promise.all([...automationRuns, chatbotRun, messageReceived, autoReply, pushRun])
}

async function parseMessageContent(
  message: WhatsAppMessage,
  accessToken: string
): Promise<{
  contentText: string | null
  mediaUrl: string | null
  mediaType: string | null
  /**
   * For interactive button / list replies: the stable id of the tapped
   * option (whatever we put on the button when sending). Used by the
   * Flows engine to advance the per-contact run; persisted to
   * `messages.interactive_reply_id` so the inbox bubble can render the
   * tap with the right affordance. Null for everything else.
   */
  interactiveReplyId: string | null
}> {
  // getMediaUrl signature is (mediaId, accessToken) — earlier code had
  // the args swapped, so every verification hit an invalid Meta URL and
  // fell through to the catch block, leaving mediaUrl as null. That's
  // why images showed up as empty bubbles in the inbox.
  const verifyAndBuildUrl = async (
    mediaId: string
  ): Promise<string | null> => {
    try {
      await getMediaUrl({ mediaId, accessToken })
      return `/api/whatsapp/media/${mediaId}`
    } catch (error) {
      console.error(
        `Failed to verify media ${mediaId} with Meta:`,
        error instanceof Error ? error.message : error
      )
      return null
    }
  }

  // Default shape — each case overrides only the fields it cares about.
  // Keeps the new `interactiveReplyId` field DRY across every return site.
  const empty = {
    contentText: null,
    mediaUrl: null,
    mediaType: null,
    interactiveReplyId: null,
  }

  switch (message.type) {
    case 'text':
      return { ...empty, contentText: message.text?.body || null }

    case 'image':
      if (message.image?.id) {
        return {
          ...empty,
          contentText: message.image.caption || null,
          mediaUrl: await verifyAndBuildUrl(message.image.id),
          mediaType: message.image.mime_type,
        }
      }
      return empty

    case 'video':
      if (message.video?.id) {
        return {
          ...empty,
          contentText: message.video.caption || null,
          mediaUrl: await verifyAndBuildUrl(message.video.id),
          mediaType: message.video.mime_type,
        }
      }
      return empty

    case 'document':
      if (message.document?.id) {
        return {
          ...empty,
          contentText:
            message.document.caption || message.document.filename || null,
          mediaUrl: await verifyAndBuildUrl(message.document.id),
          mediaType: message.document.mime_type,
        }
      }
      return empty

    case 'audio':
      if (message.audio?.id) {
        return {
          ...empty,
          mediaUrl: await verifyAndBuildUrl(message.audio.id),
          mediaType: message.audio.mime_type,
        }
      }
      return empty

    case 'sticker':
      // Stickers are images under the hood. Treat them as such so the
      // MessageBubble renders the <img>. The caller maps the DB
      // content_type to 'image' for the CHECK constraint.
      if (message.sticker?.id) {
        return {
          ...empty,
          mediaUrl: await verifyAndBuildUrl(message.sticker.id),
          mediaType: message.sticker.mime_type,
        }
      }
      return empty

    case 'location':
      if (message.location) {
        const loc = message.location
        const locationText = [loc.name, loc.address, `${loc.latitude},${loc.longitude}`]
          .filter(Boolean)
          .join(' - ')
        return { ...empty, contentText: locationText }
      }
      return empty

    case 'reaction':
      return { ...empty, contentText: message.reaction?.emoji || null }

    case 'button': {
      // The customer tapped a quick-reply button on a TEMPLATE message
      // (broadcasts, automations). Unlike interactive replies these
      // aren't tied to a Flows step, so processMessage routes the tap
      // like typed text (keywords, opt-out, chatbot) while the payload
      // is kept for reference in interactive_reply_id.
      const text = message.button?.text || message.button?.payload || null
      return {
        ...empty,
        contentText: text,
        interactiveReplyId: message.button?.payload || text,
      }
    }

    case 'order':
      // Cart from the catalog — the order (and a readable summary) is
      // created after the insert by createOrderFromCatalog.
      return { ...empty, contentText: '🛒 New order' }

    case 'interactive': {
      // The customer tapped a reply button or a list row on a message
      // we previously sent. Meta delivers `interactive.button_reply` for
      // 3-button messages and `interactive.list_reply` for list messages.
      // Use the human-readable title as contentText so the inbox bubble
      // renders the tap legibly ("Existing customer"), and stash the
      // stable id separately so the Flows engine can route on it.
      const permission = message.interactive?.call_permission_reply
      if (message.interactive?.type === 'call_permission_reply' && permission) {
        const until = permission.expiration_timestamp
          ? new Date(Number(permission.expiration_timestamp) * 1000).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })
          : null
        const text =
          permission.response === 'accept'
            ? permission.is_permanent
              ? 'Allowed WhatsApp calls from you'
              : `Allowed WhatsApp calls from you${until ? ` until ${until}` : ''}`
            : 'Declined WhatsApp calls'
        return {
          ...empty,
          contentText: text,
          interactiveReplyId: `call_permission:${permission.response ?? 'unknown'}`,
        }
      }

      // A submitted WhatsApp form (Flow). The readable summary with field
      // labels is written after the insert by handleFormReply.
      if (message.interactive?.type === 'nfm_reply') {
        return {
          ...empty,
          contentText: '📝 Form submitted',
          interactiveReplyId: 'form_submitted',
        }
      }

      const reply =
        message.interactive?.button_reply ?? message.interactive?.list_reply
      if (reply?.id) {
        return {
          ...empty,
          contentText: reply.title || reply.id,
          interactiveReplyId: reply.id,
        }
      }
      return { ...empty, contentText: '[Interactive reply]' }
    }

    default:
      return {
        ...empty,
        contentText: `[Unsupported message type: ${message.type}]`,
      }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ContactRow = any

interface ContactOutcome {
  contact: ContactRow
  /** True when this call created the row; drives new_contact_created
   *  automation dispatch in processMessage. */
  wasCreated: boolean
}

interface InboundSender {
  /** Digits only; '' when Meta hides the number behind a username. */
  phone: string
  /** Business-scoped user ID (BSUID). Null only on old payloads. */
  whatsappUserId: string | null
  username: string | null
  name: string
}

/** PostgREST / Postgres "column does not exist". */
function isMissingColumnError(error: { code?: string }): boolean {
  return error.code === 'PGRST204' || error.code === '42703'
}

async function findContactByWhatsappUserId(
  accountId: string,
  whatsappUserId: string
): Promise<ContactRow | null> {
  const { data, error } = await supabaseAdmin()
    .from('contacts')
    .select('*')
    .eq('account_id', accountId)
    .eq('whatsapp_user_id', whatsappUserId)
    .maybeSingle()
  // An error here (e.g. migration 038 not applied yet) just means we
  // fall back to the phone lookup.
  return error ? null : data
}

async function findOrCreateContact(
  accountId: string,
  configOwnerUserId: string,
  sender: InboundSender
): Promise<ContactOutcome | null> {
  const { phone, whatsappUserId, username, name } = sender

  // Match by BSUID first — it's stable even when the phone is hidden —
  // then by phone. The phone helper pre-filters in SQL by the
  // last-8-digit suffix (so we don't pull every contact on every
  // inbound message) then applies the strict `phonesMatch` in JS on the
  // small candidate set. The same helper backs the manual contact form
  // and CSV import, so all three paths agree on what "same number"
  // means (issue #212).
  const existingContact =
    (whatsappUserId
      ? await findContactByWhatsappUserId(accountId, whatsappUserId)
      : null) ??
    (phone ? await findExistingContact(supabaseAdmin(), accountId, phone) : null)

  if (existingContact) {
    // Keep the row current: name changes, a newly seen BSUID/username,
    // or a phone number Meta has now revealed for a username-only contact.
    const updates: Record<string, string> = {}
    if (name && name !== existingContact.name) updates.name = name
    if (whatsappUserId && existingContact.whatsapp_user_id !== whatsappUserId) {
      updates.whatsapp_user_id = whatsappUserId
    }
    if (username && existingContact.whatsapp_username !== username) {
      updates.whatsapp_username = username
    }
    if (phone && !existingContact.phone) updates.phone = phone
    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabaseAdmin()
        .from('contacts')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', existingContact.id)
      if (updateError) {
        console.error('[webhook] contact update failed:', updateError.message)
      } else {
        Object.assign(existingContact, updates)
      }
    }
    return { contact: existingContact, wasCreated: false }
  }

  // Create new contact. account_id is the tenancy column;
  // user_id is the NOT NULL FK audit column (no inbound message
  // has a single "user who created" it — we attribute to the
  // WhatsApp config owner as a stable default). A username-only
  // contact is stored with phone = '' (outside the unique phone index).
  const baseRow = {
    account_id: accountId,
    user_id: configOwnerUserId,
    phone,
    name: name || (username ? `@${username}` : phone) || 'WhatsApp user',
  }
  let { data: newContact, error: createError } = await supabaseAdmin()
    .from('contacts')
    .insert({
      ...baseRow,
      ...(whatsappUserId ? { whatsapp_user_id: whatsappUserId } : {}),
      ...(username ? { whatsapp_username: username } : {}),
    })
    .select()
    .single()

  // Database without migration 038 yet: the BSUID columns don't exist.
  // Retry without them rather than dropping the message (only possible
  // when we have a phone to store).
  if (createError && phone && isMissingColumnError(createError)) {
    ;({ data: newContact, error: createError } = await supabaseAdmin()
      .from('contacts')
      .insert(baseRow)
      .select()
      .single())
  }

  if (createError) {
    // Lost a race: a concurrent inbound delivery (or another path)
    // created this contact between our lookup and insert, and a unique
    // index (022 phone / 038 BSUID) rejected the duplicate. Re-resolve
    // the existing row instead of dropping the message.
    if (isUniqueViolation(createError)) {
      const raced =
        (whatsappUserId
          ? await findContactByWhatsappUserId(accountId, whatsappUserId)
          : null) ??
        (phone ? await findExistingContact(supabaseAdmin(), accountId, phone) : null)
      if (raced) return { contact: raced, wasCreated: false }
    }
    console.error('Error creating contact:', createError)
    return null
  }

  return { contact: newContact, wasCreated: true }
}

async function findOrCreateConversation(
  accountId: string,
  configOwnerUserId: string,
  contactId: string,
) {
  // Look for existing conversation in this account
  const { data: existing, error: findError } = await supabaseAdmin()
    .from('conversations')
    .select('*')
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
    .single()

  if (!findError && existing) {
    return { conversation: existing, created: false }
  }

  // Create new conversation. Same tenancy + audit split as
  // findOrCreateContact above.
  const { data: newConv, error: createError } = await supabaseAdmin()
    .from('conversations')
    .insert({
      account_id: accountId,
      user_id: configOwnerUserId,
      contact_id: contactId,
    })
    .select()
    .single()

  if (createError) {
    console.error('Error creating conversation:', createError)
    return null
  }

  return { conversation: newConv, created: true }
}
