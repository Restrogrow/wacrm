import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
const deleteUser = vi.fn()
const signOut = vi.fn()
let memberCount = 0
let role: 'owner' | 'admin' | 'agent' = 'owner'

vi.mock('@/lib/auth/account', () => ({
  getCurrentAccount: async () => ({
    userId: 'u1',
    accountId: 'acc1',
    role,
    account: { id: 'acc1', name: 'Priya Stores' },
    supabase: {
      auth: {
        getUser: async () => ({ data: { user: { id: 'u1', email: 'Owner@Example.com' } } }),
        signOut: (...a: unknown[]) => signOut(...a),
      },
    },
  }),
  toErrorResponse: (err: unknown) => new Response(String(err), { status: 500 }),
}))

vi.mock('@/lib/flows/admin-client', () => ({
  supabaseAdmin: () => ({
    rpc: (...a: unknown[]) => rpc(...a),
    auth: { admin: { deleteUser: (...a: unknown[]) => deleteUser(...a) } },
    from: () => {
      const b = {
        select: () => b,
        eq: () => b,
        neq: async () => ({ count: memberCount }),
        maybeSingle: async () => ({ data: null }),
      }
      return b
    },
  }),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: () => ({ success: true }),
  rateLimitResponse: () => new Response('limited', { status: 429 }),
  RATE_LIMITS: { accountDelete: {}, dataExport: {} },
}))

vi.mock('@/lib/calendly/api', () => ({
  deleteWebhookSubscription: vi.fn(),
  friendlyCalendlyError: () => '',
}))

import { GET, POST } from './route'

function post(body: unknown) {
  return POST(
    new Request('http://localhost/api/account/delete', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  )
}

beforeEach(() => {
  memberCount = 0
  role = 'owner'
  rpc.mockReset().mockResolvedValue({ data: {}, error: null })
  deleteUser.mockReset().mockResolvedValue({ error: null })
  signOut.mockReset().mockResolvedValue({})
})

describe('GET /api/account/delete', () => {
  it('blocks owners who still have teammates', async () => {
    memberCount = 2
    const body = await (await GET()).json()
    expect(body).toMatchObject({ is_owner: true, other_members: 2, can_delete: false })
  })

  it('lets teammates delete', async () => {
    role = 'agent'
    const body = await (await GET()).json()
    expect(body).toMatchObject({ is_owner: false, can_delete: true, confirm_with: 'Owner@Example.com' })
  })
})

describe('POST /api/account/delete', () => {
  it('requires the email to be typed exactly (case-insensitive)', async () => {
    const res = await post({ confirm: 'wrong@example.com' })
    expect(res.status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
    expect(deleteUser).not.toHaveBeenCalled()
  })

  it('refuses an owner with teammates', async () => {
    memberCount = 1
    const res = await post({ confirm: 'owner@example.com' })
    expect(res.status).toBe(409)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('prepares the data, then deletes the login', async () => {
    const res = await post({ confirm: ' owner@example.com ' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, deleted_business: true })
    expect(rpc).toHaveBeenCalledWith('prepare_user_deletion', { p_user_id: 'u1' })
    expect(deleteUser).toHaveBeenCalledWith('u1')
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(deleteUser.mock.invocationCallOrder[0])
  })

  it('does not delete the login when preparing fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'boom' } })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await post({ confirm: 'owner@example.com' })
    errSpy.mockRestore()
    expect(res.status).toBe(500)
    expect(deleteUser).not.toHaveBeenCalled()
  })

  it('says so when the migration has not been run', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.prepare_user_deletion' } })
    const res = await post({ confirm: 'owner@example.com' })
    expect(res.status).toBe(503)
    expect(deleteUser).not.toHaveBeenCalled()
  })

  it('reports teammates deleting as not deleting the business', async () => {
    role = 'agent'
    const res = await post({ confirm: 'owner@example.com' })
    expect(await res.json()).toEqual({ ok: true, deleted_business: false })
  })
})
