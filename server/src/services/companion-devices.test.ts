import { describe, expect, test } from 'bun:test';
import {
  createDeviceCredential,
  hashDeviceCredential,
  matchesDeviceCredential,
} from './companion-devices';

describe('companion device credentials', () => {
  test('creates an opaque credential that verifies against its stored digest', () => {
    const credential = createDeviceCredential();
    expect(credential.length).toBeGreaterThan(40);
    expect(matchesDeviceCredential(credential, hashDeviceCredential(credential))).toBe(true);
  });

  test('does not accept a different device credential', () => {
    expect(matchesDeviceCredential(createDeviceCredential(), hashDeviceCredential(createDeviceCredential()))).toBe(false);
  });
});
