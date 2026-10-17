import { NextResponse } from 'next/server'

import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { auditActionLabel } from '@/lib/audit-core'
import { toCsv } from '@/lib/reports/csv'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

const PAGE_SIZE = 25
const MAX_PAGE_SIZE = 100
const CSV_MAX_ROWS = 5000

interface Row {
  id: string
  actor_user_id: string | null
  action: string
  target_type: string | null
  target_id: string | null
  metadata: Record<string, unknown>
  ip: string | null
  created_at: string
}

/**
 * GET /api/account/audit-log — owners and admins only.
 *   ?action=member.removed  ?actor=<user id>  ?from=YYYY-MM-DD  ?to=YYYY-MM-DD
 *   ?page=1  ?pageSize=25   ?format=csv  (CSV: newest first, up to 5000 rows)
 * Reads through the caller's own session, so RLS (admin+ of this account)
 * is the real gate; the role check just gives a clean 403.
 */
export async function GET(request: Request) {
  try {
    const ctx = await requireRole('admin')
    const limit = checkRateLimit(`audit-log:${ctx.userId}`, { limit: 60, windowMs: 60_000 })
    if (!limit.success) return rateLimitResponse(limit)

    const url = new URL(request.url)
    const action = url.searchParams.get('action')?.slice(0, 80) || null
    const actor = url.searchParams.get('actor')
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const csv = url.searchParams.get('format') === 'csv'
    const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1)
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number.parseInt(url.searchParams.get('pageSize') ?? String(PAGE_SIZE), 10) || PAGE_SIZE),
    )

    const isDate = (v: string | null) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v)
    const isUuid = (v: string | null) => !!v && /^[0-9a-f-]{36}$/i.test(v)

    let query = ctx.supabase
      .from('audit_log')
      .select('id, actor_user_id, action, target_type, target_id, metadata, ip, created_at', { count: 'exact' })
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: false })

    if (action) query = query.eq('action', action)
    if (isUuid(actor)) query = query.eq('actor_user_id', actor)
    if (isDate(from)) query = query.gte('created_at', `${from}T00:00:00Z`)
    if (isDate(to)) query = query.lt('created_at', new Date(Date.parse(`${to}T00:00:00Z`) + 86_400_000).toISOString())

    query = csv ? query.range(0, CSV_MAX_ROWS - 1) : query.range((page - 1) * pageSize, page * pageSize - 1)

    const { data, error, count } = await query
    if (error) {
      console.error('[audit-log] query failed:', error.message)
      return NextResponse.json(
        { error: 'The activity log is not available yet. Ask your administrator to apply migration 070.' },
        { status: 503 },
      )
    }

    const rows = (data ?? []) as Row[]
    const actorIds = [...new Set(rows.map((r) => r.actor_user_id).filter((v): v is string => !!v))]
    const names = new Map<string, string>()
    if (actorIds.length) {
      const { data: profiles } = await ctx.supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .eq('account_id', ctx.accountId)
        .in('user_id', actorIds)
      for (const p of profiles ?? []) {
        names.set(p.user_id as string, ((p.full_name as string) || (p.email as string) || 'Unknown').trim())
      }
    }
    const withNames = rows.map((r) => ({
      ...r,
      actor_name: r.actor_user_id ? (names.get(r.actor_user_id) ?? 'Former member') : 'System',
      action_label: auditActionLabel(r.action),
    }))

    if (csv) {
      const body = toCsv(
        [
          { header: 'When (UTC)', value: (r: (typeof withNames)[number]) => r.created_at },
          { header: 'Who', value: (r) => r.actor_name },
          { header: 'Action', value: (r) => r.action_label },
          { header: 'Action code', value: (r) => r.action },
          { header: 'Target', value: (r) => [r.target_type, r.target_id].filter(Boolean).join(' ') },
          { header: 'Details', value: (r) => JSON.stringify(r.metadata ?? {}) },
          { header: 'IP', value: (r) => r.ip },
        ],
        withNames,
      )
      return new NextResponse(`\uFEFF${body}`, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="activity-log.csv"',
          'Cache-Control': 'no-store',
        },
      })
    }

    return NextResponse.json({ rows: withNames, total: count ?? withNames.length, page, pageSize })
  } catch (err) {
    return toErrorResponse(err)
  }
}
