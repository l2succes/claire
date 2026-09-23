import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';

/** A small, finite entrance; system Reduce Motion skips translation entirely. */
export function OnboardingReveal({ children, delay = 0, style }: {
  children: ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View style={style} entering={FadeInDown.duration(320).delay(delay).reduceMotion(ReduceMotion.System)}>
      {children}
    </Animated.View>
  );
}
