import { useEffect } from 'react';
import { router } from 'expo-router';
import { useMoreSheet } from '../../hooks/useMoreSheet';

/**
 * More is an action, never a destination. The tab press is intercepted by the
 * layout, but deep links and older navigation state can still arrive here.
 * Resolve those cases to the inbox and open the same compact sheet instead of
 * ever rendering the retired full-screen More page.
 */
export default function MoreScreen() {
  useEffect(() => {
    useMoreSheet.getState().open();
    router.replace('/(tabs)/messages');
  }, []);

  return null;
}
