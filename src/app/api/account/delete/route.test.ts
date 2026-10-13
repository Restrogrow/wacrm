import { beforeEach, describe, expect, it, vi } from 'vitest'

// Fake service-role client: profiles count, deletion request lookups/inserts.
let memberCount = 0
let pending: Record<string, unknown> | null = null
let tableMissing = false
const inserted: Record<string, unknown>[] = []
const updates: Record<string, unknown>[] = []
const deleteUser = vi.fn()
const rpc = vi.fn()
const notifyAdmins = vi.fn()
let role: 'owner' | 'admin' | 'agent' = 'owner'

vi.mock('@/lib/auth/account', () => ({
  getCurrentAccount: async () => ({
    userId: 'u1',
    accountId: 'acc1',
    role,
    account: { id: 'acc1', name: 'Priya Stores' },
    supabase: {
      auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'Owner@Example.com' } } }) },
    },
  }),
  toErrorResponse: (err: unknown) => new Response(String(err), { status: 500 }),
}))

vi.mock('@/lib/flows/admin-client', () => ({
  supabaseAdmin: () => ({
    rpc: (...a: unknown[]) => rpc(...a),
    auth: { admin: { deleteUser: (...a: unknown[]) => deleteUser(...a) } },
    from: (table: string) => {
      const missing = { data: null, error: { code: '42P01', message: 'relation does not exist' } }
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        neq: async () => ({ count: memberCount }),
        maybeSingle: async () => (tableMissing ? missing : { data: pending, error: null }),
        insert: (row: Record<string, unknown>) => {
          inserted.push(row)
          return {
            select: () => ({
              single: async () => ({ data: { id: 'r1', requested_at: '2026-10-14T00:00:00Z', reason: row.reason }, error: null }),
            }),
          }
        },
        update: (row: Record<string, unknown>) => {
          updates.push({ table, ...row })
          const u = { eq: () => u, then: (r: (v: unknown) => void) => r(tableMissing ? missing : { error: null }) }
          return u
        },
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

vi.mock('@/lib/account/deletion', async () => {
  const actual = await vi.importActual<typeof import('@/lib/account/deletion')>('@/lib/account/deletion')
  return {
    isMissingObject: actual.isMissingObject,
    otherMemberCount: async () => memberCount,
    notifyAdminsOfRequest: (...a: unknown[]) => notifyAdmins(...a),
  }
})

import { DELETE, GET, POST } from './route'

function post(body: unknown) {
  return POST(new Request('http://localhost/api/account/delete', { method: 'POST', body: JSON.stringify(body) }))
}

beforeEach(() => {
  memberCount = 0
  pending = null
  tableMissing = false
  role = 'owner'
  inserted.length = 0
  updates.length = 0
  deleteUser.mockReset()
  rpc.mockReset()
  notifyAdmins.mockReset()
})

describe('GET /api/account/delete', () => {
  it('blocks owners who still have teammates', async () => {
    memberCount = 2
    expect(await (await GET()).json()).toMatchObject({ is_owner: true, other_members: 2, can_delete: false })
  })

  it('shows an open request', async () => {
    pending = { id: 'r1', requested_at: '2026-10-14T00:00:00Z', reason: null }
    expect(await (await GET()).json()).toMatchObject({ pending_request: { id: 'r1' }, available: true })
  })

  it('reports when the migration has not been run', async () => {
    tableMissing = true
    expect(await (await GET()).json()).toMatchObject({ available: false, can_delete: false })
  })
})

describe('POST /api/account/delete', () => {
  it('requires the email to be typed exactly (case-insensitive)', async () => {
    const res = await post({ confirm: 'wrong@example.com' })
    expect(res.status).toBe(400)
    expect(inserted).toHaveLength(0)
  })

  it('refuses an owner with teammates', async () => {
    memberCount = 1
    expect((await post({ confirm: 'owner@example.com' })).status).toBe(409)
    expect(inserted).toHaveLength(0)
  })

  it('only files a request — never deletes anything', async () => {
    const res = await post({ confirm: ' owner@example.com ', reason: 'Closing the shop' })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, pending_request: { id: 'r1' } })
    expect(inserted[0]).toMatchObject({ user_id: 'u1', account_id: 'acc1', is_owner: true, reason: 'Closing the shop' })
    expect(rpc).not.toHaveBeenCalled()
    expect(deleteUser).not.toHaveBeenCalled()
    expect(notifyAdmins).toHaveBeenCalledOnce()
  })

  it('returns the existing request instead of filing a second one', async () => {
    pending = { id: 'r0', requested_at: '2026-10-13T00:00:00Z', reason: null }
    const res = await post({ confirm: 'owner@example.com' })
    expect(await res.json()).toMatchObject({ pending_request: { id: 'r0' } })
    expect(inserted).toHaveLength(0)
  })

  it('says so when the migration has not been run', async () => {
    tableMissing = true
    expect((await post({ confirm: 'owner@example.com' })).status).toBe(503)
  })
})

describe('DELETE /api/account/delete', () => {
  it('cancels the open request', async () => {
    const res = await DELETE()
    expect(res.status).toBe(200)
    expect(updates[0]).toMatchObject({ table: 'account_deletion_requests', status: 'cancelled' })
  })
})
