// Pure logic for mobile push notifications: token validation, who gets a
// push, what it says, and burst throttling. No I/O here so it is unit-tested.

export type PushKind = 'message' | 'mention' | 'assignment' | 'sla'
export type Role = 'owner' | 'admin' | 'agent' | 'viewer'

export interface Candidate {
  user_id: string
  role: Role | string | null
}

/** Expo push tokens look like ExponentPushToken[xxxx] (older: ExpoPushToken[xxxx]). */
const TOKEN_RE = /^Expo(?:nent)?PushToken\[[A-Za-z0-9_-]{8,64}\]$/

export function isExpoPushToken(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 120 && TOKEN_RE.test(value)
}

export interface TokenRegistration {
  token: string
  platform: 'ios' | 'android'
  deviceName: string | null
  appVersion: string | null
}

export function parseRegistration(body: unknown): { ok: true; value: TokenRegistration } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid request' }
  const b = body as Record<string, unknown>
  if (!isExpoPushToken(b.token)) return { ok: false, error: 'Invalid push token' }
  if (b.platform !== 'ios' && b.platform !== 'android') return { ok: false, error: 'Invalid platform' }
  const clean = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
  return {
    ok: true,
    value: { token: b.token, platform: b.platform, deviceName: clean(b.deviceName, 80), appVersion: clean(b.appVersion, 30) },
  }
}

export function parseTokenRemoval(body: unknown): string | null {
  const t = body && typeof body === 'object' ? (body as Record<string, unknown>).token : null
  return isExpoPushToken(t) ? t : null
}

const NOTIFIABLE_ROLES = new Set(['owner', 'admin', 'agent'])

/**
 * Who should get a push.
 * - message / sla: the assigned agent; if the chat is unassigned (or the
 *   assignee cannot be notified) every owner, admin and agent of the account.
 * - assignment: just the new assignee.
 * - mention: exactly the mentioned people (any role: they were asked directly).
 * Never the person who caused the event. Viewers get no message pushes.
 */
export function chooseRecipients(args: {
  kind: PushKind
  candidates: Candidate[]
  actorUserId?: string | null
  assignedUserId?: string | null
  mentionedUserIds?: string[]
}): string[] {
  const { kind, candidates, actorUserId, assignedUserId, mentionedUserIds } = args
  const byId = new Map(candidates.map((c) => [c.user_id, c]))
  const notActor = (id: string) => id !== actorUserId

  if (kind === 'mention') {
    return [...new Set(mentionedUserIds ?? [])].filter((id) => byId.has(id) && notActor(id))
  }
  if (kind === 'assignment') {
    return assignedUserId && byId.has(assignedUserId) && notActor(assignedUserId) ? [assignedUserId] : []
  }
  // message / sla
  const assignee = assignedUserId ? byId.get(assignedUserId) : undefined
  if (assignee && NOTIFIABLE_ROLES.has(String(assignee.role))) {
    return notActor(assignee.user_id) ? [assignee.user_id] : []
  }
  return candidates.filter((c) => NOTIFIABLE_ROLES.has(String(c.role)) && notActor(c.user_id)).map((c) => c.user_id)
}

export function truncate(text: string, max = 120): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}

const MEDIA_LABEL: Record<string, string> = {
  image: '📷 Photo',
  video: '🎥 Video',
  audio: '🎤 Voice message',
  document: '📄 Document',
  sticker: 'Sticker',
  location: '📍 Location',
  contacts: '👤 Contact',
  order: '🛒 Order',
  interactive: 'Reply',
}

export interface BuiltPush {
  title: string
  body: string
  data: { type: PushKind; conversationId: string; contactId?: string }
}

/** The text of a push for an inbound customer message. A short preview, nothing else. */
export function buildMessagePush(args: {
  conversationId: string
  contactId?: string | null
  contactName?: string | null
  contactPhone?: string | null
  messageType?: string | null
  text?: string | null
}): BuiltPush {
  const preview = args.text && args.text.trim() ? truncate(args.text) : (MEDIA_LABEL[args.messageType ?? ''] ?? 'New message')
  return {
    title: truncate(args.contactName || args.contactPhone || 'New message', 60),
    body: preview,
    data: { type: 'message', conversationId: args.conversationId, ...(args.contactId ? { contactId: args.contactId } : {}) },
  }
}

export function buildMentionPush(args: {
  conversationId: string
  contactId?: string | null
  actorName: string
  snippet: string
}): BuiltPush {
  return {
    title: truncate(`${args.actorName} mentioned you`, 60),
    body: truncate(args.snippet),
    data: { type: 'mention', conversationId: args.conversationId, ...(args.contactId ? { contactId: args.contactId } : {}) },
  }
}

export function buildAssignmentPush(args: { conversationId: string; contactId?: string | null; contactName?: string | null; count?: number }): BuiltPush {
  if ((args.count ?? 1) > 1) {
    return {
      title: `${args.count} chats assigned to you`,
      body: 'Open the inbox to see who is waiting for a reply',
      data: { type: 'assignment', conversationId: args.conversationId },
    }
  }
  return {
    title: 'Chat assigned to you',
    body: truncate(args.contactName ? `${args.contactName} is waiting for a reply` : 'A customer is waiting for a reply'),
    data: { type: 'assignment', conversationId: args.conversationId, ...(args.contactId ? { contactId: args.contactId } : {}) },
  }
}

/** At most one push per key within the window. In-memory (per server instance); enough to stop bursts. */
export function createThrottle(windowMs: number, maxKeys = 5000) {
  const seen = new Map<string, number>()
  return function allow(key: string, now = Date.now()): boolean {
    const last = seen.get(key)
    if (last !== undefined && now - last < windowMs) return false
    seen.set(key, now)
    if (seen.size > maxKeys) {
      for (const [k, t] of seen) if (now - t >= windowMs) seen.delete(k)
      if (seen.size > maxKeys) seen.clear()
    }
    return true
  }
}

export interface ExpoTicket {
  status?: string
  message?: string
  details?: { error?: string }
}

/** Tokens Expo says are dead (app uninstalled or token revoked). Tickets come back in send order. */
export function deadTokensFromTickets(tokens: string[], tickets: ExpoTicket[]): string[] {
  const dead: string[] = []
  tickets.forEach((t, i) => {
    if (t?.status === 'error' && t.details?.error === 'DeviceNotRegistered' && tokens[i]) dead.push(tokens[i])
  })
  return dead
}
