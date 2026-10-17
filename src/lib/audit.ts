// Server-side audit writer. Call after a sensitive action has succeeded:
//
//   await recordAudit({ accountId, actorUserId: userId, action: 'api_key.created',
//                       targetType: 'api_key', targetId: id, metadata: { name } }, request)
//
// Failure-safe by design: it never throws and never rejects, so a problem
// with the audit table (missing migration, database blip) can never break
// the user's action. Failures are logged and swallowed.

import { supabaseAdmin } from '@/lib/flows/admin-client'
import { getClientIp } from '@/lib/rate-limit'
import { buildAuditRow, type AuditEventInput } from '@/lib/audit-core'

export async function recordAudit(event: AuditEventInput, request?: Request): Promise<void> {
  try {
    const ip = event.ip ?? (request ? getClientIp(request) : null)
    const row = buildAuditRow({ ...event, ip: ip === 'unknown' ? null : ip })
    const { error } = await supabaseAdmin().from('audit_log').insert(row)
    if (error) console.error('[audit] insert failed:', error.message)
  } catch (err) {
    console.error('[audit] unexpected failure:', err instanceof Error ? err.message : err)
  }
}
