// ============================================================
// Shopify auto-sync: every connected store, every 30 minutes.
// Server-only. Runs from the automations cron (migration 090).
//
//   products   → catalog, via the same syncFromShopify as the Catalog
//                page button (Admin API, or the public feed as fallback)
//   customers  → contacts tagged "Shopify" (OAuth + read_customers).
//                Incremental: only customers updated since the last run.
//   orders     → shopify_orders rows for orders of the last 24 hours
//                whose webhook never arrived. Records only: no WhatsApp
//                message is sent for them (they'd be late and out of
//                order), and existing rows are never touched.
//
// Each part fails on its own; the store's last_sync_error collects the
// messages and Integrations → Shopify shows them.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { resolveAuditUserId } from '@/lib/api/v1/contacts';
import { CatalogSyncError, syncFromShopify } from '@/lib/catalog/sync';
import { findExistingContact, isUniqueViolation } from '@/lib/contacts/dedupe';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { normalizeIntegrationPhone } from '@/lib/integrations/phone';

import { getAccessToken, shopifyGraphql, type OAuthStoreRow } from './admin-api';
import { missingScopes } from './config';

export const SYNC_INTERVAL_MINUTES = 30;
/** Stores synced per cron run; the rest wait for the next run. */
const STORES_PER_RUN = 3;
/** Customers imported per store per run; the cursor resumes the rest. */
const MAX_CUSTOMERS_PER_RUN = 2000;
const MAX_ORDERS_PER_RUN = 500;
const ORDER_LOOKBACK_HOURS = 24;

export const SHOPIFY_CONTACT_TAG = 'Shopify';
const SHOPIFY_TAG_COLOR = '#95bf47';

interface SyncStore extends OAuthStoreRow {
  account_id: string;
  connection_type: 'oauth' | 'webhook';
  default_country_code: string;
  scopes: string | null;
  customers_synced_until: string | null;
}

type PartResult = Record<string, number | string>;

export interface StoreSyncSummary {
  products?: PartResult;
  customers?: PartResult;
  orders?: PartResult;
}

const errorText = (err: unknown) =>
  (err instanceof Error ? err.message : String(err)).slice(0, 300);

/** Sync the stores that are due. Returns how many were synced. */
export async function processShopifyAutoSync(): Promise<number> {
  const db = supabaseAdmin();
  // A minute of slack so a cron every 10 minutes syncs at 30, not 40.
  const dueBefore = new Date(
    Date.now() - (SYNC_INTERVAL_MINUTES - 1) * 60_000
  ).toISOString();

  const { data: stores, error } = await db
    .from('shopify_stores')
    .select(
      'id, account_id, shop_domain, connection_type, access_token, refresh_token, access_token_expires_at, default_country_code, scopes, customers_synced_until, last_synced_at'
    )
    .eq('status', 'active')
    .or(`last_synced_at.is.null,last_synced_at.lt."${dueBefore}"`)
    .order('last_synced_at', { ascending: true, nullsFirst: true })
    .limit(STORES_PER_RUN);
  if (error) {
    // Migration 090 not applied yet: nothing to do, don't fail the cron.
    if (/last_synced_at|customers_synced_until/.test(error.message)) return 0;
    throw new Error(error.message);
  }

  let synced = 0;
  for (const store of (stores ?? []) as unknown as (SyncStore & { last_synced_at: string | null })[]) {
    // Claim the store so an overlapping cron run skips it.
    const claim = db
      .from('shopify_stores')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', store.id);
    const { data: claimed } = await (store.last_synced_at
      ? claim.eq('last_synced_at', store.last_synced_at)
      : claim.is('last_synced_at', null)
    )
      .select('id')
      .maybeSingle();
    if (!claimed) continue;

    const { summary, errors } = await syncStore(db, store);
    await db
      .from('shopify_stores')
      .update({
        last_sync_summary: summary,
        last_sync_error: errors.length ? errors.join(' · ') : null,
      })
      .eq('id', store.id);
    synced++;
  }
  return synced;
}

