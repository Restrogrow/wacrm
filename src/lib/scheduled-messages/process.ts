// ============================================================
// Scheduled chat messages — sent by the server. Server-only.
//
// The every-minute automations cron calls processScheduledMessages():
//
//   1. rows stuck in "sending" (a crashed/timed-out run) are failed,
//      never retried, so nothing is sent twice;
//   2. due "pending" rows are claimed one by one with a conditional
//      UPDATE (pending → sending). Only the run whose UPDATE matched
//      the row proceeds, so overlapping cron runs cannot double-send;
//   3. each claimed row goes through the normal send path
//      (sendMessageToConversation), after checking the contact has not
//      opted out and the customer's 24-hour window is still open.
//
// A message that cannot go out is marked failed with a plain-language
// reason, which the inbox shows next to it.
// ============================================================

import { supabaseAdmin } from '@/lib/flows/admin-client'
import { isPhoneOptedOut } from '@/lib/contacts/opt-out'
import { SendMessageError, sendMessageToConversation } from '@/lib/whatsapp/send-message'
import { STALE_SENDING_MS, isWindowOpen } from './core'

/** Leave headroom inside the cron route's time limit. */
const TIME_BUDGET_MS = 40_000
const BATCH = 25

interface DueRow {
  id: string
  account_id: string
  conversation_id: string
  content_text: string
  created_by: string | null
}

async function fail(id: string, reason: string) {
  await supabaseAdmin()
    .from('scheduled_messages')
    .update({ status: 'failed', error_message: reason.slice(0, 500), updated_at: new Date().toISOString() })
    .eq('id', id)
}

/** Send what is due; returns how many messages were sent this run. */
export async function processScheduledMessages(): Promise<number> {
  const db = supabaseAdmin()
  const started = Date.now()

  // 1. Interrupted sends: fail them rather than risk a duplicate.
  const staleBefore = new Date(Date.now() - STALE_SENDING_MS).toISOString()
  const { error: staleErr } = await db
    .from('scheduled_messages')
    .update({
      status: 'failed',
      error_message: 'Sending was interrupted. Check the conversation before sending it again.',
      updated_at: new Date().toISOString(),
    })
    .eq('status', 'sending')
    .lt('claimed_at', staleBefore)
  if (staleErr) {
    // Migration 069 not applied yet: nothing to do, and not an error for the cron.
    console.warn('[scheduled-messages] stale sweep skipped:', staleErr.message)
    return 0
  }

  const { data: due, error } = await db
    .from('scheduled_messages')
    .select('id, account_id, conversation_id, content_text, created_by')
    .eq('status', 'pending')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(BATCH)
  if (error) throw new Error(error.message)

  let sent = 0
  for (const row of (due ?? []) as DueRow[]) {
    if (Date.now() - started > TIME_BUDGET_MS) break

    // 2. Claim. Only one concurrent run gets a row back.
    const now = new Date().toISOString()
    const { data: claimed } = await db
      .from('scheduled_messages')
      .update({ status: 'sending', claimed_at: now, updated_at: now })
      .eq('id', row.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()
    if (!claimed) continue

    try {
      // Conversation + contact, for the opt-out and window checks.
      const { data: conv } = await db
        .from('conversations')
        .select('id, contact:contacts(phone)')
        .eq('id', row.conversation_id)
        .eq('account_id', row.account_id)
        .maybeSingle()
      if (!conv) {
        await fail(row.id, 'The conversation no longer exists.')
        continue
      }
      const phone = (conv.contact as unknown as { phone?: string } | null)?.phone
      if (phone && (await isPhoneOptedOut(db, row.account_id, phone))) {
        await fail(row.id, 'The contact has opted out of messages.')
        continue
      }

      const { data: lastCustomer } = await db
        .from('messages')
        .select('created_at')
        .eq('conversation_id', row.conversation_id)
        .eq('sender_type', 'customer')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!isWindowOpen(lastCustomer?.created_at)) {
        await fail(
          row.id,
          'The customer’s 24-hour reply window had closed, so WhatsApp would not deliver a free-form message. Send a template instead.',
        )
        continue
      }

      const result = await sendMessageToConversation(db, row.account_id, {
        conversationId: row.conversation_id,
        messageType: 'text',
        contentText: row.content_text,
      })

      // Credit the message to whoever scheduled it (best effort).
      if (row.created_by) {
        await db.from('messages').update({ sender_id: row.created_by }).eq('id', result.messageId)
      }
      await db
        .from('scheduled_messages')
        .update({
          status: 'sent',
          sent_message_id: result.messageId,
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
      sent += 1
    } catch (err) {
      const reason =
        err instanceof SendMessageError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'The message could not be sent.'
      console.error('[scheduled-messages] send failed:', reason)
      await fail(row.id, reason)
    }
  }
  return sent
}
