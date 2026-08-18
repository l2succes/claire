import { useEffect } from 'react';
import { host } from './host';

export * from './types';
export { host };

/**
 * Mirror a value on the host's Dock/taskbar badge.
 *
 * Safe to call from any client: hosts without the capability no-op.
 */
export function useBadgeCount(count: number | undefined): void {
  useEffect(() => {
    if (typeof count !== 'number' || !Number.isFinite(count)) return;
    host.setBadgeCount(Math.max(0, Math.trunc(count)));
  }, [count]);
}

/**
 * Subscribe to chrome-initiated navigation — menu accelerators, notification
 * clicks. `onTarget` receives an expo-router path.
 */
export function useHostNavigation(onTarget: (target: string) => void): void {
  useEffect(() => host.onNavigate(onTarget), [onTarget]);
}
