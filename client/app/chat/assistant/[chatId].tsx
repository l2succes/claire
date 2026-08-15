import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { ArrowUpRight, ExternalLink, List, Search, SendHorizontal, Smile, Sparkles, X } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { conversationAssistantApi, type AssistantCitation, type AssistantTurn } from '../../../services/conversationAssistant';
import { platformsApi } from '../../../services/platforms';
import { supabase } from '../../../services/supabase';
import { useAuthStore } from '../../../stores/authStore';
import { MobileIconButton, MobileSearchField } from '../../../components/mobile/claire-mobile';

type QuickAction = {
  label: string;
  description: string;
  icon: typeof List;
  prompt?: string;
};

const quickActions: QuickAction[] = [
  { label: 'Catch me up', description: 'Summarize the conversation.', icon: List, prompt: 'Catch me up on this conversation. Keep it concise and cite the important moments.' },
  { label: 'Find open loops', description: 'Promises and questions.', icon: ArrowUpRight, prompt: 'What promises, questions, or open loops are still unresolved in this conversation?' },
  { label: 'Check the tone', description: 'Warm, direct, or playful.', icon: Smile, prompt: 'What is the tone of this conversation lately? Separate observations from inference and suggest a constructive next step.' },
  { label: 'Find something', description: 'Search just this chat.', icon: Search },
];

