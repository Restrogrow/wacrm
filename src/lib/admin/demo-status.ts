// Demo request statuses and row type. No server imports, so client
// components can use this (the loader lives in ./demo-requests).

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
