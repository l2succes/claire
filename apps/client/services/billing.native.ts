import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesPackage,
} from 'react-native-purchases';
import type { BillingPackage, BillingPlan, StoreBillingSnapshot } from './billing-types';

let configured = false;
let configuredUserId: string | null = null;
const packageCache = new Map<string, PurchasesPackage>();

function apiKey(): string | undefined {
  if (__DEV__ && process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY) {
    return process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;
  }
  const platform = process.env.EXPO_OS || Platform.OS;
  if (platform === 'ios') return process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
  if (platform === 'android') return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
  return undefined;
}

function planFor(values: string[]): BillingPlan {
  const normalized = values.map((value) => value.toLowerCase());
  if (normalized.some((value) => /(^|[._:-])pro([._:-]|$)/.test(value))) return 'pro';
  if (normalized.some((value) => /(^|[._:-])plus([._:-]|$)/.test(value))) return 'plus';
  return 'preview';
}

function snapshot(info: CustomerInfo): StoreBillingSnapshot {
  const activeEntitlements = Object.keys(info.entitlements.active);
  return {
    configured: true,
    activePlan: planFor([...activeEntitlements, ...info.activeSubscriptions]),
    activeEntitlements,
    managementUrl: info.managementURL,
  };
}

function publicPackage(item: PurchasesPackage): BillingPackage {
  const values = [item.identifier, item.product.identifier];
  return {
    identifier: item.identifier,
    productIdentifier: item.product.identifier,
    title: item.product.title,
    description: item.product.description,
    priceString: item.product.priceString,
    pricePerMonthString: item.product.pricePerMonthString,
    subscriptionPeriod: item.product.subscriptionPeriod,
    plan: planFor(values) === 'pro' ? 'pro' : 'plus',
  };
}

export function billingIsConfigured(): boolean {
  return Boolean(apiKey());
}

export async function initializeBilling(userId: string): Promise<boolean> {
  const key = apiKey();
  if (!key) return false;
  if (!configured) {
    if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    Purchases.configure({ apiKey: key, appUserID: userId });
    configured = true;
    configuredUserId = userId;
  } else if (configuredUserId !== userId) {
    await Purchases.logIn(userId);
    configuredUserId = userId;
    packageCache.clear();
  }
  return true;
}

export async function getStoreBillingSnapshot(): Promise<StoreBillingSnapshot> {
  if (!configured)
    return {
      configured: false,
      activePlan: 'preview',
      activeEntitlements: [],
      managementUrl: null,
    };
  return snapshot(await Purchases.getCustomerInfo());
}

export async function getBillingPackages(): Promise<BillingPackage[]> {
  if (!configured) return [];
  const current = (await Purchases.getOfferings()).current;
  packageCache.clear();
  for (const item of current?.availablePackages || []) packageCache.set(item.identifier, item);
  return (current?.availablePackages || []).map(publicPackage);
}

export async function purchaseBillingPackage(identifier: string): Promise<StoreBillingSnapshot> {
  let item = packageCache.get(identifier);
  if (!item) {
    await getBillingPackages();
    item = packageCache.get(identifier);
  }
  if (!item) throw new Error('That plan is not available from the store right now.');
  return snapshot((await Purchases.purchasePackage(item)).customerInfo);
}

export async function restoreBillingPurchases(): Promise<StoreBillingSnapshot> {
  if (!configured) throw new Error('Purchases are not configured in this build.');
  return snapshot(await Purchases.restorePurchases());
}
