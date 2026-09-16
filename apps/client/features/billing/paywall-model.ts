import type { BillingPackage, BillingPlan } from '../../services/billing-types';

export type BillingCadence = 'monthly' | 'annual';
export type PaidBillingPlan = Exclude<BillingPlan, 'preview'>;

export const PLAN_DETAILS: Record<
  PaidBillingPlan,
  {
    name: string;
    eyebrow: string;
    description: string;
    credits: string;
    features: readonly string[];
  }
> = {
  plus: {
    name: 'Claire Plus',
    eyebrow: 'MOST POPULAR',
    description: 'The full Claire AI, whenever the inbox gets busy.',
    credits: '500 AI credits / month',
    features: ['Up to 3 Loop runs a day', 'Bring your own provider key'],
  },
  pro: {
    name: 'Claire Pro',
    eyebrow: 'DAILY LOOP',
    description: 'A fresh Loop every morning, plus more room for AI.',
    credits: '2,000 AI credits / month',
    features: ['Automatic morning Loop', 'Best available model tier'],
  },
};

export function cadenceForPackage(item: BillingPackage): BillingCadence {
  return item.subscriptionPeriod === 'P1Y' ? 'annual' : 'monthly';
}

export function availableCadences(packages: BillingPackage[]): BillingCadence[] {
  const result: BillingCadence[] = [];
  if (packages.some((item) => cadenceForPackage(item) === 'monthly')) result.push('monthly');
  if (packages.some((item) => cadenceForPackage(item) === 'annual')) result.push('annual');
  return result;
}

export function packagesForCadence(
  packages: BillingPackage[],
  cadence: BillingCadence
): BillingPackage[] {
  const order: Record<PaidBillingPlan, number> = { plus: 0, pro: 1 };
  return packages
    .filter((item) => cadenceForPackage(item) === cadence)
    .sort((left, right) => order[left.plan] - order[right.plan]);
}

export function defaultPackage(packages: BillingPackage[]): BillingPackage | null {
  return (
    packages.find((item) => item.plan === 'plus' && cadenceForPackage(item) === 'annual') ||
    packages.find((item) => item.plan === 'plus') ||
    packages[0] ||
    null
  );
}

export function packageForCadence(
  packages: BillingPackage[],
  cadence: BillingCadence,
  preferredPlan?: PaidBillingPlan
): BillingPackage | null {
  const matching = packagesForCadence(packages, cadence);
  return matching.find((item) => item.plan === preferredPlan) || matching[0] || null;
}

export function packagePrice(item: BillingPackage): {
  amount: string;
  cadence: string;
  billingNote: string;
} {
  if (cadenceForPackage(item) === 'annual') {
    return {
      amount: item.pricePerMonthString || item.priceString,
      cadence: item.pricePerMonthString ? '/ month' : '/ year',
      billingNote: item.pricePerMonthString ? `${item.priceString} billed yearly` : 'Billed yearly',
    };
  }
  return { amount: item.priceString, cadence: '/ month', billingNote: 'Billed monthly' };
}
