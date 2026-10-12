// ============================================================
// WhatsApp opt-out (STOP) handling.
//
// WhatsApp's Business Messaging Policy requires honouring opt-out
// requests; ignoring them also drags down the number's quality rating
// and can get it restricted. A customer who replies STOP (or similar)
// is marked `contacts.opted_out_at` and excluded from broadcasts until
// they reply START.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

export type OptKeyword = 'opt_out' | 'opt_in';

// Whole-message matches only, so "stop the order" or "cancel my
// booking" aren't treated as unsubscribing.
const OPT_OUT_PHRASES = new Set([
  'stop',
  'stop all',
  'stopall',
  'stop messages',
  'stop sending',
  'stop sending messages',
  'unsubscribe',
  'unsub',
  'opt out',
  'optout',
  'opt-out',
  'remove me',
  'end',
  'quit',
  'band karo',
  'band kro',
  'message band karo',
  'mat bhejo',
  'msg mat bhejo',
  'message mat bhejo',
]);

const OPT_IN_PHRASES = new Set([
  'start',
  'unstop',
  'subscribe',
  'resubscribe',
  'opt in',
  'optin',
  'opt-in',
  'resume',
]);

/** Lowercase, drop punctuation/emoji, collapse whitespace. */
export function normalizeKeyword(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Is this whole message an opt-out or opt-in request? */
export function detectOptKeyword(text: string | null | undefined): OptKeyword | null {
  if (!text || text.length > 40) return null;
  const k = normalizeKeyword(text);
  if (OPT_OUT_PHRASES.has(k)) return 'opt_out';
  if (OPT_IN_PHRASES.has(k)) return 'opt_in';
  return null;
}

export const OPT_OUT_CONFIRMATION =
  "You've been unsubscribed and won't receive offers or updates from us here anymore. Reply START anytime to subscribe again.";
export const OPT_IN_CONFIRMATION =
  "You're subscribed again — thanks! Reply STOP anytime to unsubscribe.";

/** Digits only, for comparing phones in different formats. */
export const phoneKey = (phone: string) => phone.replace(/\D/g, '');

/**
 * Phones (digits only) of the account's opted-out contacts. Returns an
 * empty set if the column doesn't exist yet (migration 036 not applied)
 * so broadcasts keep working.
 */
export async function loadOptedOutPhones(db: SupabaseClient, accountId: string): Promise<Set<string>> {
  const { data, error } = await db
    .from('contacts')
    .select('phone')
    .eq('account_id', accountId)
    .not('opted_out_at', 'is', null);
  if (error) {
    console.warn('[opt-out] could not load opted-out contacts:', error.message);
    return new Set();
  }
  return new Set((data ?? []).map((r) => phoneKey(String(r.phone ?? ''))).filter(Boolean));
}

/**
 * Record an opt-out / opt-in on the contact. Returns false if it
 * couldn't be saved (e.g. migration 036 not applied), so the caller
 * doesn't confirm something that didn't happen.
 */
export async function setContactOptOut(
  db: SupabaseClient,
  contactId: string,
  optedOut: boolean
): Promise<boolean> {
  const { error } = await db
    .from('contacts')
    .update({ opted_out_at: optedOut ? new Date().toISOString() : null })
    .eq('id', contactId);
  if (error) {
    console.error('[opt-out] could not update contact:', error.message);
    return false;
  }
  return true;
}
