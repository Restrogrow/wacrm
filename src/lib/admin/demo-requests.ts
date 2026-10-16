// Demo requests for the /admin dashboard (migration 054).

import { supabaseAdmin } from '@/lib/flows/admin-client'
import { isMissingObject } from '@/lib/account/deletion'

export const DEMO_STATUSES = ['new', 'contacted', 'demo_done', 'won', 'lost'] as const
export type DemoStatus = (typeof DEMO_STATUSES)[number]

export const DEMO_STATUS_LABELS: Record<DemoStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  demo_done: 'Demo done',
  won: 'Won',
  lost: 'Lost',
}

export interface DemoRequestRow {
  id: string
  name: string
  business_name: string
  whatsapp: string
  email: string | null
  team_size: string | null
  use_case: string | null
  message: string | null
  source_page: string | null
  status: DemoStatus
  created_at: string
}

export interface DemoRequestsData {
  available: boolean
  rows: DemoRequestRow[]
  counts: Record<DemoStatus, number>
}

export function isDemoStatus(value: unknown): value is DemoStatus {
  return typeof value === 'string' && (DEMO_STATUSES as readonly string[]).includes(value)
}

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
