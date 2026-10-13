import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  checkoutContext,
  contactPhoneOf,
  countBodyVariables,
  formatMoney,
  isCashOnDelivery,
  orderContext,
  resolveBodyParams,
  shipmentStatusEvent,
  summarizeItems,
} from './events';
import { normalizeIntegrationPhone } from '@/lib/integrations/phone';
import {
  isValidShopDomain,
  normalizeShopDomain,
  verifyShopifyOAuthQuery,
  verifyShopifyWebhook,
} from './verify';

describe('verifyShopifyWebhook', () => {
  const body = JSON.stringify({ id: 1, name: '#1001' });
  const secret = 'shh';
  const good = createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64');

  it('accepts a correct signature and rejects anything else', () => {
    expect(verifyShopifyWebhook(body, good, secret)).toBe(true);
    expect(verifyShopifyWebhook(body + ' ', good, secret)).toBe(false);
    expect(verifyShopifyWebhook(body, good, 'other')).toBe(false);
    expect(verifyShopifyWebhook(body, null, secret)).toBe(false);
  });
});

describe('verifyShopifyOAuthQuery', () => {
  it('checks the hex HMAC over the sorted remaining params', () => {
    const secret = 'client-secret';
    const params = new URLSearchParams({
      shop: 'demo.myshopify.com',
      code: 'abc',
      timestamp: '1700000000',
      state: 'nonce',
    });
    const message =
      'code=abc&shop=demo.myshopify.com&state=nonce&timestamp=1700000000';
    params.set(
      'hmac',
      createHmac('sha256', secret).update(message).digest('hex')
    );
    expect(verifyShopifyOAuthQuery(params, secret)).toBe(true);
    params.set('code', 'tampered');
    expect(verifyShopifyOAuthQuery(params, secret)).toBe(false);
  });
});

describe('shop domains', () => {
  it('validates anchored myshopify domains', () => {
    expect(isValidShopDomain('my-store.myshopify.com')).toBe(true);
    expect(isValidShopDomain('my-store.myshopify.com.evil.com')).toBe(false);
    expect(isValidShopDomain('evil.com')).toBe(false);
  });

  it('normalizes what merchants paste', () => {
    expect(normalizeShopDomain('My-Store')).toBe('my-store.myshopify.com');
    expect(normalizeShopDomain('https://my-store.myshopify.com/admin')).toBe(
      'my-store.myshopify.com'
    );
    expect(normalizeShopDomain('mystore.com')).toBeNull();
    expect(normalizeShopDomain('')).toBeNull();
  });
});

describe('normalizeIntegrationPhone', () => {
  it('adds +91 to Indian national numbers', () => {
    expect(normalizeIntegrationPhone('98765 43210', 'IN', '91')).toBe(
      '919876543210'
    );
    expect(normalizeIntegrationPhone('098765-43210', 'IN', '91')).toBe(
      '919876543210'
    );
    expect(normalizeIntegrationPhone('919876543210', 'IN', '91')).toBe(
      '919876543210'
    );
  });

  it('keeps numbers that are already international', () => {
    expect(normalizeIntegrationPhone('+44 7700 900123', 'IN', '91')).toBe(
      '447700900123'
    );
    expect(normalizeIntegrationPhone('0044 7700 900123', null, '91')).toBe(
      '447700900123'
    );
  });

  it('uses the store default when the address has no country', () => {
    expect(normalizeIntegrationPhone('9876543210', null, '91')).toBe(
      '919876543210'
    );
    expect(normalizeIntegrationPhone('07700 900123', 'GB', '91')).toBe(
      '447700900123'
    );
  });

  it('returns null for unusable input', () => {
    expect(normalizeIntegrationPhone('', 'IN', '91')).toBeNull();
    expect(normalizeIntegrationPhone('12', 'IN', '91')).toBeNull();
    expect(normalizeIntegrationPhone(null, 'IN', '91')).toBeNull();
  });
});

const ORDER = {
  id: 450789469,
  name: '#1001',
  total_price: '1299.00',
  currency: 'INR',
  phone: null,
  customer: { first_name: 'Priya', last_name: 'Sharma', phone: '98765 43210' },
  shipping_address: {
    first_name: 'Priya',
    country_code: 'IN',
    phone: '9999999999',
  },
  payment_gateway_names: ['Cash on Delivery (COD)'],
  order_status_url: 'https://shop.example/orders/abc',
  line_items: [
    { title: 'Kurta', quantity: 2 },
    { title: 'Dupatta', quantity: 1 },
  ],
  fulfillments: [
    {
      tracking_number: 'AWB1',
      tracking_url: 'https://t.example/AWB1',
      tracking_company: 'Delhivery',
    },
  ],
};

describe('order payloads', () => {
  it('finds the phone on the customer before the address', () => {
    expect(contactPhoneOf(ORDER)).toEqual({
      phone: '98765 43210',
      countryCode: 'IN',
    });
  });

  it('detects cash on delivery', () => {
    expect(isCashOnDelivery(ORDER)).toBe(true);
    expect(isCashOnDelivery({ payment_gateway_names: ['razorpay'] })).toBe(
      false
    );
  });

  it('builds the message context', () => {
    const ctx = orderContext(ORDER, 'My Store');
    expect(ctx.customer_name).toBe('Priya');
    expect(ctx.customer_full_name).toBe('Priya Sharma');
    expect(ctx.order_number).toBe('#1001');
    expect(ctx.order_total).toBe(formatMoney('1299.00', 'INR'));
    expect(ctx.items).toBe('2 × Kurta, 1 × Dupatta');
    expect(ctx.tracking_url).toBe('https://t.example/AWB1');
    expect(ctx.courier).toBe('Delhivery');
    expect(ctx.shop_name).toBe('My Store');
  });

  it('builds checkout context with the recovery link', () => {
    const ctx = checkoutContext(
      {
        abandoned_checkout_url: 'https://shop.example/c/1',
        total_price: '10',
        currency: 'USD',
      },
      null
    );
    expect(ctx.checkout_url).toBe('https://shop.example/c/1');
    expect(ctx.order_total).toBe('$10.00');
  });
});

describe('helpers', () => {
  it('summarizes long carts', () => {
    const items = [1, 2, 3, 4, 5].map((n) => ({
      title: `Item ${n}`,
      quantity: 1,
    }));
    expect(summarizeItems(items)).toBe(
      '1 × Item 1, 1 × Item 2, 1 × Item 3 +2 more'
    );
    expect(summarizeItems([])).toBeNull();
  });

  it('maps carrier statuses', () => {
    expect(shipmentStatusEvent('out_for_delivery')).toBe('out_for_delivery');
    expect(shipmentStatusEvent('delivered')).toBe('order_delivered');
    expect(shipmentStatusEvent('in_transit')).toBeNull();
  });

  it('counts template variables and fills blanks with a dash', () => {
    expect(countBodyVariables('Hi {{1}}, order {{2}} total {{ 3 }}')).toBe(3);
    expect(countBodyVariables('No variables')).toBe(0);
    const ctx = orderContext(ORDER, null);
    expect(resolveBodyParams(['customer_name', 'shop_name'], ctx)).toEqual([
      'Priya',
      '-',
    ]);
  });
});
