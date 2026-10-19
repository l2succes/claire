import { View } from 'react-native';
import { ChevronLeft, ListFilter } from 'lucide-react-native';
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, mobileType, space } from '@claire/design-system';
import { MobileIconButton } from '../../components/mobile/claire-mobile';

export function ContactsCollapsingHeader({ progress, showBack, filtered, onBack, onFilter }: {
  progress: SharedValue<number>;
  showBack: boolean;
  filtered: boolean;
  onBack: () => void;
  onFilter: () => void;
}) {
  const { top } = useSafeAreaInsets();
  const frameStyle = useAnimatedStyle(() => ({ height: interpolate(progress.value, [0, 1], [128, 54]) }));
  const titleStyle = useAnimatedStyle(() => ({
    top: interpolate(progress.value, [0, 1], [58, 11]),
    left: interpolate(progress.value, [0, 1], [space[4], showBack ? 72 : space[4]]),
    fontSize: interpolate(progress.value, [0, 1], [32, 20]),
    lineHeight: interpolate(progress.value, [0, 1], [38, 26]),
  }));
  const subtitleStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));

  return (
    <View style={{ paddingTop: Math.max(top, process.env.EXPO_OS === 'ios' ? 48 : 0), backgroundColor: colors.paper }}>
      <Animated.View style={[{ overflow: 'hidden' }, frameStyle]}>
        <View style={{ height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space[4] }}>
          {showBack ? <MobileIconButton label="Back" onPress={onBack}><ChevronLeft size={20} color={colors.ink} /></MobileIconButton> : <View />}
          <MobileIconButton label="Filter by platform" selected={filtered} onPress={onFilter} testID="people-platform-filter"><ListFilter size={18} color={colors.ink} /></MobileIconButton>
        </View>
        <Animated.Text selectable maxFontSizeMultiplier={1} numberOfLines={1} style={[{ ...mobileType.screenTitle, position: 'absolute', right: 68, color: colors.ink }, titleStyle]}>Contacts</Animated.Text>
        <Animated.Text selectable maxFontSizeMultiplier={1} numberOfLines={1} style={[{ ...mobileType.bodySmall, position: 'absolute', top: 100, left: space[4], right: space[4], color: colors.neutral[600] }, subtitleStyle]}>The people behind your conversations</Animated.Text>
      </Animated.View>
    </View>
  );
}
