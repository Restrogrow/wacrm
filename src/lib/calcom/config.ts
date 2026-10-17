// Cal.com integration configuration — pure.

import { publicOrigin } from '@/lib/public-origin';

export const CALCOM_WEBHOOK_PATH = '/api/integrations/calcom/webhooks';

export function calcomWebhookUrl(ingestToken: string): string {
  return `${publicOrigin()}${CALCOM_WEBHOOK_PATH}/${ingestToken}`;
}

/** Webhook triggers the merchant ticks in Cal.com > Settings > Developer > Webhooks. */
export const CALCOM_TRIGGERS = [
  { trigger: 'BOOKING_CREATED', adminName: 'Booking created', drives: 'Booking confirmed, 24 h / 1 h reminders' },
  { trigger: 'BOOKING_RESCHEDULED', adminName: 'Booking rescheduled', drives: 'Booking rescheduled' },
  { trigger: 'BOOKING_CANCELLED', adminName: 'Booking cancelled', drives: 'Booking cancelled' },
] as const;
