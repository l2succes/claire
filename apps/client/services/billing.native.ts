import { Platform } from 'react-native';
import * as Application from 'expo-application';
import Purchases, {
  LOG_LEVEL,
  WebPurchaseRedemptionResultType,
  type CustomerInfo,
  type PurchasesPackage,
} from 'react-native-purchases';
import type {
  BillingPackage,
  BillingPlan,
  StoreBillingSnapshot,
  WebPurchaseRedemptionStatus,
} from './billing-types';
import { resolveBillingApiKey } from './billing-config';
import { eligibleTrialDays } from './billing-trial';

let configured = false;
let configuredUserId: string | null = null;
const packageCache = new Map<string, PurchasesPackage>();

function apiKey(): string | undefined {
  return resolveBillingApiKey({
    appIdentifier: Application.applicationId,
    appEnvironment: process.env.EXPO_PUBLIC_ENV,
    configuredStore: process.env.EXPO_PUBLIC_REVENUECAT_STORE,
    isDevelopmentBuild: __DEV__,
    platform: process.env.EXPO_OS || Platform.OS,
    testKey: process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY,
    iosKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
    androidKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
  });
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

function publicPackage(item: PurchasesPackage, trialEligible = false): BillingPackage {
  const values = [item.identifier, item.product.identifier];
  const trialDays = eligibleTrialDays(item.product.introPrice, trialEligible);
  return {
    identifier: item.identifier,
    productIdentifier: item.product.identifier,
    title: item.product.title,
    description: item.product.description,
    priceString: item.product.priceString,
    pricePerMonthString: item.product.pricePerMonthString,
    subscriptionPeriod: item.product.subscriptionPeriod,
    trialDays,
    plan: planFor(values) === 'pro' ? 'pro' : 'plus',
  };
}

export function billingIsConfigured(): boolean {
  // A development client can be older than the JavaScript bundle and not yet
  // include the RevenueCat native module. Treat that as an unavailable store
  // instead of throwing during app startup.
  return Boolean(apiKey() && Purchases);
}

export async function initializeBilling(userId: string): Promise<boolean> {
  const key = apiKey();
  if (!key || !Purchases) return false;
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
  const available = current?.availablePackages || [];
  for (const item of available) packageCache.set(item.identifier, item);
  let eligible = new Set<string>();
  if ((process.env.EXPO_OS || Platform.OS) === 'ios') {
    const introIds = available
      .filter((item) => item.product.introPrice?.price === 0)
      .map((item) => item.product.identifier);
    if (introIds.length) {
      try {
        const statuses = await Purchases.checkTrialOrIntroductoryPriceEligibility(introIds);
        eligible = new Set(introIds.filter((id) =>
          statuses[id]?.status === Purchases.INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE
        ));
      } catch {
        // Unknown eligibility must display standard pricing, never a trial promise.
      }
    }
  }
  return available.map((item) => publicPackage(item, eligible.has(item.product.identifier)));
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

export async function presentBillingOfferCode(): Promise<void> {
  if (!configured) throw new Error('Purchases are not configured in this build.');
  await Purchases.presentCodeRedemptionSheet();
}

export async function redeemWebPurchaseLink(url: string): Promise<WebPurchaseRedemptionStatus> {
  if (!configured) return { kind: 'ignored' };
  const redemption = await Purchases.parseAsWebPurchaseRedemption(url);
  if (!redemption) return { kind: 'ignored' };

  const result = await Purchases.redeemWebPurchase(redemption);
  switch (result.result) {
    case WebPurchaseRedemptionResultType.SUCCESS:
      return { kind: 'success', snapshot: snapshot(result.customerInfo) };
    case WebPurchaseRedemptionResultType.EXPIRED:
      return { kind: 'expired', obfuscatedEmail: result.obfuscatedEmail };
    case WebPurchaseRedemptionResultType.INVALID_TOKEN:
      return { kind: 'invalid' };
    case WebPurchaseRedemptionResultType.PURCHASE_BELONGS_TO_OTHER_USER:
      return { kind: 'other_user' };
    case WebPurchaseRedemptionResultType.ERROR:
      return { kind: 'error', message: result.error.message };
  }
}