export default function ConversationAssistantScreen() {
  const { chatId, name = 'this chat' } = useLocalSearchParams<{ chatId: string; name?: string }>();
  const user = useAuthStore(state => state.user);
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<AssistantTurn>>(null);
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(true);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [suggestionLoading, setSuggestionLoading] = useState(false);

  useEffect(() => {
    if (!chatId) return;
    conversationAssistantApi.getConversation(chatId)
      .then(result => setTurns(result?.turns || []))
      .catch(cause => setError(cause instanceof Error ? cause.message : 'Claire could not load this chat.'))
      .finally(() => setLoading(false));
  }, [chatId]);

  const loadSuggestion = useCallback(async (forceRefresh = false, guidance?: string) => {
    if (!chatId || !user?.id) return;
    setSuggestionLoading(true);
    try {
      const { data: latest, error: latestError } = await supabase
        .from('messages')
        .select('id, content, is_group')
        .eq('chat_id', chatId)
        .eq('user_id', user.id)
        .eq('from_me', false)
        .not('content', 'is', null)
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestError) throw latestError;
      if (!latest?.content) return setSuggestion(null);
      const generated = await platformsApi.generateDraftReply(latest.id, latest.content, latest.is_group ? 'group' : 'individual', { forceRefresh, guidance });
      setSuggestion(generated.suggestions[0] || null);
    } catch (cause) {
      console.warn('[ConversationAssistant] suggestion failed', cause);
      setSuggestion(null);
    } finally {
      setSuggestionLoading(false);
    }
  }, [chatId, user?.id]);

  useEffect(() => { void loadSuggestion(); }, [loadSuggestion]);

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

  const openCitation = (citation: AssistantCitation) => router.push({
    pathname: '/chat/[chatId]',
    params: { chatId: citation.chatId, highlightMessageId: citation.messageId, contact_name: citation.chatName || citation.senderName, chat_name: citation.chatName || citation.senderName, platform: citation.platform },
  });

  const useSuggestion = () => {
    if (!suggestion || !chatId) return;
    router.replace({ pathname: '/chat/[chatId]', params: { chatId, contact_name: name, chat_name: name, draft: suggestion } });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.sky }} edges={['top']} testID="conversation-assistant-screen">
      <View style={{ alignSelf: 'center', width: 48, height: 5, borderRadius: 99, backgroundColor: colors.neutral[400], marginTop: space[3], marginBottom: space[5], opacity: 0.55 }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[5], paddingBottom: space[5] }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ ...mobileType.screenTitle, color: colors.ink }}>Ask Claire</Text>
          <Text numberOfLines={1} style={{ ...mobileType.body, color: colors.neutral[600], paddingTop: 3 }}>Using your conversation with {name}</Text>
        </View>
        <MobileIconButton label="Close Ask Claire" onPress={() => router.back()}><X size={22} color={colors.ink} /></MobileIconButton>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {loading ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.ink} /></View> : !turns.length ? (
          <ScrollView contentContainerStyle={{ paddingHorizontal: space[5], paddingBottom: 48, gap: space[4] }} keyboardShouldPersistTaps="handled" testID="conversation-assistant-start">
            <View style={{ padding: space[4], paddingTop: space[5], borderRadius: 28, borderWidth: 1.5, borderColor: colors.ink, backgroundColor: colors.paper, gap: space[4] }}>
              <Text style={{ ...mobileType.monoLabel, color: colors.ink, letterSpacing: 1.2 }}>SUGGESTED REPLY · NATURAL + DIRECT</Text>
              {suggestionLoading ? <View style={{ minHeight: 72, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.ink} /></View> : <Text selectable style={{ ...mobileType.sectionTitle, color: colors.ink, lineHeight: 28 }}>{suggestion ? `“${suggestion}”` : 'Claire will suggest a reply when there is a recent message to respond to.'}</Text>}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
                <Pressable disabled={!suggestion} onPress={useSuggestion} style={({ pressed }) => ({ minHeight: 42, paddingHorizontal: space[3], alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.ink, opacity: !suggestion || pressed ? 0.65 : 1 })}><Text style={{ ...mobileType.label, color: colors.paper }}>Use reply</Text></Pressable>
                <Pressable onPress={() => void loadSuggestion(true, 'Make it shorter while preserving the same intent, language, and voice.')} style={({ pressed }) => ({ minHeight: 42, paddingHorizontal: space[3], alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.ink, opacity: pressed ? 0.65 : 1 })}><Text style={{ ...mobileType.label, color: colors.ink }}>Make shorter</Text></Pressable>
                <Pressable onPress={() => void loadSuggestion(true)} style={({ pressed }) => ({ minHeight: 42, paddingHorizontal: space[3], alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.ink, opacity: pressed ? 0.65 : 1 })}><Text style={{ ...mobileType.label, color: colors.ink }}>Try again</Text></Pressable>
              </View>
            </View>

            <Text style={{ ...mobileType.monoLabel, color: colors.ink, letterSpacing: 1.4, paddingTop: space[1] }}>MORE WAYS I CAN HELP</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
              {quickActions.map(action => {
                const Icon = action.icon;
                return <Pressable key={action.label} testID={`conversation-assistant-${action.label.toLowerCase().replace(/\s+/g, '-')}`} onPress={() => action.prompt ? void ask(action.prompt) : setQuestion('Find ')} style={({ pressed }) => ({ width: '47.8%', minHeight: 154, padding: space[3], justifyContent: 'space-between', borderRadius: 24, borderWidth: 1, borderColor: colors.neutral[400], backgroundColor: colors.paper, opacity: pressed ? 0.7 : 1 })}>
                  <Icon size={25} color={colors.ink} strokeWidth={2.2} />
                  <View style={{ gap: 4 }}><Text style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>{action.label}</Text><Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{action.description}</Text></View>
                </Pressable>;
              })}
            </View>
            {error ? <Text style={{ ...mobileType.bodySmall, color: colors.danger }}>{error}</Text> : null}
          </ScrollView>
        ) : (
          <FlatList
            ref={listRef}
            data={turns}
            keyExtractor={item => item.id}
            contentContainerStyle={{ flexGrow: 1, paddingHorizontal: space[5], paddingBottom: space[4], gap: space[3] }}
            renderItem={({ item }) => item.role === 'user' ? (
              <View style={{ alignSelf: 'flex-end', maxWidth: '86%', paddingHorizontal: space[4], paddingVertical: space[3], borderRadius: radius.card, borderBottomRightRadius: 6, backgroundColor: colors.ink }}><Text selectable style={{ ...mobileType.body, color: colors.paper }}>{item.content}</Text></View>
            ) : (
              <View style={{ gap: space[2] }}>
                <View style={{ alignSelf: 'flex-start', maxWidth: '94%', padding: space[4], borderRadius: radius.card, borderBottomLeftRadius: 6, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.neutral[300] }}><Text selectable style={{ ...mobileType.body, color: colors.ink }}>{item.content}</Text></View>
                {item.citations?.slice(0, 3).map(citation => <Pressable key={`${item.id}-${citation.messageId}`} onPress={() => openCitation(citation)} style={({ pressed }) => ({ padding: space[3], borderRadius: radius.control, borderWidth: 1, borderColor: colors.neutral[300], backgroundColor: pressed ? colors.paper : 'rgba(255,255,255,0.48)', gap: 3 })}><View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}><Text style={{ ...mobileType.label, color: colors.ink, flex: 1 }}>{citation.senderName} · {new Date(citation.timestamp).toLocaleDateString()}</Text><ExternalLink size={14} color={colors.neutral[600]} /></View><Text numberOfLines={2} style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{citation.excerpt}</Text></Pressable>)}
              </View>
            )}
            ListFooterComponent={asking ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], padding: space[3] }}><Sparkles size={16} color={colors.focus} /><Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>Claire is reading this conversation…</Text></View> : null}
          />
        )}
        {error && turns.length > 0 ? <Text style={{ ...mobileType.bodySmall, color: colors.danger, paddingHorizontal: space[4], paddingBottom: space[2] }}>{error}</Text> : null}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space[2], paddingHorizontal: space[4], paddingTop: space[2], paddingBottom: Math.max(insets.bottom, space[3]), borderTopWidth: 1, borderTopColor: 'rgba(16,18,15,0.12)', backgroundColor: colors.sky }}>
          <MobileSearchField value={question} onChangeText={setQuestion} placeholder={`Ask about ${name}…`} multiline style={{ flex: 1, minHeight: 44, backgroundColor: colors.paper, borderColor: colors.neutral[300] }} inputStyle={{ maxHeight: 88, paddingVertical: 9 }} />
          <Pressable accessibilityRole="button" accessibilityLabel="Ask Claire" disabled={!question.trim() || asking} onPress={() => void ask()} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: question.trim() ? colors.ink : colors.neutral[200], opacity: pressed ? 0.75 : 1 })}><SendHorizontal size={18} color={question.trim() ? colors.paper : colors.neutral[400]} /></Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
