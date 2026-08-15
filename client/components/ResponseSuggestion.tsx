import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { ChevronDown, ChevronUp, Expand, RefreshCw, Send, SlidersHorizontal, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react-native';
import { supabase } from '../services/supabase';
import { platformsApi } from '../services/platforms';
import { colors, mobileType, radius, space } from '@claire/design-system';

interface ResponseSuggestionProps {
  messageId: string;
  messageContent?: string;
  isGroup?: boolean;
  refreshKey?: number;
  suggestions?: string[];
  onSelectSuggestion: (suggestion: string) => void;
  onFeedback?: (suggestionId: string, feedback: 'positive' | 'negative') => void;
}

interface AISuggestion {
  id: string;
  sourceId?: string;
  suggestion: string;
  confidence: number;
  feedback?: 'positive' | 'negative';
  suggestionIndex?: number;
}

interface AISuggestionRow {
  id: string;
  suggestions?: unknown;
  response_text?: unknown;
  confidence?: number | null;
  feedback?: 'positive' | 'negative' | null;
}

const isUsefulSuggestion = (suggestion: string) => ![
  'i understand', 'thanks for letting me know', 'thanks for sharing that with me', 'got it thanks for sharing',
].includes(suggestion.trim().toLowerCase().replace(/[.!]/g, ''));

export function ResponseSuggestion({ messageId, messageContent, isGroup, refreshKey = 0, suggestions: propSuggestions, onSelectSuggestion, onFeedback }: ResponseSuggestionProps) {
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [showGuidance, setShowGuidance] = useState(false);
  const [guidance, setGuidance] = useState('');
  const loadedMessageId = useRef<string | null>(null);
  const prefetchedMessageId = useRef<string | null>(null);

  const fetchSuggestions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('ai_suggestions').select('*').eq('message_id', messageId).order('confidence', { ascending: false }).limit(3);
      if (error) throw error;
      const normalized = (data as AISuggestionRow[] || []).flatMap(item => {
        const texts = Array.isArray(item.suggestions)
          ? item.suggestions.filter((text): text is string => typeof text === 'string')
          : typeof item.response_text === 'string' ? [item.response_text] : [];
        return texts.filter(isUsefulSuggestion).map((suggestion, suggestionIndex) => ({ id: `${item.id}-${suggestionIndex}`, sourceId: item.id, suggestion, confidence: item.confidence ?? 0, feedback: item.feedback ?? undefined, suggestionIndex }));
      });
      setSuggestions(normalized);
    } catch (error) {
      console.warn('[ReplyOptions] fetch failed', error);
    } finally {
      setLoading(false);
      loadedMessageId.current = messageId;
    }
  };

  const generate = async (forceRefresh = false, extraGuidance?: string) => {
    if (!messageContent || generating) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const result = await platformsApi.generateDraftReply(messageId, messageContent, isGroup ? 'group' : 'individual', { guidance: [guidance.trim(), extraGuidance].filter(Boolean).join('\n') || undefined, forceRefresh });
      setSuggestions(result.suggestions.filter(isUsefulSuggestion).map((suggestion, index) => ({ id: `generated-${Date.now()}-${index}`, suggestion, confidence: result.confidence })));
      setShowGuidance(false);
    } catch (error) {
      console.warn('[ReplyOptions] generation failed', error);
      setGenerateError('Claire could not prepare replies. Try again.');
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    loadedMessageId.current = null;
    prefetchedMessageId.current = null;
    setSuggestions(propSuggestions?.filter(isUsefulSuggestion).map((suggestion, index) => ({ id: `prop-${index}`, suggestion, confidence: 1 })) || []);
    setGenerateError(null);
    setExpanded(false);
    if (!propSuggestions?.length) void fetchSuggestions();
  }, [messageId, propSuggestions, refreshKey]);

  useEffect(() => {
    if (!messageContent || loading || generating || suggestions.length || prefetchedMessageId.current === messageId) return;
    if (loadedMessageId.current !== messageId) return;
    prefetchedMessageId.current = messageId;
    void generate(true);
  }, [generating, loading, messageContent, messageId, suggestions.length]);

  const selectSuggestion = async (suggestion: AISuggestion) => {
    onSelectSuggestion(suggestion.suggestion);
    setExpanded(false);
    if (!suggestion.sourceId) return;
    try { await supabase.from('ai_suggestions').update({ selected_index: suggestion.suggestionIndex ?? 0 }).eq('id', suggestion.sourceId); } catch (error) { console.warn('[ReplyOptions] selection save failed', error); }
  };

  const feedback = async (suggestion: AISuggestion, value: 'positive' | 'negative') => {
    onFeedback?.(suggestion.id, value);
    setSuggestions(current => current.map(item => item.id === suggestion.id ? { ...item, feedback: value } : item));
    if (suggestion.sourceId) await supabase.from('ai_suggestions').update({ feedback: value }).eq('id', suggestion.sourceId);
  };

  if (!messageContent) return null;
  const pending = loading || generating;
  const summary = pending ? 'Claire is preparing reply options…' : generateError ? generateError : suggestions.length ? `${suggestions.length} reply option${suggestions.length === 1 ? '' : 's'} ready` : 'Reply options will appear here.';

  return <View testID="ai-suggestion-strip" style={{ backgroundColor: colors.sky, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.infoBorder }}>
    <Pressable testID="reply-options-toggle" accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(current => !current)} style={({ pressed }) => ({ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: space[4], opacity: pressed ? 0.7 : 1 })}>
      {pending ? <ActivityIndicator size="small" color={colors.ink} /> : <Sparkles size={18} color={colors.ink} />}
      <View style={{ flex: 1 }}><Text maxFontSizeMultiplier={1} style={{ ...mobileType.label, color: colors.ink }}>REPLY OPTIONS</Text><Text maxFontSizeMultiplier={1} numberOfLines={1} style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{summary}</Text></View>
      {expanded ? <ChevronDown size={19} color={colors.ink} /> : <ChevronUp size={19} color={colors.ink} />}
    </Pressable>

    {expanded ? <View style={{ paddingHorizontal: space[3], paddingBottom: space[3], gap: space[3] }}>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: space[1] }}>
        <Pressable accessibilityLabel="Adjust reply options" onPress={() => setShowGuidance(true)} style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}><SlidersHorizontal size={18} color={colors.ink} /></Pressable>
        <Pressable accessibilityLabel="Make replies longer" disabled={pending} onPress={() => void generate(true, 'Make every reply longer while preserving the language, intent, and demonstrated voice.')} style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', opacity: pending ? 0.5 : 1 }}><Expand size={18} color={colors.ink} /></Pressable>
        <Pressable accessibilityLabel="Regenerate reply options" disabled={pending} onPress={() => void generate(true)} style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', opacity: pending ? 0.5 : 1 }}><RefreshCw size={18} color={colors.ink} /></Pressable>
      </View>
      {suggestions.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }} testID="ai-suggestion-scroll">{suggestions.map(suggestion => <View key={suggestion.id} style={{ width: 238, minHeight: 130, padding: space[3], borderWidth: 1, borderColor: colors.neutral[200], borderRadius: radius.control, backgroundColor: colors.paper, justifyContent: 'space-between', gap: space[3] }}><Text maxFontSizeMultiplier={1} numberOfLines={3} style={{ ...mobileType.body, color: colors.ink }}>{suggestion.suggestion}</Text><View style={{ flexDirection: 'row', alignItems: 'center' }}><Pressable accessibilityLabel="Like reply" onPress={() => void feedback(suggestion, 'positive')} style={{ padding: 5 }}><ThumbsUp size={16} color={suggestion.feedback === 'positive' ? colors.success : colors.neutral[600]} /></Pressable><Pressable accessibilityLabel="Dislike reply" onPress={() => void feedback(suggestion, 'negative')} style={{ padding: 5 }}><ThumbsDown size={16} color={suggestion.feedback === 'negative' ? colors.danger : colors.neutral[600]} /></Pressable><View style={{ flex: 1 }} /><Pressable accessibilityLabel="Use this reply" testID={`ai-suggestion-use-${suggestion.id}`} onPress={() => void selectSuggestion(suggestion)} style={{ minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, borderRadius: radius.control, backgroundColor: colors.ink }}><Send size={14} color={colors.lime} /><Text maxFontSizeMultiplier={1} style={{ ...mobileType.label, color: colors.paper }}>Use</Text></Pressable></View></View>)}</ScrollView> : <Text maxFontSizeMultiplier={1} style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{generateError || 'Preparing suggestions…'}</Text>}
    </View> : null}

    <Modal visible={showGuidance} transparent animationType="slide" onRequestClose={() => setShowGuidance(false)}><View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(16,18,15,0.35)' }}><View testID="reply-guidance-panel" style={{ padding: space[5], paddingBottom: 36, gap: space[3], borderTopLeftRadius: radius.panel, borderTopRightRadius: radius.panel, backgroundColor: colors.paper }}><Text maxFontSizeMultiplier={1} style={{ ...mobileType.sectionTitle, color: colors.ink }}>Adjust these replies</Text><TextInput maxFontSizeMultiplier={1} value={guidance} onChangeText={setGuidance} placeholder="e.g. less formal, more like me" placeholderTextColor={colors.neutral[400]} multiline style={{ minHeight: 92, padding: space[3], borderRadius: radius.control, borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: colors.cream, ...mobileType.body, color: colors.ink }} /><View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: space[3] }}><Pressable onPress={() => setShowGuidance(false)} style={{ minHeight: 42, justifyContent: 'center', paddingHorizontal: space[3] }}><Text style={{ ...mobileType.label, color: colors.neutral[600] }}>Cancel</Text></Pressable><Pressable onPress={() => void generate(true)} style={{ minHeight: 42, justifyContent: 'center', paddingHorizontal: space[3], borderRadius: radius.control, backgroundColor: colors.ink }}><Text style={{ ...mobileType.label, color: colors.paper }}>Regenerate</Text></Pressable></View></View></View></Modal>
  </View>;
}
