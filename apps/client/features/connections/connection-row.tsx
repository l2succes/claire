import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Check, ChevronRight, Clock3, Laptop, Monitor, Smartphone } from 'lucide-react-native';
import { colors, mobileType, space } from '@claire/design-system';
import { Platform } from '../../types/platform';
import { ConnectionPlatformMark } from './connection-platform-mark';

export type ConnectionRowState = 'available' | 'pending' | 'connected' | 'desktop' | 'mac';

const STATE_COPY: Record<ConnectionRowState, string> = {
  available: 'Connect',
  pending: 'Continue setup',
  connected: 'Connected',
  desktop: 'Desktop required',
  mac: 'Mac required',
};

export function ConnectionRow({
  platform,
  name,
  detail,
  state,
  onPress,
  isLast = false,
  testID,
}: {
  platform: Platform;
  name: string;
  detail: string;
  state: ConnectionRowState;
  onPress: () => void;
  isLast?: boolean;
  testID?: string;
}) {
  const [pressed, setPressed] = useState(false);
  const stateColor = state === 'connected'
    ? colors.success
    : state === 'pending'
      ? colors.warning
      : colors.neutral[600];
  const StatusIcon = state === 'connected'
    ? Check
    : state === 'pending'
      ? Clock3
      : state === 'desktop'
        ? Monitor
        : state === 'mac'
          ? Laptop
          : Smartphone;

  return (
    <Pressable
      testID={testID || `connection-row-${platform}`}
      accessibilityRole="button"
      accessibilityLabel={`${name}. ${STATE_COPY[state]}. ${detail}`}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={{
        minHeight: 82,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        paddingVertical: space[3],
        opacity: pressed ? 0.68 : 1,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: colors.neutral[200],
      }}
    >
      <ConnectionPlatformMark platform={platform} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>{name}</Text>
        <Text numberOfLines={1} style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{detail}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <StatusIcon size={13} color={stateColor} />
          <Text style={{ ...mobileType.label, color: stateColor }}>{STATE_COPY[state]}</Text>
        </View>
      </View>
      <ChevronRight size={18} color={colors.neutral[400]} />
    </Pressable>
  );
}
