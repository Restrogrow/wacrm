// Sends pushes through the Expo Push API and keeps the token table clean.
// Server-only. NEVER throws: a push problem must not break a message, note
// or webhook. Tokens are never logged.

import type { SupabaseClient } from '@supabase/supabase-js'

import { supabaseAdmin } from '@/lib/automations/admin-client'

import {
  buildAssignmentPush,
  buildMentionPush,
  buildMessagePush,
  chooseRecipients,
  createThrottle,
  deadTokensFromTickets,
  type BuiltPush,
  type Candidate,
  type ExpoTicket,
  type PushKind,
} from './core'

/** The only host we ever send to. */
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const BATCH = 100
const TIMEOUT_MS = 10_000

const messageThrottle = createThrottle(30_000)

interface ExpoMessage {
  to: string
  title: string
  body: string
  data: Record<string, unknown>
  sound: 'default'
  channelId: 'messages'
  priority: 'high'
}

async function postBatch(messages: ExpoMessage[]): Promise<ExpoTicket[]> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
      },
      body: JSON.stringify(messages),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      console.error('[push] Expo push API returned', res.status)
      return []
    }
    const json = (await res.json().catch(() => null)) as { data?: ExpoTicket[] } | null
    return Array.isArray(json?.data) ? json.data : []
  } catch (err) {
    console.error('[push] send failed:', err instanceof Error ? err.name : 'error')
    return []
  } finally {
    clearTimeout(timer)
  }
}

/** Send one built push to specific users (all of their enabled devices). Never throws. */
export async function sendPushToUsers(userIds: string[], push: BuiltPush, db: SupabaseClient = supabaseAdmin()): Promise<number> {
  try {
    if (userIds.length === 0) return 0
    const { data, error } = await db.from('device_push_tokens').select('token').in('user_id', userIds).eq('enabled', true)
    if (error) {
      // Migration 078 not applied yet, or a database hiccup: skip quietly.
      console.error('[push] token lookup failed:', error.message)
      return 0
    }
    const tokens = [...new Set((data ?? []).map((r: { token: string }) => r.token))]
    if (tokens.length === 0) return 0

    let sent = 0
    for (let i = 0; i < tokens.length; i += BATCH) {
      const slice = tokens.slice(i, i + BATCH)
      const tickets = await postBatch(
        slice.map((to) => ({ to, title: push.title, body: push.body, data: push.data, sound: 'default', channelId: 'messages', priority: 'high' })),
      )
      sent += tickets.filter((t) => t?.status === 'ok').length
      const dead = deadTokensFromTickets(slice, tickets)
      if (dead.length > 0) {
        await db.from('device_push_tokens').update({ enabled: false }).in('token', dead)
      }
    }
    return sent
  } catch (err) {
    console.error('[push] sendPushToUsers failed:', err instanceof Error ? err.message : 'error')
    return 0
  }
}

async function loadCandidates(db: SupabaseClient, accountId: string): Promise<Candidate[]> {
  const { data } = await db.from('profiles').select('user_id, account_role').eq('account_id', accountId)
  return ((data ?? []) as Array<{ user_id: string; account_role: string | null }>).map((p) => ({ user_id: p.user_id, role: p.account_role }))
}

/** Choose recipients for an account event and send. Never throws. */
export async function sendPush(args: {
  accountId: string
  kind: PushKind
  push: BuiltPush
  actorUserId?: string | null
  assignedUserId?: string | null
  mentionedUserIds?: string[]
}): Promise<number> {
  try {
    const db = supabaseAdmin()
    const candidates = await loadCandidates(db, args.accountId)
    const userIds = chooseRecipients({
      kind: args.kind,
      candidates,
      actorUserId: args.actorUserId,
      assignedUserId: args.assignedUserId,
      mentionedUserIds: args.mentionedUserIds,
    })
    return await sendPushToUsers(userIds, args.push, db)
  } catch (err) {
    console.error('[push] sendPush failed:', err instanceof Error ? err.message : 'error')
    return 0
  }
}

/** A customer message just arrived. No-op without registered devices. Never throws. */
export async function notifyInboundMessage(args: {
  accountId: string
  conversationId: string
  messageType?: string | null
  text?: string | null
}): Promise<void> {
  try {
    if (!messageThrottle(`msg:${args.conversationId}`)) return
    const db = supabaseAdmin()
    const { data: conv } = await db
      .from('conversations')
      .select('id, assigned_agent_id, contact_id, contact:contacts(name, phone)')
      .eq('id', args.conversationId)
      .eq('account_id', args.accountId)
      .maybeSingle()
    if (!conv) return
    const contact = Array.isArray(conv.contact) ? conv.contact[0] : conv.contact
    const push = buildMessagePush({
      conversationId: conv.id,
      contactId: conv.contact_id,
      contactName: contact?.name,
      contactPhone: contact?.phone,
      messageType: args.messageType,
      text: args.text,
    })
    const candidates = await loadCandidates(db, args.accountId)
    const userIds = chooseRecipients({ kind: 'message', candidates, assignedUserId: conv.assigned_agent_id })
    await sendPushToUsers(userIds, push, db)
  } catch (err) {
    console.error('[push] notifyInboundMessage failed:', err instanceof Error ? err.message : 'error')
  }
}

/** Teammates were @mentioned in a note. */
export async function notifyMentions(args: {
  conversationId: string
  contactId?: string | null
  actorUserId: string
  actorName: string
  snippet: string
  mentionedUserIds: string[]
}): Promise<void> {
  try {
    if (args.mentionedUserIds.length === 0) return
    const userIds = chooseRecipients({
      kind: 'mention',
      candidates: args.mentionedUserIds.map((id) => ({ user_id: id, role: 'agent' })),
      actorUserId: args.actorUserId,
      mentionedUserIds: args.mentionedUserIds,
    })
    await sendPushToUsers(
      userIds,
      buildMentionPush({ conversationId: args.conversationId, contactId: args.contactId, actorName: args.actorName, snippet: args.snippet }),
    )
  } catch (err) {
    console.error('[push] notifyMentions failed:', err instanceof Error ? err.message : 'error')
  }
}

/** A chat was assigned to an agent. */
export async function notifyAssignment(args: {
  conversationId: string
  contactId?: string | null
  contactName?: string | null
  assignedUserId: string
  actorUserId?: string | null
  /** More than one chat assigned at once: sends a single summary push. */
  count?: number
}): Promise<void> {
  try {
    if (!args.contactName && (args.count ?? 1) <= 1) {
      const { data: conv } = await supabaseAdmin()
        .from('conversations')
        .select('contact_id, contact:contacts(name, phone)')
        .eq('id', args.conversationId)
        .maybeSingle()
      const contact = Array.isArray(conv?.contact) ? conv?.contact[0] : conv?.contact
      args = { ...args, contactId: args.contactId ?? conv?.contact_id, contactName: contact?.name || contact?.phone || null }
    }
    const userIds = chooseRecipients({
      kind: 'assignment',
      candidates: [{ user_id: args.assignedUserId, role: 'agent' }],
      actorUserId: args.actorUserId,
      assignedUserId: args.assignedUserId,
    })
    await sendPushToUsers(userIds, buildAssignmentPush(args))
  } catch (err) {
    console.error('[push] notifyAssignment failed:', err instanceof Error ? err.message : 'error')
  }
}
