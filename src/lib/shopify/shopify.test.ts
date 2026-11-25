import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  amountDueOf,
  amountPaidOf,
  checkoutContext,
  contactPhoneOf,
  countBodyVariables,
  formatAddress,
  isAutomatedCheckout,
  isCashOnDelivery,
  isCodOrPartiallyPaid,
  orderContext,
  outstandingPaise,
  plainOrderTotal,
  resolveBodyParams,
  shipmentStatusEvent,
  summarizeItems,
} from './events';
import { findDynamicUrlButtonIndex } from './schedule';
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

  it('spots Google Shopping’s checkout crawler', () => {
    // What the crawler actually sends: a throwaway Google address and
    // Shopify's own support line in place of a customer phone.
    const bot = {
      token: 'abc',
      email: 'johnsmith003@storebotmail.joonix.net',
      billing_address: { phone: '08067218000', country_code: 'IN' },
    };
    expect(isAutomatedCheckout(bot)).toBe(true);
    // Either signal alone is enough.
    expect(
      isAutomatedCheckout({ email: 'bot@joonix.net' })
    ).toBe(true);
    expect(isAutomatedCheckout({ phone: '08067218000' })).toBe(true);
    // Already normalised to E.164 digits, as the stored rows are.
    expect(isAutomatedCheckout({ phone: '918067218000' })).toBe(true);
    // Real shoppers pass.
    expect(isAutomatedCheckout(ORDER)).toBe(false);
    expect(
      isAutomatedCheckout({
        email: 'priya@gmail.com',
        phone: '9876543210',
      })
    ).toBe(false);
    // A lookalike domain is not a subdomain of joonix.net.
    expect(isAutomatedCheckout({ email: 'a@notjoonix.net' })).toBe(false);
  });

  it('builds the message context', () => {
    const ctx = orderContext(ORDER, 'My Store');
    expect(ctx.customer_name).toBe('Priya');
    expect(ctx.customer_full_name).toBe('Priya Sharma');
    expect(ctx.order_number).toBe('#1001');
    // Plain number, no ₹ — the template already has it.
    expect(ctx.order_total).toBe('1,299');
    expect(ctx.items).toBe('2 × Kurta, 1 × Dupatta');
    expect(ctx.tracking_url).toBe('https://t.example/AWB1');
    expect(ctx.courier).toBe('Delhivery');
    expect(ctx.shop_name).toBe('My Store');
    // ORDER has no total_outstanding/total_received — amount_due falls
    // back to total - received (0), amount_paid falls back to total -
    // outstanding (0, since outstanding also falls back to 0).
    expect(ctx.amount_due).toBe('1,299');
    expect(ctx.amount_paid).toBe('1,299');
    expect(ctx.balance_payment_url).toBeNull();
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
    expect(ctx.order_total).toBe('10');
    // Nothing is owed or paid on a checkout that was never completed.
    expect(ctx.amount_due).toBeNull();
    expect(ctx.amount_paid).toBeNull();
  });
});

describe('isCodOrPartiallyPaid', () => {
  it('is true for an unpaid or partially-paid financial_status', () => {
    expect(isCodOrPartiallyPaid('pending', 'Razorpay')).toBe(true);
    expect(isCodOrPartiallyPaid('partially_paid', 'Razorpay')).toBe(true);
  });

  it('is true for a Cash on Delivery payment method regardless of financial_status', () => {
    expect(isCodOrPartiallyPaid('paid', 'Cash on Delivery (COD)')).toBe(true);
  });

  it('is false for a fully paid, non-COD order', () => {
    expect(isCodOrPartiallyPaid('paid', 'Razorpay')).toBe(false);
    expect(isCodOrPartiallyPaid(null, 'Razorpay')).toBe(false);
  });
});

describe('amountDueOf', () => {
  it('prefers total_outstanding when Shopify provides it', () => {
    expect(amountDueOf('1799', '1799', null)).toBe('1,799');
    expect(amountDueOf('1799.00', '2500.00', '701.00')).toBe('1,799');
  });

  it('falls back to total minus total_received when total_outstanding is missing', () => {
    expect(amountDueOf(null, '2500', '701')).toBe('1,799');
    expect(amountDueOf(undefined, '1299.00', null)).toBe('1,299');
  });

  it('never goes negative', () => {
    expect(amountDueOf(null, '500', '900')).toBe('0');
  });

  it('is null when nothing usable is available', () => {
    expect(amountDueOf(null, null, null)).toBeNull();
    expect(amountDueOf('not-a-number', 'also-not-a-number', null)).toBeNull();
  });
});

