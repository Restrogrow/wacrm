import { beforeEach, describe, expect, it, vi } from 'vitest'

let call: Record<string, unknown> | null = null
let claimSucceeds = true
const updates: Record<string, unknown>[] = []
const callAction = vi.fn()

vi.mock('@/lib/whatsapp/calling-server', async () => {
  const { NextResponse } = await import('next/server')
  return {
    requireCallingAgent: async () => ({ userId: 'agent1', accountId: 'acc1', role: 'agent' }),
    callingErrorResponse: (err: unknown) =>
      NextResponse.json({ error: err instanceof Error ? err.message : 'error' }, { status: 500 }),
  }
})

vi.mock('@/lib/whatsapp/calling', () => ({
  loadCallingConfig: async () => ({ accountId: 'acc1', phoneNumberId: 'pn1', accessToken: 't' }),
  callAction: (...a: unknown[]) => callAction(...a),
}))

vi.mock('@/lib/flows/admin-client', () => ({
  supabaseAdmin: () => ({
    from: () => {
      let isUpdate = false
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        not: () => b,
        update: (row: Record<string, unknown>) => {
          isUpdate = true
          updates.push(row)
          return b
        },
        maybeSingle: async () => {
          if (isUpdate) return { data: claimSucceeds ? { id: 'row1' } : null, error: null }
          return { data: call, error: null }
        },
        then: (r: (v: unknown) => void) => r({ error: null }),
      }
      return b
    },
  }),
}))

import { POST } from './route'

function act(body: unknown) {
  return POST(new Request('http://localhost/api/whatsapp/calls/row1', { method: 'POST', body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: 'row1' }),
  })
}

beforeEach(() => {
  call = { id: 'row1', call_id: 'wacid.1', direction: 'inbound', status: 'ringing' }
  claimSucceeds = true
  updates.length = 0
  callAction.mockReset().mockResolvedValue(undefined)
})

describe('POST /api/whatsapp/calls/[id]', () => {
  it('answers: claims the call, then pre_accept and accept with the same SDP', async () => {
    const res = await act({ action: 'answer', sdp: 'v=0 answer' })
    expect(res.status).toBe(200)
    expect(updates[0]).toMatchObject({ status: 'answering', answered_by: 'agent1' })
    expect(callAction.mock.calls.map((c) => c[2])).toEqual(['pre_accept', 'accept'])
    expect(callAction.mock.calls[1][3]).toBe('v=0 answer')
    expect(updates.at(-1)).toMatchObject({ status: 'connected' })
  })

  it('lets only one agent answer', async () => {
    claimSucceeds = false
    const res = await act({ action: 'answer', sdp: 'v=0 answer' })
    expect(res.status).toBe(409)
    expect(callAction).not.toHaveBeenCalled()
  })

  it('marks the call failed if WhatsApp refuses the answer', async () => {
    callAction.mockRejectedValueOnce(new Error('expired'))
    const res = await act({ action: 'answer', sdp: 'v=0 answer' })
    expect(res.status).toBe(500)
    expect(updates.at(-1)).toMatchObject({ status: 'failed' })
  })

  it('requires an SDP to answer', async () => {
    expect((await act({ action: 'answer' })).status).toBe(400)
  })

  it('declines a ringing call', async () => {
    await act({ action: 'reject' })
    expect(callAction).toHaveBeenCalledWith(expect.anything(), 'wacid.1', 'reject')
    expect(updates[0]).toMatchObject({ status: 'rejected' })
  })

  it('hangs up a connected call', async () => {
    call = { ...call, status: 'connected' }
    await act({ action: 'hangup' })
    expect(callAction).toHaveBeenCalledWith(expect.anything(), 'wacid.1', 'terminate')
    expect(updates[0]).toMatchObject({ status: 'ended' })
  })

  it('404s for a call in another account', async () => {
    call = null
    expect((await act({ action: 'hangup' })).status).toBe(404)
  })
})
