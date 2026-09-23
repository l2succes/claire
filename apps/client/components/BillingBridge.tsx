import { useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { initializeBilling } from '../services/billing';
import { useWebPurchaseRedemption } from '../hooks/useWebPurchaseRedemption';

export function BillingBridge() {
  const userId = useAuthStore((state) => state.user?.id);
  useWebPurchaseRedemption(userId);
  useEffect(() => {
    if (userId)
      void initializeBilling(userId).catch((error) =>
        console.warn('[Billing] initialization failed', error)
      );
  }, [userId]);
  return null;
}
