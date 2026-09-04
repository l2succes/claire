import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ChevronLeft, CheckCircle2, MessageCircle, Plus, Search, Send, Sparkles, X } from 'lucide-react-native';
import { colors, mobileType, radius, space, useIsDesktopLayout } from '@claire/design-system';
import { MobileIconButton, SectionLabel } from '../components/mobile/claire-mobile';
import { AskComposer, AskToolGrid } from '../components/claire/composer';
import { ClaireMark } from '../components/claire/mark';
import { AskClaireSkeleton, DesktopAskClaireSkeleton } from '../components/claire/skeleton';
import { useChromeStore } from '../stores/chromeStore';
import { useAuthStore } from '../stores/authStore';
import { readQuerySnapshot, writeQuerySnapshot } from '../services/mobile-cache';
import {
  AssistantCitation,
  AssistantIndexStatus,
  AssistantThread,
  AssistantTurn,
  AssistantMentionCandidate,
  conversationAssistantApi,
} from '../services/conversationAssistant';

function formatThreadTime(value: string) {
  const delta = Date.now() - new Date(value).getTime();
  if (delta < 60_000) return 'now';
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h`;
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function Sources({ citations }: { citations: AssistantCitation[] }) {
  const [showAll, setShowAll] = useState(false);
  if (!citations.length) return null;
  const visible = showAll ? citations : citations.slice(0, 3);
  return (
    <View style={{ gap: space[2] }} testID="assistant-sources">
      <SectionLabel title="Sources" />
      {visible.map((citation) => (
        <Pressable
          key={citation.messageId}
          testID={`assistant-source-${citation.messageId}`}
          onPress={() => router.push({
            pathname: '/chat/[chatId]',
            params: {
              chatId: citation.chatId,
              contact_name: citation.fromMe ? citation.chatName || 'Conversation' : citation.senderName,
              chat_name: citation.chatName || citation.senderName,
              platform: citation.platform,
              is_group: citation.isGroup ? '1' : '0',
              highlightMessageId: citation.messageId,
            },
          })}
        >
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

function SearchingStatus() {
  const opacity = useSharedValue(0.55);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 720, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [opacity]);
  const pulse = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', gap: space[2], padding: space[3] }, pulse]}>
      <ClaireMark size={16} />
      <Text style={{ ...mobileType.bodySmall, color: colors.neutral[800] }}>Claire is searching your conversations…</Text>
    </Animated.View>
  );
}

function IndexStatusBanner({ status }: { status: AssistantIndexStatus | null }) {
  if (!status || status.status === 'ready') return null;
  const progress = status.totalCount ? `${status.indexedCount}/${status.totalCount}` : 'starting';
  return (
    <View testID="assistant-index-status" style={{ marginHorizontal: space[4], padding: space[3], borderRadius: radius.control, borderWidth: 1, borderColor: colors.neutral[300], backgroundColor: colors.paper }}>
      <Text style={{ ...mobileType.bodySmall, color: colors.neutral[800] }}>{status.status === 'failed' ? 'Message search is ready; semantic indexing will retry.' : `Indexing your message history (${progress}). Exact search works now.`}</Text>
    </View>
  );
}

export function AssistantScreen({ inTab = false }: { inTab?: boolean }) {
  const isDesktop = useIsDesktopLayout();
  const insets = useSafeAreaInsets();
  const setTabBarHidden = useChromeStore((state) => state.setTabBarHidden);
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

  const inThread = Boolean(activeThread);

  useEffect(() => {
    setTabBarHidden(inTab && inThread);
    return () => setTabBarHidden(false);
  }, [inTab, inThread, setTabBarHidden]);

  const onQuestionChange = (value: string) => {
    setQuestion(value);
    const match = value.match(/@([^\s@]{0,40})$/);
    if (!match) {
      setMentionCandidates([]);
      return;
    }
    void conversationAssistantApi.mentionCandidates(match[1]).then(setMentionCandidates).catch(() => setMentionCandidates([]));
  };

  const selectMention = (candidate: AssistantMentionCandidate) => {
    setMentions((current) => current.some((item) => item.id === candidate.id) ? current : [...current, candidate]);
    setQuestion((current) => current.replace(/@([^\s@]{1,40})$/, ''));
    setMentionCandidates([]);
  };

  const loadThread = useCallback(async (thread: AssistantThread) => {
    setActiveThread(thread);
    setTurns((await conversationAssistantApi.getThread(thread.id)).turns);
    setError(null);
  }, []);

  const goHome = () => {
    setActiveThread(null);
    setTurns([]);
    setQuestion('');
    setMentions([]);
    setMentionCandidates([]);
    setError(null);
  };

  const refresh = useCallback(async () => {
    try {
      const [savedThreads, status] = await Promise.all([
        conversationAssistantApi.listThreads(),
        conversationAssistantApi.getIndexStatus(),
      ]);
      setThreads(savedThreads);
      setIndexStatus(status);
      const userId = useAuthStore.getState().user?.id;
      if (userId) void writeQuerySnapshot(userId, 'assistant-threads', savedThreads).catch(() => undefined);
      if (status.status !== 'ready') void conversationAssistantApi.startIndex().catch(() => {});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load Ask Claire.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Paint the thread list from the last visit rather than a skeleton. This tab
  // is remounted every time it is opened, so it re-fetched from scratch on
  // every visit and showed a full-screen skeleton while it did.
  useEffect(() => {
    let active = true;
    const userId = useAuthStore.getState().user?.id;
    if (userId) {
      void readQuerySnapshot<AssistantThread[]>(userId, 'assistant-threads')
        .then((snapshot) => {
          if (!active || !snapshot?.data?.length) return;
          setThreads((current) => (current.length ? current : snapshot.data));
          setLoading(false);
        })
        .catch(() => undefined);
    }
    void refresh();
    return () => { active = false; };
  }, [refresh]);

  const createThread = async () => {
    try {
      const thread = await conversationAssistantApi.createThread();
      setThreads((current) => [thread, ...current]);
      setActiveThread(thread);
      setTurns([]);
      setError(null);
      return thread;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create a conversation.');
      return null;
    }
  };

  const ask = async (prompt = question) => {
    const text = prompt.trim();
    if (!text || asking) return;
    setAsking(true);
    setError(null);
    try {
      const thread = activeThread || await createThread();
      if (!thread) return;
      const scopeChatIds = mentions.map((mention) => mention.id);
      const optimistic: AssistantTurn = {
        id: `optimistic-${Date.now()}`,
        role: 'user',
        content: text,
        citations: [],
        scope_chat_ids: scopeChatIds,
        created_at: new Date().toISOString(),
      };
      setTurns((current) => [...current, optimistic]);
      setQuestion('');
      setMentionCandidates([]);
      const result = await conversationAssistantApi.ask(thread.id, text, scopeChatIds);
      setTurns((current) => [...current, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: result.answer,
        citations: result.citations,
        scope_chat_ids: scopeChatIds,
        created_at: new Date().toISOString(),
      }]);
      setIndexStatus(result.indexing);
      setMentions([]);
      const refreshed = await conversationAssistantApi.listThreads();
      setThreads(refreshed);
      setActiveThread(refreshed.find((item) => item.id === thread.id) || thread);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Claire could not answer that right now.');
    } finally {
      setAsking(false);
    }
  };

  const deleteActiveThread = async () => {
    if (!activeThread) return;
    try {
      await conversationAssistantApi.deleteThread(activeThread.id);
      setThreads((current) => current.filter((thread) => thread.id !== activeThread.id));
      goHome();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete this conversation.');
    }
  };

  const close = () => {
    if (inTab) goHome();
    else router.back();
  };

  const mentionChips = mentions.length ? (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2], paddingBottom: space[2] }}>
      {mentions.map((mention) => (
        <Pressable key={mention.id} onPress={() => setMentions((current) => current.filter((item) => item.id !== mention.id))} testID={`assistant-mention-${mention.id}`}>
          <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.lime }}>
            <Text style={{ ...mobileType.label, color: colors.ink }}>@{mention.name} ×</Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  ) : null;

  const mentionMenu = mentionCandidates.length ? (
    <View testID="assistant-mention-candidates" style={{ marginBottom: space[2], overflow: 'hidden', borderRadius: radius.card, borderWidth: 1, borderColor: colors.ink, backgroundColor: colors.paper }}>
      {mentionCandidates.map((candidate) => (
        <Pressable key={candidate.id} onPress={() => selectMention(candidate)} testID={`assistant-mention-candidate-${candidate.id}`}>
          <View style={{ paddingHorizontal: space[3], paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.neutral[200] }}>
            <Text style={{ ...mobileType.label, color: colors.ink }}>{candidate.name}</Text>
            <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{candidate.platform}{candidate.is_group ? ' · group' : ''}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  ) : null;

  if (isDesktop) {
    return <DesktopAssistantWorkspace
      threads={threads}
      activeThread={activeThread}
      turns={turns}
      loading={loading}
      question={question}
      asking={asking}
      error={error}
      onQuestionChange={onQuestionChange}
      onCreate={() => void createThread()}
      onSelect={(thread) => void loadThread(thread)}
      onAsk={(prompt?: string) => void ask(prompt)}
    />;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.sky }} edges={['top']} testID="assistant-screen">
      {inTab ? null : <View style={{ alignSelf: 'center', width: 48, height: 5, borderRadius: radius.pill, backgroundColor: colors.neutral[400], opacity: 0.58, marginTop: space[3], marginBottom: space[4] }} />}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingBottom: space[4], paddingTop: inTab ? space[4] : 0 }}>
        {inThread ? <MobileIconButton label="Back to Ask Claire" onPress={goHome}><ChevronLeft size={22} color={colors.ink} /></MobileIconButton> : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text maxFontSizeMultiplier={1} style={{ ...mobileType.screenTitle, color: colors.ink }}>{inThread ? (activeThread?.title || 'New') : 'Ask Claire'}</Text>
          <Text maxFontSizeMultiplier={1} numberOfLines={1} style={{ ...mobileType.body, color: colors.neutral[600] }}>
            {inThread ? 'Use @ to focus on a person or chat' : 'Across your connected conversations'}
          </Text>
        </View>
        {inThread ? null : (
          <Pressable accessibilityRole="button" accessibilityLabel="New Ask Claire thread" onPress={() => void createThread()} testID="assistant-new-thread">
            <View style={{ minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.ink, backgroundColor: colors.lime }}>
              <Plus size={15} color={colors.ink} />
              <Text style={{ ...mobileType.label, color: colors.ink }}>New</Text>
            </View>
          </Pressable>
        )}
        {inTab ? null : <MobileIconButton label="Close Ask Claire" onPress={close}><X size={21} color={colors.ink} /></MobileIconButton>}
      </View>
      <IndexStatusBanner status={indexStatus} />
      {loading ? (
        <AskClaireSkeleton />
      ) : inThread ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ paddingHorizontal: space[4], paddingTop: space[2], paddingBottom: space[4], gap: space[4] }} keyboardShouldPersistTaps="handled" testID="assistant-turn-list">
            {!turns.length ? (
              <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>
                Claire never sends messages from here. She only reads connected conversations and cites what she used.
              </Text>
            ) : turns.map((turn) => (
              <View key={turn.id} style={{ alignSelf: turn.role === 'user' ? 'flex-end' : 'stretch', maxWidth: turn.role === 'user' ? '88%' : '100%', gap: space[2] }}>
                <View style={{ padding: space[4], borderRadius: radius.card, borderCurve: 'continuous', borderWidth: turn.role === 'assistant' ? 1 : 0, borderColor: colors.ink, backgroundColor: turn.role === 'user' ? colors.ink : colors.paper }}>
                  <Text selectable style={{ ...mobileType.body, color: turn.role === 'user' ? colors.paper : colors.ink }}>{turn.content}</Text>
                </View>
                {turn.role === 'assistant' ? <Sources citations={turn.citations || []} /> : null}
              </View>
            ))}
            {asking ? <SearchingStatus /> : null}
          </ScrollView>
          {error ? <Text testID="assistant-error" style={{ ...mobileType.bodySmall, color: colors.danger, paddingHorizontal: space[4], paddingBottom: space[2] }}>{error}</Text> : null}
          <View style={{ paddingHorizontal: space[4], paddingTop: space[2], paddingBottom: Math.max(insets.bottom, space[3]), backgroundColor: colors.sky }}>
            <AskComposer
              value={question}
              onChangeText={onQuestionChange}
              onSend={() => void ask()}
              sending={asking}
              onTagPerson={() => onQuestionChange(`${question}${question.endsWith('@') || question.endsWith('@ ') ? '' : question ? ' @' : '@'}`)}
              onFilterPlatform={() => void ask('Only use messages from one platform if the question names it. Otherwise say which platforms you searched.')}
              onFocusChat={() => onQuestionChange(`${question}${question.includes('@') ? '' : ' @'}`)}
              onFindLoops={() => void ask('What commitments, questions, or plans are still unresolved?')}
              onCheckTone={() => void ask('What patterns do you notice in the tone of my recent conversations? Distinguish observations from inference.')}
              onFindSomething={() => void ask('Help me find something I remember saying or receiving.')}
              onClear={() => setTurns([])}
              onDelete={() => void deleteActiveThread()}
              chips={<>{mentionChips}{mentionMenu}</>}
            />
          </View>
        </KeyboardAvoidingView>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: space[4], paddingTop: space[2], paddingBottom: inTab ? 120 : space[8], gap: space[4] }} testID="assistant-home">
          {error ? <Text testID="assistant-error" style={{ ...mobileType.bodySmall, color: colors.danger }}>{error}</Text> : null}
          <View>
            <SectionLabel title="Recent" detail={threads.length ? String(threads.length) : undefined} />
            {threads.length ? threads.map((thread) => (
              <Pressable key={thread.id} onPress={() => void loadThread(thread)} testID={`assistant-thread-${thread.id}`}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.neutral[200] }}>
                  <View style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper }}>
                    <ClaireMark size={20} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>{thread.title || 'Untitled'}</Text>
                    <Text numberOfLines={1} style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>Across your chats</Text>
                  </View>
                  <Text style={{ ...mobileType.label, color: colors.neutral[400] }}>{formatThreadTime(thread.updated_at || thread.created_at)}</Text>
                </View>
              </Pressable>
            )) : (
              <Text testID="assistant-empty" style={{ ...mobileType.bodySmall, color: colors.neutral[600], paddingTop: space[2] }}>
                New starts a thread. Claire never sends messages from here.
              </Text>
            )}
          </View>
          <View>
            <SectionLabel title="More ways I can help" />
            <AskToolGrid onSelect={(prompt) => void ask(prompt)} />
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function DesktopAssistantWorkspace({ threads, activeThread, turns, loading, question, asking, error, onQuestionChange, onCreate, onSelect, onAsk }: {
  threads: AssistantThread[];
  activeThread: AssistantThread | null;
  turns: AssistantTurn[];
  loading: boolean;
  question: string;
  asking: boolean;
  error: string | null;
  onQuestionChange: (value: string) => void;
  onCreate: () => void;
  onSelect: (thread: AssistantThread) => void;
  onAsk: (prompt?: string) => void;
}) {
  if (loading) return <DesktopAskClaireSkeleton />;

  const title = activeThread?.title || threads[0]?.title || 'New conversation';
  const shownTurns = turns.slice(-2);
  return <View style={{ flex: 1, minHeight: 0, flexDirection: 'row', backgroundColor: '#FAF9F5' }} testID="desktop-assistant-screen">
    <View style={{ width: 210, flexShrink: 0, padding: space[3], backgroundColor: '#F4F2EC', borderRightWidth: 1, borderColor: colors.neutral[200] }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 16 }}><Sparkles size={16} color={colors.ink} /><Text style={{ ...mobileType.monoLabel, color: colors.ink }}>ASK CLAIRE</Text><Pressable onPress={onCreate} style={{ marginLeft: 'auto' }}><View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}><Plus size={15} color={colors.paper} /></View></Pressable></View>{threads.map((thread, index) => <Pressable key={thread.id} onPress={() => onSelect(thread)}><View style={{ padding: 10, borderRadius: 11, borderWidth: activeThread?.id === thread.id || (!activeThread && index === 0) ? 1 : 0, borderColor: colors.ink, backgroundColor: activeThread?.id === thread.id || (!activeThread && index === 0) ? colors.lime : 'transparent', marginBottom: 5 }}><Text numberOfLines={1} style={{ ...mobileType.bodySmall, fontWeight: '700', color: colors.ink }}>{thread.title || 'Untitled'}</Text><Text numberOfLines={1} style={{ ...mobileType.label, color: colors.neutral[600] }}>Conversation context · {formatThreadTime(thread.updated_at || thread.created_at)}</Text></View></Pressable>)}{!threads.length ? <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>Start a private question about your conversations.</Text> : null}<View style={{ marginTop: 'auto', paddingTop: 14, borderTopWidth: 1, borderColor: colors.neutral[200] }}><Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>PRIVATE BY DEFAULT</Text><Text style={{ ...mobileType.label, color: colors.neutral[600], marginTop: 5 }}>Claire cites connected messages and never sends from this workspace.</Text></View></View>
    <View style={{ flex: 1, minWidth: 0, padding: 30, paddingBottom: 18 }}><View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16 }}><View><Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>CONNECTED CONTEXT</Text><Text style={{ ...mobileType.screenTitle, color: colors.ink, marginTop: 4 }}>Ask Claire</Text><Text style={{ ...mobileType.bodySmall, color: colors.neutral[600], marginTop: 3 }}>Use conversations, relationship context, and open loops to make the next move easier.</Text></View><View style={{ alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 99, backgroundColor: colors.sky }}><Text style={{ ...mobileType.monoLabel, color: colors.ink }}>READ ONLY</Text></View></View>
      {shownTurns.length ? <ScrollView style={{ flex: 1, marginTop: 20 }} contentContainerStyle={{ gap: 10, paddingBottom: 14 }}>{shownTurns.map((turn) => <View key={turn.id} style={{ alignSelf: turn.role === 'user' ? 'flex-end' : 'stretch', maxWidth: turn.role === 'user' ? '76%' : undefined, padding: 15, borderRadius: 15, borderWidth: turn.role === 'assistant' ? 1 : 0, borderColor: colors.ink, backgroundColor: turn.role === 'user' ? colors.ink : colors.sky }}><Text style={{ ...mobileType.body, color: turn.role === 'user' ? colors.paper : colors.ink, textAlign: 'left' }}>{turn.content}</Text></View>)}</ScrollView> : <><View style={{ flexDirection: 'row', gap: 12, marginTop: 22, padding: 16, borderWidth: 1, borderColor: colors.ink, borderRadius: 16, backgroundColor: colors.sky }}><View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}><Sparkles size={18} color={colors.paper} /></View><View style={{ flex: 1 }}><Text style={{ ...mobileType.monoLabel, color: colors.ink }}>SUGGESTED REPLY · WARM + DIRECT</Text><Text style={{ ...mobileType.body, color: colors.ink, marginTop: 7 }}>“I can help pull together the context, find what is still open, and draft a reply you can review.”</Text><View style={{ flexDirection: 'row', gap: 7, marginTop: 12 }}><DesktopAskButton label="Use reply" primary onPress={() => onAsk('Draft a warm, direct reply using the relevant conversation context.')} /><DesktopAskButton label="Make shorter" onPress={() => onAsk('Give me a concise version of the next reply.')} /><DesktopAskButton label="Try again" onPress={() => onAsk('Offer another thoughtful reply option.')} /></View></View></View><Text style={{ ...mobileType.monoLabel, color: colors.neutral[600], marginTop: 22, marginBottom: 9 }}>MORE WAYS I CAN HELP</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{[[MessageCircle, 'Catch me up', 'Summarize this conversation.'], [CheckCircle2, 'Find open loops', 'Commitments and unanswered questions.'], [Sparkles, 'Check the tone', 'Warm, direct, or playful.'], [Search, 'Find something', 'Search this chat or every chat.']].map(([Icon, label, detail]) => { const ToolIcon = Icon as typeof Sparkles; return <Pressable key={label as string} onPress={() => onAsk(detail as string)}><View style={{ width: 184, minHeight: 78, padding: 11, borderRadius: 13, borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: colors.paper }}><ToolIcon size={17} color={colors.ink} /><Text style={{ ...mobileType.bodySmall, fontWeight: '700', color: colors.ink, marginTop: 5 }}>{label as string}</Text><Text style={{ ...mobileType.label, color: colors.neutral[600] }}>{detail as string}</Text></View></Pressable>})}</View></>}
      {error ? <Text style={{ ...mobileType.bodySmall, color: colors.danger, marginTop: 8 }}>{error}</Text> : null}
      <View style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 16, paddingLeft: 13, paddingRight: 8, borderRadius: 14, borderWidth: 1, borderColor: colors.ink, backgroundColor: colors.paper }}><Sparkles size={17} color={colors.ink} /><TextInput value={question} onChangeText={onQuestionChange} onSubmitEditing={() => onAsk()} placeholder="Ask about a conversation, person, or open loop…" placeholderTextColor={colors.neutral[400]} style={{ flex: 1, minWidth: 0, color: colors.ink, fontSize: 14, outlineStyle: 'none' } as never} /><View style={{ paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.neutral[100] }}><Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>⌥⌘A</Text></View><Pressable onPress={() => onAsk()} disabled={asking}><View style={{ width: 31, height: 31, borderRadius: 10, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', opacity: asking ? 0.55 : 1 }}><Send size={16} color={colors.paper} /></View></Pressable></View>
    </View>
    <View style={{ width: 235, flexShrink: 0, padding: space[3], borderLeftWidth: 1, borderColor: colors.neutral[200], backgroundColor: '#F4F2EC' }}><Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>CLAIRE’S CONTEXT</Text><DesktopEvidence label="RELATIONSHIP" title="Context-aware" detail="Claire uses the conversation and the relationship memory you’ve chosen." /><DesktopEvidence label="OPEN LOOPS" title="Find open loops" detail="Open loops and unresolved plans are available to ask about." /><View style={{ marginTop: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#DFCA7E', backgroundColor: '#FFF8DD' }}><Text style={{ ...mobileType.monoLabel, color: colors.ink }}>AVAILABLE SOURCES</Text><Text style={{ ...mobileType.bodySmall, fontWeight: '700', color: colors.ink, marginTop: 5 }}>Connected messages</Text><Text style={{ ...mobileType.label, color: colors.neutral[600], marginTop: 3 }}>Claire shows the messages behind any answer.</Text></View></View>
  </View>;
}

function DesktopAskButton({ label, primary = false, onPress }: { label: string; primary?: boolean; onPress: () => void }) { return <Pressable onPress={onPress}><View style={{ paddingHorizontal: 8, paddingVertical: 6, borderRadius: 99, borderWidth: 1, borderColor: primary ? colors.ink : colors.neutral[200], backgroundColor: primary ? colors.ink : colors.paper }}><Text style={{ ...mobileType.label, color: primary ? colors.paper : colors.ink }}>{label}</Text></View></Pressable>; }
function DesktopEvidence({ label, title, detail }: { label: string; title: string; detail: string }) { return <View style={{ marginTop: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: colors.paper }}><Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>{label}</Text><Text style={{ ...mobileType.bodySmall, fontWeight: '700', color: colors.ink, marginTop: 5 }}>{title}</Text><Text style={{ ...mobileType.label, color: colors.neutral[600], marginTop: 3 }}>{detail}</Text></View>; }

export default AssistantScreen;
