import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/flows/admin-client', () => ({ supabaseAdmin: () => ({}) }));

import { productChanged } from '@/lib/catalog/sync';
import type { SyncProduct } from '@/lib/catalog/flatten';

import { customerContact, orderRow } from './auto-sync';
import { missingScopes } from './config';

describe('missingScopes', () => {
  it('lists scopes the token lacks', () => {
    expect(missingScopes('read_orders,read_fulfillments')).toEqual(['read_products', 'read_customers']);
  });
  it('treats write_x as read_x', () => {
    expect(missingScopes('read_orders,read_fulfillments,write_products,read_customers')).toEqual([]);
  });
  it('reports nothing when the scopes are unknown', () => {
    expect(missingScopes(null)).toEqual([]);
  });
});

describe('customerContact', () => {
  const base = {
    firstName: 'Asha',
    lastName: 'Rao',
    updatedAt: '2026-10-29T10:00:00Z',
    defaultEmailAddress: { emailAddress: 'asha@example.com' },
    defaultPhoneNumber: null,
    defaultAddress: null,
  };

  it('uses the customer phone, adding the store calling code', () => {
    expect(customerContact({ ...base, defaultPhoneNumber: { phoneNumber: '98765 43210' } }, '91')).toEqual({
      phone: '919876543210',
      name: 'Asha Rao',
      email: 'asha@example.com',
    });
  });

  it('falls back to the address phone', () => {
    const c = customerContact(
      { ...base, defaultAddress: { phone: '+44 7700 900123', countryCodeV2: 'GB' } },
      '91'
    );
    expect(c?.phone).toBe('447700900123');
  });

  it('skips customers without a usable phone', () => {
    expect(customerContact(base, '91')).toBeNull();
  });
});

describe('orderRow', () => {
  it('maps a GraphQL order to the webhook columns', () => {
    const row = orderRow(
      {
        legacyResourceId: '5550001',
        name: '#1042',
        email: null,
        phone: null,
        statusPageUrl: 'https://shop.example/status',
        paymentGatewayNames: ['Cash on Delivery (COD)'],
        totalPriceSet: { shopMoney: { amount: '1299.00', currencyCode: 'INR' } },
        customer: null,
        shippingAddress: { firstName: 'Ravi', lastName: 'K', phone: '09876543210', countryCodeV2: 'IN' },
        billingAddress: null,
      },
      '91'
    );
    expect(row).toEqual({
      shopify_order_id: '5550001',
      order_name: '#1042',
      phone: '919876543210',
      customer_name: 'Ravi K',
      email: null,
      total: '1299.00',
      currency: 'INR',
      payment_method: 'Cash on Delivery (COD)',
      order_status_url: 'https://shop.example/status',
    });
  });
});

describe('productChanged', () => {
  const p: SyncProduct = {
    source: 'shopify',
    source_id: 'v1',
    retailer_id: 'SKU1',
    title: 'Oud',
    description: '',
    price_paise: 129900,
    sale_price_paise: null,
    currency: 'INR',
    image_url: 'https://cdn.example/oud.jpg',
    additional_image_urls: [],
    product_url: null,
    brand: null,
    category: null,
    availability: 'in stock',
    stock_qty: 4,
    status: 'active',
  };
  const known = { id: 'p1', ...p };

  it('is false when nothing the store owns changed', () => {
    expect(productChanged(known, p)).toBe(false);
  });
  it('is true when price or stock changed', () => {
    expect(productChanged(known, { ...p, price_paise: 119900 })).toBe(true);
    expect(productChanged(known, { ...p, stock_qty: 0, availability: 'out of stock' })).toBe(true);
  });
});
