// Create or update an account's WooCommerce connection row. Shared by the
// manual connect route and the one-click flow. Server-only.

import { randomBytes } from 'node:crypto'

import type { SupabaseClient } from '@supabase/supabase-js'

import { decrypt, encrypt } from '@/lib/whatsapp/encryption'

/**
 * Keeps the existing webhook URL token and signing secret unless `rotateSecret`.
 * Returns the token and the plain secret (for the merchant or for creating webhooks).
 */
export async function ensureWooStore(
  db: SupabaseClient,
  args: { accountId: string; userId: string; storeUrl: string; rotateSecret?: boolean },
): Promise<{ ok: true; ingestToken: string; secret: string } | { ok: false; error: string }> {
  const { data: existing } = await db
    .from('woocommerce_stores')
    .select('ingest_token, webhook_secret')
    .eq('account_id', args.accountId)
    .maybeSingle()

  const ingestToken = (existing?.ingest_token as string | undefined) ?? randomBytes(24).toString('base64url')
  let secret: string | null = null
  if (existing && !args.rotateSecret) {
    try {
      secret = decrypt(existing.webhook_secret as string)
    } catch {
      secret = null
    }
  }
  if (!secret) secret = randomBytes(32).toString('base64url')

  const { error } = await db.from('woocommerce_stores').upsert(
    {
      account_id: args.accountId,
      store_url: args.storeUrl,
      store_name: new URL(args.storeUrl).hostname,
      ingest_token: ingestToken,
      webhook_secret: encrypt(secret),
      status: 'active',
      connected_by: args.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'account_id' },
  )
  if (error) {
    console.error('[woocommerce] save store failed:', error.message)
    return { ok: false, error: 'Failed to save the store' }
  }
  return { ok: true, ingestToken, secret }
}
