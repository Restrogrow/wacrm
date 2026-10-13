// Account deletion requests for the /admin dashboard (migration 047).

import { supabaseAdmin } from '@/lib/flows/admin-client'
import { isMissingObject } from '@/lib/account/deletion'

export interface DeletionRequestRow {
  id: string
  user_id: string
  account_id: string | null
  is_owner: boolean
  email: string | null
  business_name: string | null
  reason: string | null
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  admin_note: string | null
  requested_at: string
  decided_at: string | null
}

export interface DeletionRequestsData {
  available: boolean
  pending: DeletionRequestRow[]
  recent: DeletionRequestRow[]
}

export async function loadDeletionRequests(): Promise<DeletionRequestsData> {
  const db = supabaseAdmin()
  const columns =
    'id, user_id, account_id, is_owner, email, business_name, reason, status, admin_note, requested_at, decided_at'
  const [pending, recent] = await Promise.all([
    db
      .from('account_deletion_requests')
      .select(columns)
      .eq('status', 'pending')
      .order('requested_at', { ascending: true }),
    db
      .from('account_deletion_requests')
      .select(columns)
      .neq('status', 'pending')
      .order('decided_at', { ascending: false, nullsFirst: false })
      .limit(10),
  ])
  if (isMissingObject(pending.error)) return { available: false, pending: [], recent: [] }
  return {
    available: !pending.error,
    pending: (pending.data ?? []) as DeletionRequestRow[],
    recent: (recent.data ?? []) as DeletionRequestRow[],
  }
}
