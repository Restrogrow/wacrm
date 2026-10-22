// ============================================================
// Saving a one-click (OAuth) Shopify connection on an account.
//
// Used by the OAuth callback when the merchant is already signed in,
// and by /claim when they installed from the App Store first and signed
// in or up afterwards (the tokens wait in shopify_pending_installs,
// migration 082).
// ============================================================

import { createHash, randomBytes } from 'node:crypto';

import { recordAudit } from '@/lib/audit';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { decrypt } from '@/lib/whatsapp/encryption';
import {
  fetchShopName,
  registerWebhooks,
  tokenColumns,
  type ShopifyTokenSet,
} from './admin-api';

/** httpOnly cookie holding the claim token for a parked install. */
export const PENDING_INSTALL_COOKIE = 'shopify_pending_install';
const PENDING_TTL_SECONDS = 60 * 60;

/** We store only the SHA-256 of the claim token the browser holds. */
export function hashClaimToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Encrypted token columns, as stored in shopify_stores and the pending table. */
type TokenColumns = ReturnType<typeof tokenColumns>;

/**
 * Attach an OAuth-connected shop to `accountId`, register our webhooks
 * and audit it. Throws with a merchant-readable message on failure.
 */
export async function saveOAuthConnection(args: {
  accountId: string;
  userId: string;
  shop: string;
  shopName: string | null;
  columns: TokenColumns;
  request: Request;
}): Promise<void> {
  const { accountId, userId, shop, shopName, columns, request } = args;
  const db = supabaseAdmin();

  // An OAuth-connected shop can belong to only one Repeat Grow account.
  const { data: taken } = await db
    .from('shopify_stores')
    .select('account_id')
    .eq('shop_domain', shop)
    .eq('connection_type', 'oauth')
    .eq('status', 'active')
    .neq('account_id', accountId)
    .maybeSingle();
  if (taken) {
    throw new Error(
      `${shop} is already connected to another Repeat Grow account. Disconnect it there first.`
    );
  }

  const { data: existing } = await db
    .from('shopify_stores')
    .select('ingest_token')
    .eq('account_id', accountId)
    .maybeSingle();
  const { error: saveErr } = await db.from('shopify_stores').upsert(
    {
      account_id: accountId,
      shop_domain: shop,
      shop_name: shopName,
      connection_type: 'oauth',
      ingest_token:
        existing?.ingest_token ?? randomBytes(24).toString('base64url'),
      webhook_secret: null,
      ...columns,
      status: 'active',
      connected_by: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'account_id' }
  );
  if (saveErr) throw new Error(saveErr.message);

  await registerWebhooks(shop, decrypt(columns.access_token));
  await recordAudit(
    {
      accountId,
      actorUserId: userId,
      action: 'integration.connected',
      targetType: 'integration',
      targetId: 'shopify',
    },
    request
  );
}

/**
 * Park a freshly exchanged token set until the merchant signs in.
 * Returns the claim token to put in the httpOnly cookie.
 */
export async function createPendingInstall(
  shop: string,
  tokens: ShopifyTokenSet
): Promise<{ claimToken: string; maxAge: number }> {
  const db = supabaseAdmin();
  // Sweep old rows so abandoned installs don't pile up.
  await db
    .from('shopify_pending_installs')
    .delete()
    .lt('expires_at', new Date().toISOString());

  const shopName = await fetchShopName(shop, tokens.accessToken).catch(
    () => null
  );
  const claimToken = randomBytes(32).toString('base64url');
  const { error } = await db.from('shopify_pending_installs').insert({
    claim_hash: hashClaimToken(claimToken),
    shop_domain: shop,
    shop_name: shopName,
    ...tokenColumns(tokens),
    expires_at: new Date(Date.now() + PENDING_TTL_SECONDS * 1000).toISOString(),
  });
  if (error) throw new Error(error.message);
  return { claimToken, maxAge: PENDING_TTL_SECONDS };
}

/**
 * Take (and delete) the parked install for this claim token, or null
 * when there is none or it expired. Single use.
 */
export async function takePendingInstall(claimToken: string): Promise<{
  shop: string;
  shopName: string | null;
  columns: TokenColumns;
} | null> {
  const db = supabaseAdmin();
  const { data } = await db
    .from('shopify_pending_installs')
    .delete()
    .eq('claim_hash', hashClaimToken(claimToken))
    .gt('expires_at', new Date().toISOString())
    .select(
      'shop_domain, shop_name, access_token, refresh_token, access_token_expires_at, scopes'
    )
    .maybeSingle();
  if (!data) return null;
  return {
    shop: data.shop_domain,
    shopName: data.shop_name,
    columns: {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      access_token_expires_at: data.access_token_expires_at,
      scopes: data.scopes,
    },
  };
}
