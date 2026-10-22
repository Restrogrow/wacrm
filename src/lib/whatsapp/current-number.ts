// ============================================================
// Conversations belong to the WhatsApp number they ran on
// (migration 083). After an account swaps number 1 for number 2, a
// contact can have one conversation per number; the dashboard only sees
// the current number's (RLS), but service-role code must pick it itself.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

/** The phone_number_id connected to the account right now, or null. */
export async function currentPhoneNumberId(db: SupabaseClient, accountId: string): Promise<string | null> {
  const { data } = await db
    .from('whatsapp_config')
    .select('phone_number_id')
    .eq('account_id', accountId)
    .maybeSingle();
  return (data as { phone_number_id: string | null } | null)?.phone_number_id ?? null;
}

/**
 * PostgREST `or` filter for rows of the current number (untagged rows
 * count too). Null when no number is connected: then nothing is filtered.
 */
export function currentNumberFilter(phoneNumberId: string | null): string | null {
  if (!phoneNumberId) return null;
  return `phone_number_id.is.null,phone_number_id.eq.${phoneNumberId.replace(/[^0-9A-Za-z_-]/g, '')}`;
}
