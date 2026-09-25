import { Pressable, Text, View } from 'react-native';
import { colors, mobileType } from '@claire/design-system';

export function ChatDeliveryStatus({ visible, needsAttention, count, error, onPress, onRestore, restoreLabel }: {
  visible: boolean;
  needsAttention: boolean;
  count: number;
  error?: string;
  onPress: () => void;
  onRestore?: () => void;
  restoreLabel?: string;
}) {
  if (!visible) return null;
  return (
    <View style={{ paddingBottom: 8, gap: 6 }}>
      <Pressable testID="chat-connection-status" accessibilityRole="button" onPress={onPress}>
        <Text style={{ ...mobileType.bodySmall, color: error ? colors.danger : colors.neutral[600] }}>
          {needsAttention ? 'Connection needs attention · Open Connections' : error ? `${error} · Tap to retry`
            : count ? `${count} queued · Will send when connected` : 'Reconnecting… You can keep typing'}
        </Text>
      </Pressable>
      {error && onRestore ? (
        <Pressable accessibilityRole="button" onPress={onRestore}>
          <Text style={{ ...mobileType.bodySmall, color: colors.ink }}>{restoreLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
