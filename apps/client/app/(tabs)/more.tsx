import { LegacyMoreScreen } from '../../features/more/legacy-more-screen';

/**
 * The More tab no longer navigates here: `app/(tabs)/_layout.tsx` intercepts the
 * tab press and opens `MoreSheet` over the current tab instead. This route is
 * kept mounted so the tab still appears in the bar, and so the previous
 * full-screen version stays one line away if we want it back — delete the
 * `listeners` on the `more` screen in the tab layout to revert.
 */
export default function MoreScreen() {
  return <LegacyMoreScreen />;
}
