import { useEffect } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { colors, radius, space } from '@claire/design-system';

type BoneProps = {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  delay?: number;
  style?: StyleProp<ViewStyle>;
};

export function Bone({ width = '100%', height = 12, radius: corner = 8, delay = 0, style }: BoneProps) {
  const opacity = useSharedValue(0.42);
  useEffect(() => {
    const timer = setTimeout(() => {
      opacity.value = withRepeat(withTiming(0.88, { duration: 860, easing: Easing.inOut(Easing.quad) }), -1, true);
    }, delay);
    return () => clearTimeout(timer);
  }, [delay, opacity]);
  const pulse = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      style={[{ width, height, borderRadius: corner, backgroundColor: colors.neutral[200] }, pulse, style]}
    />
  );
}

export function InboxRowSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <View style={{ minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], borderBottomWidth: 1, borderBottomColor: colors.neutral[200] }}>
      <Bone width={44} height={44} radius={22} delay={delay} />
      <View style={{ flex: 1, gap: 8 }}>
        <Bone width="58%" height={14} delay={delay + 40} />
        <Bone width="82%" height={11} delay={delay + 80} />
      </View>
      <Bone width={28} height={10} delay={delay + 60} />
    </View>
  );
}

export function InboxSkeleton({ testID }: { testID?: string }) {
  return (
    <View testID={testID} style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: space[4], paddingTop: space[3], paddingBottom: space[2] }}>
        <Bone width={92} height={10} delay={0} />
      </View>
      <View style={{ paddingHorizontal: space[4], paddingBottom: space[3] }}>
        <Bone width="100%" height={138} radius={radius.card} delay={40} />
      </View>
      {Array.from({ length: 7 }, (_, index) => <InboxRowSkeleton key={index} delay={index * 70} />)}
    </View>
  );
}

export function HomeSkeleton() {
  return (
    <View style={{ gap: space[4] }}>
      <Bone width="100%" height={82} radius={radius.card} />
      <Bone width={72} height={10} />
      {Array.from({ length: 3 }, (_, index) => (
        <View key={index} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 82, paddingVertical: space[3], borderBottomWidth: 1, borderBottomColor: colors.neutral[200] }}>
          <Bone width={48} height={48} radius={16} delay={index * 80} />
          <View style={{ flex: 1, gap: 8 }}>
            <Bone width="72%" height={14} delay={index * 80 + 40} />
            <Bone width="48%" height={11} delay={index * 80 + 80} />
          </View>
        </View>
      ))}
      <Bone width="100%" height={92} radius={radius.card} delay={180} />
    </View>
  );
}

export function LoopsSkeleton() {
  return (
    <View style={{ paddingHorizontal: space[4] }}>
      {Array.from({ length: 6 }, (_, index) => (
        <View key={index} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3], borderBottomWidth: 1, borderBottomColor: colors.neutral[200] }}>
          <Bone width={34} height={34} radius={17} delay={index * 70} />
          <View style={{ flex: 1, gap: 8 }}>
            <Bone width="78%" height={14} delay={index * 70 + 30} />
            <Bone width="42%" height={11} delay={index * 70 + 70} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function AskClaireSkeleton() {
  return (
    <View style={{ paddingHorizontal: space[4], gap: space[4] }}>
      <Bone width={64} height={10} />
      {Array.from({ length: 3 }, (_, index) => (
        <View key={index} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.neutral[200] }}>
          <Bone width={42} height={42} radius={21} delay={index * 80} />
          <View style={{ flex: 1, gap: 8 }}>
            <Bone width="62%" height={14} delay={index * 80 + 40} />
            <Bone width="38%" height={11} delay={index * 80 + 80} />
          </View>
        </View>
      ))}
      <Bone width={140} height={10} delay={160} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
        {Array.from({ length: 4 }, (_, index) => (
          <Bone key={index} width="47.8%" height={132} radius={radius.card} delay={200 + index * 70} />
        ))}
      </View>
    </View>
  );
}

export function ChatSkeleton({ testID }: { testID?: string }) {
  return (
    <Animated.View entering={FadeIn.duration(180)} testID={testID} style={{ flex: 1, justifyContent: 'flex-end', paddingHorizontal: space[4], paddingBottom: space[4], gap: space[3] }}>
      <View style={{ alignSelf: 'flex-start' }}><Bone width={196} height={46} radius={18} delay={0} /></View>
      <View style={{ alignSelf: 'flex-end' }}><Bone width={168} height={40} radius={18} delay={80} /></View>
      <View style={{ alignSelf: 'flex-start' }}><Bone width={228} height={62} radius={18} delay={140} /></View>
      <View style={{ alignSelf: 'flex-end' }}><Bone width={132} height={40} radius={18} delay={200} /></View>
      <View style={{ alignSelf: 'flex-start' }}><Bone width={184} height={46} radius={18} delay={260} /></View>
    </Animated.View>
  );
}

export function PeopleSkeleton() {
  return (
    <View>
      {Array.from({ length: 8 }, (_, index) => (
        <View key={index} style={{ minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3], borderBottomWidth: 1, borderBottomColor: colors.neutral[200] }}>
          <Bone width={48} height={48} radius={24} delay={index * 60} />
          <View style={{ flex: 1, gap: 8 }}>
            <Bone width="54%" height={14} delay={index * 60 + 30} />
            <Bone width="72%" height={11} delay={index * 60 + 70} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function ConnectionsSkeleton() {
  return (
    <View style={{ gap: space[4] }}>
      <Bone width="100%" height={118} radius={radius.card} />
      {Array.from({ length: 4 }, (_, index) => (
        <View key={index} style={{ minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3], borderBottomWidth: 1, borderBottomColor: colors.neutral[200] }}>
          <Bone width={46} height={46} radius={15} delay={index * 80} />
          <View style={{ flex: 1, gap: 8 }}>
            <Bone width="44%" height={14} delay={index * 80 + 40} />
            <Bone width="62%" height={11} delay={index * 80 + 80} />
          </View>
        </View>
      ))}
    </View>
  );
}
