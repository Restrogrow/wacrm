import { describe, expect, it } from 'vitest'
import type { SupabaseClient, User } from '@supabase/supabase-js'

import { BUSINESS_TABLES, sanitizeRow, streamAccountExport, type ExportContext } from './data-export'

describe('sanitizeRow', () => {
  it('drops token, secret, key and password columns', () => {
    const row = sanitizeRow({
      id: '1',
      phone_number_id: '123',
      access_token: 'EAAG...',
      verify_token: 'v',
      webhook_secret: 's',
      signing_key: 'k',
      key_hash: 'h',
      password: 'p',
      encrypted_value: 'e',
      refresh_token: 'r',
      name: 'Main number',
    })
    expect(row).toEqual({ id: '1', phone_number_id: '123', name: 'Main number' })
  })
})

type Rows = Record<string, Record<string, unknown>[]>

/** Minimal fake of the supabase-js query builder used by the export. */
function fakeClient(rows: Rows, failing: string[] = []): SupabaseClient {
  return {
    from(table: string) {
      const filters: [string, unknown][] = []
      let range: [number, number] = [0, Infinity]
      const builder = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          filters.push([col, val])
          return builder
        },
        order: () => builder,
        limit: () => builder,
        range: (from: number, to: number) => {
          range = [from, to]
          return builder
        },
        maybeSingle: async () => ({ data: (rows[table] ?? [])[0] ?? null, error: null }),
        then(resolve: (v: unknown) => void) {
          if (failing.includes(table)) return resolve({ data: null, error: { message: 'denied' } })
          const all = (rows[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v))
          resolve({ data: all.slice(range[0], range[1] + 1), error: null })
        },
      }
      return builder
    },
  } as unknown as SupabaseClient
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text()
}

const user = {
  id: 'u1',
  email: 'owner@example.com',
  created_at: '2026-01-01T00:00:00Z',
  app_metadata: { providers: ['google'] },
  user_metadata: { full_name: 'Priya' },
} as unknown as User

function ctx(role: ExportContext['role'], rows: Rows, failing: string[] = []): ExportContext {
  return {
    supabase: fakeClient(rows, failing),
    admin: fakeClient(rows),
    user,
    accountId: 'acc1',
    accountName: 'Priya Stores',
    role,
  }
}

describe('streamAccountExport', () => {
  const rows: Rows = {
    profiles: [{ user_id: 'u1', account_id: 'acc1', full_name: 'Priya', email: 'owner@example.com', account_role: 'owner' }],
    notifications: [{ id: 'n1', user_id: 'u1', title: 'New chat' }],
    contacts: [
      { id: 'c1', name: 'Asha', phone: '919800000001' },
      { id: 'c2', name: 'Ravi', phone: '919800000002' },
    ],
    whatsapp_config: [{ id: 'w1', phone_number_id: '123', access_token: 'SECRET' }],
    shopify_stores: [
      { id: 's1', account_id: 'acc1', shop_domain: 'a.myshopify.com', access_token: 'SECRET' },
      { id: 's2', account_id: 'other', shop_domain: 'b.myshopify.com' },
    ],
  }

  it('produces valid JSON with personal and business data for owners', async () => {
    const json = JSON.parse(await readAll(streamAccountExport(ctx('owner', rows))))
    expect(json.format).toBe('repeat-grow-export/1')
    expect(json.you.user.email).toBe('owner@example.com')
    expect(json.you.user.sign_in_methods).toEqual(['google'])
    expect(json.you.notifications).toHaveLength(1)
    expect(json.account).toEqual({ id: 'acc1', name: 'Priya Stores', your_role: 'owner' })
    expect(json.business.contacts).toHaveLength(2)
    expect(json.business.members).toHaveLength(1)
  })

  it('never includes secrets', async () => {
    const text = await readAll(streamAccountExport(ctx('owner', rows)))
    expect(text).not.toContain('SECRET')
    expect(JSON.parse(text).business.whatsapp_config[0]).toEqual({ id: 'w1', phone_number_id: '123' })
  })

  it('reads integration tables only for the caller’s account', async () => {
    const json = JSON.parse(await readAll(streamAccountExport(ctx('admin', rows))))
    expect(json.business.shopify_stores.map((s: { id: string }) => s.id)).toEqual(['s1'])
  })

  it('gives agents and viewers only their personal data', async () => {
    const json = JSON.parse(await readAll(streamAccountExport(ctx('agent', rows))))
    expect(json.you.user.id).toBe('u1')
    expect(json.business).toBeUndefined()
  })

  it('lists unreadable tables as skipped instead of failing', async () => {
    const json = JSON.parse(await readAll(streamAccountExport(ctx('owner', rows, ['messages']))))
    expect(json.skipped).toContain('messages')
    expect(json.business.messages).toBeUndefined()
    expect(json.business.contacts).toHaveLength(2)
  })

  it('pages through large tables', async () => {
    const many = Array.from({ length: 2500 }, (_, i) => ({ id: `m${i}`, content_text: 'hi' }))
    const json = JSON.parse(await readAll(streamAccountExport(ctx('owner', { ...rows, messages: many }))))
    expect(json.business.messages).toHaveLength(2500)
  })

  it('exports every business table it knows about once', () => {
    const names = BUSINESS_TABLES.map((t) => t.table)
    expect(new Set(names).size).toBe(names.length)
  })
})
