'use client';

import {
  ErrorCode,
  type Offering,
  type Package as RevenueCatPackage,
  type Purchases as PurchasesInstance,
  Purchases,
  PurchasesError,
  type RedemptionInfo,
} from '@revenuecat/purchases-js';
import { useEffect, useRef, useState } from 'react';
import styles from './subscribe.module.css';

const ANONYMOUS_ID_KEY = 'claire.web-checkout.app-user-id';
const CLAIRE_PACKAGE_ID = 'pro_monthly';
const CLAIRE_PRODUCT_ID = 'claire_pro_monthly';

type CheckoutPhase = 'loading' | 'ready' | 'purchasing' | 'success' | 'error';

type CheckoutProps = {
  initialDiscountCode?: string;
  publicApiKey: string;
};

type CheckoutSuccess = {
  customerEmail?: string;
  redemptionInfo: RedemptionInfo | null;
};

let configuredPurchases: PurchasesInstance | null = null;
let configuredApiKey: string | null = null;

function anonymousAppUserId(): string {
  const existing = window.localStorage.getItem(ANONYMOUS_ID_KEY);
  if (existing) return existing;

  const created = Purchases.generateRevenueCatAnonymousAppUserId();
  window.localStorage.setItem(ANONYMOUS_ID_KEY, created);
  return created;
}

function purchasesFor(apiKey: string): PurchasesInstance {
  if (configuredPurchases && configuredApiKey === apiKey) return configuredPurchases;

  configuredPurchases?.close();
  configuredPurchases = Purchases.configure({
    apiKey,
    appUserId: anonymousAppUserId(),
    flags: {
      autoCollectUTMAsMetadata: true,
      collectAnalyticsEvents: true,
    },
  });
  configuredApiKey = apiKey;
  return configuredPurchases;
}

export function selectClairePackage(offering: Offering | null): RevenueCatPackage | null {
  if (!offering) return null;

  const configured = offering.packagesById[CLAIRE_PACKAGE_ID];
  if (configured?.webBillingProduct.identifier === CLAIRE_PRODUCT_ID) return configured;

  return (
    offering.availablePackages.find(
      (candidate) => candidate.webBillingProduct.identifier === CLAIRE_PRODUCT_ID
    ) ?? null
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof PurchasesError) {
    if (error.errorCode === ErrorCode.NetworkError) {
      return 'We could not reach checkout. Check your connection and try again.';
    }
    if (error.errorCode === ErrorCode.InvalidCredentialsError) {
      return 'Web checkout is not configured yet. Please try again shortly.';
    }
    return error.message || 'Checkout could not be opened. Please try again.';
  }
  return error instanceof Error ? error.message : 'Checkout could not be opened. Please try again.';
}

