import { Pressable, Text, View } from 'react-native';
import { Reply, X } from 'lucide-react-native';
import { colors, mobileType, radius, space } from '@claire/design-system';

type ReplyReferenceProps = {
  sender: string;
  content: string;
};

function summary(content: string) {
  const compact = content.replace(/\s+/g, ' ').trim();
  return compact || 'Media message';
}

export function MessageReplyPreview({ sender, content }: ReplyReferenceProps) {
  return (
    <View
      accessibilityLabel={`Reply to ${sender}: ${summary(content)}`}
      style={{
        gap: 2,
        marginBottom: space[2],
        paddingVertical: 5,
        paddingHorizontal: space[2],
        borderLeftWidth: 2,
        borderLeftColor: colors.ink,
        borderRadius: radius.control,
        backgroundColor: 'rgba(255,255,255,0.34)',
      }}
    >
      <Text numberOfLines={1} style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>
        {sender}
      </Text>
      <Text numberOfLines={1} style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>
        {summary(content)}
      </Text>
    </View>
  );
}

export function ComposerReplyTarget({
  sender,
  content,
  onCancel,
}: ReplyReferenceProps & { onCancel: () => void }) {
  return (
    <View
      testID="composer-reply-target"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2],
        marginBottom: space[2],
        paddingHorizontal: space[3],
        paddingVertical: space[2],
        borderWidth: 1,
        borderColor: colors.ink,
        borderRadius: radius.control,
        backgroundColor: colors.sky,
      }}
    >
      <Reply size={16} color={colors.ink} strokeWidth={2.2} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={{ ...mobileType.monoLabel, color: colors.ink }}>
          REPLYING TO {sender.toUpperCase()}
        </Text>
        <Text numberOfLines={1} style={{ ...mobileType.bodySmall, color: colors.ink }}>
          {summary(content)}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cancel reply"
        hitSlop={8}
        onPress={onCancel}
        style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}
      >
        <X size={18} color={colors.ink} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}
