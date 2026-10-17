import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { normalizeIntegrationPhone } from '@/lib/integrations/phone';
import {
  eventsForStatus,
  isWooCashOnDelivery,
  resolveWooBodyParams,
  summarizeWooItems,
  wooContactPhoneOf,
  wooCustomerNamesOf,
  wooOrderContext,
  wooOrderNumberOf,
  wooOrderUrl,
  wooTrackingOf,
} from './events';
import { normalizeStoreUrl, verifyWooCommerceWebhook } from './verify';

describe('verifyWooCommerceWebhook', () => {
  const body = JSON.stringify({ id: 1001, status: 'processing' });
  const secret = 'generated-secret-value';
  const good = createHmac('sha256', secret).update(body, 'utf8').digest('base64');

  it('accepts a correct signature', () => {
    expect(verifyWooCommerceWebhook(body, good, secret)).toBe(true);
    expect(verifyWooCommerceWebhook(body, `  ${good} `, secret)).toBe(true);
  });

  it('rejects a wrong secret, a tampered body, and a missing or empty signature', () => {
    expect(verifyWooCommerceWebhook(body, good, 'other-secret')).toBe(false);
    expect(verifyWooCommerceWebhook(body + ' ', good, secret)).toBe(false);
    expect(verifyWooCommerceWebhook(body, null, secret)).toBe(false);
    expect(verifyWooCommerceWebhook(body, '', secret)).toBe(false);
    expect(verifyWooCommerceWebhook(body, good, '')).toBe(false);
  });

  it('rejects a signature of the wrong length without throwing', () => {
    expect(verifyWooCommerceWebhook(body, good.slice(0, -2), secret)).toBe(false);
    expect(verifyWooCommerceWebhook(body, `${good}AAAA`, secret)).toBe(false);
  });

  it('verifies the form-encoded ping WooCommerce sends on webhook creation', () => {
    const ping = 'webhook_id=12';
    const sig = createHmac('sha256', secret).update(ping, 'utf8').digest('base64');
    expect(verifyWooCommerceWebhook(ping, sig, secret)).toBe(true);
  });
});

describe('normalizeStoreUrl', () => {
  it('normalizes what merchants paste', () => {
    expect(normalizeStoreUrl('shop.example.com')).toBe('https://shop.example.com');
    expect(normalizeStoreUrl('https://Shop.Example.com/wp-admin/')).toBe('https://shop.example.com');
    expect(normalizeStoreUrl('http://shop.example.com:8080/x?y=1')).toBe('http://shop.example.com:8080');
  });

  it('rejects things that are not a public store address', () => {
    expect(normalizeStoreUrl('')).toBeNull();
    expect(normalizeStoreUrl(null)).toBeNull();
    expect(normalizeStoreUrl('localhost')).toBeNull();
    expect(normalizeStoreUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeStoreUrl('ftp://shop.example.com')).toBeNull();
    expect(normalizeStoreUrl('not a url')).toBeNull();
  });
});

const ORDER = {
  id: 727,
  number: '727',
  status: 'processing',
  currency: 'INR',
  total: '1299.00',
  order_key: 'wc_order_abc123',
  payment_method: 'razorpay',
  payment_method_title: 'Razorpay',
  billing: {
    first_name: 'Priya',
    last_name: 'Sharma',
    email: 'priya@example.com',
    phone: '98765 43210',
    country: 'IN',
  },
  shipping: { first_name: 'Priya', last_name: 'Sharma', phone: '', country: 'IN' },
  line_items: [
    { name: 'Kurta', quantity: 2 },
    { name: 'Dupatta', quantity: 1 },
  ],
  meta_data: [
    {
      key: '_wc_shipment_tracking_items',
      value: [
        {
          tracking_provider: 'delhivery',
          custom_tracking_provider: 'Delhivery',
          tracking_number: 'AWB123',
          formatted_tracking_link: 'https://track.example/AWB123',
        },
      ],
    },
  ],
};

