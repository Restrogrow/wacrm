import { describe, expect, it } from 'vitest';

import {
  DELAY_UNITS,
  MAX_STEPS_PER_EVENT,
  dedupeKey,
  delayToMinutes,
  describeDelay,
  minutesToDelay,
  schedulableSteps,
  sendAtFor,
  validateSteps,
  type MessageStep,
} from './steps';
import { urlButtonParam } from './events';

// Templates the validator can resolve. The variable count comes from
// the body text, so these drive the "mapped vs needed" checks.
const BODIES: Record<string, string> = {
  cart_1: 'Hi {{1}}, your cart is waiting.',
  cart_2: 'Hi {{1}}, {{2}} is still in your cart.',
  no_vars: 'Your order is on its way.',
};
const bodyTextOf = (name: string) => BODIES[name];

function step(over: Partial<MessageStep> = {}): Record<string, unknown> {
  return {
    enabled: true,
    template_name: 'cart_1',
    template_language: 'en_US',
    body_variables: ['customer_name'],
    delay_minutes: 30,
    delay_unit: 'minutes',
    url_button_variable: null,
    ...over,
  };
}

describe('delay conversion', () => {
  it('converts each unit to minutes', () => {
    expect(delayToMinutes(30, 'minutes')).toBe(30);
    expect(delayToMinutes(7, 'hours')).toBe(420);
    expect(delayToMinutes(3, 'days')).toBe(4320);
  });

  it('round-trips through the largest unit that divides evenly', () => {
    expect(minutesToDelay(420)).toEqual({ value: 7, unit: 'hours' });
    expect(minutesToDelay(4320)).toEqual({ value: 3, unit: 'days' });
    expect(minutesToDelay(90)).toEqual({ value: 90, unit: 'minutes' });
  });

  it('keeps the unit the merchant typed when it still divides cleanly', () => {
    // Someone who entered "60 minutes" should not be shown "1 hour".
    expect(minutesToDelay(60, 'minutes')).toEqual({ value: 60, unit: 'minutes' });
    expect(minutesToDelay(60, 'hours')).toEqual({ value: 1, unit: 'hours' });
    // Preference that doesn't divide falls back to the largest that does.
    expect(minutesToDelay(90, 'hours')).toEqual({ value: 90, unit: 'minutes' });
  });

  it('describes delays in words, singularising the unit', () => {
    expect(describeDelay({ delay_minutes: 0 } as MessageStep)).toBe('Send immediately');
    expect(
      describeDelay({ delay_minutes: 60, delay_unit: 'hours' } as MessageStep)
    ).toBe('After 1 hour');
    expect(
      describeDelay({ delay_minutes: 420, delay_unit: 'hours' } as MessageStep)
    ).toBe('After 7 hours');
  });

  it('exposes exactly the units the schema allows', () => {
    expect([...DELAY_UNITS]).toEqual(['minutes', 'hours', 'days']);
  });
});

describe('scheduling helpers', () => {
  it('adds the delay to the event time', () => {
    const base = new Date('2026-01-01T10:00:00Z');
    expect(sendAtFor(base, 30).toISOString()).toBe('2026-01-01T10:30:00.000Z');
    expect(sendAtFor(base, 0).toISOString()).toBe('2026-01-01T10:00:00.000Z');
  });

  it('treats a negative delay as immediate rather than going backwards', () => {
    const base = new Date('2026-01-01T10:00:00Z');
    expect(sendAtFor(base, -90).toISOString()).toBe('2026-01-01T10:00:00.000Z');
  });

  it('keys on event + step + entity so a webhook retry collides', () => {
    expect(dedupeKey('abandoned_checkout', 1, 'tok_abc')).toBe(
      'abandoned_checkout:1:tok_abc'
    );
    // Different step of the same cart is a different message.
    expect(dedupeKey('abandoned_checkout', 2, 'tok_abc')).not.toBe(
      dedupeKey('abandoned_checkout', 1, 'tok_abc')
    );
  });

  it('schedules only enabled steps with a template, earliest first', () => {
    const steps = [
      { enabled: true, template_name: 't', delay_minutes: 1440 },
      { enabled: false, template_name: 't', delay_minutes: 30 },
      { enabled: true, template_name: null, delay_minutes: 60 },
      { enabled: true, template_name: 't', delay_minutes: 420 },
    ] as MessageStep[];
    expect(schedulableSteps(steps).map((s) => s.delay_minutes)).toEqual([420, 1440]);
  });
});

