import { useState } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

type FeedbackStyle = StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);

/**
 * NativeWind's Pressable wrapper drops React Native's style callback on native.
 * Resolve it to a static style so the hit area and pressed feedback both render.
 */
export function FeedbackPressable({
  style,
  onPressIn,
  onPressOut,
  ...props
}: Omit<PressableProps, 'style'> & { style?: FeedbackStyle }) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      {...props}
      onPressIn={(event) => {
        setPressed(true);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        onPressOut?.(event);
      }}
      style={typeof style === 'function' ? style({ pressed }) : style}
    />
  );
}
