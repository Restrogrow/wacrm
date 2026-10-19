// WhatsApp calls (web migrations 048, 057, 080/081) — read-only in the app.
// Members can read their account's calls through RLS. Calls are placed and
// answered on the web dashboard (WebRTC + the AI agent run in the browser);
// the app shows the history and the AI call notes.
import { supabase } from '@/lib/supabase';

export type CallStatus = 'ringing' | 'answering' | 'connected' | 'ended' | 'missed' | 'rejected' | 'failed';

export interface CallNotes {
  summary: string;
  customer_wants: string;
  action_items: string[];
  follow_up: string;
  customer_language: string;
  mood: 'happy' | 'neutral' | 'unhappy';
}

export interface CallRow {
  id: string;
  direction: 'inbound' | 'outbound';
  status: CallStatus;
  customer_name: string | null;
  customer_number: string | null;
  contact_id: string | null;
  conversation_id: string | null;
  duration_seconds: number | null;
  created_at: string;
  answered_at: string | null;
  ended_at: string | null;
  ai_agent: boolean;
  ai_notes: CallNotes | null;
}

export type CallFilter = 'all' | 'missed' | 'ai' | 'inbound' | 'outbound';

const COLUMNS =
  'id, direction, status, customer_name, customer_number, contact_id, conversation_id, duration_seconds, created_at, answered_at, ended_at, ai_agent, ai_notes';
// Before migration 080 there is no ai_agent column; fall back without it.
const COLUMNS_NO_AI = COLUMNS.replace(', ai_agent', '');

function normalize(rows: Record<string, unknown>[]): CallRow[] {
  return rows.map((r) => ({ ...(r as unknown as CallRow), ai_agent: r.ai_agent === true }));
}

export async function fetchCalls(opts: { filter?: CallFilter; contactId?: string; limit?: number } = {}): Promise<CallRow[]> {
  const run = async (columns: string) => {
    let q = supabase.from('whatsapp_calls').select(columns).order('created_at', { ascending: false }).limit(opts.limit ?? 100);
    if (opts.contactId) q = q.eq('contact_id', opts.contactId);
    switch (opts.filter) {
      case 'missed':
        q = q.in('status', ['missed', 'rejected', 'failed']);
        break;
      case 'ai':
        if (columns.includes('ai_agent')) q = q.eq('ai_agent', true);
        break;
      case 'inbound':
      case 'outbound':
        q = q.eq('direction', opts.filter);
        break;
    }
    return q;
  };
  let { data, error } = await run(COLUMNS);
  if (error && /ai_agent/.test(error.message)) ({ data, error } = await run(COLUMNS_NO_AI));
  if (error) throw new Error(error.message);
  return normalize((data ?? []) as unknown as Record<string, unknown>[]);
}

export async function fetchCall(id: string): Promise<CallRow | null> {
  let { data, error } = await supabase.from('whatsapp_calls').select(COLUMNS).eq('id', id).maybeSingle();
  if (error && /ai_agent/.test(error.message)) ({ data, error } = await supabase.from('whatsapp_calls').select(COLUMNS_NO_AI).eq('id', id).maybeSingle());
  if (error) throw new Error(error.message);
  return data ? normalize([data as unknown as Record<string, unknown>])[0] : null;
}

/** Calls since `fromIso`: total and missed (for the Overview tile). */
export async function countCalls(fromIso: string): Promise<{ total: number; missed: number }> {
  const base = () => supabase.from('whatsapp_calls').select('id', { count: 'exact', head: true }).gte('created_at', fromIso);
  const [all, missed] = await Promise.all([base(), base().in('status', ['missed', 'rejected', 'failed'])]);
  if (all.error) throw new Error(all.error.message);
  return { total: all.count ?? 0, missed: missed.count ?? 0 };
}

/** Re-run `onChange` whenever a call row changes (new calls, status, AI notes). */
export function subscribeCalls(onChange: () => void): () => void {
  const channel = supabase
    .channel(`calls-${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_calls' }, () => onChange())
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

export function callLabel(c: Pick<CallRow, 'customer_name' | 'customer_number'>): string {
  return c.customer_name || (c.customer_number ? `+${c.customer_number.replace(/^\+/, '')}` : 'WhatsApp caller');
}

export function isMissed(c: Pick<CallRow, 'status'>): boolean {
  return c.status === 'missed' || c.status === 'rejected' || c.status === 'failed';
}

export function statusText(c: Pick<CallRow, 'status' | 'direction'>): string {
  switch (c.status) {
    case 'missed':
      return c.direction === 'inbound' ? 'Missed' : 'No answer';
    case 'rejected':
      return 'Declined';
    case 'failed':
      return 'Failed';
    case 'ringing':
    case 'answering':
      return 'Ringing';
    case 'connected':
      return 'On the call';
    default:
      return c.direction === 'inbound' ? 'Incoming' : 'Outgoing';
  }
}

/** 0:42 / 3:05 / 1:02:10 */
export function callLength(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}
