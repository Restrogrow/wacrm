import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buildAuditRow, sanitizeMetadata, auditActionLabel } from './audit-core'

// Plain functions (not vi.fn) so a deliberately thrown error is just an error
// our code must swallow, not something the test runner tracks.
let behaviour: 'ok' | 'db-error' | 'throw' = 'ok'
const calls: Array<Record<string, unknown>> = []
vi.mock('@/lib/flows/admin-client', () => ({
  supabaseAdmin: () => ({
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        calls.push(row)
        if (behaviour === 'throw') throw new Error('network down')
        if (behaviour === 'db-error') return { error: { message: 'relation "audit_log" does not exist' } }
        return { error: null }
      },
    }),
  }),
}))

import { recordAudit } from './audit'

beforeEach(() => {
  behaviour = 'ok'
  calls.length = 0
})

describe('sanitizeMetadata', () => {
  it('redacts secret-looking keys at any depth', () => {
    const out = sanitizeMetadata({
      name: 'Zapier key',
      api_key: 'rg_live_123',
      access_token: 'EAAB...',
      nested: { password: 'hunter2', webhookSecret: 'abc', ok: 'fine' },
      Authorization: 'Bearer x',
    })
    expect(out.name).toBe('Zapier key')
    expect(out.api_key).toBe('[redacted]')
    expect(out.access_token).toBe('[redacted]')
    expect(out.Authorization).toBe('[redacted]')
    expect(out.nested).toEqual({ password: '[redacted]', webhookSecret: '[redacted]', ok: 'fine' })
    expect(JSON.stringify(out)).not.toMatch(/rg_live_123|EAAB|hunter2/)
  })

  it('caps string length, depth and key count', () => {
    const long = 'x'.repeat(1000)
    const out = sanitizeMetadata({ long, deep: { a: { b: { c: { d: 1 } } } } })
    expect((out.long as string).length).toBeLessThan(400)
    expect(JSON.stringify(out.deep)).toContain('[truncated]')

    const many: Record<string, number> = {}
    for (let i = 0; i < 100; i++) many[`k${i}`] = i
    expect(Object.keys(sanitizeMetadata(many)).length).toBe(25)
  })

  it('drops functions and tolerates null input', () => {
    expect(sanitizeMetadata({ f: () => 1, ok: true })).toEqual({ ok: true })
    expect(sanitizeMetadata(null)).toEqual({})
    expect(sanitizeMetadata(undefined)).toEqual({})
  })
})

describe('buildAuditRow', () => {
  it('maps fields and sanitises metadata', () => {
    const row = buildAuditRow({
      accountId: 'a1',
      actorUserId: 'u1',
      action: 'api_key.created',
      targetType: 'api_key',
      targetId: 'k1',
      metadata: { name: 'x', key_hash: 'zzz' },
      ip: '1.2.3.4',
    })
    expect(row).toMatchObject({ account_id: 'a1', actor_user_id: 'u1', action: 'api_key.created', ip: '1.2.3.4' })
    expect(row.metadata.key_hash).toBe('[redacted]')
  })
})

describe('recordAudit (failure-safe)', () => {
  it('inserts a row on success', async () => {
    await recordAudit({ accountId: 'a1', actorUserId: 'u1', action: 'member.removed' })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ action: 'member.removed' })
  })

  it('does not throw when the insert returns an error (e.g. migration missing)', async () => {
    behaviour = 'db-error'
    await expect(recordAudit({ accountId: 'a1', actorUserId: 'u1', action: 'member.removed' })).resolves.toBeUndefined()
  })

  it('does not throw when the client itself throws', async () => {
    behaviour = 'throw'
    await expect(recordAudit({ accountId: 'a1', actorUserId: 'u1', action: 'plan.changed' })).resolves.toBeUndefined()
  })

  it('takes the IP from the request without trusting forged headers', async () => {
    const req = new Request('https://x', { headers: { 'x-forwarded-for': '9.9.9.9, 203.0.113.5' } })
    await recordAudit({ accountId: 'a1', actorUserId: 'u1', action: 'plan.changed' }, req)
    expect(calls[0].ip).toBe('203.0.113.5')
  })
})

describe('auditActionLabel', () => {
  it('falls back to the raw action for unknown values', () => {
    expect(auditActionLabel('member.removed')).toBe('Removed a team member')
    expect(auditActionLabel('something.new')).toBe('something.new')
  })
})
