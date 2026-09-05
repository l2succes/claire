import { Text, View } from 'react-native';
import { colors, mobileType, radius } from '@claire/design-system';

export function StandaloneEmojiMessage({
  messageId,
  content,
  timestamp,
  fromMe,
}: {
  messageId: string;
  content: string;
  timestamp: string;
  fromMe: boolean;
}) {
  return (
    <View style={{ alignItems: fromMe ? 'flex-end' : 'flex-start' }}>
      <Text
        testID={`standalone-emoji-${messageId}`}
        style={{ fontSize: 52, lineHeight: 62, color: colors.ink, textAlign: 'center' }}
      >
        {content.trim()}
      </Text>
      <Text
        testID={`standalone-emoji-time-${messageId}`}
        style={{
          ...mobileType.label,
          fontSize: 10,
          color: colors.neutral[600],
          minHeight: 20,
          paddingHorizontal: 7,
          paddingVertical: 2,
          borderWidth: 1,
          borderColor: colors.neutral[200],
          borderRadius: radius.pill,
          backgroundColor: fromMe ? colors.lime : colors.paper,
          overflow: 'hidden',
        }}
      >
        {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </Text>
    </View>
  );
}
