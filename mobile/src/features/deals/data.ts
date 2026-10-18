import { supabase } from '@/lib/supabase';

export interface Stage {
  id: string;
  pipeline_id: string;
  name: string;
  position: number;
  color: string;
}
export interface Pipeline {
  id: string;
  name: string;
  stages: Stage[];
}
export type DealStatus = 'open' | 'won' | 'lost';
export interface Deal {
  id: string;
  title: string;
  value: number;
  currency: string | null;
  status: DealStatus | string | null;
  stage_id: string;
  pipeline_id: string;
  contact_id: string;
  notes: string | null;
  expected_close_date: string | null;
  created_at: string;
  contact: { name: string | null; phone: string } | null;
}

export async function loadPipelines(): Promise<Pipeline[]> {
  const [p, s] = await Promise.all([
    supabase.from('pipelines').select('id, name').order('created_at'),
    supabase.from('pipeline_stages').select('id, pipeline_id, name, position, color').order('position'),
  ]);
  if (p.error) throw new Error(p.error.message);
  if (s.error) throw new Error(s.error.message);
  const stages = (s.data ?? []) as Stage[];
  return ((p.data ?? []) as { id: string; name: string }[]).map((pl) => ({
    ...pl,
    stages: stages.filter((st) => st.pipeline_id === pl.id).sort((a, b) => a.position - b.position),
  }));
}

type DealRow = Omit<Deal, 'contact' | 'value'> & {
  value: number | string;
  contacts: { name: string | null; phone: string } | { name: string | null; phone: string }[] | null;
};

const DEAL_COLS =
  'id, title, value, currency, status, stage_id, pipeline_id, contact_id, notes, expected_close_date, created_at, contacts(name, phone)';

function mapDeal(r: DealRow): Deal {
  const { contacts, value, ...rest } = r;
  return { ...rest, value: Number(value), contact: Array.isArray(contacts) ? contacts[0] ?? null : contacts };
}

export async function loadDeals(pipelineId: string): Promise<Deal[]> {
  const { data, error } = await supabase
    .from('deals')
    .select(DEAL_COLS)
    .eq('pipeline_id', pipelineId)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as DealRow[]).map(mapDeal);
}

export async function getDeal(id: string): Promise<Deal | null> {
  const { data, error } = await supabase.from('deals').select(DEAL_COLS).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapDeal(data as unknown as DealRow) : null;
}

export async function moveDeal(id: string, stageId: string): Promise<void> {
  const { error } = await supabase.from('deals').update({ stage_id: stageId, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function setDealStatus(id: string, status: DealStatus): Promise<void> {
  const { error } = await supabase.from('deals').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function updateDeal(id: string, f: { title: string; value: number; notes: string }): Promise<void> {
  const { error } = await supabase
    .from('deals')
    .update({ title: f.title.trim(), value: f.value, notes: f.notes.trim() || null, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function createDeal(input: {
  accountId: string;
  userId: string;
  contactId: string;
  pipelineId: string;
  stageId: string;
  title: string;
  value: number;
  notes: string;
}): Promise<void> {
  const { error } = await supabase.from('deals').insert({
    user_id: input.userId,
    account_id: input.accountId,
    contact_id: input.contactId,
    pipeline_id: input.pipelineId,
    stage_id: input.stageId,
    title: input.title.trim(),
    value: input.value,
    currency: 'INR',
    notes: input.notes.trim() || null,
    status: 'open',
  });
  if (error) throw error;
}

export async function deleteDeal(id: string): Promise<void> {
  const { error } = await supabase.from('deals').delete().eq('id', id);
  if (error) throw error;
}

/** Group a pipeline's deals by stage, with open-deal totals per currency. */
export function summariseStage(deals: Deal[]): { count: number; value: number } {
  const open = deals.filter((d) => d.status !== 'lost');
  return { count: open.length, value: open.reduce((n, d) => n + (Number.isFinite(d.value) ? d.value : 0), 0) };
}
