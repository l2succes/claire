import { useEffect } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Check, ChevronLeft, MessageCircle, Sparkles } from 'lucide-react-native';
import { router } from 'expo-router';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { MobileHeader, MobileIconButton, SectionLabel } from '../../components/mobile/claire-mobile';
import { useChatPreferencesStore, type ChatPlusDefault } from '../../stores/chatPreferencesStore';

const options: { value: ChatPlusDefault; title: string; detail: string }[] = [
  { value: 'menu', title: 'Attachments', detail: 'Tap + for photos, files, and reply options.' },
  { value: 'reply-options', title: 'Reply options', detail: 'Tap + to show Claire’s drafts for this chat.' },
];

export default function ChatSettingsScreen() {
  const plusDefault = useChatPreferencesStore(state => state.plusDefault);
  const hydrate = useChatPreferencesStore(state => state.hydrate);
  const setPlusDefault = useChatPreferencesStore(state => state.setPlusDefault);

  useEffect(() => { void hydrate(); }, [hydrate]);

  return (
    <ScrollView testID="chat-settings-screen" style={{ flex: 1, backgroundColor: colors.cream }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 112 }}>
      <MobileHeader
        title="Chat"
        subtitle="What the plus button does, and how to switch it."
        leading={<MobileIconButton label="Back to Settings" onPress={() => router.replace('/settings')}><ChevronLeft size={20} color={colors.ink} /></MobileIconButton>}
      />
      <View style={{ paddingHorizontal: space[4], gap: space[5] }}>
        <View style={{ gap: space[2] }}>
          <SectionLabel title="Plus button" />
          {options.map(option => {
            const selected = plusDefault === option.value;
            return (
              <Pressable
                key={option.value}
                testID={`chat-plus-default-${option.value}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => void setPlusDefault(option.value)}
                style={({ pressed }) => ({
                  minHeight: 74,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space[3],
                  padding: space[3],
                  borderRadius: radius.control,
                  backgroundColor: pressed ? colors.sky : colors.paper,
                  borderWidth: selected ? 2 : 1,
                  borderColor: selected ? colors.ink : colors.neutral[200],
                })}
              >
                <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: option.value === 'reply-options' ? colors.lavender : colors.neutral[100], alignItems: 'center', justifyContent: 'center' }}>
                  {option.value === 'reply-options' ? <Sparkles size={18} color={colors.ink} /> : <MessageCircle size={18} color={colors.ink} />}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>{option.title}</Text>
                  <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{option.detail}</Text>
                </View>
                {selected ? <Check size={18} color={colors.ink} /> : null}
              </Pressable>
            );
          })}
        </View>
        <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>
          Touch and hold + to do the other action. Reply options stay hidden until you ask for them, so they never stack on Quick Context.
        </Text>
      </View>
    </ScrollView>
  );
}
