// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from 'bun:test';
import {
  checkWaitlistRateLimit,
  normalizeCampaign,
  normalizeEmail,
  normalizeSource,
} from './waitlist';

describe('waitlist input handling', () => {
  test('normalizes valid email addresses', () => {
    expect(normalizeEmail('  Person@Example.COM ')).toBe('person@example.com');
  });

  test('rejects malformed and oversized email addresses', () => {
    expect(normalizeEmail('not-an-email')).toBeNull();
    expect(normalizeEmail(`${'a'.repeat(250)}@x.com`)).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });

  test('allows only known placement sources', () => {
    expect(normalizeSource('homepage_footer')).toBe('homepage_footer');
    expect(normalizeSource('forged_source')).toBe('homepage_hero');
  });

  test('trims and caps campaign values', () => {
    expect(normalizeCampaign('  launch-day  ')).toBe('launch-day');
    expect(normalizeCampaign('x'.repeat(200))).toHaveLength(100);
    expect(normalizeCampaign('')).toBeNull();
  });

  test('limits repeated submissions from one client', () => {
    const ip = `test-${crypto.randomUUID()}`;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      expect(checkWaitlistRateLimit(ip).ok).toBe(true);
    }
    expect(checkWaitlistRateLimit(ip).ok).toBe(false);
  });
});