export async function syncStore(
  db: SupabaseClient,
  store: SyncStore
): Promise<{ summary: StoreSyncSummary; errors: string[] }> {
  const summary: StoreSyncSummary = {};
  const errors: string[] = [];

  try {
    const r = await syncFromShopify(db, store.account_id);
    summary.products = {
      created: r.created,
      updated: r.updated,
      mode: r.mode,
      ...(r.over_limit ? { over_limit: r.over_limit } : {}),
    };
  } catch (err) {
    const message = err instanceof CatalogSyncError ? err.message : errorText(err);
    summary.products = { error: message };
    errors.push(`Products: ${message}`);
  }

  // Customers and orders need the Admin API.
  if (store.connection_type !== 'oauth' || !store.access_token) {
    const reason = 'Needs the Shopify app connection (Connect Shopify)';
    summary.customers = { skipped: reason };
    summary.orders = { skipped: reason };
    return { summary, errors };
  }

  let token: string;
  try {
    token = await getAccessToken(store);
  } catch (err) {
    const message = errorText(err);
    errors.push(`Shopify access: ${message}`);
    summary.customers = { error: message };
    summary.orders = { error: message };
    return { summary, errors };
  }

  if (missingScopes(store.scopes).includes('read_customers')) {
    summary.customers = { skipped: 'Reconnect Shopify to allow customer access' };
  } else {
    try {
      summary.customers = await syncCustomers(db, store, token);
    } catch (err) {
      const message = errorText(err);
      summary.customers = { error: message };
      errors.push(`Customers: ${message}`);
    }
  }

  try {
    summary.orders = await catchUpOrders(db, store, token);
  } catch (err) {
    const message = errorText(err);
    summary.orders = { error: message };
    errors.push(`Orders: ${message}`);
  }

  return { summary, errors };
}

// ---------- customers → contacts ----------

const CUSTOMERS_QUERY = `
query syncCustomers($cursor: String, $q: String) {
  customers(first: 100, after: $cursor, query: $q, sortKey: UPDATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      firstName lastName updatedAt
      defaultEmailAddress { emailAddress }
      defaultPhoneNumber { phoneNumber }
      defaultAddress { phone countryCodeV2 }
    }
  }
}`;

interface ShopifyCustomer {
  firstName: string | null;
  lastName: string | null;
  updatedAt: string;
  defaultEmailAddress: { emailAddress: string | null } | null;
  defaultPhoneNumber: { phoneNumber: string | null } | null;
  defaultAddress: { phone: string | null; countryCodeV2: string | null } | null;
}

interface CustomersPage {
  customers: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: ShopifyCustomer[];
  };
}

export function customerContact(
  c: ShopifyCustomer,
  defaultCallingCode: string
): { phone: string; name: string | null; email: string | null } | null {
  const country = c.defaultAddress?.countryCodeV2 ?? null;
  const phone =
    normalizeIntegrationPhone(c.defaultPhoneNumber?.phoneNumber, country, defaultCallingCode) ??
    normalizeIntegrationPhone(c.defaultAddress?.phone, country, defaultCallingCode);
  if (!phone) return null;
  const name = [c.firstName, c.lastName].map((s) => s?.trim()).filter(Boolean).join(' ') || null;
  return { phone, name, email: c.defaultEmailAddress?.emailAddress?.trim() || null };
}

