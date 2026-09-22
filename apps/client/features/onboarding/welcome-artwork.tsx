import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { Check, Sparkles } from 'lucide-react-native';
import Animated, { cancelAnimation, Easing, interpolate, useAnimatedStyle, useSharedValue, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';
import { colors, mobileType } from '@claire/design-system';
import { ClaireMark } from '../../components/claire/mark';
import { PlatformIcon } from '../../components/PlatformIcon';
import { WELCOME_PLATFORMS } from './welcome-scenes';

const clamp = 'clamp' as const;

function PlatformTile({ item, index, progress, drift }: {
  item: (typeof WELCOME_PLATFORMS)[number]; index: number;
  progress: SharedValue<number>; drift: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    const float = Math.sin(drift.value * Math.PI * 2 + index * 1.6) * 4;
    return {
      opacity: interpolate(p, [0, 0.8, 1, 2], [1, 0.5, 0.4, 0.35], clamp),
      transform: [
        { translateX: interpolate(p, [0, 1, 2], [item.x, (index - (WELCOME_PLATFORMS.length - 1) / 2) * 64, (index - (WELCOME_PLATFORMS.length - 1) / 2) * 64], clamp) },
        { translateY: interpolate(p, [0, 1, 2], [item.y + float, -92, -92], clamp) },
        { rotate: `${interpolate(p, [0, 1], [item.tilt + float / 2, 0], clamp)}deg` },
        { scale: interpolate(p, [0, 1], [1, 0.64], clamp) },
      ],
    };
  });
  return (
    <Animated.View style={[{ position: 'absolute', width: 68, height: 68, borderRadius: 21, borderCurve: 'continuous', backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 20px rgba(16,18,15,0.08)' }, style]}>
      <PlatformIcon platform={item.platform} size={34} />
    </Animated.View>
  );
}

// These are decorative illustrations. The accessible story copy below scales with Dynamic Type.
function StoryCard({ scene, progress }: { scene: 1 | 2; progress: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [scene - 0.5, scene, scene + 0.5], [0, 1, 0], clamp),
    transform: [
      { translateX: (scene - progress.value) * 65 },
      { translateY: interpolate(progress.value, [scene - 1, scene, scene + 1], [22, 0, -12], clamp) },
      { scale: interpolate(progress.value, [scene - 1, scene, scene + 1], [0.88, 1, 0.94], clamp) },
    ],
  }));
  return (
    <Animated.View style={[{ position: 'absolute', width: 272, padding: 20, borderRadius: 24, borderCurve: 'continuous', gap: 14, backgroundColor: colors.paper, boxShadow: '0 12px 30px rgba(16,18,15,0.08)' }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ClaireMark size={18} />
        <Text allowFontScaling={false} style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>{scene === 1 ? 'A LITTLE CATCH-UP' : 'ONE LESS THING TO REMEMBER'}</Text>
      </View>
      <Text allowFontScaling={false} style={{ ...mobileType.sectionTitle, color: colors.ink }}>{scene === 1 ? 'Dinner’s at 7.\nYou’re all caught up.' : 'Get back to Sam.\nWhen you have a moment.'}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        {scene === 1 ? <Sparkles size={15} color={colors.success} /> : <Check size={16} color={colors.success} />}
        <Text allowFontScaling={false} style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{scene === 1 ? 'The details, without the scroll.' : 'A follow-up, saved for later.'}</Text>
      </View>
    </Animated.View>
  );
}

export function WelcomeArtwork({ progress, animate }: { progress: SharedValue<number>; animate: boolean }) {
  const drift = useSharedValue(0);
  useEffect(() => {
    if (animate) drift.value = withRepeat(withTiming(1, { duration: 6000, easing: Easing.linear }), -1, false);
    else { cancelAnimation(drift); drift.value = 0; }
    return () => cancelAnimation(drift);
  }, [animate, drift]);
  const hub = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.65], [1, 0], clamp),
    transform: [{ scale: interpolate(progress.value, [0, 1], [1, 0.65], clamp) }, { rotate: `${progress.value * -18}deg` }],
  }));
  return (
    <View pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ height: 262, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ position: 'absolute', width: 224, height: 224, borderRadius: 112, borderWidth: 1, borderColor: 'rgba(255,253,248,0.45)' }, hub]} />
      <Animated.View style={[{ position: 'absolute', width: 112, height: 112, borderRadius: 34, borderCurve: 'continuous', backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 24px rgba(16,18,15,0.08)' }, hub]}>
        <ClaireMark size={68} color={colors.ink} dot={colors.paper} />
      </Animated.View>
      {WELCOME_PLATFORMS.map((item, index) => <PlatformTile key={item.platform} item={item} index={index} progress={progress} drift={drift} />)}
      <StoryCard scene={1} progress={progress} />
      <StoryCard scene={2} progress={progress} />
    </View>
  );
}
