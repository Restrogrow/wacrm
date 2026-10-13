// ============================================================
// "Download my data" — DPDP Act / GDPR data portability.
//
// Streams one JSON file:
//
//   {
//     "format": "repeat-grow-export/1",
//     "exported_at": "...",
//     "you":      { auth user, profile, notifications },
//     "account":  { id, name, your_role },
//     "business": { contacts: [...], conversations: [...], ... },   // admins+
//     "skipped":  [ tables that could not be read ]
//   }
//
// Every member gets their personal data. Owners and admins also get
// the business's data. Tables are read page by page and written
// straight to the response, so large inboxes don't sit in memory.
//
// Business tables are read with the caller's own (RLS-scoped) client,
// so an export can never include another account's rows. Integration
// tables are service-role only, so they're read with the admin client
// filtered to the caller's account_id.
//
// Secrets are never exported: any column whose name looks like a
// token, secret, key hash or password is dropped (see sanitizeRow).
// ============================================================

import type { SupabaseClient, User } from '@supabase/supabase-js'

import { hasMinRole, type AccountRole } from '@/lib/auth/roles'

export const EXPORT_FORMAT = 'repeat-grow-export/1'

const PAGE_SIZE = 1000

/** Column names that must never leave the server. */
const SECRET_COLUMN = /(token|secret|signing_key|key_hash|password|encrypted|private_key|api_key|refresh)/i

/** Drop secret-looking columns from a row (shallow). */
export function sanitizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    if (SECRET_COLUMN.test(key)) continue
    out[key] = value
  }
  return out
}

interface TableSpec {
  table: string
  /** Column used for stable paging. */
  orderBy: string
  /** Read with the service-role client, filtered by account_id. */
  serviceRole?: boolean
}

/** Business data included for owners and admins. */
export const BUSINESS_TABLES: TableSpec[] = [
  { table: 'contacts', orderBy: 'id' },
  { table: 'contact_tags', orderBy: 'contact_id' },
  { table: 'tags', orderBy: 'id' },
  { table: 'custom_fields', orderBy: 'id' },
  { table: 'contact_custom_values', orderBy: 'id' },
  { table: 'contact_notes', orderBy: 'id' },
  { table: 'conversations', orderBy: 'id' },
  { table: 'messages', orderBy: 'id' },
  { table: 'message_reactions', orderBy: 'id' },
  { table: 'pipelines', orderBy: 'id' },
  { table: 'pipeline_stages', orderBy: 'id' },
  { table: 'deals', orderBy: 'id' },
  { table: 'broadcasts', orderBy: 'id' },
  { table: 'broadcast_recipients', orderBy: 'id' },
  { table: 'message_templates', orderBy: 'id' },
  { table: 'saved_replies', orderBy: 'id' },
  { table: 'automations', orderBy: 'id' },
  { table: 'automation_steps', orderBy: 'id' },
  { table: 'flows', orderBy: 'id' },
  { table: 'flow_nodes', orderBy: 'id' },
  { table: 'ai_chatbot_settings', orderBy: 'account_id' },
  { table: 'whatsapp_config', orderBy: 'id' },
  { table: 'webhook_endpoints', orderBy: 'id' },
  { table: 'api_keys', orderBy: 'id' },
  { table: 'shopify_stores', orderBy: 'id', serviceRole: true },
  { table: 'shopify_event_rules', orderBy: 'id', serviceRole: true },
  { table: 'shopify_orders', orderBy: 'id', serviceRole: true },
  { table: 'shopify_checkouts', orderBy: 'id', serviceRole: true },
  { table: 'calendly_connections', orderBy: 'id', serviceRole: true },
  { table: 'calendly_event_rules', orderBy: 'id', serviceRole: true },
  { table: 'calendly_bookings', orderBy: 'id', serviceRole: true },
]

export interface ExportContext {
  /** RLS-scoped client for the caller. */
  supabase: SupabaseClient
  /** Service-role client (integration tables only, always account-filtered). */
  admin: SupabaseClient
  user: User
  accountId: string
  accountName: string
  role: AccountRole
}

export function exportFileName(now: Date = new Date()): string {
  return `repeat-grow-data-${now.toISOString().slice(0, 10)}.json`
}

/** Build the streaming JSON body. */
export function streamAccountExport(ctx: ExportContext): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const skipped: string[] = []

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (s: string) => controller.enqueue(encoder.encode(s))
      try {
        write(`{"format":${JSON.stringify(EXPORT_FORMAT)},"exported_at":${JSON.stringify(new Date().toISOString())}`)

        // ---- You ----
        const { data: profile } = await ctx.supabase
          .from('profiles')
          .select('*')
          .eq('user_id', ctx.user.id)
          .maybeSingle()
        const { data: notifications } = await ctx.supabase
          .from('notifications')
          .select('*')
          .eq('user_id', ctx.user.id)
          .order('created_at', { ascending: false })
          .limit(5000)

        const you = {
          user: {
            id: ctx.user.id,
            email: ctx.user.email ?? null,
            phone: ctx.user.phone || null,
            created_at: ctx.user.created_at,
            last_sign_in_at: ctx.user.last_sign_in_at ?? null,
            sign_in_methods: (ctx.user.app_metadata?.providers as string[] | undefined) ?? [],
            name: (ctx.user.user_metadata?.full_name as string | undefined) ?? null,
          },
          profile: profile ? sanitizeRow(profile) : null,
          notifications: (notifications ?? []).map(sanitizeRow),
        }
        write(`,"you":${JSON.stringify(you)}`)
        write(`,"account":${JSON.stringify({ id: ctx.accountId, name: ctx.accountName, your_role: ctx.role })}`)

        // ---- Business (owners and admins) ----
        if (hasMinRole(ctx.role, 'admin')) {
          const { data: members } = await ctx.supabase
            .from('profiles')
            .select('user_id, full_name, email, account_role, created_at')
            .eq('account_id', ctx.accountId)
          write(`,"business":{"members":${JSON.stringify(members ?? [])}`)

          for (const spec of BUSINESS_TABLES) {
            await writeTable(spec, ctx, write, skipped)
          }
          write('}')
        }

        write(`,"skipped":${JSON.stringify(skipped)}}`)
        controller.close()
      } catch (err) {
        controller.error(err)
      }
    },
  })
}

async function writeTable(
  spec: TableSpec,
  ctx: ExportContext,
  write: (s: string) => void,
  skipped: string[],
) {
  const client = spec.serviceRole ? ctx.admin : ctx.supabase
  let offset = 0
  let first = true
  let opened = false

  for (;;) {
    let query = client.from(spec.table).select('*')
    if (spec.serviceRole) query = query.eq('account_id', ctx.accountId)
    const { data, error } = await query
      .order(spec.orderBy, { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) {
      // Missing table (older install) or no read access: note it and
      // move on rather than failing the whole export.
      if (!opened) {
        skipped.push(spec.table)
        return
      }
      break
    }

    if (!opened) {
      write(`,${JSON.stringify(spec.table)}:[`)
      opened = true
    }
    for (const row of data ?? []) {
      write((first ? '' : ',') + JSON.stringify(sanitizeRow(row as Record<string, unknown>)))
      first = false
    }
    if (!data || data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  if (opened) write(']')
}
