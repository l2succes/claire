import type {
  BillingPackage,
  StoreBillingSnapshot,
  WebPurchaseRedemptionStatus,
} from './billing-types';

const unavailable: StoreBillingSnapshot = {
  configured: false,
  activePlan: 'preview',
  activeEntitlements: [],
  managementUrl: null,
};

export function billingIsConfigured(): boolean {
  return false;
}
export async function initializeBilling(_userId: string): Promise<boolean> {
  return false;
}
export async function getStoreBillingSnapshot(): Promise<StoreBillingSnapshot> {
  return unavailable;
}
export async function getBillingPackages(): Promise<BillingPackage[]> {
  return [];
}
export async function purchaseBillingPackage(_identifier: string): Promise<StoreBillingSnapshot> {
  throw new Error('In-app subscriptions are available in the Claire mobile app.');
}
export async function restoreBillingPurchases(): Promise<StoreBillingSnapshot> {
  throw new Error('Purchase restore is available in the Claire mobile app.');
}
export async function presentBillingOfferCode(): Promise<void> {
  throw new Error('Offer codes are available in the Claire mobile app.');
}
export async function redeemWebPurchaseLink(_url: string): Promise<WebPurchaseRedemptionStatus> {
  return { kind: 'ignored' };
}
