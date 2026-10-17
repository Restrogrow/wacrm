// Shiprocket integration configuration — pure.

import { publicOrigin } from '@/lib/public-origin';

// Shiprocket refuses webhook URLs that contain "shiprocket", "sr", "kr" or
// "kartrocket", so this path and the (hex) token deliberately avoid them.
export const SHIPPING_WEBHOOK_PATH = '/api/integrations/shipping-updates/webhooks';

export function shippingWebhookUrl(ingestToken: string): string {
  return `${publicOrigin()}${SHIPPING_WEBHOOK_PATH}/${ingestToken}`;
}