async function syncCustomers(
  db: SupabaseClient,
  store: SyncStore,
  token: string
): Promise<PartResult> {
  const ownerUserId = await resolveAuditUserId(db, store.account_id);
  const tagId = await ensureShopifyTag(db, store.account_id, ownerUserId);

  // Shopify's search syntax; >= so a customer updated in the same
  // second as the cursor isn't lost (re-importing it is a no-op).
  const q = store.customers_synced_until
    ? `updated_at:>='${store.customers_synced_until}'`
    : null;

  let created = 0;
  let updated = 0;
  let seen = 0;
  let newest = store.customers_synced_until;
  let cursor: string | null = null;

  while (seen < MAX_CUSTOMERS_PER_RUN) {
    const data: CustomersPage = await shopifyGraphql<CustomersPage>(
      store.shop_domain,
      token,
      CUSTOMERS_QUERY,
      { cursor, q }
    );
    for (const c of data.customers.nodes) {
      seen++;
      if (!newest || c.updatedAt > newest) newest = c.updatedAt;
      const contact = customerContact(c, store.default_country_code);
      if (!contact) continue;
      const result = await upsertContact(db, store.account_id, ownerUserId, contact, tagId);
      if (result === 'created') created++;
      else if (result === 'updated') updated++;
    }
    if (!data.customers.pageInfo.hasNextPage) break;
    cursor = data.customers.pageInfo.endCursor;
  }

  // Sorted by updatedAt ascending, so a capped run resumes where it stopped.
  if (newest && newest !== store.customers_synced_until) {
    await db
      .from('shopify_stores')
      .update({ customers_synced_until: newest })
      .eq('id', store.id);
  }
  return { created, updated, checked: seen };
}

/**
 * Add the customer as a contact, or fill in a known contact's missing
 * name / email. Never overwrites what the team typed in RepeatGrow.
 */
async function upsertContact(
  db: SupabaseClient,
  accountId: string,
  ownerUserId: string,
  c: { phone: string; name: string | null; email: string | null },
  tagId: string | null
): Promise<'created' | 'updated' | 'unchanged'> {
  let contactId: string;
  let result: 'created' | 'updated' | 'unchanged' = 'unchanged';

  const existing = await findExistingContact(db, accountId, c.phone);
  if (existing) {
    contactId = existing.id;
    const patch: Record<string, string> = {};
    const currentName = (existing.name ?? '').trim();
    if (c.name && (!currentName || currentName.replace(/\D/g, '') === existing.phone.replace(/\D/g, ''))) {
      patch.name = c.name;
    }
    if (c.email && !existing.email) patch.email = c.email;
    if (Object.keys(patch).length) {
      await db
        .from('contacts')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      result = 'updated';
    }
  } else {
    const { data, error } = await db
      .from('contacts')
      .insert({
        account_id: accountId,
        user_id: ownerUserId,
        phone: c.phone,
        name: c.name || c.phone,
        email: c.email,
      })
      .select('id')
      .single();
    if (error || !data) {
      if (isUniqueViolation(error)) return 'unchanged'; // created meanwhile
      throw new Error(error?.message ?? 'contact insert failed');
    }
    contactId = data.id as string;
    result = 'created';
  }

  if (tagId) {
    await db
      .from('contact_tags')
      .upsert(
        { contact_id: contactId, tag_id: tagId },
        { onConflict: 'contact_id,tag_id', ignoreDuplicates: true }
      );
  }
  return result;
}

async function ensureShopifyTag(
  db: SupabaseClient,
  accountId: string,
  ownerUserId: string
): Promise<string | null> {
  const { data: existing } = await db
    .from('tags')
    .select('id')
    .eq('account_id', accountId)
    .ilike('name', SHOPIFY_CONTACT_TAG)
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id as string;
  const { data: created } = await db
    .from('tags')
    .insert({
      account_id: accountId,
      user_id: ownerUserId,
      name: SHOPIFY_CONTACT_TAG,
      color: SHOPIFY_TAG_COLOR,
    })
    .select('id')
    .single();
  return (created?.id as string | undefined) ?? null;
}

// ---------- missed orders ----------

const ORDERS_QUERY = `
query syncOrders($cursor: String, $q: String) {
  orders(first: 50, after: $cursor, query: $q, sortKey: CREATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      legacyResourceId name email phone statusPageUrl paymentGatewayNames
      totalPriceSet { shopMoney { amount currencyCode } }
      customer {
        firstName lastName
        defaultEmailAddress { emailAddress }
        defaultPhoneNumber { phoneNumber }
        defaultAddress { phone countryCodeV2 }
      }
      shippingAddress { firstName lastName phone countryCodeV2 }
      billingAddress { firstName lastName phone countryCodeV2 }
    }
  }
}`;

