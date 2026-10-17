// WooCommerce integration configuration — pure.

import { publicOrigin } from '@/lib/public-origin';

export const WOO_WEBHOOK_PATH = '/api/integrations/woocommerce/webhooks';

export function wooWebhookUrl(ingestToken: string): string {
  return `${publicOrigin()}${WOO_WEBHOOK_PATH}/${ingestToken}`;
}

/** Webhooks the merchant creates in WooCommerce → Settings → Advanced → Webhooks. */
export const WOO_TOPICS = [
  {
    topic: 'order.created',
    adminName: 'Order created',
    drives: 'Order placed, COD order placed',
  },
  {
    topic: 'order.updated',
    adminName: 'Order updated',
    drives: 'Order completed, Order cancelled, Order refunded',
  },
] as const;
