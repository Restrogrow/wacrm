import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/flows/admin-client', () => ({ supabaseAdmin: vi.fn() }));
vi.mock('@/lib/billing/server', () => ({ accountCanSend: vi.fn() }));

import { isTransientSendError, MAX_ATTEMPTS, nextRetryAt } from './scheduled';

describe('isTransientSendError', () => {
  it('retries throttling, Meta outages and network errors', () => {
    for (const message of [
      '(#130429) Rate limit hit',
      'Service temporarily unavailable',
      'An unknown error occurred. Please try again later',
      'Meta API error: 503',
      'fetch failed',
      'The operation was aborted due to timeout',
      'read ECONNRESET',
    ]) {
      expect(isTransientSendError(message), message).toBe(true);
    }
  });

  it('does not retry permanent failures', () => {
    for (const message of [
      'Template name does not exist in the translation',
      '(#131026) Message undeliverable',
      'Recipient phone number not in allowed list',
      'Parameter value is not valid',
      'Opted out (replied STOP)',
    ]) {
      expect(isTransientSendError(message), message).toBe(false);
    }
  });
});

describe('nextRetryAt', () => {
  it('backs off, then gives up after the last try', () => {
    const now = 1_000_000;
    expect(nextRetryAt(1, now)).toBe(new Date(now + 60_000).toISOString());
    expect(nextRetryAt(2, now)).toBe(new Date(now + 5 * 60_000).toISOString());
    expect(nextRetryAt(MAX_ATTEMPTS - 1, now)).not.toBeNull();
    expect(nextRetryAt(MAX_ATTEMPTS, now)).toBeNull();
  });
});
