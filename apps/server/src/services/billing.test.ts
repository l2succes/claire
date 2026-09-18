import { describe, expect, test } from 'bun:test';
import { billingPlanFor, billingStatusFor, revenueCatUserId } from './billing';

const userId = '9f9f36e9-a6b6-4b76-a17d-f718a2efe521';

describe('RevenueCat billing event interpretation', () => {
  test('finds the stable Supabase user ID across RevenueCat aliases', () => {
    expect(
      revenueCatUserId({
        id: 'evt',
        type: 'RENEWAL',
        app_user_id: '$RCAnonymousID:1',
        aliases: [userId],
      })
    ).toBe(userId);
  });

  test('maps entitlement and product identifiers to a plan', () => {
    expect(billingPlanFor({ id: 'evt', type: 'RENEWAL', entitlement_ids: ['pro'] })).toBe('pro');
    expect(billingPlanFor({ id: 'evt', type: 'RENEWAL', product_id: 'claire_plus_annual' })).toBe(
      'plus'
    );
  });

  test('keeps canceled access until its paid-through date', () => {
    expect(
      billingStatusFor(
        {
          id: 'evt',
          type: 'CANCELLATION',
          product_id: 'claire_plus_monthly',
          expiration_at_ms: 2_000,
        },
        1_000
      )
    ).toBe('canceling');
    expect(
      billingStatusFor(
        {
          id: 'evt',
          type: 'CANCELLATION',
          product_id: 'claire_plus_monthly',
          expiration_at_ms: 500,
        },
        1_000
      )
    ).toBe('expired');
  });
});
