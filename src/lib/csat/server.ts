// ============================================================
// CSAT survey — server side. Server-only.
//
//   requestCsat():   when a chat is closed, send the rating buttons
//                    (once per conversation, inside the 24-hour window).
//   handleCsatReply(): when the customer taps a button, store the rating.
//
// Every function fails open: a CSAT problem must never block closing a
// chat or processing an inbound message, and it stays quiet if
// migration 069 has not been applied.
// ============================================================

import { supabaseAdmin } from '@/lib/flows/admin-client'
import { isPhoneOptedOut } from '@/lib/contacts/opt-out'
import { accountCanSend } from '@/lib/billing/server'
import { engineSendInteractiveButtons, engineSendText } from '@/lib/flows/meta-send'
import { isWindowOpen } from '@/lib/scheduled-messages/core'
import {
  CSAT_OPTIONS,
  CSAT_THANKS_MESSAGE,
  csatButtonId,
  normalizeCsatMessage,
  parseCsatButtonId,
} from './core'

export interface CsatSettings {
  enabled: boolean
  message_text: string
}

export type CsatRequestResult =
  | { sent: true }
  | { sent: false; reason: 'disabled' | 'not_closed' | 'already_sent' | 'window_closed' | 'opted_out' | 'plan' | 'error' }

export async function loadCsatSettings(accountId: string): Promise<CsatSettings | null> {
  const { data, error } = await supabaseAdmin()
    .from('csat_settings')
    .select('enabled, message_text')
    .eq('account_id', accountId)
    .maybeSingle()
  if (error) return null
  return data ? { enabled: !!data.enabled, message_text: normalizeCsatMessage(data.message_text) } : null
}

/**
 * Ask the customer to rate the chat. `userId` is only used for the audit
 * column on the outgoing message. Never throws.
 */
export async function requestCsat(args: {
  accountId: string
  conversationId: string
  userId: string
}): Promise<CsatRequestResult> {
  const db = supabaseAdmin()
  try {
    const settings = await loadCsatSettings(args.accountId)
    if (!settings?.enabled) return { sent: false, reason: 'disabled' }

    const { data: conv } = await db
      .from('conversations')
      .select('id, status, contact_id, assigned_agent_id, contact:contacts(phone)')
      .eq('id', args.conversationId)
      .eq('account_id', args.accountId)
      .maybeSingle()
    if (!conv || conv.status !== 'closed') return { sent: false, reason: 'not_closed' }

    const phone = (conv.contact as unknown as { phone?: string } | null)?.phone
    if (phone && (await isPhoneOptedOut(db, args.accountId, phone))) {
      return { sent: false, reason: 'opted_out' }
    }
    if (!(await accountCanSend(args.accountId))) return { sent: false, reason: 'plan' }

    const { data: lastCustomer } = await db
      .from('messages')
      .select('created_at')
      .eq('conversation_id', args.conversationId)
      .eq('sender_type', 'customer')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!isWindowOpen(lastCustomer?.created_at)) return { sent: false, reason: 'window_closed' }

    // Claim the one survey slot for this conversation. The UNIQUE key makes
    // a second close of the same chat a no-op.
    const { data: row, error: insErr } = await db
      .from('csat_responses')
      .insert({
        account_id: args.accountId,
        conversation_id: args.conversationId,
        contact_id: conv.contact_id,
        agent_id: conv.assigned_agent_id ?? null,
      })
      .select('id')
      .single()
    if (insErr) {
      return { sent: false, reason: insErr.code === '23505' ? 'already_sent' : 'error' }
    }

    try {
      await engineSendInteractiveButtons({
        accountId: args.accountId,
        userId: args.userId,
        conversationId: args.conversationId,
        contactId: conv.contact_id,
        bodyText: settings.message_text,
        buttons: CSAT_OPTIONS.map((o) => ({ id: csatButtonId(row.id, o.rating), title: o.title })),
      })
    } catch (err) {
      // Free the slot so a later close can try again.
      await db.from('csat_responses').delete().eq('id', row.id)
      console.error('[csat] survey send failed:', err instanceof Error ? err.message : err)
      return { sent: false, reason: 'error' }
    }
    return { sent: true }
  } catch (err) {
    console.warn('[csat] request skipped:', err instanceof Error ? err.message : err)
    return { sent: false, reason: 'error' }
  }
}

/**
 * Called for every inbound button tap. Returns true when the tap was a CSAT
 * answer (so the caller can stop the flow/automation/bot from also reacting
 * to it), false for any other button. Never throws.
 */
export async function handleCsatReply(args: {
  accountId: string
  conversationId: string
  contactId: string
  userId: string
  replyId: string | null | undefined
}): Promise<boolean> {
  const parsed = parseCsatButtonId(args.replyId)
  if (!parsed) return false
  const db = supabaseAdmin()
  try {
    // Only the first answer counts, and only for a survey of this chat.
    const { data: updated } = await db
      .from('csat_responses')
      .update({ rating: parsed.rating, responded_at: new Date().toISOString() })
      .eq('id', parsed.responseId)
      .eq('account_id', args.accountId)
      .eq('conversation_id', args.conversationId)
      .is('rating', null)
      .select('id')
      .maybeSingle()
    if (updated) {
      await engineSendText({
        accountId: args.accountId,
        userId: args.userId,
        conversationId: args.conversationId,
        contactId: args.contactId,
        text: CSAT_THANKS_MESSAGE,
      }).catch((err) => console.warn('[csat] thank-you failed:', err instanceof Error ? err.message : err))
    }
  } catch (err) {
    console.warn('[csat] reply handling failed:', err instanceof Error ? err.message : err)
  }
  // A well-formed CSAT id is always consumed, answered or not.
  return true
}
