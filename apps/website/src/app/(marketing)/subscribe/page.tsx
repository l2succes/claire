// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter } from '@/components/site/SiteFooter';
import { SiteHeader } from '@/components/site/SiteHeader';
import { Checkout } from './checkout';
import styles from './subscribe.module.css';

export const metadata: Metadata = {
  title: 'Subscribe',
  description: 'Subscribe to Claire for $19.99 a month through secure Stripe checkout.',
  alternates: { canonical: '/subscribe' },
};

export default function SubscribePage() {
  const publicApiKey = process.env.NEXT_PUBLIC_REVENUECAT_WEB_API_KEY?.trim() ?? '';

  return (
    <main className={styles.page}>
      <div className="shell">
        <SiteHeader active="Pricing" />
      </div>

      <section className={`${styles.hero} shell`}>
        <div className={styles.intro}>
          <Link className={styles.back} href="/pricing">
            ← Pricing
          </Link>
          <div className="kicker">CLAIRE MEMBERSHIP</div>
          <h1>
            One plan.
            <br />
            <span>Everything included.</span>
          </h1>
          <p>
            Subscribe on the web to keep billing simple, then connect the purchase to the Claire
            app. Cancel whenever you want.
          </p>
          <ul className={styles.trustList}>
            <li>Secure payment processing by Stripe</li>
            <li>Instant access through RevenueCat</li>
            <li>No surprise usage charges</li>
          </ul>
        </div>

        <Checkout publicApiKey={publicApiKey} />
      </section>

      <SiteFooter note="One calm place for every conversation." />
    </main>
  );
}
