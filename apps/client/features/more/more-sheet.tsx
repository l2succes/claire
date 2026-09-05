import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { colors, mobileType, space } from '@claire/design-system';
import { BottomSheet } from '../../components/mobile/bottom-sheet';
import { useMoreSheet } from '../../hooks/useMoreSheet';
import { MORE_DESTINATIONS, type MoreDestination } from './more-destinations';

/**
 * One destination. Deliberately a list row rather than a standalone card: the
 * previous screen floated four bordered, shadowed cards, which matched nothing
 * else in the app. Rows share a single surface and are separated by hairlines,
 * the way the inbox and settings lists already read.
 */
function MoreSheetRow({
  destination,
  isLast,
  onPress,
}: {
  destination: MoreDestination;
  isLast: boolean;
  onPress: () => void;
}) {
  const Icon = destination.icon;
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      testID={`more-${destination.key}`}
      accessibilityRole="button"
      accessibilityLabel={`${destination.title}. ${destination.detail}`}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      // Static style object rather than the ({ pressed }) callback form: this
      // app runs NativeWind's css-interop wrapper over Pressable, which does not
      // apply the callback result, so the row lost its flexDirection/padding.
      style={{
        minHeight: 60,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        paddingHorizontal: space[4],
        paddingVertical: space[2],
        backgroundColor: pressed ? colors.neutral[100] : 'transparent',
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: colors.neutral[200],
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          flexShrink: 0,
          borderRadius: 11,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.neutral[100],
        }}
      >
        <Icon size={18} color={colors.ink} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text maxFontSizeMultiplier={1.2} style={{ ...mobileType.body, fontWeight: '600', color: colors.ink }}>
          {destination.title}
        </Text>
        <Text
          maxFontSizeMultiplier={1.2}
          numberOfLines={1}
          style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}
        >
          {destination.detail}
        </Text>
      </View>
      <ChevronRight size={18} color={colors.neutral[400]} />
    </Pressable>
  );
}

/** Mounted once from the tab layout so it can open over any tab. */
export function MoreSheet() {
  const isOpen = useMoreSheet((state) => state.isOpen);
  const close = useMoreSheet((state) => state.close);
  const navigate = useMoreSheet((state) => state.navigate);

  return (
    <BottomSheet visible={isOpen} title="More" onClose={close} testID="more-sheet">
      {MORE_DESTINATIONS.map((destination, index) => (
        <MoreSheetRow
          key={destination.key}
          destination={destination}
          isLast={index === MORE_DESTINATIONS.length - 1}
          onPress={() => navigate(destination.href)}
        />
      ))}
    </BottomSheet>
  );
}
