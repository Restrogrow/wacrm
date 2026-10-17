// Data loading for /reports. Heavy aggregation happens in SQL
// (supabase/migrations/065_reports.sql, SECURITY INVOKER, so row-level
// security scopes everything to the signed-in user's account). Only the
// broadcasts list is read directly, also through RLS.

import type { SupabaseClient } from '@supabase/supabase-js'

import { dayKeys, fillDays, type ReportRange } from './range'

type DB = SupabaseClient

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function rpcArgs(accountId: string, range: ReportRange, tz?: string) {
  return {
    p_account_id: accountId,
    p_from: range.from.toISOString(),
    p_to: range.to.toISOString(),
    ...(tz ? { p_tz: tz } : {}),
  }
}

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

async function rpc<T>(db: DB, fn: string, args: Record<string, unknown>): Promise<Record<string, unknown>[]> {
  const { data, error } = await db.rpc(fn, args)
  if (error) throw new Error(error.message)
  return (data ?? []) as Record<string, unknown>[] & T[]
}

// ---- 1. Messaging ------------------------------------------------------

export interface MessagingDay {
  day: string
  inbound: number
  outbound: number
  sent: number
  delivered: number
  read: number
  failed: number
}

export async function loadMessaging(db: DB, accountId: string, range: ReportRange, tz: string) {
  const rows = await rpc<unknown>(db, 'report_messaging_daily', rpcArgs(accountId, range, tz))
  const parsed: MessagingDay[] = rows.map((r) => ({
    day: String(r.day),
    inbound: num(r.inbound),
    outbound: num(r.outbound),
    sent: num(r.out_sent),
    delivered: num(r.out_delivered),
    read: num(r.out_read),
    failed: num(r.out_failed),
  }))
  return fillDays(dayKeys(range), parsed, (day) => ({
    day,
    inbound: 0,
    outbound: 0,
    sent: 0,
    delivered: 0,
    read: 0,
    failed: 0,
  }))
}

// ---- 2. Conversations --------------------------------------------------

export interface ConversationDay {
  day: string
  created: number
  closed: number
}

export interface ConversationSummary {
  created: number
  closed: number
  firstResponseAvgS: number | null
  firstResponseMedianS: number | null
  firstResponseSamples: number
  resolutionAvgS: number | null
  resolutionMedianS: number | null
  resolutionSamples: number
  openNow: number
  pendingNow: number
}

export async function loadConversations(db: DB, accountId: string, range: ReportRange, tz: string) {
  const [dailyRows, summaryRows] = await Promise.all([
    rpc<unknown>(db, 'report_conversations_daily', rpcArgs(accountId, range, tz)),
    rpc<unknown>(db, 'report_conversation_summary', rpcArgs(accountId, range)),
  ])
  const daily = fillDays(
    dayKeys(range),
    dailyRows.map((r) => ({ day: String(r.day), created: num(r.new_count), closed: num(r.closed_count) })),
    (day): ConversationDay => ({ day, created: 0, closed: 0 }),
  )
  const s = summaryRows[0] ?? {}
  const summary: ConversationSummary = {
    created: num(s.new_count),
    closed: num(s.closed_count),
    firstResponseAvgS: numOrNull(s.first_response_avg_s),
    firstResponseMedianS: numOrNull(s.first_response_median_s),
    firstResponseSamples: num(s.first_response_samples),
    resolutionAvgS: numOrNull(s.resolution_avg_s),
    resolutionMedianS: numOrNull(s.resolution_median_s),
    resolutionSamples: num(s.resolution_samples),
    openNow: num(s.open_now),
    pendingNow: num(s.pending_now),
  }
  return { daily, summary }
}

// ---- 3. Agents ---------------------------------------------------------

export interface AgentRow {
  agentId: string | null
  name: string
  conversations: number
  closed: number
  messagesSent: number
  firstResponseAvgS: number | null
  firstResponseSamples: number
}

export async function loadAgents(db: DB, accountId: string, range: ReportRange): Promise<AgentRow[]> {
  const rows = await rpc<unknown>(db, 'report_agents', rpcArgs(accountId, range))
  return rows.map((r) => ({
    agentId: (r.agent_user_id as string | null) ?? null,
    name: String(r.agent_name ?? 'Unknown'),
    conversations: num(r.conversations),
    closed: num(r.closed),
    messagesSent: num(r.messages_sent),
    firstResponseAvgS: numOrNull(r.first_response_avg_s),
    firstResponseSamples: num(r.first_response_samples),
  }))
}

// ---- 4. Broadcasts -----------------------------------------------------

export interface BroadcastRow {
  id: string
  name: string
  status: string
  createdAt: string
  recipients: number
  sent: number
  delivered: number
  read: number
  replied: number
  failed: number
}

export async function loadBroadcasts(db: DB, accountId: string, range: ReportRange): Promise<BroadcastRow[]> {
  const { data, error } = await db
    .from('broadcasts')
    .select('id, name, status, created_at, total_recipients, sent_count, delivered_count, read_count, replied_count, failed_count')
    .eq('account_id', accountId)
    .gte('created_at', range.from.toISOString())
    .lt('created_at', range.to.toISOString())
    .neq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map((b) => ({
    id: String(b.id),
    name: String(b.name ?? ''),
    status: String(b.status ?? ''),
    createdAt: String(b.created_at),
    recipients: num(b.total_recipients),
    sent: num(b.sent_count),
    delivered: num(b.delivered_count),
    read: num(b.read_count),
    replied: num(b.replied_count),
    failed: num(b.failed_count),
  }))
}

// ---- 5. Sales ----------------------------------------------------------

export interface DealsRow {
  currency: string
  createdCount: number
  createdValue: number
  wonCount: number
  wonValue: number
  lostCount: number
  lostValue: number
  openCount: number
  openValue: number
}

export interface OrdersRow {
  source: 'whatsapp' | 'shopify'
  currency: string
  orders: number
  paid: number | null
  revenue: number
}

export async function loadSales(db: DB, accountId: string, range: ReportRange) {
  const [dealRows, orderRows] = await Promise.all([
    rpc<unknown>(db, 'report_deals', rpcArgs(accountId, range)),
    rpc<unknown>(db, 'report_orders', rpcArgs(accountId, range)),
  ])
  const deals: DealsRow[] = dealRows.map((r) => ({
    currency: String(r.currency),
    createdCount: num(r.created_count),
    createdValue: num(r.created_value),
    wonCount: num(r.won_count),
    wonValue: num(r.won_value),
    lostCount: num(r.lost_count),
    lostValue: num(r.lost_value),
    openCount: num(r.open_count),
    openValue: num(r.open_value),
  }))
  const orders: OrdersRow[] = orderRows.map((r) => ({
    source: r.source === 'shopify' ? 'shopify' : 'whatsapp',
    currency: String(r.currency),
    orders: num(r.order_count),
    paid: numOrNull(r.paid_count),
    revenue: num(r.revenue),
  }))
  return { deals, orders }
}
