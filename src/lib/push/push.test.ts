import { describe, expect, it } from 'vitest'

import {
  buildAssignmentPush,
  buildMentionPush,
  buildMessagePush,
  chooseRecipients,
  createThrottle,
  deadTokensFromTickets,
  isExpoPushToken,
  parseRegistration,
  parseTokenRemoval,
  truncate,
} from './core'

const team = [
  { user_id: 'owner', role: 'owner' },
  { user_id: 'admin', role: 'admin' },
  { user_id: 'agent1', role: 'agent' },
  { user_id: 'agent2', role: 'agent' },
  { user_id: 'viewer', role: 'viewer' },
]

describe('push token validation', () => {
  it('accepts Expo token shapes only', () => {
    expect(isExpoPushToken('ExponentPushToken[abcdEFGH1234567890_-]')).toBe(true)
    expect(isExpoPushToken('ExpoPushToken[abcdEFGH1234567890]')).toBe(true)
    expect(isExpoPushToken('fcm:APA91bH...')).toBe(false)
    expect(isExpoPushToken('ExponentPushToken[]')).toBe(false)
    expect(isExpoPushToken('ExponentPushToken[abc def ghi jkl]')).toBe(false)
    expect(isExpoPushToken(undefined)).toBe(false)
    expect(isExpoPushToken('ExponentPushToken[' + 'a'.repeat(200) + ']')).toBe(false)
  })

  it('parses a registration and rejects bad ones', () => {
    const ok = parseRegistration({ token: 'ExponentPushToken[abcdEFGH1234]', platform: 'ios', deviceName: ' iPhone 15 ', appVersion: '1.0.0' })
    expect(ok).toEqual({ ok: true, value: { token: 'ExponentPushToken[abcdEFGH1234]', platform: 'ios', deviceName: 'iPhone 15', appVersion: '1.0.0' } })
    expect(parseRegistration({ token: 'nope', platform: 'ios' }).ok).toBe(false)
    expect(parseRegistration({ token: 'ExponentPushToken[abcdEFGH1234]', platform: 'web' }).ok).toBe(false)
    expect(parseRegistration(null).ok).toBe(false)
  })

  it('parses a removal', () => {
    expect(parseTokenRemoval({ token: 'ExponentPushToken[abcdEFGH1234]' })).toBe('ExponentPushToken[abcdEFGH1234]')
    expect(parseTokenRemoval({ token: 'x' })).toBeNull()
    expect(parseTokenRemoval(null)).toBeNull()
  })
})

describe('chooseRecipients', () => {
  it('notifies only the assigned agent when the chat is assigned', () => {
    expect(chooseRecipients({ kind: 'message', candidates: team, assignedUserId: 'agent2' })).toEqual(['agent2'])
  })

  it('notifies owners, admins and agents (never viewers) when unassigned', () => {
    expect(chooseRecipients({ kind: 'message', candidates: team, assignedUserId: null })).toEqual(['owner', 'admin', 'agent1', 'agent2'])
  })

  it('falls back to the team when the assignee is a viewer or unknown', () => {
    expect(chooseRecipients({ kind: 'message', candidates: team, assignedUserId: 'viewer' })).toEqual(['owner', 'admin', 'agent1', 'agent2'])
    expect(chooseRecipients({ kind: 'message', candidates: team, assignedUserId: 'ghost' })).toEqual(['owner', 'admin', 'agent1', 'agent2'])
  })

  it('never notifies the person who caused the event', () => {
    expect(chooseRecipients({ kind: 'message', candidates: team, actorUserId: 'agent1' })).toEqual(['owner', 'admin', 'agent2'])
    expect(chooseRecipients({ kind: 'message', candidates: team, assignedUserId: 'agent1', actorUserId: 'agent1' })).toEqual([])
    expect(chooseRecipients({ kind: 'assignment', candidates: team, assignedUserId: 'agent1', actorUserId: 'agent1' })).toEqual([])
  })

  it('assignment notifies just the assignee', () => {
    expect(chooseRecipients({ kind: 'assignment', candidates: team, assignedUserId: 'agent2', actorUserId: 'admin' })).toEqual(['agent2'])
    expect(chooseRecipients({ kind: 'assignment', candidates: team, assignedUserId: 'ghost' })).toEqual([])
  })

  it('mentions notify exactly the mentioned members, once, excluding the author', () => {
    expect(
      chooseRecipients({ kind: 'mention', candidates: team, actorUserId: 'admin', mentionedUserIds: ['agent1', 'agent1', 'admin', 'ghost', 'viewer'] }),
    ).toEqual(['agent1', 'viewer'])
  })
})

describe('payloads', () => {
  it('truncates long text', () => {
    const t = truncate('x'.repeat(300))
    expect(t.length).toBeLessThanOrEqual(120)
    expect(t.endsWith('…')).toBe(true)
    expect(truncate('  hello   world \n ok ')).toBe('hello world ok')
  })

  it('message push shows the name and a short preview', () => {
    const p = buildMessagePush({ conversationId: 'c1', contactId: 'k1', contactName: 'Asha', text: 'Hi, is this in stock?' })
    expect(p).toEqual({ title: 'Asha', body: 'Hi, is this in stock?', data: { type: 'message', conversationId: 'c1', contactId: 'k1' } })
  })

  it('falls back to phone and media labels', () => {
    const p = buildMessagePush({ conversationId: 'c1', contactPhone: '+919876543210', messageType: 'image' })
    expect(p.title).toBe('+919876543210')
    expect(p.body).toBe('📷 Photo')
    expect(buildMessagePush({ conversationId: 'c1' }).body).toBe('New message')
  })

  it('mention and assignment payloads carry the deep-link data', () => {
    expect(buildMentionPush({ conversationId: 'c1', actorName: 'Ravi', snippet: 'please check' }).data).toEqual({ type: 'mention', conversationId: 'c1' })
    const a = buildAssignmentPush({ conversationId: 'c2', contactId: 'k2', contactName: 'Asha' })
    expect(a.data).toEqual({ type: 'assignment', conversationId: 'c2', contactId: 'k2' })
    expect(a.body).toContain('Asha')
    const many = buildAssignmentPush({ conversationId: 'c3', contactName: 'Asha', count: 12 })
    expect(many.title).toBe('12 chats assigned to you')
    expect(many.data).toEqual({ type: 'assignment', conversationId: 'c3' })
  })
})

describe('createThrottle', () => {
  it('allows one push per key per window', () => {
    const allow = createThrottle(30_000)
    expect(allow('chat:1', 1000)).toBe(true)
    expect(allow('chat:1', 20_000)).toBe(false)
    expect(allow('chat:2', 20_000)).toBe(true)
    expect(allow('chat:1', 31_001)).toBe(true)
  })
})

describe('deadTokensFromTickets', () => {
  it('flags only DeviceNotRegistered tickets, matched by position', () => {
    const tokens = ['a', 'b', 'c']
    const dead = deadTokensFromTickets(tokens, [
      { status: 'ok' },
      { status: 'error', details: { error: 'DeviceNotRegistered' } },
      { status: 'error', details: { error: 'MessageRateExceeded' } },
    ])
    expect(dead).toEqual(['b'])
    expect(deadTokensFromTickets(tokens, [])).toEqual([])
  })
})