describe('validateSteps', () => {
  it('accepts an empty list', () => {
    expect(validateSteps([], bodyTextOf)).toEqual({ ok: true, value: [] });
  });

  it('rejects a non-list', () => {
    const r = validateSteps({ enabled: true }, bodyTextOf);
    expect(r).toEqual({ ok: false, error: 'Steps must be a list.' });
  });

  it('numbers steps by position', () => {
    const r = validateSteps(
      [step({ delay_minutes: 30 }), step({ delay_minutes: 420 })],
      bodyTextOf
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.map((s) => s.step_order)).toEqual([0, 1]);
    expect(r.value.map((s) => s.delay_minutes)).toEqual([30, 420]);
  });

  it('caps the number of steps', () => {
    const many = Array.from({ length: MAX_STEPS_PER_EVENT + 1 }, (_, i) =>
      step({ delay_minutes: (i + 1) * 30 })
    );
    const r = validateSteps(many, bodyTextOf);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/At most 5 steps/);
  });

  it('rejects an enabled step with no template', () => {
    const r = validateSteps([step({ template_name: null })], bodyTextOf);
    expect(r).toEqual({ ok: false, error: 'Step 1 needs a template.' });
  });

  it('allows a disabled step with no template', () => {
    const r = validateSteps(
      [step({ enabled: false, template_name: null, body_variables: [] })],
      bodyTextOf
    );
    expect(r.ok).toBe(true);
  });

  it('rejects a delay beyond 90 days', () => {
    const r = validateSteps([step({ delay_minutes: 200_000 })], bodyTextOf);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/between 0 and 90 days/);
  });

  it('accepts a zero delay as send-immediately', () => {
    const r = validateSteps([step({ delay_minutes: 0 })], bodyTextOf);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value[0].delay_minutes).toBe(0);
  });

  it('checks the variable mapping against the template body', () => {
    const r = validateSteps(
      [step({ template_name: 'cart_2', body_variables: ['customer_name'] })],
      bodyTextOf
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/has 2 variables to fill, but 1 is mapped/);
  });

  it('singularises the variable-count message', () => {
    const r = validateSteps(
      [step({ template_name: 'cart_1', body_variables: [] })],
      bodyTextOf
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/has 1 variable to fill, but 0 are mapped/);
  });

  it('skips the variable check for a disabled step', () => {
    const r = validateSteps(
      [step({ enabled: false, template_name: 'cart_2', body_variables: [] })],
      bodyTextOf
    );
    expect(r.ok).toBe(true);
  });

  it('rejects two enabled steps at the same delay', () => {
    const r = validateSteps(
      [step({ delay_minutes: 30 }), step({ delay_minutes: 30 })],
      bodyTextOf
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/same delay/);
  });

  it('ignores a duplicate delay between disabled steps', () => {
    const r = validateSteps(
      [
        step({ delay_minutes: 30 }),
        step({ enabled: false, template_name: null, delay_minutes: 30, body_variables: [] }),
      ],
      bodyTextOf
    );
    expect(r.ok).toBe(true);
  });

  it('keeps a URL-shaped button variable and drops anything else', () => {
    const kept = validateSteps(
      [step({ url_button_variable: 'checkout_url' })],
      bodyTextOf
    );
    expect(kept.ok).toBe(true);
    if (!kept.ok) return;
    expect(kept.value[0].url_button_variable).toBe('checkout_url');

    // A non-URL variable would build a nonsense link; a stale client
    // sending one degrades to "no dynamic button" rather than a 400.
    const dropped = validateSteps(
      [step({ url_button_variable: 'customer_name' })],
      bodyTextOf
    );
    expect(dropped.ok).toBe(true);
    if (!dropped.ok) return;
    expect(dropped.value[0].url_button_variable).toBeNull();
  });

  it('drops unknown body variables rather than failing the save', () => {
    const r = validateSteps(
      [step({ template_name: 'no_vars', body_variables: ['nope' as never] })],
      bodyTextOf
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value[0].body_variables).toEqual([]);
  });
});

describe('urlButtonParam', () => {
  const button = 'https://momperfume.in/{{1}}';

  it('strips the origin and leading slash', () => {
    expect(urlButtonParam('https://momperfume.in/checkouts/abc', button)).toEqual({
      ok: true,
      value: 'checkouts/abc',
    });
  });

  it('keeps the query string and hash', () => {
    expect(
      urlButtonParam('https://momperfume.in/cart?key=xyz#top', button)
    ).toEqual({ ok: true, value: 'cart?key=xyz#top' });
  });

  it('treats www as the same host', () => {
    expect(
      urlButtonParam('https://www.momperfume.in/checkouts/abc', button)
    ).toEqual({ ok: true, value: 'checkouts/abc' });
  });

  it('refuses to strip a different domain', () => {
    // Shopify hands out courier tracking links on hosts that are not
    // the store. Stripping that origin would send the customer to
    // momperfume.in/AWB123 — a real-looking URL on the wrong site.
    const r = urlButtonParam('https://delhivery.com/track/AWB123', button);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/delhivery\.com.*momperfume\.in/);
  });

  it('also removes the button\'s own fixed path', () => {
    expect(
      urlButtonParam(
        'https://shop.in/track/AWB123',
        'https://shop.in/track/{{1}}'
      )
    ).toEqual({ ok: true, value: 'AWB123' });
  });

  it('reports a link with nothing after the prefix', () => {
    const r = urlButtonParam('https://shop.in/track', 'https://shop.in/track/{{1}}');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/nothing after the button prefix/);
  });

  it('passes the path through when there is no button prefix to match', () => {
    expect(urlButtonParam('https://anything.test/a/b', null)).toEqual({
      ok: true,
      value: 'a/b',
    });
  });

  it('reports a missing or malformed link', () => {
    const missing = urlButtonParam(null, button);
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.reason).toMatch(/did not provide/);

    const bad = urlButtonParam('not a url', button);
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.reason).toMatch(/not a valid URL/);
  });
});
