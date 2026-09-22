export type BillingPlan = 'preview' | 'plus' | 'pro';

export type BillingPackage = {
  identifier: string;
  productIdentifier: string;
  title: string;
  description: string;
  priceString: string;
  pricePerMonthString: string | null;
  subscriptionPeriod: string | null;
  /** Only set when the store confirms this customer can use its free trial. */
  trialDays?: number;
  plan: Exclude<BillingPlan, 'preview'>;
};

export type StoreBillingSnapshot = {
  configured: boolean;
  activePlan: BillingPlan;
  activeEntitlements: string[];
  managementUrl: string | null;
};

export type WebPurchaseRedemptionStatus =
  | { kind: 'ignored' }
  | { kind: 'success'; snapshot: StoreBillingSnapshot }
  | { kind: 'expired'; obfuscatedEmail: string }
  | { kind: 'invalid' }
  | { kind: 'other_user' }
  | { kind: 'error'; message: string };

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
