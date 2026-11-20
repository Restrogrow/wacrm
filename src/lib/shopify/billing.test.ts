import { describe, expect, it } from 'vitest';

import { parseAppSubscriptionWebhook } from './billing';

describe('parseAppSubscriptionWebhook', () => {
  it('reads the nested app_subscription shape', () => {
    expect(
      parseAppSubscriptionWebhook({
        app_subscription: {
          admin_graphql_api_id: 'gid://shopify/AppSubscription/1',
          status: 'active',
        },
      })
    ).toEqual({ subscriptionId: 'gid://shopify/AppSubscription/1', status: 'ACTIVE' });
  });

  it('falls back to a flattened payload', () => {
    expect(
      parseAppSubscriptionWebhook({
        admin_graphql_api_id: 'gid://shopify/AppSubscription/2',
        status: 'CANCELLED',
      })
    ).toEqual({ subscriptionId: 'gid://shopify/AppSubscription/2', status: 'CANCELLED' });
  });

  it('rejects an unknown status rather than guessing', () => {
    expect(
      parseAppSubscriptionWebhook({
        app_subscription: {
          admin_graphql_api_id: 'gid://shopify/AppSubscription/3',
          status: 'SOMETHING_NEW',
        },
      })
    ).toBeNull();
  });

  it('rejects a payload missing either field', () => {
    expect(parseAppSubscriptionWebhook({ app_subscription: { status: 'ACTIVE' } })).toBeNull();
    expect(
      parseAppSubscriptionWebhook({
        app_subscription: { admin_graphql_api_id: 'gid://shopify/AppSubscription/4' },
      })
    ).toBeNull();
    expect(parseAppSubscriptionWebhook({})).toBeNull();
  });
});