describe('plainOrderTotal', () => {
  it('formats without a currency symbol or decimals', () => {
    expect(plainOrderTotal('1299.00')).toBe('1,299');
    expect(plainOrderTotal(1299)).toBe('1,299');
  });

  it('is null for unusable input', () => {
    expect(plainOrderTotal(null)).toBeNull();
    expect(plainOrderTotal('not-a-number')).toBeNull();
  });
});

describe('amountPaidOf', () => {
  it('prefers total_received when Shopify provides it', () => {
    expect(amountPaidOf('200', '1599', '1799')).toBe('200');
  });

  it('falls back to total minus outstanding when total_received is missing', () => {
    expect(amountPaidOf(null, '1599', '1799')).toBe('200');
    expect(amountPaidOf(undefined, null, '1299.00')).toBe('1,299');
  });

  it('never goes negative', () => {
    expect(amountPaidOf('-50', '1799', '1799')).toBe('0');
  });

  it('is null when nothing usable is available', () => {
    expect(amountPaidOf(null, null, null)).toBeNull();
  });
});

describe('outstandingPaise', () => {
  it('converts the outstanding rupee amount to paise', () => {
    expect(outstandingPaise('200', '1799', null)).toBe(20_000);
    expect(outstandingPaise(null, '2500', '1800')).toBe(70_000);
  });

  it('is null when there is nothing left to collect', () => {
    expect(outstandingPaise('0', '1799', '1799')).toBeNull();
    expect(outstandingPaise(null, '500', '900')).toBeNull();
    expect(outstandingPaise(null, null, null)).toBeNull();
  });
});

describe('findDynamicUrlButtonIndex', () => {
  it('finds the URL button carrying a {{n}} placeholder', () => {
    expect(
      findDynamicUrlButtonIndex([
        { type: 'QUICK_REPLY', text: 'Yes' },
        { type: 'URL', url: 'https://rzp.io/{{1}}' },
      ])
    ).toBe(1);
  });

  it('is null when there is no dynamic URL button', () => {
    expect(findDynamicUrlButtonIndex([{ type: 'URL', url: 'https://shop.example' }])).toBeNull();
    expect(findDynamicUrlButtonIndex(null)).toBeNull();
    expect(findDynamicUrlButtonIndex(undefined)).toBeNull();
  });
});

describe('formatAddress', () => {
  it('joins the address into one comma-separated line', () => {
    expect(
      formatAddress({
        address1: '12 MG Road',
        address2: 'Indiranagar',
        city: 'Bengaluru',
        province: 'Karnataka',
        zip: '560038',
        country: 'India',
      })
    ).toBe('12 MG Road, Indiranagar, Bengaluru, Karnataka, 560038, India');
  });

  it('never returns a newline, tab or long space run', () => {
    // Meta rejects a body parameter containing any of these, and
    // shoppers type newlines into address1 constantly.
    const value = formatAddress({
      address1: 'Flat 4\nTower B\tWing 2',
      address2: '   ',
      city: 'Mumbai',
      country: 'India',
    });
    expect(value).toBe('Flat 4 Tower B Wing 2, Mumbai, India');
    expect(value).not.toMatch(/[\n\t]|\s{5}/);
  });

  it('drops a state that just repeats the city', () => {
    expect(
      formatAddress({ address1: '5 Hauz Khas', city: 'Delhi', province: 'Delhi' })
    ).toBe('5 Hauz Khas, Delhi');
  });

  it('is null when there is no address at all', () => {
    expect(formatAddress(null)).toBeNull();
    expect(formatAddress(undefined)).toBeNull();
    expect(formatAddress('12 MG Road')).toBeNull();
    expect(formatAddress({})).toBeNull();
    expect(formatAddress({ address1: '  ', city: '' })).toBeNull();
  });

  it('keeps whatever parts Shopify did send', () => {
    expect(formatAddress({ city: 'Pune', country: 'India' })).toBe(
      'Pune, India'
    );
  });
});

describe('shipping_address in the message context', () => {
  it('comes through on an order', () => {
    const ctx = orderContext(
      {
        ...ORDER,
        shipping_address: {
          address1: '12 MG Road',
          city: 'Bengaluru',
          province: 'Karnataka',
          zip: '560038',
          country: 'India',
          country_code: 'IN',
        },
      },
      'My Store'
    );
    expect(ctx.shipping_address).toBe(
      '12 MG Road, Bengaluru, Karnataka, 560038, India'
    );
  });

  it('is null on an abandoned checkout with no address yet', () => {
    const ctx = checkoutContext({ abandoned_checkout_url: 'x' }, null);
    expect(ctx.shipping_address).toBeNull();
    // A null body variable must still send as "-" — Meta rejects empty.
    expect(resolveBodyParams(['shipping_address'], ctx)).toEqual(['-']);
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
