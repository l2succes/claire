import { useEffect, useRef } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import { refreshServerBillingSummary } from '../services/billing-api';
import { initializeBilling, redeemWebPurchaseLink } from '../services/billing';

export function useWebPurchaseRedemption(userId: string | undefined) {
  const handled = useRef(new Set<string>());

  useEffect(() => {
    if (!userId || Platform.OS === 'web') return;
    let active = true;

    const redeem = async (url: string | null) => {
      if (!url || handled.current.has(url)) return;
      handled.current.add(url);

      try {
        if (!(await initializeBilling(userId))) return;
        const result = await redeemWebPurchaseLink(url);
        if (!active || result.kind === 'ignored') return;

        if (result.kind === 'success') {
          await refreshServerBillingSummary().catch(() => null);
          Alert.alert('Claire is ready', 'Your web subscription is now connected to this account.');
        } else if (result.kind === 'expired') {
          Alert.alert(
            'That link expired',
            `RevenueCat sent a fresh link to ${result.obfuscatedEmail}. Open it on this device to finish.`
          );
        } else if (result.kind === 'other_user') {
          Alert.alert(
            'Subscription already connected',
            'That purchase belongs to another Claire account. Sign in to that account and open the link again.'
          );
        } else if (result.kind === 'invalid') {
          Alert.alert('Invalid redemption link', 'Request a new link from your purchase email.');
        } else {
          Alert.alert('Could not connect subscription', result.message || 'Please try again.');
        }
      } catch (error) {
        if (active)
          Alert.alert(
            'Could not connect subscription',
            error instanceof Error ? error.message : 'Please try again.'
          );
      }
    };

    void Linking.getInitialURL().then(redeem);
    const subscription = Linking.addEventListener('url', ({ url }) => void redeem(url));
    return () => {
      active = false;
      subscription.remove();
    };
  }, [userId]);
}
