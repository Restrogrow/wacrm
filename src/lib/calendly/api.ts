// ============================================================
// Calendly API v2 client — server-only. Authenticated with the
// business's personal access token (Calendly → Integrations → API &
// Webhooks). Webhook subscriptions need a paid Calendly plan.
// https://developer.calendly.com/openapi/calendly-api.yaml
// ============================================================

import { CALENDLY_WEBHOOK_EVENTS } from './events';

const API = 'https://api.calendly.com';

export class CalendlyApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'CalendlyApiError';
  }
}

async function calendly<T>(
  token: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  // A full URL (a webhook subscription's uri) must still be Calendly's API:
  // the account's token goes with this request.
  const url = path.startsWith('http') ? path : `${API}${path}`
  if (!url.startsWith(`${API}/`)) throw new Error('Calendly request URL is not the Calendly API')
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => ({}))) as {
    title?: string;
    message?: string;
    details?: { message?: string }[];
  } & T;
  if (!res.ok) {
    const detail = json.details
      ?.map((d) => d.message)
      .filter(Boolean)
      .join('; ');
    throw new CalendlyApiError(
      [json.title, json.message, detail].filter(Boolean).join(': ') ||
        `HTTP ${res.status}`,
      res.status
    );
  }
  return json;
}

export interface CalendlyUser {
  uri: string;
  name: string | null;
  email: string | null;
  scheduling_url: string | null;
  current_organization: string;
}

export async function getCurrentUser(token: string): Promise<CalendlyUser> {
  const { resource } = await calendly<{ resource: CalendlyUser }>(
    token,
    '/users/me'
  );
  return resource;
}

/** Subscribe the user's bookings to `url`; returns the subscription URI. */
export async function createWebhookSubscription(
  token: string,
  user: CalendlyUser,
  url: string,
  signingKey: string
): Promise<string> {
  const { resource } = await calendly<{ resource: { uri: string } }>(
    token,
    '/webhook_subscriptions',
    {
      method: 'POST',
      body: JSON.stringify({
        url,
        events: CALENDLY_WEBHOOK_EVENTS,
        organization: user.current_organization,
        user: user.uri,
        scope: 'user',
        signing_key: signingKey,
      }),
    }
  );
  return resource.uri;
}

export async function deleteWebhookSubscription(
  token: string,
  uri: string
): Promise<void> {
  await calendly<void>(token, uri, { method: 'DELETE' });
}

/** Turn Calendly's errors into something a business owner can act on. */
export function friendlyCalendlyError(err: unknown): string {
  if (err instanceof CalendlyApiError) {
    if (err.status === 401) {
      return 'Calendly rejected the token. Generate a new personal access token and paste it again.';
    }
    if (err.status === 403) {
      return `Calendly refused (${err.message}). Webhooks need a paid Calendly plan, and the token needs the webhooks, scheduled events and users permissions.`;
    }
    return `Calendly error: ${err.message}`;
  }
  return err instanceof Error ? err.message : 'Could not reach Calendly';
}
