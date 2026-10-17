// Server-only: record first-touch Click-to-WhatsApp attribution for a
// contact and tag them "Ad lead". Called from the WhatsApp webhook with
// the service-role client; never throws (attribution must not cost us the
// inbound message).

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  AD_LEAD_TAG,
  AD_LEAD_TAG_COLOR,
  parseReferral,
  referralToColumns,
} from '@/lib/ad-attribution';
import { fireTeamAlert } from '@/lib/alerts/server';

/**
 * @returns true when this call recorded the contact's first ad touch.
 */
export async function recordAdAttribution(
  db: SupabaseClient,
  args: {
    accountId: string;
    ownerUserId: string;
    contactId: string;
    /** `ad_first_seen_at` already on the contact row, if the row was read after migration 062. */
    alreadyAttributed: boolean;
    rawReferral: unknown;
  },
): Promise<boolean> {
  try {
    if (args.alreadyAttributed) return false; // first touch wins
    const referral = parseReferral(args.rawReferral);
    if (!referral) return false;

    // `.is('ad_first_seen_at', null)` makes this atomic: if two messages race,
    // only one update matches.
    const { data, error } = await db
      .from('contacts')
      .update(referralToColumns(referral))
      .eq('id', args.contactId)
      .eq('account_id', args.accountId)
      .is('ad_first_seen_at', null)
      .select('id');
    if (error) {
      // 42703 = column missing: migration 062 not applied yet. Stay quiet-ish.
      if (error.code !== '42703' && error.code !== 'PGRST204') {
        console.error('[ad-attribution] update failed:', error.message);
      }
      return false;
    }
    if (!data || data.length === 0) return false; // someone else recorded it first

    // Find (or create) this account's "Ad lead" tag, then attach it.
    let tagId: string | null = null;
    const { data: existing } = await db
      .from('tags')
      .select('id')
      .eq('account_id', args.accountId)
      .eq('name', AD_LEAD_TAG)
      .limit(1)
      .maybeSingle();
    tagId = (existing?.id as string | undefined) ?? null;
    if (!tagId) {
      const { data: created } = await db
        .from('tags')
        .insert({
          account_id: args.accountId,
          user_id: args.ownerUserId,
          name: AD_LEAD_TAG,
          color: AD_LEAD_TAG_COLOR,
        })
        .select('id')
        .single();
      tagId = (created?.id as string | undefined) ?? null;
    }
    if (tagId) {
      await db
        .from('contact_tags')
        .upsert(
          { contact_id: args.contactId, tag_id: tagId },
          { onConflict: 'contact_id,tag_id', ignoreDuplicates: true },
        );
    }
    // Team alert (Slack / Discord / Telegram). Never throws.
    const { data: lead } = await db
      .from('contacts')
      .select('name, phone')
      .eq('id', args.contactId)
      .eq('account_id', args.accountId)
      .maybeSingle();
    await fireTeamAlert(args.accountId, 'ad_lead', {
      contactName: (lead?.name as string | undefined) ?? null,
      phone: (lead?.phone as string | undefined) ?? null,
      source: referral.headline ?? (referral.id ? `Ad ${referral.id}` : null),
    });
    return true;
  } catch (err) {
    console.error('[ad-attribution] failed:', err instanceof Error ? err.message : err);
    return false;
  }
}