describe('order payload mapping', () => {
  it('reads the customer from billing details', () => {
    expect(wooCustomerNamesOf(ORDER)).toEqual({ first: 'Priya', full: 'Priya Sharma' });
    expect(wooContactPhoneOf(ORDER)).toEqual({ phone: '98765 43210', countryCode: 'IN' });
    expect(wooOrderNumberOf(ORDER)).toBe('#727');
  });

  it('falls back to the shipping phone when billing has none', () => {
    const order = { ...ORDER, billing: { ...ORDER.billing, phone: '' }, shipping: { phone: '+91 91234 56789', country: 'IN' } };
    expect(wooContactPhoneOf(order).phone).toBe('+91 91234 56789');
    expect(wooContactPhoneOf({ billing: {}, shipping: {} })).toEqual({ phone: null, countryCode: null });
  });

  it('turns an Indian national number into WhatsApp digits', () => {
    const { phone, countryCode } = wooContactPhoneOf(ORDER);
    expect(normalizeIntegrationPhone(phone, countryCode, '91')).toBe('919876543210');
  });

  it('detects cash on delivery', () => {
    expect(isWooCashOnDelivery({ payment_method: 'cod' })).toBe(true);
    expect(isWooCashOnDelivery({ payment_method: 'x', payment_method_title: 'Cash on delivery' })).toBe(true);
    expect(isWooCashOnDelivery(ORDER)).toBe(false);
  });

  it('summarizes line items', () => {
    expect(summarizeWooItems(ORDER.line_items)).toBe('2 × Kurta, 1 × Dupatta');
    expect(summarizeWooItems([{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }])).toBe(
      '1 × A, 1 × B, 1 × C +1 more'
    );
    expect(summarizeWooItems([])).toBeNull();
  });

  it('reads shipment-tracking plugin data', () => {
    expect(wooTrackingOf(ORDER)).toEqual({
      number: 'AWB123',
      url: 'https://track.example/AWB123',
      company: 'Delhivery',
    });
    expect(wooTrackingOf({ meta_data: [] })).toEqual({ number: null, url: null, company: null });
    expect(wooTrackingOf({})).toEqual({ number: null, url: null, company: null });
  });

  it('builds the order-received link only when the order key is present', () => {
    expect(wooOrderUrl(ORDER, 'https://shop.example.com/')).toBe(
      'https://shop.example.com/checkout/order-received/727/?key=wc_order_abc123'
    );
    expect(wooOrderUrl({ id: 1 }, 'https://shop.example.com')).toBeNull();
  });

  it('builds the template context', () => {
    const ctx = wooOrderContext(ORDER, 'https://shop.example.com', 'shop.example.com');
    expect(ctx.customer_name).toBe('Priya');
    expect(ctx.order_number).toBe('#727');
    expect(ctx.order_total).toContain('1,299');
    expect(ctx.courier).toBe('Delhivery');
    expect(ctx.shop_name).toBe('shop.example.com');
  });

  it('fills missing variables with "-" so Meta accepts the message', () => {
    const ctx = wooOrderContext({ id: 5 }, 'https://shop.example.com', null);
    expect(resolveWooBodyParams(['customer_name', 'order_number', 'tracking_number'], ctx)).toEqual(['-', '#5', '-']);
  });
});

describe('eventsForStatus', () => {
  it('confirms paid or accepted orders, once, with a COD variant', () => {
    expect(eventsForStatus('processing', false)).toEqual(['order_placed']);
    expect(eventsForStatus('on-hold', true)).toEqual(['cod_order_placed']);
  });

  it('does not confirm unpaid or failed checkouts', () => {
    expect(eventsForStatus('pending', false)).toEqual([]);
    expect(eventsForStatus('failed', false)).toEqual([]);
    expect(eventsForStatus('checkout-draft', false)).toEqual([]);
    expect(eventsForStatus(undefined, false)).toEqual([]);
  });

  it('maps completed, cancelled and refunded', () => {
    expect(eventsForStatus('completed', false)).toEqual(['order_placed', 'order_completed']);
    expect(eventsForStatus('cancelled', false)).toEqual(['order_cancelled']);
    expect(eventsForStatus('refunded', false)).toEqual(['order_refunded']);
    expect(eventsForStatus('Completed', true)).toEqual(['cod_order_placed', 'order_completed']);
  });
});
