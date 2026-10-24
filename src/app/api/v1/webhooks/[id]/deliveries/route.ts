// ============================================================
// GET /api/v1/webhooks/{id}/deliveries — recent deliveries to an
// endpoint, newest first (webhooks:manage).
//
// Query: ?status=pending|delivered|failed  ?limit=1..100 (default 50)
//
// Each row: id, event, status, attempts, next_attempt_at,
// last_status_code, last_error, created_at, delivered_at. The log is
// kept for 14 days (migration 085). Payloads are not returned here.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';

const STATUSES = new Set(['pending', 'delivered', 'failed']);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireApiKey(request, 'webhooks:manage');
    const { id } = await params;
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    if (status && !STATUSES.has(status)) {
      return fail('bad_request', "'status' must be pending, delivered or failed", 400);
    }
    const limitParam = Number(url.searchParams.get('limit') ?? 50);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(Math.trunc(limitParam), 1), 100) : 50;

    const { data: endpoint } = await ctx.supabase
      .from('webhook_endpoints')
      .select('id')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle();
    if (!endpoint) return fail('not_found', 'Webhook not found', 404);

    let query = ctx.supabase
      .from('webhook_deliveries')
      .select('id, event, status, attempts, next_attempt_at, last_status_code, last_error, created_at, delivered_at')
      .eq('endpoint_id', id)
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) {
      console.error('[api/v1/webhooks] deliveries read error:', error);
      return fail('internal', 'Failed to read deliveries', 500);
    }
    return ok(data ?? []);
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
