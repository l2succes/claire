import { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

/** Pause decorative motion off-screen and respond to accessibility changes live. */
export function useOnboardingMotion() {
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setReduceMotion(value);
    });
    const preference = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    const lifecycle = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
    return () => { mounted = false; preference.remove(); lifecycle.remove(); };
  }, []);
  return { reduceMotion, animate: focused && foreground && !reduceMotion };
}
