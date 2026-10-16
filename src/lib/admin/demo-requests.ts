// Demo requests for the /admin dashboard (migration 054). Server only;
// statuses and types for client components are in ./demo-status.

import { supabaseAdmin } from '@/lib/flows/admin-client'
import { isMissingObject } from '@/lib/account/deletion'
import type { DemoRequestRow, DemoRequestsData, DemoStatus } from './demo-status'

export * from './demo-status'

const EMPTY_COUNTS: Record<DemoStatus, number> = { new: 0, contacted: 0, demo_done: 0, won: 0, lost: 0 }

export async function loadDemoRequests(): Promise<DemoRequestsData> {
  const db = supabaseAdmin()
  const { data, error } = await db
    .from('demo_requests')
    .select('id, name, business_name, whatsapp, email, team_size, use_case, message, source_page, status, created_at')
    .order('created_at', { ascending: false })
    .limit(100)
  if (isMissingObject(error)) return { available: false, rows: [], counts: { ...EMPTY_COUNTS } }
  const rows = (data ?? []) as DemoRequestRow[]
  const counts = { ...EMPTY_COUNTS }
  for (const r of rows) if (r.status in counts) counts[r.status] += 1
  return { available: !error, rows, counts }
}
