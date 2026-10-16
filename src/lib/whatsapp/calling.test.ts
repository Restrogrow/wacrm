import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/whatsapp/encryption', () => ({ decrypt: (s: string) => `plain:${s}` }))
vi.mock('@/lib/contacts/dedupe', () => ({ findExistingContact: async () => null }))
vi.mock('@/lib/whatsapp/resolve-conversation', () => ({
  resolveConversationByPhone: vi.fn(async () => ({ conversationId: 'conv1', contactId: 'ct1', contactCreated: false })),
}))

import { handleCallsWebhook, parsePermission } from './calling'
import { resolveConversationByPhone } from '@/lib/whatsapp/resolve-conversation'

type Op = { table: string; op: string; row?: Record<string, unknown>; opts?: unknown; filters: [string, unknown][] }

function fakeDb(existingCall: Record<string, unknown> | null = null) {
  const ops: Op[] = []
  const db = {
    from(table: string) {
      const op: Op = { table, op: 'select', filters: [] }
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (c: string, v: unknown) => {
          op.filters.push([c, v])
          return b
        },
        not: (c: string, _o: string, v: unknown) => {
          op.filters.push([`not:${c}`, v])
          return b
        },
        maybeSingle: async () => {
          if (table === 'whatsapp_config') return { data: { account_id: 'acc1' }, error: null }
          if (table === 'whatsapp_calls') return { data: existingCall, error: null }
          return { data: null, error: null }
        },
        upsert: async (row: Record<string, unknown>, opts: unknown) => {
          ops.push({ table, op: 'upsert', row, opts, filters: [] })
          return { error: null }
        },
        update: (row: Record<string, unknown>) => {
          op.op = 'update'
          op.row = row
          ops.push(op)
          return b
        },
        then: (r: (v: unknown) => void) => r({ error: null }),
      }
      return b
    },
  } as unknown as SupabaseClient
  return { db, ops }
}

const meta = { phone_number_id: 'pn1' }

describe('handleCallsWebhook', () => {
  beforeEach(() => vi.mocked(resolveConversationByPhone).mockClear())

  it('records an incoming call as ringing, linked to the conversation', async () => {
    const { db, ops } = fakeDb()
    await handleCallsWebhook(db, {
      metadata: meta,
      contacts: [{ wa_id: '919800000001', profile: { name: 'Asha' } }],
      calls: [
        {
          id: 'wacid.1',
          from: '919800000001',
          event: 'connect',
          direction: 'USER_INITIATED',
          timestamp: '1760400000',
          session: { sdp_type: 'offer', sdp: 'v=0 offer' },
        },
      ],
    })
    const up = ops.find((o) => o.op === 'upsert')!
    expect(up.row).toMatchObject({
      call_id: 'wacid.1',
      account_id: 'acc1',
      direction: 'inbound',
      status: 'ringing',
      customer_number: '919800000001',
      customer_name: 'Asha',
      conversation_id: 'conv1',
      contact_id: 'ct1',
      sdp_offer: 'v=0 offer',
    })
    expect(up.opts).toMatchObject({ onConflict: 'call_id', ignoreDuplicates: true })
    // New contacts get the WhatsApp profile name; the number is E.164.
    expect(resolveConversationByPhone).toHaveBeenCalledWith(db, 'acc1', '+919800000001', 'Asha')
  })

  it('stores Meta’s SDP answer for a call an agent started', async () => {
    const { db, ops } = fakeDb()
    await handleCallsWebhook(db, {
      metadata: meta,
      calls: [{ id: 'wacid.2', event: 'connect', direction: 'BUSINESS_INITIATED', session: { sdp_type: 'answer', sdp: 'v=0 answer' } }],
    })
    expect(ops[0].row).toMatchObject({ call_id: 'wacid.2', direction: 'outbound', sdp_answer: 'v=0 answer' })
    expect(resolveConversationByPhone).not.toHaveBeenCalled()
  })

  it('marks an unanswered call as missed when it ends', async () => {
    const { db, ops } = fakeDb({ id: 'row1', status: 'ringing', answered_at: null })
    await handleCallsWebhook(db, { metadata: meta, calls: [{ id: 'wacid.3', event: 'terminate', status: ['Completed'] }] })
    expect(ops.find((o) => o.op === 'update')?.row).toMatchObject({ status: 'missed', sdp_offer: null })
  })

  it('records duration for an answered call', async () => {
    const { db, ops } = fakeDb({ id: 'row1', status: 'connected', answered_at: '2026-10-14T10:00:00Z' })
    await handleCallsWebhook(db, {
      metadata: meta,
      calls: [{ id: 'wacid.4', event: 'terminate', status: ['Completed'], duration: 95, end_time: '1760400095' }],
    })
    expect(ops.find((o) => o.op === 'update')?.row).toMatchObject({ status: 'ended', duration_seconds: 95 })
  })

  it('maps call statuses for outbound calls', async () => {
    const { db, ops } = fakeDb()
    await handleCallsWebhook(db, {
      metadata: meta,
      statuses: [
        { id: 'wacid.5', type: 'call', status: 'ACCEPTED' },
        { id: 'wacid.6', type: 'call', status: 'REJECTED' },
      ],
    })
    const updates = ops.filter((o) => o.op === 'update')
    expect(updates[0].row).toMatchObject({ status: 'connected' })
    expect(updates[1].row).toMatchObject({ status: 'rejected' })
  })
})

