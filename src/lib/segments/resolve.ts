// Client-side helpers around the segment RPCs (migration 068).
// Every call goes through the signed-in user's Supabase client, so row
// level security and the functions' own membership check keep results
// inside the caller's account.

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Contact } from '@/types';

import { readRules, validateRules, type SegmentRules } from './rules';

export interface SegmentRow {
  id: string;
  name: string;
  rules: SegmentRules;
  contact_count: number;
  created_at: string;
  updated_at: string;
}

const BROADCAST_PAGE = 1000;

/** Saved segments with their current size, for the sidebar. */
export async function loadSegments(
  supabase: SupabaseClient,
  accountId: string,
): Promise<SegmentRow[]> {
  const { data, error } = await supabase.rpc('segments_with_counts', { p_account_id: accountId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    rules: readRules(r.rules),
    contact_count: Number(r.contact_count ?? 0),
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  }));
}

/** How many contacts match an unsaved rule set (rule builder preview). */
export async function countSegmentMembers(
  supabase: SupabaseClient,
  accountId: string,
  rules: SegmentRules,
  excludeOptedOut = false,
): Promise<number> {
  const { data, error } = await supabase.rpc('segment_count', {
    p_account_id: accountId,
    p_rules: rules,
    p_exclude_opted_out: excludeOptedOut,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

/**
 * Every contact in a saved segment, for a broadcast. Rules are read
 * from the database (never trusted from the browser), opted-out
 * contacts are excluded, and results are paged past PostgREST's
 * 1000-row cap.
 */
export async function resolveSegmentContacts(
  supabase: SupabaseClient,
  accountId: string,
  segmentId: string,
): Promise<Contact[]> {
  const { data: seg, error: segError } = await supabase
    .from('segments')
    .select('rules')
    .eq('id', segmentId)
    .eq('account_id', accountId)
    .maybeSingle();
  if (segError) throw new Error(`Failed to load segment: ${segError.message}`);
  if (!seg) throw new Error('That segment no longer exists.');

  const parsed = validateRules(seg.rules);
  if (!parsed.ok) throw new Error(`Segment rules are invalid: ${parsed.error}`);

  const contacts: Contact[] = [];
  for (let offset = 0; ; offset += BROADCAST_PAGE) {
    const { data, error } = await supabase.rpc('segment_contacts', {
      p_account_id: accountId,
      p_rules: parsed.rules,
      p_search: null,
      p_limit: BROADCAST_PAGE,
      p_offset: offset,
      p_exclude_opted_out: true,
    });
    if (error) throw new Error(`Failed to load segment contacts: ${error.message}`);
    const rows = (data ?? []) as Array<{ contact: Contact }>;
    contacts.push(...rows.map((r) => r.contact));
    if (rows.length < BROADCAST_PAGE) break;
  }
  return contacts;
}

/** Live member count of one saved segment (opted-out excluded, as a broadcast would). */
export async function countSavedSegment(
  supabase: SupabaseClient,
  accountId: string,
  segmentId: string,
): Promise<number | null> {
  const { data: seg } = await supabase
    .from('segments')
    .select('rules')
    .eq('id', segmentId)
    .eq('account_id', accountId)
    .maybeSingle();
  if (!seg) return null;
  const parsed = validateRules(seg.rules);
  if (!parsed.ok) return null;
  return countSegmentMembers(supabase, accountId, parsed.rules, true);
}