interface Address {
  firstName?: string | null;
  lastName?: string | null;
  phone: string | null;
  countryCodeV2: string | null;
}

interface ShopifyOrderNode {
  legacyResourceId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  statusPageUrl: string | null;
  paymentGatewayNames: string[] | null;
  totalPriceSet: { shopMoney: { amount: string; currencyCode: string } } | null;
  customer: {
    firstName: string | null;
    lastName: string | null;
    defaultEmailAddress: { emailAddress: string | null } | null;
    defaultPhoneNumber: { phoneNumber: string | null } | null;
    defaultAddress: Address | null;
  } | null;
  shippingAddress: Address | null;
  billingAddress: Address | null;
}

interface OrdersPage {
  orders: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: ShopifyOrderNode[];
  };
}

/** The shopify_orders columns a webhook would have written, from a GraphQL order. */
export function orderRow(o: ShopifyOrderNode, defaultCallingCode: string) {
  // Same preference order as contactPhoneOf() for webhook payloads.
  const candidates: [string | null | undefined, string | null | undefined][] = [
    [o.phone, o.shippingAddress?.countryCodeV2],
    [o.customer?.defaultPhoneNumber?.phoneNumber, o.customer?.defaultAddress?.countryCodeV2],
    [o.shippingAddress?.phone, o.shippingAddress?.countryCodeV2],
    [o.billingAddress?.phone, o.billingAddress?.countryCodeV2],
    [o.customer?.defaultAddress?.phone, o.customer?.defaultAddress?.countryCodeV2],
  ];
  let phone: string | null = null;
  for (const [raw, country] of candidates) {
    phone = normalizeIntegrationPhone(raw, country, defaultCallingCode);
    if (phone) break;
  }
  const first = o.customer?.firstName ?? o.shippingAddress?.firstName ?? o.billingAddress?.firstName ?? null;
  const last = o.customer?.lastName ?? o.shippingAddress?.lastName ?? o.billingAddress?.lastName ?? null;
  const gateways = (o.paymentGatewayNames ?? []).filter(Boolean).join(', ');
  return {
    shopify_order_id: o.legacyResourceId,
    order_name: o.name,
    phone,
    customer_name: [first, last].filter(Boolean).join(' ') || null,
    email: o.email ?? o.customer?.defaultEmailAddress?.emailAddress ?? null,
    total: o.totalPriceSet?.shopMoney.amount ?? null,
    currency: o.totalPriceSet?.shopMoney.currencyCode ?? null,
    payment_method: gateways || null,
    order_status_url: o.statusPageUrl,
  };
}

async function catchUpOrders(
  db: SupabaseClient,
  store: SyncStore,
  token: string
): Promise<PartResult> {
  const since = new Date(Date.now() - ORDER_LOOKBACK_HOURS * 3_600_000).toISOString();
  const q = `created_at:>='${since}'`;

  let added = 0;
  let checked = 0;
  let cursor: string | null = null;
  while (checked < MAX_ORDERS_PER_RUN) {
    const data: OrdersPage = await shopifyGraphql<OrdersPage>(
      store.shop_domain,
      token,
      ORDERS_QUERY,
      { cursor, q }
    );
    const rows = data.orders.nodes.map((o) => ({
      account_id: store.account_id,
      store_id: store.id,
      ...orderRow(o, store.default_country_code),
    }));
    checked += rows.length;
    if (rows.length) {
      // Insert only orders we don't have; a webhook row is never overwritten.
      const { data: inserted, error } = await db
        .from('shopify_orders')
        .upsert(rows, { onConflict: 'store_id,shopify_order_id', ignoreDuplicates: true })
        .select('id');
      if (error) throw new Error(error.message);
      added += inserted?.length ?? 0;
    }
    if (!data.orders.pageInfo.hasNextPage) break;
    cursor = data.orders.pageInfo.endCursor;
  }
  return { added, checked };
}
