import { Linking, Platform, Pressable, Text, View } from 'react-native';
import { CalendarPlus, MessageCircle } from 'lucide-react-native';
import { router } from 'expo-router';
import { colors, mobileType, radius, space } from '@claire/design-system';
import type { AssistantAction } from '../../services/conversationAssistant';

export function AssistantAnswerActions({ actions }: { actions?: AssistantAction[] }) {
  if (!actions?.length) return null;

  const handleAction = (action: AssistantAction) => {
    if (action.type === 'open_conversation' && action.chatId) {
      router.push({
        pathname: '/chat/[chatId]',
        params: {
          chatId: action.chatId,
          contact_name: action.chatName || 'Conversation',
          chat_name: action.chatName || 'Conversation',
          platform: action.platform || 'unknown',
          is_group: action.isGroup ? '1' : '0',
        },
      });
      return;
    }

    if (action.type === 'open_calendar') {
      const calendarUrl = Platform.OS === 'ios' ? 'calshow:' : 'content://com.android.calendar/time/';
      void Linking.openURL(calendarUrl);
    }
  };

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }} testID="assistant-answer-actions">
      {actions.map((action, index) => {
        const Icon = action.type === 'open_calendar' ? CalendarPlus : MessageCircle;
        return (
          <Pressable
            key={`${action.type}-${action.label}-${index}`}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            testID={`assistant-answer-action-${action.type}`}
            onPress={() => handleAction(action)}
            style={({ pressed }) => ({ minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: space[3], borderRadius: radius.pill, borderWidth: 1, borderColor: colors.ink, backgroundColor: colors.paper, opacity: pressed ? 0.72 : 1 })}
          >
            <Icon size={16} color={colors.ink} />
            <Text maxFontSizeMultiplier={1} style={{ ...mobileType.label, color: colors.ink }}>{action.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
