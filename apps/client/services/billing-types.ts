export type BillingPlan = 'preview' | 'plus' | 'pro';

export type BillingPackage = {
  identifier: string;
  productIdentifier: string;
  title: string;
  description: string;
  priceString: string;
  pricePerMonthString: string | null;
  subscriptionPeriod: string | null;
  plan: Exclude<BillingPlan, 'preview'>;
};

export type StoreBillingSnapshot = {
  configured: boolean;
  activePlan: BillingPlan;
  activeEntitlements: string[];
  managementUrl: string | null;
};

export type ServerBillingSummary = {
  plan: BillingPlan;
  status: 'preview' | 'active' | 'canceling' | 'grace' | 'billing_issue' | 'expired';
  isActive: boolean;
  willRenew: boolean;
  productIdentifier: string | null;
  store: string | null;
  expiresAt: string | null;
  credits: {
    available: number;
    monthlyAllowance: number;
    nextGrantAt: string | null;
  };
};
