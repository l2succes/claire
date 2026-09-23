import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CheckCircle2, MessageCircle, Plus, Search, Send, Smile, X } from 'lucide-react-native';
import { colors, mobileType, radius, space, useIsDesktopLayout } from '@claire/design-system';
import { MobileIconButton, SectionLabel } from '../components/mobile/claire-mobile';
import { AskComposer, AskToolGrid } from '../components/claire/composer';
import { AssistantAnswerActions } from '../components/claire/assistant-answer-actions';
import { AssistantRichText } from '../components/claire/assistant-rich-text';
import { ClaireMark } from '../components/claire/mark';
import { AskClaireSkeleton, DesktopAskClaireSkeleton } from '../components/claire/skeleton';
import { PlatformName } from '../components/PlatformIcon';
import { useChromeStore } from '../stores/chromeStore';
import { useAuthStore } from '../stores/authStore';
import { readQuerySnapshot, writeQuerySnapshot } from '../services/mobile-cache';
import { useAssistantStream } from '../hooks/useAssistantStream';
import { userFacingErrorMessage } from '../services/api-errors';
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

function isUnsavedThread(thread: AssistantThread | null) {
  return !thread || thread.id.startsWith('draft-') || thread.id.startsWith('pending-');
}

function Sources({ citations, onExpand }: { citations: AssistantCitation[]; onExpand: () => void }) {
  const [expanded, setExpanded] = useState(false);
  if (!citations.length) return null;
  const previewSources = citations.slice(0, 3);
  return (
    <View style={{ gap: space[2] }} testID="assistant-sources">
      <Pressable
        testID="assistant-sources-toggle"
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${expanded ? 'Hide' : 'Show'} ${citations.length} sources`}
        onPress={() => setExpanded((current) => {
          const next = !current;
          if (next) onExpand();
          return next;
        })}
      >
        <View style={{ minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingRight: space[1] }}>
            {previewSources.map((citation, index) => {
              const name = citation.fromMe ? 'You' : citation.senderName;
              const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';
              return (
                <View key={citation.messageId} style={{ width: 25, height: 25, marginLeft: index ? -7 : 0, borderRadius: 13, borderWidth: 2, borderColor: colors.sky, alignItems: 'center', justifyContent: 'center', backgroundColor: index % 2 ? colors.lime : colors.cream }}>
                  <Text maxFontSizeMultiplier={1} style={{ fontSize: 9, lineHeight: 11, fontWeight: '800', color: colors.ink }}>{initials}</Text>
                </View>
              );
            })}
          </View>
          <Text selectable maxFontSizeMultiplier={1} style={{ ...mobileType.label, color: colors.ink }}>Sources</Text>
          <Text selectable maxFontSizeMultiplier={1} style={{ ...mobileType.label, color: colors.neutral[600] }}>{citations.length}</Text>
          <View style={{ marginLeft: 'auto' }}>
            {expanded ? <ChevronUp size={17} color={colors.neutral[600]} /> : <ChevronDown size={17} color={colors.neutral[600]} />}
          </View>
        </View>
      </Pressable>
      {expanded ? (
        <ScrollView horizontal style={{ height: 148, marginHorizontal: -space[4] }} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2], paddingHorizontal: space[4] }} testID="assistant-sources-carousel">
          {citations.map((citation) => (
            <Pressable
              key={citation.messageId}
              testID={`assistant-source-${citation.messageId}`}
              accessibilityRole="button"
              accessibilityLabel={`Open source from ${citation.fromMe ? 'you' : citation.senderName}`}
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
              <View style={{ width: 264, minHeight: 144, justifyContent: 'space-between', gap: space[2], padding: space[3], borderRadius: radius.card, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.infoBorder, backgroundColor: colors.infoSurface }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space[2] }}>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text selectable maxFontSizeMultiplier={1} numberOfLines={1} style={{ ...mobileType.bodySmall, fontWeight: '800', color: colors.ink }}>{citation.fromMe ? 'You' : citation.senderName}</Text>
                    <PlatformName platform={citation.platform} size={14} />
                  </View>
                  <Text selectable maxFontSizeMultiplier={1} numberOfLines={1} style={{ ...mobileType.label, color: colors.neutral[600], fontVariant: ['tabular-nums'] }}>{new Date(citation.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text>
                </View>
                <Text selectable maxFontSizeMultiplier={1} numberOfLines={3} style={{ ...mobileType.body, color: colors.neutral[800], lineHeight: 21 }}>{citation.excerpt}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  <Text maxFontSizeMultiplier={1} style={{ ...mobileType.label, color: colors.ink }}>Open chat</Text>
                  <ChevronRight size={15} color={colors.ink} />
                  {citation.isPreferredScope === false ? <Text maxFontSizeMultiplier={1} numberOfLines={1} style={{ ...mobileType.label, color: colors.neutral[600], marginLeft: 2 }}>Also relevant</Text> : null}
                </View>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

function SearchingStatus({ phase, onStop }: { phase: 'planning' | 'reading' | 'saving' | null; onStop: () => void }) {
  const opacity = useSharedValue(0.55);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 720, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [opacity]);
  const pulse = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', gap: space[2], padding: space[3] }, pulse]}>
      <ClaireMark size={16} />
      <Text style={{ ...mobileType.bodySmall, color: colors.neutral[800], flex: 1 }}>
        {phase === 'planning' ? 'Claire is understanding the question…' : phase === 'saving' ? 'Claire is saving the answer…' : 'Claire is reading the relevant conversations…'}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Stop Claire" onPress={onStop} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.neutral[400] }}>
        <Text style={{ ...mobileType.label, color: colors.ink }}>Stop</Text>
      </Pressable>
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

function AssistantHomeSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: space[2], paddingBottom: space[2] }}>
      <SectionLabel title={title} />
      {children}
    </View>
  );
}

export function AssistantScreen({ inTab = false }: { inTab?: boolean }) {
  const { threadId } = useLocalSearchParams<{ threadId?: string }>();
  const isDesktop = useIsDesktopLayout();
  const insets = useSafeAreaInsets();
  const setTabBarHidden = useChromeStore((state) => state.setTabBarHidden);
  const [threads, setThreads] = useState<AssistantThread[]>([]);
  const [activeThread, setActiveThread] = useState<AssistantThread | null>(null);
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [question, setQuestion] = useState('');
  const [composerMenuOpen, setComposerMenuOpen] = useState(false);
  const [indexStatus, setIndexStatus] = useState<AssistantIndexStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const { start: startStream, stop: stopStream, isStreaming: asking, phase: streamPhase } = useAssistantStream();
  const [error, setError] = useState<string | null>(null);
  const [mentions, setMentions] = useState<AssistantMentionCandidate[]>([]);
  const [mentionCandidates, setMentionCandidates] = useState<AssistantMentionCandidate[]>([]);
  const openedThreadId = useRef<string | null>(null);
  const conversationScrollRef = useRef<ScrollView>(null);
  const interactiveRequestEpoch = useRef(0);
  const navigationEpoch = useRef(0);
  const threadScrollY = useSharedValue(0);
  const onThreadScroll = useAnimatedScrollHandler({
    onScroll: (event) => { threadScrollY.value = Math.max(0, event.contentOffset.y); },
  });
  const threadHeaderStyle = useAnimatedStyle(() => ({
    paddingTop: interpolate(threadScrollY.value, [0, 72], [inTab ? space[4] : 0, space[2]], 'clamp'),
    paddingBottom: interpolate(threadScrollY.value, [0, 72], [space[4], space[2]], 'clamp'),
  }));
  const threadTitleStyle = useAnimatedStyle(() => ({
    fontSize: interpolate(threadScrollY.value, [0, 72], [24, 18], 'clamp'),
    lineHeight: interpolate(threadScrollY.value, [0, 72], [28, 22], 'clamp'),
  }));
  const threadSubtitleStyle = useAnimatedStyle(() => ({
    height: interpolate(threadScrollY.value, [0, 72], [25, 0], 'clamp'),
    opacity: interpolate(threadScrollY.value, [0, 48], [1, 0], 'clamp'),
  }));

  const inThread = Boolean(activeThread);

  useEffect(() => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

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
    const epoch = ++navigationEpoch.current;
    setComposerMenuOpen(false);
    setActiveThread(thread);
    setTurns([]);
    threadScrollY.value = 0;
    setError(null);
    try {
      const history = await conversationAssistantApi.getThread(thread.id);
      if (epoch === navigationEpoch.current) setTurns(history.turns);
    } catch (cause) {
      if (epoch === navigationEpoch.current) setError(userFacingErrorMessage(cause, 'Could not load this conversation.'));
    }
  }, [threadScrollY]);

  useEffect(() => {
    if (!threadId || loading || openedThreadId.current === threadId) return;
    const thread = threads.find((item) => item.id === threadId);
    if (!thread) return;
    openedThreadId.current = threadId;
    void loadThread(thread);
  }, [loadThread, loading, threadId, threads]);

  const goHome = () => {
    navigationEpoch.current += 1;
    setComposerMenuOpen(false);
    setActiveThread(null);
    threadScrollY.value = 0;
    setTurns([]);
    setQuestion('');
    setMentions([]);
    setMentionCandidates([]);
    setError(null);
  };

  const refresh = useCallback(async () => {
    const requestEpoch = interactiveRequestEpoch.current;
    try {
      const [savedThreads, status] = await Promise.all([
        conversationAssistantApi.listThreads(),
        conversationAssistantApi.getIndexStatus(),
      ]);
      setThreads(savedThreads);
      setIndexStatus(status);
      const userId = useAuthStore.getState().user?.id;
      if (userId) void writeQuerySnapshot(userId, 'assistant-threads-v2', savedThreads).catch(() => undefined);
      if (status.status !== 'ready') void conversationAssistantApi.startIndex().catch(() => {});
    } catch (cause) {
      // An initial/background load can finish after a person has already asked
      // a question. Never let that older failure overwrite a newer answer.
      if (requestEpoch === interactiveRequestEpoch.current) {
        setError(userFacingErrorMessage(cause, 'Could not load Ask Claire.'));
      }
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
      void readQuerySnapshot<AssistantThread[]>(userId, 'assistant-threads-v2')
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

  const createThread = () => {
    // Starting a conversation is local. The first question creates the saved
    // thread, so leaving an untouched draft never pollutes Recent.
    navigationEpoch.current += 1;
    setComposerMenuOpen(false);
    setActiveThread({
      id: `draft-${Crypto.randomUUID()}`,
      title: 'New conversation',
      chat_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    setTurns([]);
    setQuestion('');
    setMentions([]);
    setMentionCandidates([]);
    setError(null);
    threadScrollY.value = 0;
  };

  const ask = async (prompt = question) => {
    const text = prompt.trim();
    if (!text || asking) return;
    interactiveRequestEpoch.current += 1;
    setError(null);
    const viewEpoch = navigationEpoch.current;
    try {
      const requestId = Crypto.randomUUID();
      const isNewThread = isUnsavedThread(activeThread);
      const thread: AssistantThread = activeThread || {
        id: `pending-${requestId}`,
        title: text.slice(0, 72),
        chat_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (isNewThread) {
        setActiveThread({ ...thread, title: text.slice(0, 72) });
        setTurns([]);
      }
      const scopeChatIds = mentions.map((mention) => mention.id);
      const optimistic: AssistantTurn = {
        id: `user-${requestId}`,
        role: 'user',
        content: text,
        citations: [],
        scope_chat_ids: scopeChatIds,
        created_at: new Date().toISOString(),
      };
      const streamingTurn: AssistantTurn = {
        id: `assistant-${requestId}`,
        role: 'assistant',
        content: '',
        citations: [],
        actions: [],
        scope_chat_ids: scopeChatIds,
        status: 'streaming',
        request_id: requestId,
        created_at: new Date().toISOString(),
      };
      setTurns((current) => isNewThread ? [optimistic, streamingTurn] : [...current, optimistic, streamingTurn]);
      setQuestion('');
      setMentionCandidates([]);
      const result = await startStream(
        isNewThread
          ? { kind: 'new', question: text, chatIds: scopeChatIds, requestId }
          : { kind: 'thread', threadId: thread.id, question: text, chatIds: scopeChatIds, requestId },
        { onDelta: (delta) => {
          if (viewEpoch === navigationEpoch.current) setTurns((current) => current.map((turn) => turn.id === streamingTurn.id ? { ...turn, content: turn.content + delta } : turn));
        } },
      );
      if (viewEpoch === navigationEpoch.current) setTurns((current) => current.map((turn) => turn.id === streamingTurn.id
        ? result.assistantTurn || { ...turn, content: result.answer, citations: result.citations, actions: result.actions, status: 'completed' }
        : turn));
      setIndexStatus(result.indexing);
      if (viewEpoch === navigationEpoch.current) {
        setError(null);
        setMentions([]);
      }
      const persistedThread = result.thread || thread;
      if (viewEpoch === navigationEpoch.current) setActiveThread(persistedThread);
      // Refreshing Recent is secondary to the completed answer. A transient
      // history failure must not turn a successful response into an error.
      try {
        const refreshed = await conversationAssistantApi.listThreads();
        setThreads(refreshed);
        const userId = useAuthStore.getState().user?.id;
        if (userId) void writeQuerySnapshot(userId, 'assistant-threads-v2', refreshed).catch(() => undefined);
        if (viewEpoch === navigationEpoch.current) setActiveThread(refreshed.find((item) => item.id === persistedThread.id) || persistedThread);
      } catch {
        setThreads((current) => [persistedThread, ...current.filter((item) => item.id !== persistedThread.id)]);
      }
    } catch (cause) {
      const message = userFacingErrorMessage(cause, 'Claire could not answer that right now.');
      if (viewEpoch === navigationEpoch.current) {
        setError(message);
        setTurns((current) => current.map((turn) => turn.status === 'streaming' ? { ...turn, status: message === 'Answer stopped.' ? 'cancelled' : 'failed' } : turn));
      }
    }
  };

  const deleteActiveThread = async () => {
    if (!activeThread) return;
    if (isUnsavedThread(activeThread)) {
      goHome();
      return;
    }
    try {
      await conversationAssistantApi.deleteThread(activeThread.id);
      setThreads((current) => current.filter((thread) => thread.id !== activeThread.id));
      goHome();
    } catch (cause) {
      setError(userFacingErrorMessage(cause, 'Could not delete this conversation.'));
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

  const headerContent = <>
    {inThread ? <MobileIconButton label="Back to Ask Claire" onPress={goHome}><ChevronLeft size={22} color={colors.ink} /></MobileIconButton> : null}
    <View style={{ flex: 1, minWidth: 0 }}>
      {inThread ? (
        <>
          <Animated.Text maxFontSizeMultiplier={1} numberOfLines={1} ellipsizeMode="tail" style={[{ ...mobileType.screenTitle, color: colors.ink }, threadTitleStyle]}>{activeThread?.title || 'New conversation'}</Animated.Text>
          <Animated.View style={[{ overflow: 'hidden' }, threadSubtitleStyle]}>
            <Text maxFontSizeMultiplier={1} numberOfLines={1} style={{ ...mobileType.body, color: colors.neutral[600] }}>Use @ to focus on a person or chat</Text>
          </Animated.View>
        </>
      ) : (
        <>
          <Text maxFontSizeMultiplier={1} numberOfLines={1} style={{ ...mobileType.screenTitle, color: colors.ink }}>Ask Claire</Text>
          <Text maxFontSizeMultiplier={1} numberOfLines={1} style={{ ...mobileType.body, color: colors.neutral[600] }}>Across your connected conversations</Text>
        </>
      )}
    </View>
    {inThread ? null : <MobileIconButton selected label="New Ask Claire thread" onPress={createThread} testID="assistant-new-thread"><Plus size={21} color={colors.ink} /></MobileIconButton>}
    {inTab ? null : <MobileIconButton label="Close Ask Claire" onPress={close}><X size={21} color={colors.ink} /></MobileIconButton>}
  </>;

  const header = inThread ? (
    <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], backgroundColor: colors.sky }, threadHeaderStyle]}>{headerContent}</Animated.View>
  ) : (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingBottom: space[4], paddingTop: inTab ? space[4] : 0 }}>{headerContent}</View>
  );

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
      onCreate={createThread}
      onSelect={(thread) => void loadThread(thread)}
      onAsk={(prompt?: string) => void ask(prompt)}
    />;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.sky }} edges={['top']} testID="assistant-screen">
      {loading ? (
        <>
          {header}
          <IndexStatusBanner status={indexStatus} />
          <AskClaireSkeleton />
        </>
      ) : inThread ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {header}
          <IndexStatusBanner status={indexStatus} />
          <Animated.ScrollView ref={conversationScrollRef} onScroll={onThreadScroll} scrollEventThrottle={16} contentContainerStyle={{ paddingHorizontal: space[4], paddingTop: space[2], paddingBottom: space[4], gap: space[4] }} keyboardShouldPersistTaps="handled" testID="assistant-turn-list">
            {!turns.length ? (
              <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>
                Claire never sends messages from here. She only reads connected conversations and cites what she used.
              </Text>
            ) : turns.map((turn) => turn.role === 'assistant' && !turn.content.trim() && !(turn.citations?.length || turn.actions?.length) ? null : (
              <View key={turn.id} style={{ alignSelf: turn.role === 'user' ? 'flex-end' : 'stretch', maxWidth: turn.role === 'user' ? '88%' : '100%', gap: space[2] }}>
                {turn.content.trim() ? <View testID={turn.role === 'assistant' ? 'assistant-answer-bubble' : undefined} style={{ padding: space[4], borderRadius: radius.card, borderCurve: 'continuous', borderWidth: turn.role === 'assistant' ? 1 : 0, borderColor: colors.ink, backgroundColor: turn.role === 'user' ? colors.ink : colors.paper }}>
                  {turn.role === 'assistant'
                    ? <AssistantRichText content={turn.content} style={{ ...mobileType.body, color: colors.ink }} />
                    : <Text selectable style={{ ...mobileType.body, color: colors.paper }}>{turn.content}</Text>}
                </View> : null}
                {turn.role === 'assistant' ? <AssistantAnswerActions actions={turn.actions} /> : null}
                {turn.role === 'assistant' ? <Sources citations={turn.citations || []} onExpand={() => requestAnimationFrame(() => conversationScrollRef.current?.scrollToEnd({ animated: true }))} /> : null}
              </View>
            ))}
            {asking ? <SearchingStatus phase={streamPhase} onStop={stopStream} /> : null}
          </Animated.ScrollView>
          {error ? <Text testID="assistant-error" style={{ ...mobileType.bodySmall, color: colors.danger, paddingHorizontal: space[4], paddingBottom: space[2] }}>{error}</Text> : null}
          {composerMenuOpen ? (
            <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(150)} style={{ position: 'absolute', top: -insets.top, right: 0, bottom: 0, left: 0, zIndex: 1, backgroundColor: 'rgba(16,18,15,0.28)' }}>
              <Pressable accessibilityRole="button" accessibilityLabel="Close Claire actions" onPress={() => setComposerMenuOpen(false)} style={{ flex: 1 }} testID="ask-composer-backdrop" />
            </Animated.View>
          ) : null}
          {/* The keyboard replaces the tab bar, so its open state needs only a small gap. */}
          <View style={{ zIndex: 2, paddingHorizontal: space[4], paddingTop: 4, paddingBottom: keyboardVisible ? space[2] : Math.max(insets.bottom, space[2]) + (inTab ? space[3] : 0), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(16,18,15,0.16)', backgroundColor: composerMenuOpen ? 'transparent' : colors.sky }}>
            <AskComposer
              value={question}
              onChangeText={onQuestionChange}
              onSend={() => void ask()}
              sending={asking}
              menuOpen={composerMenuOpen}
              onMenuOpenChange={setComposerMenuOpen}
              onFocus={() => setComposerMenuOpen(false)}
              onTagPerson={() => onQuestionChange(`${question}${question.endsWith('@') || question.endsWith('@ ') ? '' : question ? ' @' : '@'}`)}
              onFocusChat={() => onQuestionChange(`${question}${question.includes('@') ? '' : ' @'}`)}
              onFindLoops={() => void ask('What commitments, questions, or plans are still unresolved?')}
              onCheckTone={() => void ask('What patterns do you notice in the tone of my recent conversations? Distinguish observations from inference.')}
              onFindSomething={() => onQuestionChange('Find ')}
              onDelete={() => void deleteActiveThread()}
              chips={<>{mentionChips}{mentionMenu}</>}
            />
          </View>
        </KeyboardAvoidingView>
      ) : (
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: inTab ? 120 : space[8], gap: space[4] }} testID="assistant-home">
          {header}
          <IndexStatusBanner status={indexStatus} />
          {error ? <Text testID="assistant-error" style={{ ...mobileType.bodySmall, color: colors.danger }}>{error}</Text> : null}
          <AssistantHomeSection title="What can I help with?">
            <AskToolGrid onSelect={(prompt) => void ask(prompt)} />
          </AssistantHomeSection>
          <AssistantHomeSection title="Recent">
            {threads.length ? threads.slice(0, 4).map((thread) => (
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
                Ask a question to start a private conversation. Claire never sends messages from here.
              </Text>
            )}
            {threads.length > 4 ? <Pressable testID="assistant-see-more" accessibilityRole="button" accessibilityLabel={`See ${threads.length - 4} more Ask Claire conversations`} onPress={() => router.push('/assistant/recents')}><View style={{ minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: space[2], borderBottomWidth: 1, borderBottomColor: colors.neutral[200] }}><Text style={{ ...mobileType.bodySmall, flex: 1, fontWeight: '800', color: colors.ink }}>See more conversations</Text><Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>{threads.length - 4}</Text><ChevronRight size={17} color={colors.ink} /></View></Pressable> : null}
          </AssistantHomeSection>
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

  const shownTurns = turns.slice(-2);
  return <View style={{ flex: 1, minHeight: 0, flexDirection: 'row', backgroundColor: '#FAF9F5' }} testID="desktop-assistant-screen">
    <View style={{ width: 210, flexShrink: 0, padding: space[3], backgroundColor: '#F4F2EC', borderRightWidth: 1, borderColor: colors.neutral[200] }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 16 }}><ClaireMark size={16} /><Text style={{ ...mobileType.monoLabel, color: colors.ink }}>ASK CLAIRE</Text><Pressable onPress={onCreate} style={{ marginLeft: 'auto' }}><View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}><Plus size={15} color={colors.paper} /></View></Pressable></View>{threads.map((thread, index) => <Pressable key={thread.id} onPress={() => onSelect(thread)}><View style={{ padding: 10, borderRadius: 11, borderWidth: activeThread?.id === thread.id || (!activeThread && index === 0) ? 1 : 0, borderColor: colors.ink, backgroundColor: activeThread?.id === thread.id || (!activeThread && index === 0) ? colors.lime : 'transparent', marginBottom: 5 }}><Text numberOfLines={1} style={{ ...mobileType.bodySmall, fontWeight: '700', color: colors.ink }}>{thread.title || 'Untitled'}</Text><Text numberOfLines={1} style={{ ...mobileType.label, color: colors.neutral[600] }}>Conversation context · {formatThreadTime(thread.updated_at || thread.created_at)}</Text></View></Pressable>)}{!threads.length ? <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>Start a private question about your conversations.</Text> : null}<View style={{ marginTop: 'auto', paddingTop: 14, borderTopWidth: 1, borderColor: colors.neutral[200] }}><Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>PRIVATE BY DEFAULT</Text><Text style={{ ...mobileType.label, color: colors.neutral[600], marginTop: 5 }}>Claire cites connected messages and never sends from this workspace.</Text></View></View>
    <View style={{ flex: 1, minWidth: 0, padding: 30, paddingBottom: 18 }}><View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16 }}><View><Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>CONNECTED CONTEXT</Text><Text style={{ ...mobileType.screenTitle, color: colors.ink, marginTop: 4 }}>Ask Claire</Text><Text style={{ ...mobileType.bodySmall, color: colors.neutral[600], marginTop: 3 }}>Use conversations, relationship context, and open loops to make the next move easier.</Text></View><View style={{ alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 99, backgroundColor: colors.sky }}><Text style={{ ...mobileType.monoLabel, color: colors.ink }}>READ ONLY</Text></View></View>
      {shownTurns.length ? <ScrollView style={{ flex: 1, marginTop: 20 }} contentContainerStyle={{ gap: 10, paddingBottom: 14 }}>{shownTurns.map((turn) => <View key={turn.id} style={{ alignSelf: turn.role === 'user' ? 'flex-end' : 'stretch', maxWidth: turn.role === 'user' ? '76%' : undefined, padding: 15, borderRadius: 15, borderWidth: turn.role === 'assistant' ? 1 : 0, borderColor: colors.ink, backgroundColor: turn.role === 'user' ? colors.ink : colors.sky }}>{turn.role === 'assistant' ? <AssistantRichText content={turn.content} style={{ ...mobileType.body, color: colors.ink, textAlign: 'left' }} /> : <Text style={{ ...mobileType.body, color: colors.paper, textAlign: 'left' }}>{turn.content}</Text>}</View>)}</ScrollView> : <><View style={{ flexDirection: 'row', gap: 12, marginTop: 22, padding: 16, borderWidth: 1, borderColor: colors.ink, borderRadius: 16, backgroundColor: colors.sky }}><View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}><ClaireMark size={18} color={colors.paper} dot={colors.lime} /></View><View style={{ flex: 1 }}><Text style={{ ...mobileType.monoLabel, color: colors.ink }}>SUGGESTED REPLY · WARM + DIRECT</Text><Text style={{ ...mobileType.body, color: colors.ink, marginTop: 7 }}>“I can help pull together the context, find what is still open, and draft a reply you can review.”</Text><View style={{ flexDirection: 'row', gap: 7, marginTop: 12 }}><DesktopAskButton label="Use reply" primary onPress={() => onAsk('Draft a warm, direct reply using the relevant conversation context.')} /><DesktopAskButton label="Make shorter" onPress={() => onAsk('Give me a concise version of the next reply.')} /><DesktopAskButton label="Try again" onPress={() => onAsk('Offer another thoughtful reply option.')} /></View></View></View><Text style={{ ...mobileType.monoLabel, color: colors.neutral[600], marginTop: 22, marginBottom: 9 }}>MORE WAYS I CAN HELP</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{[[MessageCircle, 'Catch me up', 'Summarize this conversation.'], [CheckCircle2, 'Find open loops', 'Commitments and unanswered questions.'], [Smile, 'Check the tone', 'Warm, direct, or playful.'], [Search, 'Find something', 'Search this chat or every chat.']].map(([Icon, label, detail]) => { const ToolIcon = Icon as typeof MessageCircle; return <Pressable key={label as string} onPress={() => onAsk(detail as string)}><View style={{ width: 184, minHeight: 78, padding: 11, borderRadius: 13, borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: colors.paper }}><ToolIcon size={17} color={colors.ink} /><Text style={{ ...mobileType.bodySmall, fontWeight: '700', color: colors.ink, marginTop: 5 }}>{label as string}</Text><Text style={{ ...mobileType.label, color: colors.neutral[600] }}>{detail as string}</Text></View></Pressable>})}</View></>}
      {error ? <Text style={{ ...mobileType.bodySmall, color: colors.danger, marginTop: 8 }}>{error}</Text> : null}
      <View style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 16, paddingLeft: 13, paddingRight: 8, borderRadius: 14, borderWidth: 1, borderColor: colors.ink, backgroundColor: colors.paper }}><ClaireMark size={17} /><TextInput value={question} onChangeText={onQuestionChange} onSubmitEditing={() => onAsk()} placeholder="Ask about a conversation, person, or open loop…" placeholderTextColor={colors.neutral[400]} style={{ flex: 1, minWidth: 0, color: colors.ink, fontSize: 14, outlineStyle: 'none' } as never} /><View style={{ paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.neutral[100] }}><Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>⌥⌘A</Text></View><Pressable onPress={() => onAsk()} disabled={asking}><View style={{ width: 31, height: 31, borderRadius: 10, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', opacity: asking ? 0.55 : 1 }}><Send size={16} color={colors.paper} /></View></Pressable></View>
    </View>
    <View style={{ width: 235, flexShrink: 0, padding: space[3], borderLeftWidth: 1, borderColor: colors.neutral[200], backgroundColor: '#F4F2EC' }}><Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>CLAIRE’S CONTEXT</Text><DesktopEvidence label="RELATIONSHIP" title="Context-aware" detail="Claire uses the conversation and the relationship memory you’ve chosen." /><DesktopEvidence label="OPEN LOOPS" title="Find open loops" detail="Open loops and unresolved plans are available to ask about." /><View style={{ marginTop: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#DFCA7E', backgroundColor: '#FFF8DD' }}><Text style={{ ...mobileType.monoLabel, color: colors.ink }}>AVAILABLE SOURCES</Text><Text style={{ ...mobileType.bodySmall, fontWeight: '700', color: colors.ink, marginTop: 5 }}>Connected messages</Text><Text style={{ ...mobileType.label, color: colors.neutral[600], marginTop: 3 }}>Claire shows the messages behind any answer.</Text></View></View>
  </View>;
}

function DesktopAskButton({ label, primary = false, onPress }: { label: string; primary?: boolean; onPress: () => void }) { return <Pressable onPress={onPress}><View style={{ paddingHorizontal: 8, paddingVertical: 6, borderRadius: 99, borderWidth: 1, borderColor: primary ? colors.ink : colors.neutral[200], backgroundColor: primary ? colors.ink : colors.paper }}><Text style={{ ...mobileType.label, color: primary ? colors.paper : colors.ink }}>{label}</Text></View></Pressable>; }
function DesktopEvidence({ label, title, detail }: { label: string; title: string; detail: string }) { return <View style={{ marginTop: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: colors.paper }}><Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>{label}</Text><Text style={{ ...mobileType.bodySmall, fontWeight: '700', color: colors.ink, marginTop: 5 }}>{title}</Text><Text style={{ ...mobileType.label, color: colors.neutral[600], marginTop: 3 }}>{detail}</Text></View>; }

export default AssistantScreen;
