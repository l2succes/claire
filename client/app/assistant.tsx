import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowUpRight, List, Plus, Search, SendHorizonal, Smile, Sparkles, Trash2, X } from 'lucide-react-native';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { MobileIconButton, MobileSearchField, SectionLabel } from '../components/mobile/claire-mobile';
import {
  AssistantCitation,
  AssistantIndexStatus,
  AssistantThread,
  AssistantTurn,
  AssistantMentionCandidate,
  conversationAssistantApi,
} from '../services/conversationAssistant';

const QUICK_ACTIONS = [
  { label: 'Catch me up', description: 'Summarize recent conversations.', icon: List, prompt: 'Catch me up on the conversations that need my attention.' },
  { label: 'Find open loops', description: 'Promises and questions.', icon: ArrowUpRight, prompt: 'What promises, questions, or plans are still unresolved?' },
  { label: 'Check the tone', description: 'Warm, direct, or playful.', icon: Smile, prompt: 'What patterns do you notice in the tone of my recent conversations? Distinguish observations from inference.' },
  { label: 'Find something', description: 'Search messages and plans.', icon: Search, prompt: 'Help me find something I remember saying or receiving.' },
] as const;

function Sources({ citations }: { citations: AssistantCitation[] }) {
  const [showAll, setShowAll] = useState(false);
  if (!citations.length) return null;
  const visible = showAll ? citations : citations.slice(0, 3);
  return (
    <View style={{ gap: space[2] }} testID="assistant-sources">
      <SectionLabel title="Sources" />
      {visible.map((citation) => (
        <Pressable key={citation.messageId} testID={`assistant-source-${citation.messageId}`} onPress={() => router.push({ pathname: '/chat/[chatId]', params: { chatId: citation.chatId, contact_name: citation.fromMe ? citation.chatName || 'Conversation' : citation.senderName, chat_name: citation.chatName || citation.senderName, platform: citation.platform, is_group: citation.isGroup ? '1' : '0', highlightMessageId: citation.messageId } })}>
          <View style={{ gap: 3, padding: space[3], borderRadius: radius.control, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.neutral[300], backgroundColor: colors.paper }}>
            <Text maxFontSizeMultiplier={1} style={{ ...mobileType.label, color: colors.ink }}>{citation.fromMe ? 'You' : citation.senderName} · {new Date(citation.timestamp).toLocaleDateString()} · {citation.platform}</Text>
            {citation.isPreferredScope === false ? <Text maxFontSizeMultiplier={1} style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>Also relevant from another conversation</Text> : null}
            <Text maxFontSizeMultiplier={1} numberOfLines={3} style={{ ...mobileType.bodySmall, color: colors.neutral[800] }}>{citation.excerpt}</Text>
          </View>
        </Pressable>
      ))}
      {citations.length > 3 ? <Pressable onPress={() => setShowAll((current) => !current)} testID="assistant-sources-toggle"><Text style={{ ...mobileType.label, color: colors.ink }}>{showAll ? 'Show less' : `View ${citations.length - 3} more`}</Text></Pressable> : null}
    </View>
  );
}

function IndexStatusBanner({ status }: { status: AssistantIndexStatus | null }) {
  if (!status || status.status === 'ready') return null;
  const progress = status.totalCount ? `${status.indexedCount}/${status.totalCount}` : 'starting';
  return <View testID="assistant-index-status" style={{ marginHorizontal: space[4], padding: space[3], borderRadius: radius.control, borderWidth: 1, borderColor: colors.neutral[300], backgroundColor: colors.paper }}><Text style={{ ...mobileType.bodySmall, color: colors.neutral[800] }}>{status.status === 'failed' ? 'Message search is ready; semantic indexing will retry.' : `Indexing your message history (${progress}). Exact search works now.`}</Text></View>;
}

