import { useCallback, useEffect, useRef } from 'react';
import { useSharedValue, withTiming } from 'react-native-reanimated';

/** Collapse during a drag or fling, then restore the header when it settles. */
export function useScrollSettledHeader() {
  const progress = useSharedValue(0);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSettleTimer = useCallback(() => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = null;
  }, []);
  const setCollapsed = useCallback((collapsed: boolean) => {
    progress.value = withTiming(collapsed ? 1 : 0, { duration: 210 });
  }, [progress]);
  useEffect(() => clearSettleTimer, [clearSettleTimer]);

  return {
    progress,
    onScrollBeginDrag: () => { clearSettleTimer(); setCollapsed(true); },
    onScrollEndDrag: () => {
      clearSettleTimer();
      // Momentum starts after the drag ends. Restore here only when no fling
      // takes ownership of the settle.
      settleTimer.current = setTimeout(() => setCollapsed(false), 100);
    },
    onMomentumScrollBegin: clearSettleTimer,
    onMomentumScrollEnd: () => { clearSettleTimer(); setCollapsed(false); },
  };
}
