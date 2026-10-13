// Shared Sentry settings for the browser, server and edge runtimes.
//
// Sentry stays OFF until NEXT_PUBLIC_SENTRY_DSN is set (Hostinger env,
// from sentry.io → Project settings → Client keys). Errors only, a small
// trace sample, and no Session Replay or default PII: customer chats are
// private, so nothing from the page content is recorded.

export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

export const sentryOptions = {
  dsn: SENTRY_DSN,
  enabled: !!SENTRY_DSN,
  environment:
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
  tracesSampleRate: 0.05,
  sendDefaultPii: false,
};
