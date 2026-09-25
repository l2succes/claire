import { describe, expect, test } from 'bun:test';
import type { Offering, Package as RevenueCatPackage } from '@revenuecat/purchases-js';
import { selectClairePackage } from './checkout';

function checkoutPackage(identifier: string, productIdentifier: string): RevenueCatPackage {
  return {
    identifier,
    webBillingProduct: { identifier: productIdentifier },
  } as RevenueCatPackage;
}

function offering(packages: RevenueCatPackage[]): Offering {
  return {
    packagesById: Object.fromEntries(packages.map((item) => [item.identifier, item])),
    availablePackages: packages,
  } as unknown as Offering;
}

describe('selectClairePackage', () => {
  test('selects the configured Claire monthly package', () => {
    const monthly = checkoutPackage('pro_monthly', 'claire_pro_monthly');
    expect(selectClairePackage(offering([monthly]))).toBe(monthly);
  });

  test('does not silently sell a legacy or unrelated package', () => {
    const legacy = checkoutPackage('plus_monthly', 'claire_plus_monthly');
    expect(selectClairePackage(offering([legacy]))).toBeNull();
    expect(selectClairePackage(null)).toBeNull();
  });
});