export function Checkout({ initialDiscountCode = '', publicApiKey }: CheckoutProps) {
  const [phase, setPhase] = useState<CheckoutPhase>(publicApiKey ? 'loading' : 'error');
  const [plan, setPlan] = useState<RevenueCatPackage | null>(null);
  const [message, setMessage] = useState(
    publicApiKey ? '' : 'Web checkout is being connected. Please check back shortly.'
  );
  const [discountCode, setDiscountCode] = useState(initialDiscountCode);
  const [showDiscount, setShowDiscount] = useState(Boolean(initialDiscountCode));
  const [success, setSuccess] = useState<CheckoutSuccess | null>(null);
  const checkoutTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!publicApiKey) return;
    let active = true;

    const load = async () => {
      try {
        const purchases = purchasesFor(publicApiKey);
        const [offerings] = await Promise.all([purchases.getOfferings({ currency: 'USD' }), purchases.preload()]);
        const nextPlan = selectClairePackage(offerings.current);
        if (!nextPlan) throw new Error('The Claire monthly plan is not available right now.');
        if (!active) return;
        setPlan(nextPlan);
        setPhase('ready');
      } catch (error) {
        if (!active) return;
        setMessage(errorMessage(error));
        setPhase('error');
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [publicApiKey]);

  const startPurchase = async () => {
    if (!plan || !checkoutTarget.current) return;

    setMessage('');
    setPhase('purchasing');
    try {
      const result = await purchasesFor(publicApiKey).purchase({
        rcPackage: plan,
        htmlTarget: checkoutTarget.current,
        discountCode: discountCode.trim() || undefined,
        showDiscountCodeField: true,
        termsAndConditionsUrl: 'https://useclaire.co/legal/terms',
        metadata: {
          source: 'useclaire.co',
          plan: CLAIRE_PRODUCT_ID,
        },
      });

      setSuccess({
        customerEmail: result.customerEmail,
        redemptionInfo: result.redemptionInfo,
      });
      setPhase('success');
    } catch (error) {
      if (error instanceof PurchasesError && error.errorCode === ErrorCode.UserCancelledError) {
        setPhase('ready');
        return;
      }
      setMessage(errorMessage(error));
      setPhase('error');
    }
  };

  if (phase === 'success') {
    const redeemUrl = success?.redemptionInfo?.redeemUrlRedirect ?? success?.redemptionInfo?.redeemUrl;
    return (
      <section className={`${styles.card} ${styles.success}`} aria-live="polite">
        <span className={styles.successMark}>✓</span>
        <div className="kicker">PAYMENT COMPLETE</div>
        <h2>You’re all set.</h2>
        <p>
          {success?.customerEmail
            ? `A receipt and backup redemption link are on the way to ${success.customerEmail}.`
            : 'A receipt and backup redemption link are on the way to your billing email.'}
        </p>
        {redeemUrl ? (
          <a className="button button-dark" href={redeemUrl}>
            Open Claire and unlock
          </a>
        ) : (
          <a className="button button-dark" href="https://apps.apple.com/app/id6814665946">
            Open Claire
          </a>
        )}
        <small>On a computer? Open the redemption email on the phone where Claire is installed.</small>
      </section>
    );
  }

  const displayPrice = plan?.webBillingProduct.price.formattedPrice ?? '$19.99';
  const isLoading = phase === 'loading';
  const isPurchasing = phase === 'purchasing';

  return (
    <section className={styles.card} aria-labelledby="checkout-title">
      <div className={styles.cardTop}>
        <div>
          <div className="kicker">EVERYTHING INCLUDED</div>
          <h2 id="checkout-title">Claire</h2>
        </div>
        <span className={styles.price}>
          {displayPrice}
          <small>/month</small>
        </span>
      </div>

      <p className={styles.renewal}>Renews monthly until canceled.</p>
      <ul className={styles.features}>
        <li>Every supported messaging network</li>
        <li>A fresh Loop every morning</li>
        <li>Ask Claire, drafts, summaries, and smart cards</li>
        <li>2,000 monthly AI credits with a hard spend cap</li>
      </ul>

      <div className={styles.discount}>
        <button type="button" onClick={() => setShowDiscount((current) => !current)}>
          {showDiscount ? 'Hide promo code' : 'Have a promo code?'}
        </button>
        {showDiscount ? (
          <label>
            <span>Promo code</span>
            <input
              autoCapitalize="characters"
              autoComplete="off"
              onChange={(event) => setDiscountCode(event.target.value.toUpperCase())}
              placeholder="Enter code"
              value={discountCode}
            />
          </label>
        ) : null}
      </div>

      {message ? <p className={styles.error} role="alert">{message}</p> : null}

      <button
        className={`button button-dark ${styles.checkoutButton}`}
        disabled={!plan || isLoading || isPurchasing}
        onClick={() => void startPurchase()}
        type="button"
      >
        {isLoading ? 'Loading checkout…' : isPurchasing ? 'Checkout open below' : 'Continue to secure checkout'}
      </button>

      <div className={styles.checkoutTarget} ref={checkoutTarget} />

      <div className={styles.finePrint}>
        <span>Encrypted payment</span>
        <span>Powered by Stripe + RevenueCat</span>
      </div>
    </section>
  );
}
