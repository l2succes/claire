import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, G, Mask, Path, Rect } from 'react-native-svg';

const THREAD_LENGTH = 180;
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type LaunchRevealProps = {
  ready: boolean;
  onFinish: () => void;
};

/**
 * Native launch screens are intentionally static. Once React owns the frame,
 * this lime overlay cuts the thread mark out as a window onto the app, then
 * grows that window until the app fills the display.
 */
export function LaunchReveal({ ready, onFinish }: LaunchRevealProps) {
  const { width, height } = useWindowDimensions();
  const threadOffset = useRef(new Animated.Value(THREAD_LENGTH)).current;
  const dotRadius = useRef(new Animated.Value(0)).current;
  const expansion = useRef(new Animated.Value(1)).current;
  const overlayOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!ready) return;

    const animation = Animated.sequence([
      Animated.timing(threadOffset, {
        toValue: 0,
        duration: 680,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(dotRadius, {
        toValue: 8,
        duration: 170,
        easing: Easing.out(Easing.back(1.7)),
        useNativeDriver: false,
      }),
      Animated.delay(180),
      Animated.parallel([
        Animated.timing(expansion, {
          toValue: 11,
          duration: 620,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(430),
          Animated.timing(overlayOpacity, {
            toValue: 0,
            duration: 190,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]);

    animation.start(({ finished }) => {
      if (finished) onFinish();
    });
    return () => animation.stop();
  }, [dotRadius, expansion, onFinish, overlayOpacity, ready, threadOffset]);

  const centerX = width / 2;
  const centerY = height / 2;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        styles.overlay,
        { opacity: overlayOpacity, transform: [{ scale: expansion }] },
      ]}
    >
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <Defs>
          <Mask id="claire-launch-cutout" maskType="luminance">
            <Rect width={width} height={height} fill="#FFFFFF" />
            <G transform={`translate(${centerX - 64} ${centerY - 64}) scale(2)`}>
              <G transform="translate(64 0) scale(-1 1)">
                <AnimatedPath
                  d="M10 34c0-13 9-22 22-22s22 8 22 20-9 20-21 20c-10 0-17-6-17-14 0-7 5-12 12-12 6 0 10 4 10 9 0 6-4 10-10 10"
                  fill="none"
                  stroke="#000000"
                  strokeWidth={7}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={THREAD_LENGTH}
                  strokeDashoffset={threadOffset}
                />
              </G>
              <AnimatedCircle cx={54} cy={34} r={dotRadius} fill="#000000" />
            </G>
          </Mask>
        </Defs>
        <Rect width={width} height={height} fill="#DFFF64" mask="url(#claire-launch-cutout)" />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
