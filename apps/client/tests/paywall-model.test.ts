import type { BillingPackage } from '../services/billing-types';
import {
  availableCadences,
  defaultPackage,
  packageForCadence,
  packagePrice,
  packagesForCadence,
} from '../features/billing/paywall-model';

function billingPackage(
  identifier: string,
  plan: BillingPackage['plan'],
  subscriptionPeriod: string,
  priceString: string,
  pricePerMonthString: string | null = null
): BillingPackage {
  return {
    identifier,
    productIdentifier: `claire_${identifier}`,
    title: identifier,
    description: identifier,
    priceString,
    pricePerMonthString,
    subscriptionPeriod,
    plan,
  };
}

const packages = [
  billingPackage('pro_monthly', 'pro', 'P1M', '$19.99'),
  billingPackage('plus_annual', 'plus', 'P1Y', '$99.99', '$8.33'),
  billingPackage('plus_monthly', 'plus', 'P1M', '$9.99'),
  billingPackage('pro_annual', 'pro', 'P1Y', '$199.99', '$16.67'),
];

describe('paywall model', () => {
  it('defaults to annual Plus and exposes only store-backed cadences', () => {
    expect(defaultPackage(packages)?.identifier).toBe('plus_annual');
    expect(availableCadences(packages)).toEqual(['monthly', 'annual']);
  });

  it('orders plan choices consistently within a cadence', () => {
    expect(packagesForCadence(packages, 'monthly').map((item) => item.identifier)).toEqual([
      'plus_monthly',
      'pro_monthly',
    ]);
  });

  it('keeps the selected plan when cadence changes', () => {
    expect(packageForCadence(packages, 'monthly', 'pro')?.identifier).toBe('pro_monthly');
  });

  it('shows the real renewal charge alongside an annual monthly equivalent', () => {
    expect(packagePrice(packages[1])).toEqual({
      amount: '$8.33',
      cadence: '/ month',
      billingNote: '$99.99 billed yearly',
    });
  });
});
