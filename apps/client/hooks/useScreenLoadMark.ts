import { useEffect, useRef } from 'react';
import { perfMark, type PerfSource } from '../services/perf-marks';

type ScreenLoadState = {
  /** True once there is something real to paint, from any source. */
  hasData: boolean;
  /** True while a network request for this screen is in flight. */
  isFetching?: boolean;
  /** Where the first painted data came from. */
  source?: PerfSource;
};

/**
 * Records when a screen mounted, when it first had something to show, and when
 * it stopped moving.
 *
 * The three marks are deliberately distinct. `first-paint` is the number the
 * local-first work is trying to move, and it should land on cached data;
 * `settled` is when the network refresh finished and is allowed to be much
 * later. Collapsing them into one "loaded" number would hide exactly the gap
 * that matters.
 */
export function useScreenLoadMark(screen: string, state: ScreenLoadState): void {
  const painted = useRef(false);
  const settled = useRef(false);

  useEffect(() => {
    perfMark(screen, 'mount');
    // Mount is per screen instance: a remount of the same route should time
    // itself again rather than inherit the first visit's baseline.
    return () => {
      painted.current = false;
      settled.current = false;
    };
  }, [screen]);

  useEffect(() => {
    if (state.hasData && !painted.current) {
      painted.current = true;
      perfMark(screen, 'first-paint', { source: state.source });
    }
    if (state.hasData && !state.isFetching && !settled.current) {
      settled.current = true;
      perfMark(screen, 'settled', { source: state.source });
    }
  }, [screen, state.hasData, state.isFetching, state.source]);
}
