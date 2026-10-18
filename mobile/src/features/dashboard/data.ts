// Overview data. The aggregate numbers come from the report_* SQL functions
// (migration 065), which run as the signed-in user and check account membership.
import { supabase } from '@/lib/supabase';

export type RangeKey = 'today' | '7d' | '30d';

export function rangeBounds(key: RangeKey, now: Date = new Date()): { from: Date; to: Date; days: number } {
  const to = new Date(now.getTime() + 60_000);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (key === 'today') return { from: start, to, days: 1 };
  const days = key === '7d' ? 7 : 30;
  start.setDate(start.getDate() - (days - 1));
  return { from: start, to, days };
}

export interface Summary {
  new_count: number;
  closed_count: number;
  first_response_avg_s: number | null;
  first_response_samples: number;
  open_now: number;
  pending_now: number;
}
export interface DailyMessages {
  day: string;
  inbound: number;
  outbound: number;
}
export interface DealTotals {
  currency: string;
  created_count: number;
  created_value: number;
  won_count: number;
  won_value: number;
  open_count: number;
  open_value: number;
}
export interface OrderTotals {
  source: string;
  currency: string;
  order_count: number;
  paid_count: number | null;
  revenue: number;
}
export interface LeadSource {
  label: string;
  count: number;
}
export interface Attention {
  id: string;
  contactName: string;
  preview: string | null;
  lastAt: string | null;
  unread: number;
}

const TZ = 'Asia/Kolkata';
const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

export async function getSummary(accountId: string, from: Date, to: Date): Promise<Summary> {
  const { data, error } = await supabase.rpc('report_conversation_summary', {
    p_account_id: accountId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  if (error) throw new Error(error.message);
  const r = ((data ?? []) as Record<string, unknown>[])[0] ?? {};
  return {
    new_count: num(r.new_count),
    closed_count: num(r.closed_count),
    first_response_avg_s: r.first_response_avg_s === null || r.first_response_avg_s === undefined ? null : Number(r.first_response_avg_s),
    first_response_samples: num(r.first_response_samples),
    open_now: num(r.open_now),
    pending_now: num(r.pending_now),
  };
}

export async function getDailyMessages(accountId: string, from: Date, to: Date): Promise<DailyMessages[]> {
  const { data, error } = await supabase.rpc('report_messaging_daily', {
    p_account_id: accountId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_tz: TZ,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({ day: String(r.day), inbound: num(r.inbound), outbound: num(r.outbound) }));
}

export async function getDealTotals(accountId: string, from: Date, to: Date): Promise<DealTotals[]> {
  const { data, error } = await supabase.rpc('report_deals', { p_account_id: accountId, p_from: from.toISOString(), p_to: to.toISOString() });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    currency: String(r.currency ?? 'INR'),
    created_count: num(r.created_count),
    created_value: num(r.created_value),
    won_count: num(r.won_count),
    won_value: num(r.won_value),
    open_count: num(r.open_count),
    open_value: num(r.open_value),
  }));
}

export async function getOrderTotals(accountId: string, from: Date, to: Date): Promise<OrderTotals[]> {
  const { data, error } = await supabase.rpc('report_orders', { p_account_id: accountId, p_from: from.toISOString(), p_to: to.toISOString() });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    source: String(r.source),
    currency: String(r.currency ?? 'INR'),
    order_count: num(r.order_count),
    paid_count: r.paid_count === null || r.paid_count === undefined ? null : Number(r.paid_count),
    revenue: num(r.revenue),
  }));
}

export async function getNewContacts(accountId: string, from: Date): Promise<number> {
  const { count, error } = await supabase
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .gte('created_at', from.toISOString());
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function getLeadSources(accountId: string, from: Date): Promise<LeadSource[]> {
  const { data, error } = await supabase
    .from('contacts')
    .select('ad_source_type, ad_headline, ad_source_id')
    .eq('account_id', accountId)
    .not('ad_source_type', 'is', null)
    .gte('created_at', from.toISOString())
    .limit(2000);
  if (error) throw new Error(error.message);
  const map = new Map<string, number>();
  for (const r of (data ?? []) as { ad_source_type: string; ad_headline: string | null; ad_source_id: string | null }[]) {
    const label = r.ad_headline?.trim() || (r.ad_source_id ? `${r.ad_source_type} ${r.ad_source_id.slice(-6)}` : r.ad_source_type);
    map.set(label, (map.get(label) ?? 0) + 1);
  }
  return [...map.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 5);
}

/** Open chats with unread customer messages, longest waiting first. */
export async function getAttention(accountId: string): Promise<Attention[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, last_message_text, last_message_at, unread_count, contacts(name, phone)')
    .eq('account_id', accountId)
    .eq('status', 'open')
    .gt('unread_count', 0)
    .order('last_message_at', { ascending: true })
    .limit(5);
  if (error) throw new Error(error.message);
  type Row = {
    id: string;
    last_message_text: string | null;
    last_message_at: string | null;
    unread_count: number | null;
    contacts: { name: string | null; phone: string } | { name: string | null; phone: string }[] | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => {
    const c = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts;
    return { id: r.id, contactName: c?.name?.trim() || c?.phone || 'Unknown', preview: r.last_message_text, lastAt: r.last_message_at, unread: r.unread_count ?? 0 };
  });
}

/** Fill days with no messages so the chart has a bar for every day in range. */
export function fillDays(rows: DailyMessages[], from: Date, days: number): DailyMessages[] {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const out: DailyMessages[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(from);
    d.setDate(from.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.push(byDay.get(key) ?? { day: key, inbound: 0, outbound: 0 });
  }
  return out;
}
