// ============================================================
// Welcome / away auto-replies for inbound WhatsApp messages.
//
// Called once per inbound message from the webhook. It NEVER throws:
// a failure here must not affect saving the message or any other
// automation. Replies go out through the automation bot sender
// (engineSendText), which
//   - refuses when the trial / plan is over (accountCanSend),
//   - stores the message as sender_type = 'bot', so an auto-reply
//     never counts as a human first response (SLA, reports) and never
//     pauses a running flow.
// The customer just messaged us, so the 24 hour window is open and a
// plain text reply is allowed.
// ============================================================

import { supabaseAdmin } from '@/lib/automations/admin-client'
import { engineSendText } from '@/lib/automations/meta-send'
import { pickAutoReply, renderAutoReply, rowToSettings } from './hours'

export interface AutoReplyArgs {
  accountId: string
  /** Sender-of-record user (the WhatsApp config owner). */
  ownerUserId: string
  contactId: string
  conversationId: string
  contactName: string | null
  /** WhatsApp message type of the inbound message. */
  messageType: string
  isFirstInboundMessage: boolean
  /** True when a flow or an opt-out keyword already handled the message. */
  suppressed: boolean
}

type Kind = 'welcome' | 'away'

export async function maybeSendAutoReply(args: AutoReplyArgs): Promise<void> {
  try {
    // Reactions, our own echoes and already-handled messages get no auto-reply.
    if (args.suppressed || args.messageType === 'reaction') return

    const db = supabaseAdmin()
    const { data: row, error } = await db
      .from('business_hours_settings')
      .select('*')
      .eq('account_id', args.accountId)
      .maybeSingle()
    if (error || !row) return // not configured (or migration 066 not applied)

    const settings = rowToSettings(row)
    if (!settings.welcome_enabled && !settings.away_enabled) return

    const kind: Kind | null = pickAutoReply(settings, {
      isFirstInboundMessage: args.isFirstInboundMessage,
    })
    if (!kind) return

    // Respect opt-outs.
    const { data: contact } = await db
      .from('contacts')
      .select('opted_out_at')
      .eq('id', args.contactId)
      .eq('account_id', args.accountId)
      .maybeSingle()
    if (contact?.opted_out_at) return

    // Welcome: once per conversation. Away: once per cooldown window.
    const since =
      kind === 'welcome'
        ? new Date(0).toISOString()
        : new Date(Date.now() - settings.away_cooldown_hours * 3600_000).toISOString()

    const recent = await db
      .from('auto_reply_log')
      .select('id')
      .eq('conversation_id', args.conversationId)
      .eq('kind', kind)
      .gte('created_at', since)
      .limit(1)
    if (recent.error || (recent.data && recent.data.length > 0)) return

    // Claim first, then send, so two messages arriving together cannot
    // both trigger a reply: only the earliest claim in the window wins.
    const claim = await db
      .from('auto_reply_log')
      .insert({ account_id: args.accountId, conversation_id: args.conversationId, kind })
      .select('id')
      .single()
    if (claim.error || !claim.data) return
    const myId = claim.data.id as string

    const earliest = await db
      .from('auto_reply_log')
      .select('id')
      .eq('conversation_id', args.conversationId)
      .eq('kind', kind)
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(1)
    if (earliest.data?.[0] && earliest.data[0].id !== myId) {
      await db.from('auto_reply_log').delete().eq('id', myId)
      return
    }

    const template = kind === 'welcome' ? settings.welcome_message : settings.away_message
    const text = renderAutoReply(template, args.contactName)
    if (!text) {
      await db.from('auto_reply_log').delete().eq('id', myId)
      return
    }

    try {
      await engineSendText({
        accountId: args.accountId,
        userId: args.ownerUserId,
        conversationId: args.conversationId,
        contactId: args.contactId,
        text,
      })
    } catch (err) {
      // Release the claim so a later message can try again.
      await db.from('auto_reply_log').delete().eq('id', myId)
      console.error(`[auto-reply] ${kind} send failed:`, err instanceof Error ? err.message : err)
    }
  } catch (err) {
    console.error('[auto-reply] failed:', err instanceof Error ? err.message : err)
  }
}
