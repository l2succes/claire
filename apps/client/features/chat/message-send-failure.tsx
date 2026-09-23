import { Pressable, Text, View } from 'react-native';
import { colors, mobileType, space } from '@claire/design-system';

/** WhatsApp-style per-message failure affordance; the indicator is the retry button. */
export function MessageSendFailure({ messageId, onRetry }: { messageId: string; onRetry: () => void }) {
  return (
    <Pressable
      testID={`message-retry-${messageId}`}
      accessibilityRole="button"
      accessibilityLabel="Message failed to send. Retry"
      hitSlop={8}
      onPress={onRetry}
      style={{
        width: 34,
        height: 34,
        marginRight: space[2],
        marginBottom: 4,
        alignSelf: 'flex-end',
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
