// ============================================================
// Billing checks — server-only.
//
// An account whose trial (or paid period) has ended is read-only: it
// still receives messages, but every outbound send path calls
// accountCanSend() first — inbox replies, the public API, broadcasts,
// automations, flows, the AI chatbot, Shopify and Calendly messages.
// Fails open when the billing columns don't exist yet (migration 041
// not applied) so a missing migration never stops messaging.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '@/lib/flows/admin-client';

import {
  effectivePlan,
  type AccountBilling,
  type EffectivePlan,
} from './plans';

export async function loadEffectivePlan(
  accountId: string,
  db: SupabaseClient = supabaseAdmin()
): Promise<EffectivePlan | null> {
  const { data, error } = await db
    .from('accounts')
    .select('plan, trial_ends_at, plan_expires_at')
    .eq('id', accountId)
    .maybeSingle();
  if (error || !data) return null;
  return effectivePlan(data as AccountBilling);
}

export async function accountCanSend(accountId: string): Promise<boolean> {
  return (await loadEffectivePlan(accountId)) !== 'expired';
}
