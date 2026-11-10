// ============================================================
// Writing `accounts.install_source` (migration 099) — server only.
//
// Called when a Shopify install finishes, from both completion paths:
// the signed-in one in /callback and the sign-up-first one in /claim.
// The decision is in install-source.ts; this only persists it.
// ============================================================

import { supabaseAdmin } from '@/lib/flows/admin-client';

import { shouldAdoptShopifyBilling, type AdoptSkipReason } from './install-source';

export type MarkResult =
  | { marked: true }
  | { marked: false; reason: AdoptSkipReason | 'account_missing' | 'write_failed' };

/**
 * Record that an account arrived through the Shopify App Store, if it
 * should be. Never throws: an install must not fail because a billing
 * flag could not be written — the merchant has already approved the
 * app on Shopify's side by this point, and a failure here is
 * recoverable by reconciling later.
 */
export async function markInstallSource(
  accountId: string,
  fromAppStore: boolean
): Promise<MarkResult> {
  if (!fromAppStore) return { marked: false, reason: 'not_from_app_store' };

  const db = supabaseAdmin();
  const { data: account } = await db
    .from('accounts')
    .select('install_source, plan')
    .eq('id', accountId)
    .maybeSingle();
  if (!account) return { marked: false, reason: 'account_missing' };

  const decision = shouldAdoptShopifyBilling({
    current: (account as Record<string, unknown>).install_source,
    fromAppStore,
    plan: (account as Record<string, unknown>).plan,
  });
  if (!decision.adopt) {
    if (decision.reason === 'paying_website_customer') {
      // Worth seeing in the logs: somebody who pays us directly has
      // just installed from Shopify, and which side bills them is now
      // a question for a human.
      console.warn(
        '[install-source] paying website customer installed from Shopify:',
        accountId
      );
    }
    return { marked: false, reason: decision.reason };
  }

  // Guarded on the current value so two concurrent completions cannot
  // both claim the account.
  const { error } = await db
    .from('accounts')
    .update({
      install_source: 'shopify_app_store',
      install_source_set_at: new Date().toISOString(),
    })
    .eq('id', accountId)
    .eq('install_source', 'website');
  if (error) {
    console.error('[install-source] write failed:', error.message);
    return { marked: false, reason: 'write_failed' };
  }
  return { marked: true };
}
