import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { colors, mobileType, space } from '@claire/design-system';
import { ClaireMark } from '../../components/claire/mark';
import { MobileHeader, MobileIconButton, MobileState } from '../../components/mobile/claire-mobile';
import { type AssistantThread, conversationAssistantApi } from '../../services/conversationAssistant';

function formatThreadTime(value: string) {
  const delta = Date.now() - new Date(value).getTime();
  if (delta < 60_000) return 'now';
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h`;
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function AssistantHistoryScreen() {
  const [threads, setThreads] = useState<AssistantThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void conversationAssistantApi.listThreads()
      .then((items) => { if (active) setThreads(items); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load conversations.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.sky }} testID="assistant-recents-screen">
      <MobileHeader title="All conversations" subtitle="Your Ask Claire history" safeArea leading={<MobileIconButton label="Back to Ask Claire" onPress={() => router.back()}><ChevronLeft size={21} color={colors.ink} /></MobileIconButton>} />
      {loading ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.ink} /></View> : error ? <MobileState error title="Could not load conversations" message={error} /> : !threads.length ? <MobileState title="No conversations yet" message="Ask Claire a question to start one." /> : (
        <ScrollView testID="assistant-recents-list" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 112 }}>
          {threads.map((thread) => (
            <Pressable key={thread.id} testID={`assistant-recents-thread-${thread.id}`} accessibilityRole="button" accessibilityLabel={`Open ${thread.title || 'untitled'} conversation`} onPress={() => router.push({ pathname: '/assistant', params: { threadId: thread.id } })}>
              <View style={{ minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.neutral[200] }}>
                <View style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper }}><ClaireMark size={20} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text selectable numberOfLines={2} style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>{thread.title || 'Untitled'}</Text>
                  <Text selectable numberOfLines={1} style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>Across your chats</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}><Text style={{ ...mobileType.label, color: colors.neutral[400] }}>{formatThreadTime(thread.updated_at || thread.created_at)}</Text><ChevronRight size={16} color={colors.neutral[600]} /></View>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
