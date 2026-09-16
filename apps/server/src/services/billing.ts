import { supabase, type DbRow } from './supabase';
import { config } from '../config';

export const BILLING_ENTITLEMENTS = {
  plus: 'plus',
  pro: 'pro',
} as const;

export const BILLING_CREDITS = {
  starter: 50,
  plusMonthly: 500,
  proMonthly: 2_000,
} as const;

export type BillingPlan = 'preview' | 'plus' | 'pro';
export type BillingStatus =
  | 'preview'
  | 'active'
  | 'canceling'
  | 'grace'
  | 'billing_issue'
  | 'expired';

export interface RevenueCatWebhookEvent {
  id: string;
  type: string;
  app_user_id?: string | null;
  original_app_user_id?: string | null;
  aliases?: string[] | null;
  entitlement_ids?: string[] | null;
  entitlement_id?: string | null;
  product_id?: string | null;
  store?: string | null;
  environment?: string | null;
  expiration_at_ms?: number | null;
  purchased_at_ms?: number | null;
}

export interface BillingSummary {
  plan: BillingPlan;
  status: BillingStatus;
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
}

type RevenueCatSubscriber = {
  entitlements?: Record<
    string,
    {
      expires_date?: string | null;
      grace_period_expires_date?: string | null;
      product_identifier?: string | null;
      purchase_date?: string | null;
    }
  >;
  subscriptions?: Record<
    string,
    {
      billing_issues_detected_at?: string | null;
      unsubscribe_detected_at?: string | null;
      store?: string | null;
      is_sandbox?: boolean;
    }
  >;
};

const USER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUBSCRIPTION_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'CANCELLATION',
  'UNCANCELLATION',
  'BILLING_ISSUE',
  'SUBSCRIPTION_PAUSED',
  'SUBSCRIPTION_EXTENDED',
  'EXPIRATION',
  'TEMPORARY_ENTITLEMENT_GRANT',
]);

function asEnvironment(value: string | null | undefined): 'sandbox' | 'production' | null {
  const normalized = value?.toLowerCase();
  return normalized === 'sandbox' || normalized === 'production' ? normalized : null;
}

function nextMonthlyGrantAt(from = new Date()): Date {
  const next = new Date(from);
  const originalDay = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(originalDay, lastDay));
  return next;
}

export function revenueCatUserId(event: RevenueCatWebhookEvent): string | null {
  const candidates = [event.app_user_id, event.original_app_user_id, ...(event.aliases || [])];
  return (
    candidates.find((candidate): candidate is string =>
      Boolean(candidate && USER_ID_PATTERN.test(candidate))
    ) ?? null
  );
}

export function billingPlanFor(event: RevenueCatWebhookEvent): BillingPlan {
  const entitlements = new Set(
    [...(event.entitlement_ids || []), ...(event.entitlement_id ? [event.entitlement_id] : [])].map(
      (value) => value.toLowerCase()
    )
  );
  const product = event.product_id?.toLowerCase() || '';
  if (entitlements.has(BILLING_ENTITLEMENTS.pro) || /(^|[.:_-])pro([.:_-]|$)/.test(product))
    return 'pro';
  if (entitlements.has(BILLING_ENTITLEMENTS.plus) || /(^|[.:_-])plus([.:_-]|$)/.test(product))
    return 'plus';
  return 'preview';
}

export function billingStatusFor(event: RevenueCatWebhookEvent, nowMs = Date.now()): BillingStatus {
  const type = event.type.toUpperCase();
  if (type === 'EXPIRATION' || type === 'SUBSCRIPTION_PAUSED') return 'expired';
  if (type === 'BILLING_ISSUE') return 'billing_issue';
  if (type === 'CANCELLATION') {
    return event.expiration_at_ms && event.expiration_at_ms > nowMs ? 'canceling' : 'expired';
  }
  if (type === 'TEMPORARY_ENTITLEMENT_GRANT') return 'grace';
  return billingPlanFor(event) === 'preview' ? 'preview' : 'active';
}

function monthlyAllowance(plan: BillingPlan): number {
  if (plan === 'pro') return BILLING_CREDITS.proMonthly;
  if (plan === 'plus') return BILLING_CREDITS.plusMonthly;
  return 0;
}

function storeAllowanceSourceKey(userId: string, plan: BillingPlan, purchasedAt: Date): string {
  return `allowance:${userId}:${plan}:${purchasedAt.toISOString().slice(0, 7)}`;
}

