import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, Brain, MessageCircle, Plus, SendHorizonal, Trash2 } from 'lucide-react-native';
import {
  AssistantCitation,
  AssistantIndexStatus,
  AssistantThread,
  AssistantTurn,
  AssistantMentionCandidate,
  conversationAssistantApi,
} from '../services/conversationAssistant';

function Sources({ citations }: { citations: AssistantCitation[] }) {
  if (!citations.length) return null;
  const [showAll, setShowAll] = useState(false);
  const visibleCitations = showAll ? citations : citations.slice(0, 3);
  return (
    <View style={{ marginTop: 10, gap: 6 }} testID="assistant-sources">
      <Text style={{ color: '#64748b', fontSize: 12, fontWeight: '700' }}>Sources</Text>
      {visibleCitations.map((citation) => (
        <TouchableOpacity
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
          style={{ borderWidth: 1, borderColor: '#dbeafe', backgroundColor: '#f8fbff', borderRadius: 10, padding: 9 }}
        >
          <Text style={{ color: '#1e3a8a', fontSize: 12, fontWeight: '700' }}>
            {citation.fromMe ? 'You' : citation.senderName} · {new Date(citation.timestamp).toLocaleDateString()} · {citation.platform}
          </Text>
          {citation.isPreferredScope === false && (
            <Text style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>Also relevant from another conversation</Text>
          )}
          <Text numberOfLines={3} style={{ color: '#334155', fontSize: 13, marginTop: 2 }}>{citation.excerpt}</Text>
        </TouchableOpacity>
      ))}
      {citations.length > 3 && (
        <TouchableOpacity onPress={() => setShowAll(current => !current)} testID="assistant-sources-toggle" style={{ alignSelf: 'flex-start', paddingVertical: 5 }}>
          <Text style={{ color: '#4f46e5', fontSize: 13, fontWeight: '700' }}>
            {showAll ? 'Show less' : `View ${citations.length - 3} more`}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function IndexStatusBanner({ status }: { status: AssistantIndexStatus | null }) {
  if (!status || status.status === 'ready') return null;
  const progress = status.totalCount ? `${status.indexedCount}/${status.totalCount}` : 'starting';
  return (
    <View testID="assistant-index-status" style={{ backgroundColor: '#eff6ff', borderBottomWidth: 1, borderColor: '#bfdbfe', paddingHorizontal: 16, paddingVertical: 8 }}>
      <Text style={{ color: '#1d4ed8', fontSize: 12 }}>
        {status.status === 'failed' ? 'Message search is available; semantic indexing will retry.' : `Indexing your message history (${progress}). Exact search works now.`}
      </Text>
    </View>
  );
}

export default function AssistantScreen() {
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
    void conversationAssistantApi.mentionCandidates(match[1])
      .then(setMentionCandidates).catch(() => setMentionCandidates([]));
  };

  const selectMention = (candidate: AssistantMentionCandidate) => {
    setMentions(current => current.some(item => item.id === candidate.id) ? current : [...current, candidate]);
    setQuestion(current => current.replace(/@([^\s@]{1,40})$/, ''));
    setMentionCandidates([]);
  };

  const loadThread = useCallback(async (thread: AssistantThread) => {
    setActiveThread(thread);
    const response = await conversationAssistantApi.getThread(thread.id);
    setTurns(response.turns);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const [savedThreads, status] = await Promise.all([
        conversationAssistantApi.listThreads(),
        conversationAssistantApi.getIndexStatus(),
      ]);
      setThreads(savedThreads);
      setIndexStatus(status);
      if (status.status !== 'ready') void conversationAssistantApi.startIndex().catch(() => {});
      if (savedThreads[0]) await loadThread(savedThreads[0]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load Ask Claire.');
    } finally {
      setLoading(false);
    }
  }, [loadThread]);

  useEffect(() => { void refresh(); }, [refresh]);

  const createThread = async () => {
    try {
      const thread = await conversationAssistantApi.createThread();
      setThreads(prev => [thread, ...prev]);
      setActiveThread(thread);
      setTurns([]);
      setError(null);
      return thread;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create a conversation.');
      return null;
    }
  };

  const ask = async () => {
    const text = question.trim();
    if (!text || asking) return;
    setAsking(true);
    setError(null);
    try {
      const thread = activeThread || await createThread();
      if (!thread) return;
      const scopeChatIds = mentions.map(mention => mention.id);
      const optimistic: AssistantTurn = { id: `optimistic-${Date.now()}`, role: 'user', content: text, citations: [], scope_chat_ids: scopeChatIds, created_at: new Date().toISOString() };
      setTurns(prev => [...prev, optimistic]);
      setQuestion('');
      setMentionCandidates([]);
      const result = await conversationAssistantApi.ask(thread.id, text, scopeChatIds);
      setTurns(prev => [...prev, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: result.answer,
        citations: result.citations,
        scope_chat_ids: scopeChatIds,
        created_at: new Date().toISOString(),
      }]);
      setIndexStatus(result.indexing);
      setMentions([]);
      const refreshedThreads = await conversationAssistantApi.listThreads();
      setThreads(refreshedThreads);
      setActiveThread(refreshedThreads.find(item => item.id === thread.id) || thread);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Claire could not answer that right now.');
    } finally {
      setAsking(false);
    }
  };

  const deleteActiveThread = async () => {
    if (!activeThread) return;
    try {
      await conversationAssistantApi.deleteThread(activeThread.id);
      const remaining = threads.filter(thread => thread.id !== activeThread.id);
      setThreads(remaining);
      setActiveThread(null);
      setTurns([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete this conversation.');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#ffffff' }} edges={['top']} testID="assistant-screen">
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderColor: '#e5e7eb' }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4, marginRight: 8 }} testID="assistant-back">
          <ArrowLeft size={24} color="#0f172a" />
        </TouchableOpacity>
        <Brain size={22} color="#4f46e5" />
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#0f172a' }}>Ask Claire</Text>
          <Text style={{ fontSize: 12, color: '#64748b' }}>Search across your connected conversations</Text>
        </View>
        {activeThread && <TouchableOpacity onPress={deleteActiveThread} testID="assistant-delete-thread" style={{ padding: 6 }}><Trash2 size={18} color="#64748b" /></TouchableOpacity>}
      </View>

      <IndexStatusBanner status={indexStatus} />

      <View style={{ flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 8, borderBottomWidth: 1, borderColor: '#f1f5f9' }}>
        <TouchableOpacity onPress={() => void createThread()} testID="assistant-new-thread" style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#eef2ff', borderRadius: 18, paddingHorizontal: 10, paddingVertical: 7 }}>
          <Plus size={14} color="#4f46e5" /><Text style={{ color: '#4338ca', fontWeight: '700', fontSize: 12, marginLeft: 4 }}>New</Text>
        </TouchableOpacity>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {threads.map(thread => (
            <TouchableOpacity key={thread.id} onPress={() => void loadThread(thread)} testID={`assistant-thread-${thread.id}`} style={{ maxWidth: 180, borderRadius: 18, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: activeThread?.id === thread.id ? '#4f46e5' : '#f1f5f9' }}>
              <Text numberOfLines={1} style={{ color: activeThread?.id === thread.id ? '#ffffff' : '#475569', fontSize: 12, fontWeight: '600' }}>{thread.title}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color="#4f46e5" /></View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} testID="assistant-turn-list">
            {!turns.length && (
              <View style={{ alignItems: 'center', paddingVertical: 50 }} testID="assistant-empty">
                <MessageCircle size={34} color="#a5b4fc" />
                <Text style={{ color: '#334155', fontSize: 16, fontWeight: '700', marginTop: 10 }}>Ask about any conversation</Text>
                <Text style={{ color: '#64748b', fontSize: 13, textAlign: 'center', marginTop: 5 }}>Try “Where did I mention meeting Noah?” or “What did Zu say about Friday?”</Text>
              </View>
            )}
            {turns.map(turn => (
              <View key={turn.id} style={{ alignSelf: turn.role === 'user' ? 'flex-end' : 'stretch', maxWidth: turn.role === 'user' ? '84%' : '100%', backgroundColor: turn.role === 'user' ? '#4f46e5' : '#f8fafc', borderRadius: 14, padding: 12 }}>
                <Text style={{ color: turn.role === 'user' ? '#ffffff' : '#1e293b', fontSize: 14, lineHeight: 20 }}>{turn.content}</Text>
                {turn.role === 'assistant' && <Sources citations={turn.citations || []} />}
              </View>
            ))}
            {asking && <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><ActivityIndicator size="small" color="#4f46e5" /><Text style={{ color: '#4f46e5', fontSize: 13 }}>Claire is searching your conversations…</Text></View>}
          </ScrollView>
          {error && <Text testID="assistant-error" style={{ color: '#dc2626', fontSize: 12, paddingHorizontal: 16, paddingBottom: 6 }}>{error}</Text>}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, borderTopWidth: 1, borderColor: '#e5e7eb' }}>
            <View style={{ flex: 1 }}>
              {mentions.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 5 }}>
                {mentions.map(mention => <TouchableOpacity key={mention.id} onPress={() => setMentions(current => current.filter(item => item.id !== mention.id))} testID={`assistant-mention-${mention.id}`} style={{ backgroundColor: '#e0e7ff', borderRadius: 14, paddingHorizontal: 9, paddingVertical: 5 }}><Text style={{ color: '#4338ca', fontSize: 12, fontWeight: '700' }}>@{mention.name} ×</Text></TouchableOpacity>)}
              </ScrollView>}
              {mentionCandidates.length > 0 && <View testID="assistant-mention-candidates" style={{ position: 'absolute', bottom: 50, left: 0, right: 0, backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, zIndex: 3 }}>
                {mentionCandidates.map(candidate => <TouchableOpacity key={candidate.id} onPress={() => selectMention(candidate)} testID={`assistant-mention-candidate-${candidate.id}`} style={{ paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderColor: '#f1f5f9' }}><Text style={{ color: '#0f172a', fontWeight: '700' }}>{candidate.name}</Text><Text style={{ color: '#64748b', fontSize: 11 }}>{candidate.platform}{candidate.is_group ? ' · group' : ''}</Text></TouchableOpacity>)}
              </View>}
              <TextInput value={question} onChangeText={onQuestionChange} placeholder="Ask about a message, plan, or @person…" multiline testID="assistant-input" style={{ minHeight: 42, maxHeight: 110, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, color: '#0f172a' }} />
            </View>
            <TouchableOpacity onPress={() => void ask()} disabled={asking || !question.trim()} testID="assistant-send" style={{ backgroundColor: asking || !question.trim() ? '#c7d2fe' : '#4f46e5', borderRadius: 22, padding: 11 }}><SendHorizonal size={20} color="#ffffff" /></TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}
