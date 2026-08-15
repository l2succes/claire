import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { ChevronLeft, ExternalLink, SendHorizontal, Sparkles, Trash2 } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { conversationAssistantApi, type AssistantCitation, type AssistantTurn } from '../../../services/conversationAssistant';
import { MobileIconButton, MobileState } from '../../../components/mobile/claire-mobile';

const starterQuestions = [
  'What am I missing here?',
  'What should I reply?',
  'How has the tone changed?',
];

export default function ConversationAssistantScreen() {
  const { chatId, name = 'this chat' } = useLocalSearchParams<{ chatId: string; name?: string }>();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<AssistantTurn>>(null);
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(true);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!chatId) return;
    conversationAssistantApi.getConversation(chatId)
      .then(result => setTurns(result?.turns || []))
      .catch(cause => setError(cause instanceof Error ? cause.message : 'Claire could not load this chat.'))
      .finally(() => setLoading(false));
  }, [chatId]);

  const ask = async (value = question) => {
    const clean = value.trim();
    if (!clean || !chatId || asking) return;
    setQuestion('');
    setAsking(true);
    setError(null);
    const optimistic: AssistantTurn = { id: `question-${Date.now()}`, role: 'user', content: clean, citations: [], created_at: new Date().toISOString() };
    setTurns(current => [...current, optimistic]);
    try {
      const result = await conversationAssistantApi.askConversation(chatId, clean);
      setTurns(result.turns);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 40);
    } catch (cause) {
      setTurns(current => current.filter(turn => turn.id !== optimistic.id));
      setQuestion(clean);
      setError(cause instanceof Error ? cause.message : 'Claire could not answer right now.');
    } finally {
      setAsking(false);
    }
  };

  const clear = () => Alert.alert('Clear this Claire chat?', 'This only removes the assistant thread. Your messages stay untouched.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Clear', style: 'destructive', onPress: async () => {
      if (!chatId) return;
      await conversationAssistantApi.clearConversation(chatId);
      setTurns([]);
    } },
  ]);

  const openCitation = (citation: AssistantCitation) => router.push({
    pathname: '/chat/[chatId]',
    params: { chatId: citation.chatId, highlightMessageId: citation.messageId, contact_name: citation.chatName || citation.senderName, chat_name: citation.chatName || citation.senderName, platform: citation.platform },
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.cream }} edges={['top']}>
      <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[3], borderBottomWidth: 1, borderBottomColor: colors.neutral[200], backgroundColor: colors.paper }}>
        <MobileIconButton label="Close Ask Claire" onPress={() => router.back()}><ChevronLeft size={21} color={colors.ink} /></MobileIconButton>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ ...mobileType.sectionTitle, color: colors.ink }}>Ask Claire</Text>
          <Text numberOfLines={1} style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>Only searching {name}</Text>
        </View>
        <MobileIconButton label="Clear assistant chat" onPress={clear}><Trash2 size={18} color={colors.neutral[600]} /></MobileIconButton>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {loading ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.ink} /></View> : (
          <FlatList
            ref={listRef}
            data={turns}
            keyExtractor={item => item.id}
            contentContainerStyle={{ flexGrow: 1, padding: space[4], gap: space[3] }}
            renderItem={({ item }) => item.role === 'user' ? (
              <View style={{ alignSelf: 'flex-end', maxWidth: '86%', paddingHorizontal: space[4], paddingVertical: space[3], borderRadius: radius.card, borderBottomRightRadius: 6, backgroundColor: colors.ink }}>
                <Text selectable style={{ ...mobileType.body, color: colors.paper }}>{item.content}</Text>
              </View>
            ) : (
              <View style={{ gap: space[2] }}>
                <View style={{ alignSelf: 'flex-start', maxWidth: '94%', padding: space[4], borderRadius: radius.card, borderBottomLeftRadius: 6, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.neutral[200] }}>
                  <Text selectable style={{ ...mobileType.body, color: colors.ink }}>{item.content}</Text>
                </View>
                {item.citations?.slice(0, 3).map(citation => (
                  <Pressable key={`${item.id}-${citation.messageId}`} onPress={() => openCitation(citation)} style={({ pressed }) => ({ padding: space[3], borderRadius: radius.control, borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: pressed ? colors.sky : colors.paper, gap: 3 })}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}><Text style={{ ...mobileType.label, color: colors.ink, flex: 1 }}>{citation.senderName} · {new Date(citation.timestamp).toLocaleDateString()}</Text><ExternalLink size={14} color={colors.neutral[600]} /></View>
                    <Text numberOfLines={2} style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{citation.excerpt}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            ListEmptyComponent={<View style={{ flex: 1, justifyContent: 'center', gap: space[4] }}><MobileState title={`Ask about ${name}`} message="Claire answers from this conversation, cites what it found, and never sends a message for you." /><View style={{ gap: space[2] }}>{starterQuestions.map(prompt => <Pressable key={prompt} onPress={() => void ask(prompt)} style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: space[4], borderRadius: radius.control, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.neutral[200] }}><Text style={{ ...mobileType.body, color: colors.ink }}>{prompt}</Text></Pressable>)}</View></View>}
            ListFooterComponent={asking ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], padding: space[3] }}><Sparkles size={16} color={colors.focus} /><Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>Claire is reading this conversation…</Text></View> : null}
          />
        )}
        {error ? <Text style={{ ...mobileType.bodySmall, color: colors.danger, paddingHorizontal: space[4], paddingBottom: space[2] }}>{error}</Text> : null}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space[2], paddingHorizontal: space[3], paddingTop: space[2], paddingBottom: Math.max(insets.bottom, space[3]), borderTopWidth: 1, borderTopColor: colors.neutral[200], backgroundColor: colors.paper }}>
          <TextInput value={question} onChangeText={setQuestion} placeholder={`Ask about ${name}…`} placeholderTextColor={colors.neutral[400]} multiline style={{ flex: 1, minHeight: 44, maxHeight: 112, paddingHorizontal: space[3], paddingVertical: 10, borderRadius: radius.control, backgroundColor: colors.neutral[100], ...mobileType.body, color: colors.ink }} />
          <Pressable accessibilityRole="button" accessibilityLabel="Ask Claire" disabled={!question.trim() || asking} onPress={() => void ask()} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: question.trim() ? colors.lime : colors.neutral[200], opacity: pressed ? 0.75 : 1 })}><SendHorizontal size={18} color={colors.ink} /></Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
