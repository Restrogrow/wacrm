import { beforeEach, describe, expect, it, vi } from 'vitest'

let request: Record<string, unknown> | null = null
const updates: Record<string, unknown>[] = []
const execute = vi.fn()
const notifyUser = vi.fn()

vi.mock('@/lib/auth/platform-admin', () => ({
  requirePlatformAdmin: async () => ({ userId: 'admin1', email: 'admin@repeatgrow.com' }),
}))

vi.mock('@/lib/flows/admin-client', () => ({
  supabaseAdmin: () => ({
    from: () => {
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        maybeSingle: async () => ({ data: request, error: null }),
        update: (row: Record<string, unknown>) => {
          updates.push(row)
          const u = { eq: () => u, then: (r: (v: unknown) => void) => r({ error: null }) }
          return u
        },
      }
      return b
    },
  }),
}))

vi.mock('@/lib/account/deletion', async () => {
  const actual = await vi.importActual<typeof import('@/lib/account/deletion')>('@/lib/account/deletion')
  return {
    DeletionError: actual.DeletionError,
    executeAccountDeletion: (...a: unknown[]) => execute(...a),
    notifyUserOfDecision: (...a: unknown[]) => notifyUser(...a),
  }
})

import { DeletionError } from '@/lib/account/deletion'
import { POST } from './route'

function decide(body: unknown) {
  return POST(new Request('http://localhost/api/admin/deletion-requests/r1', { method: 'POST', body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: 'r1' }),
  })
}

beforeEach(() => {
  request = { id: 'r1', user_id: 'u1', email: 'owner@example.com', status: 'pending' }
  updates.length = 0
  execute.mockReset().mockResolvedValue({ deletedBusiness: true })
  notifyUser.mockReset()
})

describe('POST /api/admin/deletion-requests/[id]', () => {
  it('rejects an unknown action', async () => {
    expect((await decide({ action: 'nuke' })).status).toBe(400)
    expect(execute).not.toHaveBeenCalled()
  })

  it('reject keeps the account and emails the note', async () => {
    const res = await decide({ action: 'reject', note: 'Please clear your dues first' })
    expect(await res.json()).toEqual({ ok: true, status: 'rejected' })
    expect(execute).not.toHaveBeenCalled()
    expect(updates[0]).toMatchObject({ status: 'rejected', decided_by: 'admin1', admin_note: 'Please clear your dues first' })
    expect(notifyUser).toHaveBeenCalledWith('owner@example.com', 'rejected', 'Please clear your dues first')
  })

  it('approve deletes, then clears the stored email and business name', async () => {
    const res = await decide({ action: 'approve' })
    expect(await res.json()).toEqual({ ok: true, status: 'approved', deleted_business: true })
    expect(execute).toHaveBeenCalledWith('u1')
    expect(updates[0]).toMatchObject({ status: 'approved', email: null, business_name: null })
  })

  it('does not mark approved when the deletion is refused', async () => {
    execute.mockRejectedValue(new DeletionError('The business still has 1 teammate.', 409))
    const res = await decide({ action: 'approve' })
    expect(res.status).toBe(409)
    expect(updates).toHaveLength(0)
    expect(notifyUser).not.toHaveBeenCalled()
  })

  it('will not decide a request twice', async () => {
    request = { ...request, status: 'approved' }
    expect((await decide({ action: 'approve' })).status).toBe(409)
    expect(execute).not.toHaveBeenCalled()
  })

  it('404s for an unknown request', async () => {
    request = null
    expect((await decide({ action: 'reject' })).status).toBe(404)
  })
})
