// ============================================================
// The connected-store row shape, on its own so that `process.ts` (the
// webhook handlers) and `schedule.ts` (the queue) can both use it
// without importing each other.
//
// They genuinely need to call in both directions — a webhook enqueues
// steps, and the queue's worker needs the store a step belongs to — so
// the shared vocabulary lives here instead. `process.ts` re-exports
// both names, so existing `from './process'` imports keep working.
// ============================================================

export interface ShopifyStore {
  id: string;
  account_id: string;
  shop_domain: string;
  shop_name: string | null;
  connection_type: 'oauth' | 'webhook';
  default_country_code: string;
  status: 'active' | 'disconnected';
}

export const STORE_COLUMNS =
  'id, account_id, shop_domain, shop_name, connection_type, default_country_code, status';