export function AssistantScreen({ inTab = false }: { inTab?: boolean }) {
  const insets = useSafeAreaInsets();
  const [threads, setThreads] = useState<AssistantThread[]>([]);
  const [activeThread, setActiveThread] = useState<AssistantThread | null>(null);
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [question, setQuestion] = useState('');
  const [indexStatus, setIndexStatus] = useState<AssistantIndexStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mentions, setMentions] = useState<AssistantMentionCandidate[]>([]);
  const [mentionCandidates, setMentionCandidates] = useState<AssistantMentionCandidate[]>([]);

  const onQuestionChange = (value: string) => {
    setQuestion(value);
    const match = value.match(/@([^\s@]{0,40})$/);
    if (!match) { setMentionCandidates([]); return; }
    void conversationAssistantApi.mentionCandidates(match[1]).then(setMentionCandidates).catch(() => setMentionCandidates([]));
  };
  const selectMention = (candidate: AssistantMentionCandidate) => { setMentions((current) => current.some((item) => item.id === candidate.id) ? current : [...current, candidate]); setQuestion((current) => current.replace(/@([^\s@]{1,40})$/, '')); setMentionCandidates([]); };
  const loadThread = useCallback(async (thread: AssistantThread) => { setActiveThread(thread); setTurns((await conversationAssistantApi.getThread(thread.id)).turns); }, []);
  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const [savedThreads, status] = await Promise.all([conversationAssistantApi.listThreads(), conversationAssistantApi.getIndexStatus()]);
      setThreads(savedThreads); setIndexStatus(status);
      if (status.status !== 'ready') void conversationAssistantApi.startIndex().catch(() => {});
      if (savedThreads[0]) await loadThread(savedThreads[0]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load Ask Claire.'); } finally { setLoading(false); }
  }, [loadThread]);
  useEffect(() => { void refresh(); }, [refresh]);
  const createThread = async () => { try { const thread = await conversationAssistantApi.createThread(); setThreads((current) => [thread, ...current]); setActiveThread(thread); setTurns([]); setError(null); return thread; } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create a conversation.'); return null; } };
  const ask = async (prompt = question) => {
    const text = prompt.trim(); if (!text || asking) return;
    setAsking(true); setError(null);
    try {
      const thread = activeThread || await createThread(); if (!thread) return;
      const scopeChatIds = mentions.map((mention) => mention.id);
      const optimistic: AssistantTurn = { id: `optimistic-${Date.now()}`, role: 'user', content: text, citations: [], scope_chat_ids: scopeChatIds, created_at: new Date().toISOString() };
      setTurns((current) => [...current, optimistic]); setQuestion(''); setMentionCandidates([]);
      const result = await conversationAssistantApi.ask(thread.id, text, scopeChatIds);
      setTurns((current) => [...current, { id: `assistant-${Date.now()}`, role: 'assistant', content: result.answer, citations: result.citations, scope_chat_ids: scopeChatIds, created_at: new Date().toISOString() }]);
      setIndexStatus(result.indexing); setMentions([]);
      const refreshed = await conversationAssistantApi.listThreads(); setThreads(refreshed); setActiveThread(refreshed.find((item) => item.id === thread.id) || thread);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Claire could not answer that right now.'); } finally { setAsking(false); }
  };
  const deleteActiveThread = async () => { if (!activeThread) return; try { await conversationAssistantApi.deleteThread(activeThread.id); setThreads((current) => current.filter((thread) => thread.id !== activeThread.id)); setActiveThread(null); setTurns([]); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not delete this conversation.'); } };
  const close = () => { if (inTab) router.navigate('/dashboard'); else router.back(); };

  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.sky }} edges={['top']} testID="assistant-screen">
    <View style={{ alignSelf: 'center', width: 48, height: 5, borderRadius: radius.pill, backgroundColor: colors.neutral[400], opacity: 0.58, marginTop: space[3], marginBottom: space[4] }} />
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingBottom: space[4] }}>
      <View style={{ flex: 1, minWidth: 0 }}><Text maxFontSizeMultiplier={1} style={{ ...mobileType.screenTitle, color: colors.ink }}>Ask Claire</Text><Text maxFontSizeMultiplier={1} numberOfLines={1} style={{ ...mobileType.body, color: colors.neutral[600] }}>Across your connected conversations</Text></View>
      {activeThread ? <MobileIconButton label="Delete this Ask Claire thread" onPress={() => void deleteActiveThread()}><Trash2 size={18} color={colors.ink} /></MobileIconButton> : null}
      <MobileIconButton label="Close Ask Claire" onPress={close}><X size={21} color={colors.ink} /></MobileIconButton>
    </View>
    <IndexStatusBanner status={indexStatus} />
    {threads.length ? <View style={{ paddingTop: space[3], paddingBottom: space[1] }}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2], paddingHorizontal: space[4] }}><Pressable onPress={() => void createThread()} testID="assistant-new-thread"><View style={{ minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.ink, backgroundColor: colors.lime }}><Plus size={15} color={colors.ink} /><Text style={{ ...mobileType.label, color: colors.ink }}>New</Text></View></Pressable>{threads.map((thread) => <Pressable key={thread.id} onPress={() => void loadThread(thread)} testID={`assistant-thread-${thread.id}`}><View style={{ maxWidth: 174, minHeight: 34, justifyContent: 'center', paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: activeThread?.id === thread.id ? colors.ink : colors.neutral[300], backgroundColor: activeThread?.id === thread.id ? colors.ink : colors.paper }}><Text maxFontSizeMultiplier={1} numberOfLines={1} style={{ ...mobileType.label, color: activeThread?.id === thread.id ? colors.paper : colors.ink }}>{thread.title}</Text></View></Pressable>)}</ScrollView></View> : null}
    {loading ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.ink} /></View> : <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space[4], paddingTop: space[4], paddingBottom: space[4], gap: space[4] }} keyboardShouldPersistTaps="handled" testID="assistant-turn-list">
        {!turns.length ? <>
          <View testID="assistant-empty" style={{ padding: space[4], gap: space[3], borderRadius: radius.panel, borderCurve: 'continuous', borderWidth: 1.5, borderColor: colors.ink, backgroundColor: colors.paper }}>
            <Text maxFontSizeMultiplier={1} style={{ ...mobileType.monoLabel, color: colors.ink }}>ASK ACROSS YOUR CHATS</Text>
            <Text maxFontSizeMultiplier={1} style={{ ...mobileType.sectionTitle, color: colors.ink, lineHeight: 28 }}>Find a plan, remember what someone said, or get perspective with sources.</Text>
            <Text maxFontSizeMultiplier={1} style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>Use @ to focus on a person or chat. Claire never sends messages from here.</Text>
          </View>
          <SectionLabel title="More ways I can help" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>{QUICK_ACTIONS.map((action) => { const Icon = action.icon; return <Pressable key={action.label} testID={`assistant-quick-${action.label.toLowerCase().replace(/\s+/g, '-')}`} onPress={() => void ask(action.prompt)} style={{ width: '47.8%' }}><View style={{ minHeight: 142, justifyContent: 'space-between', padding: space[3], borderRadius: radius.card, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.neutral[400], backgroundColor: 'rgba(255,255,255,0.5)' }}><Icon size={25} color={colors.ink} strokeWidth={2.2} /><View style={{ gap: 3 }}><Text maxFontSizeMultiplier={1} style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>{action.label}</Text><Text maxFontSizeMultiplier={1} style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{action.description}</Text></View></View></Pressable>; })}</View>
        </> : turns.map((turn) => <View key={turn.id} style={{ alignSelf: turn.role === 'user' ? 'flex-end' : 'stretch', maxWidth: turn.role === 'user' ? '88%' : '100%', gap: space[2] }}><View style={{ padding: space[4], borderRadius: radius.card, borderCurve: 'continuous', borderWidth: turn.role === 'assistant' ? 1 : 0, borderColor: colors.ink, backgroundColor: turn.role === 'user' ? colors.ink : colors.paper }}><Text selectable style={{ ...mobileType.body, color: turn.role === 'user' ? colors.paper : colors.ink }}>{turn.content}</Text></View>{turn.role === 'assistant' ? <Sources citations={turn.citations || []} /> : null}</View>)}
        {asking ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], padding: space[3] }}><Sparkles size={17} color={colors.ink} /><Text style={{ ...mobileType.bodySmall, color: colors.neutral[800] }}>Claire is searching your conversations…</Text></View> : null}
      </ScrollView>
      {error ? <Text testID="assistant-error" style={{ ...mobileType.bodySmall, color: colors.danger, paddingHorizontal: space[4], paddingBottom: space[2] }}>{error}</Text> : null}
      <View style={{ paddingHorizontal: space[4], paddingTop: space[2], paddingBottom: Math.max(insets.bottom, inTab ? 76 : space[3]), borderTopWidth: 1, borderTopColor: 'rgba(16,18,15,0.14)', backgroundColor: colors.sky }}>
        {mentions.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2], paddingBottom: space[2] }}>{mentions.map((mention) => <Pressable key={mention.id} onPress={() => setMentions((current) => current.filter((item) => item.id !== mention.id))} testID={`assistant-mention-${mention.id}`}><View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.lime }}><Text style={{ ...mobileType.label, color: colors.ink }}>@{mention.name} ×</Text></View></Pressable>)}</ScrollView> : null}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space[2] }}><View style={{ flex: 1 }}>
          {mentionCandidates.length ? <View testID="assistant-mention-candidates" style={{ position: 'absolute', zIndex: 3, left: 0, right: 0, bottom: 54, overflow: 'hidden', borderRadius: radius.card, borderWidth: 1, borderColor: colors.ink, backgroundColor: colors.paper }}>{mentionCandidates.map((candidate) => <Pressable key={candidate.id} onPress={() => selectMention(candidate)} testID={`assistant-mention-candidate-${candidate.id}`}><View style={{ paddingHorizontal: space[3], paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.neutral[200] }}><Text style={{ ...mobileType.label, color: colors.ink }}>{candidate.name}</Text><Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{candidate.platform}{candidate.is_group ? ' · group' : ''}</Text></View></Pressable>)}</View> : null}
          <MobileSearchField value={question} onChangeText={onQuestionChange} placeholder="Ask about a message, plan, or @person…" multiline testID="assistant-input" style={{ minHeight: 48, backgroundColor: colors.paper, borderColor: colors.neutral[300] }} inputStyle={{ maxHeight: 88, paddingVertical: 9 }} />
        </View><Pressable onPress={() => void ask()} disabled={asking || !question.trim()} testID="assistant-send"><View style={{ width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: question.trim() && !asking ? colors.ink : colors.neutral[200] }}><SendHorizonal size={20} color={question.trim() && !asking ? colors.lime : colors.neutral[400]} /></View></Pressable></View>
      </View>
    </KeyboardAvoidingView>}
  </SafeAreaView>;
}

export default AssistantScreen;