async function grantCredits(input: {
  userId: string;
  amount: number;
  bucket: 'monthly' | 'purchased';
  sourceKey: string;
  expiresAt?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabase.from('billing_credit_ledger').insert({
    user_id: input.userId,
    amount: input.amount,
    bucket: input.bucket,
    entry_type: 'grant',
    source_key: input.sourceKey,
    expires_at: input.expiresAt ?? null,
    metadata: input.metadata ?? {},
  });
  if (error && error.code !== '23505') throw error;
}

async function grantPlanAllowance(
  userId: string,
  plan: BillingPlan,
  sourceKey: string,
  from: Date
): Promise<string | null> {
  const allowance = monthlyAllowance(plan);
  if (!allowance) return null;
  const nextGrantAt = nextMonthlyGrantAt(from);
  await grantCredits({
    userId,
    amount: allowance,
    bucket: 'monthly',
    sourceKey,
    expiresAt: nextGrantAt.toISOString(),
    metadata: { plan },
  });
  return nextGrantAt.toISOString();
}

async function grantTopUp(event: RevenueCatWebhookEvent, userId: string): Promise<void> {
  const product = event.product_id?.toLowerCase() || '';
  const amount = product.includes('2000') ? 2_000 : product.includes('500') ? 500 : 0;
  if (!amount) return;
  await grantCredits({
    userId,
    amount,
    bucket: 'purchased',
    sourceKey: `revenuecat:${event.id}:topup`,
    metadata: { productIdentifier: event.product_id || null, store: event.store || null },
  });
}

export async function processRevenueCatEvent(
  event: RevenueCatWebhookEvent
): Promise<'processed' | 'duplicate' | 'ignored'> {
  const userId = revenueCatUserId(event);
  const { error: eventError } = await supabase.from('billing_webhook_events').insert({
    event_id: event.id,
    event_type: event.type,
    app_user_id: userId || event.app_user_id || null,
    environment: asEnvironment(event.environment),
  });
  if (eventError?.code === '23505') {
    const { data: existing, error: existingError } = await supabase
      .from('billing_webhook_events')
      .select('processed_at')
      .eq('event_id', event.id)
      .single();
    if (existingError) throw existingError;
    // A completed delivery is idempotent. A previously failed delivery stays
    // retryable so a transient database failure cannot permanently drop a
    // subscription change.
    if (existing.processed_at) return 'duplicate';
  }
  if (eventError && eventError.code !== '23505') throw eventError;

  if (!userId) {
    await supabase
      .from('billing_webhook_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('event_id', event.id);
    return 'ignored';
  }

  try {
    await supabase
      .from('billing_accounts')
      .upsert(
        { user_id: userId, revenuecat_customer_id: userId },
        { onConflict: 'user_id', ignoreDuplicates: true }
      );

    if (event.type.toUpperCase() === 'NON_RENEWING_PURCHASE') {
      await grantTopUp(event, userId);
    }

    if (SUBSCRIPTION_EVENTS.has(event.type.toUpperCase())) {
      const plan = billingPlanFor(event);
      const status = billingStatusFor(event);
      const renewing = ['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION'].includes(
        event.type.toUpperCase()
      );
      const purchasedAt = new Date(event.purchased_at_ms || Date.now());
      let nextGrant: string | null = null;
      if (
        ['INITIAL_PURCHASE', 'RENEWAL'].includes(event.type.toUpperCase()) &&
        status === 'active'
      ) {
        nextGrant = await grantPlanAllowance(
          userId,
          plan,
          storeAllowanceSourceKey(userId, plan, purchasedAt),
          purchasedAt
        );
      }

      const updates: Record<string, unknown> = {
        plan: status === 'expired' ? 'preview' : plan,
        status,
        product_identifier: event.product_id || null,
        store: event.store?.toLowerCase() || null,
        environment: asEnvironment(event.environment),
        entitlement_expires_at: event.expiration_at_ms
          ? new Date(event.expiration_at_ms).toISOString()
          : null,
        will_renew: renewing,
        last_revenuecat_event_id: event.id,
        updated_at: new Date().toISOString(),
      };
      if (nextGrant) updates.credit_reset_at = nextGrant;
      const { error } = await supabase
        .from('billing_accounts')
        .update(updates)
        .eq('user_id', userId);
      if (error) throw error;
    }

    await supabase
      .from('billing_webhook_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('event_id', event.id);
    return 'processed';
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown billing event error';
    await supabase
      .from('billing_webhook_events')
      .update({ processing_error: message.slice(0, 1_000) })
      .eq('event_id', event.id);
    throw error;
  }
}

async function refreshMonthlyAllowance(account: DbRow): Promise<DbRow> {
  if (!['active', 'canceling', 'grace'].includes(account.status) || !account.credit_reset_at)
    return account;
  const due = new Date(account.credit_reset_at);
  if (Number.isNaN(due.getTime()) || due.getTime() > Date.now()) return account;
  const now = new Date();
  const nextGrant = await grantPlanAllowance(
    account.user_id,
    account.plan,
    `monthly:${account.user_id}:${due.toISOString()}`,
    now
  );
  if (!nextGrant) return account;
  const { data, error } = await supabase
    .from('billing_accounts')
    .update({ credit_reset_at: nextGrant, updated_at: now.toISOString() })
    .eq('user_id', account.user_id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function getBillingSummary(userId: string): Promise<BillingSummary> {
  await supabase
    .from('billing_accounts')
    .upsert(
      { user_id: userId, revenuecat_customer_id: userId },
      { onConflict: 'user_id', ignoreDuplicates: true }
    );
  const { data: initial, error: accountError } = await supabase
    .from('billing_accounts')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (accountError) throw accountError;
  const account = await refreshMonthlyAllowance(initial);

  const { data: entries, error: creditError } = await supabase
    .from('billing_credit_ledger')
    .select('amount, expires_at')
    .eq('user_id', userId);
  if (creditError) throw creditError;
  const now = Date.now();
  const available = (entries || []).reduce((total: number, entry: DbRow) => {
    if (entry.expires_at && new Date(entry.expires_at).getTime() <= now) return total;
    return total + Number(entry.amount || 0);
  }, 0);
  const plan = account.plan as BillingPlan;
  const status = account.status as BillingStatus;
  return {
    plan,
    status,
    isActive: ['active', 'canceling', 'grace'].includes(status),
    willRenew: account.will_renew === true,
    productIdentifier: account.product_identifier || null,
    store: account.store || null,
    expiresAt: account.entitlement_expires_at || null,
    credits: {
      available: Math.max(0, available),
      monthlyAllowance: monthlyAllowance(plan),
      nextGrantAt: account.credit_reset_at || null,
    },
  };
}

export async function reserveBillingCredits(
  userId: string,
  sourceKey: string,
  amount = 1,
  metadata: Record<string, unknown> = {}
): Promise<boolean> {
  // Annual subscriptions renew in the store once a year, while their Claire
  // allowance resets monthly. Refreshing here makes the reset independent of
  // whether the user happened to open the billing screen first.
  await getBillingSummary(userId);
  const { data, error } = await supabase.rpc('consume_billing_credits', {
    p_user_id: userId,
    p_amount: amount,
    p_source_key: sourceKey,
    p_metadata: metadata,
  });
  if (error) throw error;
  return data === true;
}

export async function releaseBillingCredits(userId: string, sourceKey: string): Promise<void> {
  const { error } = await supabase.rpc('release_billing_credits', {
    p_user_id: userId,
    p_source_key: sourceKey,
  });
  if (error) throw error;
}

export async function syncRevenueCatCustomer(userId: string): Promise<BillingSummary> {
  if (!config.REVENUECAT_SECRET_API_KEY) throw new Error('RevenueCat server key is not configured');
  const response = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
    {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${config.REVENUECAT_SECRET_API_KEY}`,
      },
    }
  );
  if (!response.ok) throw new Error(`RevenueCat customer refresh failed (${response.status})`);
  const payload = (await response.json()) as { subscriber?: RevenueCatSubscriber };
  const subscriber = payload.subscriber;
  if (!subscriber) throw new Error('RevenueCat returned no customer data');

  const now = Date.now();
  const activeEntitlement = (['pro', 'plus'] as const)
    .map((plan) => ({
      plan,
      entitlement: subscriber.entitlements?.[plan],
    }))
    .find(({ entitlement }) => {
      if (!entitlement) return false;
      if (!entitlement.expires_date) return true;
      return new Date(entitlement.expires_date).getTime() > now;
    });

  if (!activeEntitlement?.entitlement) {
    const { error } = await supabase.from('billing_accounts').upsert(
      {
        user_id: userId,
        revenuecat_customer_id: userId,
        plan: 'preview',
        status: 'expired',
        will_renew: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
    if (error) throw error;
    return getBillingSummary(userId);
  }

  const { plan, entitlement } = activeEntitlement;
  const productIdentifier = entitlement.product_identifier || null;
  const subscription = productIdentifier
    ? subscriber.subscriptions?.[productIdentifier]
    : undefined;
  const graceExpiry = entitlement.grace_period_expires_date
    ? new Date(entitlement.grace_period_expires_date).getTime()
    : 0;
  const status: BillingStatus =
    graceExpiry > now
      ? 'grace'
      : subscription?.billing_issues_detected_at
        ? 'billing_issue'
        : subscription?.unsubscribe_detected_at
          ? 'canceling'
          : 'active';
  const parsedPurchaseDate = entitlement.purchase_date
    ? new Date(entitlement.purchase_date)
    : new Date();
  const purchasedAt = Number.isNaN(parsedPurchaseDate.getTime()) ? new Date() : parsedPurchaseDate;
  const nextGrant = await grantPlanAllowance(
    userId,
    plan,
    storeAllowanceSourceKey(userId, plan, purchasedAt),
    purchasedAt
  );
  const { error } = await supabase.from('billing_accounts').upsert(
    {
      user_id: userId,
      revenuecat_customer_id: userId,
      plan,
      status,
      product_identifier: productIdentifier,
      store: subscription?.store?.toLowerCase() || null,
      environment:
        subscription?.is_sandbox === undefined
          ? null
          : subscription.is_sandbox
            ? 'sandbox'
            : 'production',
      entitlement_expires_at: entitlement.expires_date || null,
      will_renew: !subscription?.unsubscribe_detected_at,
      ...(nextGrant ? { credit_reset_at: nextGrant } : {}),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
  if (error) throw error;
  return getBillingSummary(userId);
}
