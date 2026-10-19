import { Pressable, Text, View } from 'react-native';
import { colors, mobileType } from '@claire/design-system';

/** WhatsApp-style per-message failure affordance; the indicator is the retry button. */
export function MessageSendFailure({ messageId, onRetry, needsConnection }: {
  messageId: string;
  onRetry: () => void;
  needsConnection?: boolean;
}) {
  return (
    <Pressable
      testID={`message-retry-${messageId}`}
      accessibilityRole="button"
      accessibilityLabel={needsConnection ? 'Message failed to send. Open Connections' : 'Message failed to send. Retry'}
      hitSlop={8}
      onPress={(event) => { event?.stopPropagation?.(); onRetry(); }}
      style={{
        position: 'absolute',
        top: -6,
        right: -6,
        zIndex: 2,
        width: 34,
        height: 34,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.danger,
        }}
      >
        <Text
          maxFontSizeMultiplier={1}
          style={{ ...mobileType.label, color: colors.paper, fontSize: 14, lineHeight: 17 }}
        >
          !
        </Text>
      </View>
    </Pressable>
  );
}
