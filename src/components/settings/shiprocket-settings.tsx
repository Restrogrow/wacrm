'use client';

// ShiprocketSettings - Integrations -> Shiprocket. Thin wrapper over the
// shared webhook panel; API: /api/integrations/shipping-updates.

import {
  AlertTriangle,
  CheckCircle2,
  PackageCheck,
  RotateCcw,
  Route,
  Truck,
  type LucideIcon,
} from 'lucide-react';

import {
  SHIPROCKET_EVENTS,
  SHIPROCKET_EVENT_META,
  SHIPROCKET_VARIABLES,
  type ShiprocketEvent,
} from '@/lib/shiprocket/events';
import { WebhookIntegrationPanel } from './webhook-integration-panel';

const EVENT_ICONS: Partial<Record<ShiprocketEvent, LucideIcon>> = {
  shipped: PackageCheck,
  in_transit: Route,
  out_for_delivery: Truck,
  delivered: CheckCircle2,
  delivery_failed: AlertTriangle,
  return_initiated: RotateCcw,
};

export function ShiprocketSettings() {
  return (
    <WebhookIntegrationPanel<ShiprocketEvent>
      apiBase="/api/integrations/shipping-updates"
      name="Shiprocket"
      icon={Truck}
      description="Send customers WhatsApp updates automatically as their Shiprocket shipment is picked up, goes out for delivery, is delivered, fails delivery or is returned."
      connectTitle="Connect Shiprocket"
      connectHelp="We create a webhook URL and a token; you paste them into Shiprocket. No passwords or API keys needed."
      connectButton="Get webhook URL and token"
      secretLabel="Token"
      connectedLabel="Shiprocket"
      events={SHIPROCKET_EVENTS}
      meta={SHIPROCKET_EVENT_META}
      variables={SHIPROCKET_VARIABLES}
      eventIcons={EVENT_ICONS}
      steps={
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            In Shiprocket, open <b>Settings → API → Webhooks</b>.
          </li>
          <li>
            Paste the <b>Webhook URL</b> below and the <b>Token</b> as the secret token (it is sent in the{' '}
            <code>x-api-key</code> header), then turn the webhook on.
          </li>
          <li>
            Shiprocket does not send the customer&apos;s phone, so connect your <b>Shopify</b> or <b>WooCommerce</b>{' '}
            store in Repeat Grow too. We match the order number to find the customer.
          </li>
        </ol>
      }
      activityLabel={(row) =>
        `${row.event ? (SHIPROCKET_EVENT_META[row.event as ShiprocketEvent]?.label ?? row.event) : row.topic}${
          row.order_number ? ` · ${row.order_number}` : ''
        }${row.topic === 'test' ? ' · test' : ''}`
      }
    />
  );
}