describe('parsePermission', () => {
  it('reads a temporary permission that allows calling', () => {
    const p = parsePermission({
      permission: { status: 'temporary', expiration_time: 1760500000 },
      actions: [
        { action_name: 'send_call_permission_request', can_perform_action: false },
        { action_name: 'start_call', can_perform_action: true },
      ],
    })
    expect(p).toEqual({ status: 'temporary', expiresAt: new Date(1760500000 * 1000).toISOString(), canCall: true, canRequest: false })
  })

  it('cannot call without permission even if start_call is allowed', () => {
    const p = parsePermission({
      permission: { status: 'no_permission' },
      actions: [
        { action_name: 'send_call_permission_request', can_perform_action: true },
        { action_name: 'start_call', can_perform_action: true },
      ],
    })
    expect(p.canCall).toBe(false)
    expect(p.canRequest).toBe(true)
  })
})

describe('isCallingNotEnabledError', () => {
  it('recognises Meta’s “calling not enabled” error', async () => {
    const { CallingError, isCallingNotEnabledError } = await import('./calling')
    expect(isCallingNotEnabledError(new CallingError('WhatsApp Cloud API calling not enabled for this phone number.', 400))).toBe(true)
    expect(isCallingNotEnabledError(new CallingError('Invalid parameter', 400))).toBe(false)
    expect(isCallingNotEnabledError(new Error('calling not enabled'))).toBe(false)
  })
})

describe('coexistence numbers (Meta #141000)', () => {
  it('recognises the error and explains it in plain words', async () => {
    const { CallingError, callingHelpFor, isCallingNotEnabledError, isCoexistenceCallingError, CALLING_COEXISTENCE_HELP } =
      await import('./calling')
    const err = new CallingError('(#141000) The phone number is not a valid Cloud API number', 400, undefined, 141000)
    expect(isCoexistenceCallingError(err)).toBe(true)
    expect(isCallingNotEnabledError(err)).toBe(true)
    expect(callingHelpFor(err)).toBe(CALLING_COEXISTENCE_HELP)
    expect(CALLING_COEXISTENCE_HELP).toMatch(/WhatsApp Business app/)

    const other = new CallingError('Calling is not enabled for this phone number', 400)
    expect(isCoexistenceCallingError(other)).toBe(false)
    expect(callingHelpFor(other)).not.toBe(CALLING_COEXISTENCE_HELP)
  })
})
