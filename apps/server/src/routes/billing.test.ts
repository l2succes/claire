import { createHmac } from 'crypto';
import { describe, expect, test } from 'bun:test';
import { verifyRevenueCatSignature } from './billing';

describe('RevenueCat webhook signature verification', () => {
  const secret = 'a-secure-webhook-signing-secret-12345';
  const rawBody = Buffer.from('{"event":{"id":"evt_1"}}');
  const timestamp = 2_000_000_000;
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody.toString('utf8')}`)
    .digest('hex');

  test('accepts a current signature over the exact raw body', () => {
    expect(
      verifyRevenueCatSignature({
        header: `t=${timestamp},v1=${signature}`,
        rawBody,
        secret,
        nowSeconds: timestamp + 30,
      })
    ).toBe(true);
  });

  test('rejects tampering and stale deliveries', () => {
    expect(
      verifyRevenueCatSignature({
        header: `t=${timestamp},v1=${signature}`,
        rawBody: Buffer.from('{}'),
        secret,
        nowSeconds: timestamp,
      })
    ).toBe(false);
    expect(
      verifyRevenueCatSignature({
        header: `t=${timestamp},v1=${signature}`,
        rawBody,
        secret,
        nowSeconds: timestamp + 301,
      })
    ).toBe(false);
  });
});
