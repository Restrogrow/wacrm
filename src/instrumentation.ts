import * as Sentry from '@sentry/nextjs';

import { sentryOptions } from '@/lib/sentry-options';

// Server + edge errors → Sentry (no-op until NEXT_PUBLIC_SENTRY_DSN is
// set): route handlers (webhooks, cron, integrations), server
// components, and the proxy.
export async function register() {
  if (
    process.env.NEXT_RUNTIME === 'nodejs' ||
    process.env.NEXT_RUNTIME === 'edge'
  ) {
    Sentry.init(sentryOptions);
  }
}

export const onRequestError = Sentry.captureRequestError;
