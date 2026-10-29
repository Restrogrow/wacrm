// Pure parts of the audit log: action names, the metadata sanitiser and the
// row builder. No I/O, so it's unit-testable and safe to import anywhere.

/** Every action that can be written. Keep names dotted: <area>.<what_happened>. */
export const AUDIT_ACTIONS = [
  'member.invited',
  'member.invite_revoked',
  'member.role_changed',
  'member.removed',
  'member.password_reset',
  'ownership.transferred',
  'api_key.created',
  'api_key.revoked',
  'whatsapp.config_changed',
  'whatsapp.config_removed',
  'integration.connected',
  'integration.disconnected',
  'plan.changed',
  'contact.bulk_deleted',
  'account.deletion_requested',
] as const

export type AuditAction = (typeof AUDIT_ACTIONS)[number]

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  'member.invited': 'Invited a team member',
  'member.invite_revoked': 'Cancelled an invitation',
  'member.role_changed': 'Changed a member role',
  'member.removed': 'Removed a team member',
  'member.password_reset': 'Password reset by Repeat Grow support',
  'ownership.transferred': 'Transferred ownership',
  'api_key.created': 'Created an API key',
  'api_key.revoked': 'Revoked an API key',
  'whatsapp.config_changed': 'Changed WhatsApp settings',
  'whatsapp.config_removed': 'Removed WhatsApp connection',
  'integration.connected': 'Connected an integration',
  'integration.disconnected': 'Disconnected an integration',
  'plan.changed': 'Plan changed',
  'contact.bulk_deleted': 'Deleted contacts in bulk',
  'account.deletion_requested': 'Requested account deletion',
}

export function auditActionLabel(action: string): string {
  return (AUDIT_ACTION_LABELS as Record<string, string>)[action] ?? action
}

export interface AuditEventInput {
  /** Account the event belongs to; null for platform-level events. */
  accountId: string | null
  actorUserId: string | null
  action: AuditAction
  targetType?: string | null
  targetId?: string | null
  metadata?: Record<string, unknown>
  ip?: string | null
}

export interface AuditRow {
  account_id: string | null
  actor_user_id: string | null
  action: string
  target_type: string | null
  target_id: string | null
  metadata: Record<string, unknown>
  ip: string | null
}

/** Keys whose values must never reach the log, whatever the caller passes. */
const SENSITIVE_KEY =
  /secret|token|password|passwd|authorization|cookie|api[_-]?key|key[_-]?hash|private|credential|signature|bearer|code[_-]?verifier|(^|[_\-.])(otp|pin)($|[_\-.])/i

const MAX_STRING = 300
const MAX_DEPTH = 3
const MAX_KEYS = 25
const MAX_ARRAY = 20

function sanitizeValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean') return value
  if (value instanceof Date) return value.toISOString()
  if (depth >= MAX_DEPTH) return '[truncated]'
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY).map((v) => sanitizeValue(v, depth + 1))
  if (typeof value === 'object') return sanitizeMetadata(value as Record<string, unknown>, depth + 1)
  return String(value)
}

/**
 * Make caller-supplied metadata safe to store: redact secret-looking keys,
 * cap string length / depth / key count, and drop functions and symbols.
 */
export function sanitizeMetadata(
  input: Record<string, unknown> | undefined | null,
  depth = 0,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!input || typeof input !== 'object') return out
  let n = 0
  for (const [key, value] of Object.entries(input)) {
    if (n >= MAX_KEYS) break
    if (typeof value === 'function' || typeof value === 'symbol') continue
    out[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : sanitizeValue(value, depth)
    n++
  }
  return out
}

export function buildAuditRow(event: AuditEventInput): AuditRow {
  return {
    account_id: event.accountId,
    actor_user_id: event.actorUserId,
    action: event.action,
    target_type: event.targetType ?? null,
    target_id: event.targetId ? String(event.targetId).slice(0, 200) : null,
    metadata: sanitizeMetadata(event.metadata),
    ip: event.ip ? String(event.ip).slice(0, 64) : null,
  }
}
