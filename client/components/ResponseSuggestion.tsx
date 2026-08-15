import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, Modal } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { Sparkles, Send, RefreshCw, ThumbsUp, ThumbsDown, SlidersHorizontal, Brain, Expand } from 'lucide-react-native';
import { supabase } from '../services/supabase';
import { platformsApi } from '../services/platforms';
import { colors, mobileType, radius, space } from '@claire/design-system';

interface ResponseSuggestionProps {
  messageId: string;
  chatId: string;
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
  is_selected?: boolean;
  feedback?: 'positive' | 'negative';
  suggestionIndex?: number;
}

interface AISuggestionRow {
  id: string;
  suggestions?: unknown;
  response_text?: unknown;
  confidence?: number | null;
  selected_index?: number | null;
  is_selected?: boolean;
  feedback?: 'positive' | 'negative' | null;
}

interface ConversationExplanation {
  summary: string;
  latestMessageIntent: string;
  responseStrategy: string;
  suggestedNextStep: string;
  contextSignals: string[];
}

const isUsefulSuggestion = (suggestion: string) => {
  const normalized = suggestion.trim().toLowerCase().replace(/[.!]/g, '');
  return ![
    'i understand',
    'thanks for letting me know',
    'thanks for sharing that with me',
    'got it thanks for sharing',
  ].includes(normalized);
};

export function ResponseSuggestion({
  messageId,
  messageContent,
  isGroup,
  refreshKey = 0,
  suggestions: propSuggestions,
  onSelectSuggestion,
  onFeedback,
}: ResponseSuggestionProps) {
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [showGuidance, setShowGuidance] = useState(false);
  const [guidance, setGuidance] = useState('');
  const [loadedMessageId, setLoadedMessageId] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState<ConversationExplanation | null>(null);
  const [explainError, setExplainError] = useState<string | null>(null);
  const prefetchedMessageId = useRef<string | null>(null);

  useEffect(() => {
    setLoadedMessageId(null);
    setSuggestions([]);
    setSelectedIndex(null);
    setExplanation(null);
    setGenerateError(null);
    if (propSuggestions && propSuggestions.length > 0) {
      // Use provided suggestions
      setSuggestions(
        propSuggestions.filter(isUsefulSuggestion).map((text, index) => ({
          id: `prop-${index}`,
          suggestion: text,
          confidence: 1,
        }))
      );
      setLoadedMessageId(messageId);
    } else {
      // Fetch from database
      fetchAISuggestions();
    }
  }, [messageId, propSuggestions, refreshKey]);

  const fetchAISuggestions = async () => {
    setLoading(true);
    setSuggestions([]);
    try {
      const { data, error } = await supabase
        .from('ai_suggestions')
        .select('*')
        .eq('message_id', messageId)
        .order('confidence', { ascending: false })
        .limit(3);

      if (error) throw error;

      if (data && data.length > 0) {
        const normalized = (data as AISuggestionRow[]).flatMap((item) => {
          const texts: string[] = Array.isArray(item.suggestions)
            ? item.suggestions.filter((text): text is string => typeof text === 'string')
            : typeof item.response_text === 'string'
              ? [item.response_text]
              : [];

          return texts.filter(isUsefulSuggestion).map((text, suggestionIndex) => ({
            id: `${item.id}-${suggestionIndex}`,
            sourceId: item.id,
            suggestion: text,
            confidence: item.confidence ?? 0,
            is_selected: item.selected_index === suggestionIndex || item.is_selected === true,
            feedback: item.feedback ?? undefined,
            suggestionIndex,
          }));
        });
        setSuggestions(normalized);
      }
    } catch (error) {
      console.error('Error fetching AI suggestions:', error);
    } finally {
      setLoading(false);
      setLoadedMessageId(messageId);
    }
  };

  const handleGenerate = async (forceRefresh = false, extraGuidance?: string) => {
    if (!messageContent || generating) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const result = await platformsApi.generateDraftReply(
        messageId,
        messageContent,
        isGroup ? 'group' : 'individual',
        {
          guidance: [guidance.trim(), extraGuidance].filter(Boolean).join('\n') || undefined,
          forceRefresh,
        }
      );
      setSuggestions(
        result.suggestions.map((suggestion, index) => ({
          id: `generated-${Date.now()}-${index}`,
          suggestion,
          confidence: result.confidence,
        }))
      );
      setSelectedIndex(null);
      setShowGuidance(false);
    } catch (err) {
      console.error('Draft reply generation failed:', err);
      setGenerateError('Could not generate a draft. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  // Incoming messages normally receive suggestions as a background job. For
  // older messages (or a stale generic result), prefetch a fresh set as soon
  // as the chat opens rather than showing a manual "Draft" trigger.
  useEffect(() => {
    if (
      loadedMessageId !== messageId ||
      !messageContent ||
      loading ||
      generating ||
      suggestions.length > 0 ||
      prefetchedMessageId.current === messageId
    ) return;

    prefetchedMessageId.current = messageId;
    void handleGenerate(true);
  }, [loadedMessageId, messageId, messageContent, loading, generating, suggestions.length, refreshKey]);

  const handleExplain = async () => {
    if (!messageContent || explaining) return;
    setExplaining(true);
    setExplainError(null);
    try {
      const result = await platformsApi.explainConversation(
        messageId,
        messageContent,
        isGroup ? 'group' : 'individual'
      );
      setExplanation(result);
    } catch (error) {
      console.error('Conversation explanation failed:', error);
      setExplainError('Claire could not explain this conversation right now.');
    } finally {
      setExplaining(false);
    }
  };

  const handleSelectSuggestion = async (suggestion: AISuggestion, index: number) => {
    setSelectedIndex(index);
    onSelectSuggestion(suggestion.suggestion);

    // Mark as selected in database if it's from DB
    if (suggestion.sourceId) {
      try {
        await supabase
          .from('ai_suggestions')
          .update({ selected_index: suggestion.suggestionIndex ?? index })
          .eq('id', suggestion.sourceId);
      } catch (error) {
        console.error('Error updating selection:', error);
      }
    }
  };

  const handleFeedback = async (suggestion: AISuggestion, feedback: 'positive' | 'negative') => {
    if (onFeedback) {
      onFeedback(suggestion.id, feedback);
    }

    // Update feedback in database
    if (suggestion.sourceId) {
      try {
        await supabase
          .from('ai_suggestions')
          .update({ feedback })
          .eq('id', suggestion.sourceId);

        // Update local state
        setSuggestions(prev =>
          prev.map(s =>
            s.id === suggestion.id ? { ...s, feedback } : s
          )
        );
      } catch (error) {
        console.error('Error updating feedback:', error);
      }
    }
  };

  if (!messageContent) return null;

  return (
    <View
      style={{
        backgroundColor: colors.sky,
        padding: space[3],
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: colors.infoBorder,
      }}
      testID="ai-suggestion-strip"
    >
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space[2], gap: space[2] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          <Sparkles size={16} color={colors.ink} />
          <Text style={{ ...mobileType.label, color: colors.ink }}>Reply options</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <TouchableOpacity
            onPress={handleExplain}
            disabled={explaining}
            accessibilityLabel="Explain this conversation"
            testID="ask-claire-button"
            style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
          >
            {explaining ? <ActivityIndicator size="small" color={colors.ink} /> : <Brain size={17} color={colors.ink} />}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowGuidance(value => !value)}
            accessibilityLabel="Adjust reply options"
            testID="reply-guidance-toggle"
            style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
          >
            <SlidersHorizontal size={17} color={colors.ink} />
          </TouchableOpacity>
          {suggestions.length > 0 && (
            <TouchableOpacity
              onPress={() => handleGenerate(true, 'Make each option a little longer and more detailed, while keeping the same language and conversational style.')}
              disabled={generating}
              accessibilityLabel="Make replies longer"
              testID="make-reply-options-longer"
              style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
            >
              <Expand size={17} color={colors.ink} />
            </TouchableOpacity>
          )}
          {suggestions.length > 0 && (
            <TouchableOpacity
              onPress={() => handleGenerate(true)}
              disabled={generating}
              accessibilityLabel="Regenerate reply options"
              testID="regenerate-reply-options"
              style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
            >
              <RefreshCw size={17} color={colors.ink} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <Modal visible={showGuidance} transparent animationType="slide" onRequestClose={() => setShowGuidance(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(16,18,15,0.35)' }}>
          <View testID="reply-guidance-panel" style={{ backgroundColor: colors.paper, borderTopLeftRadius: radius.panel, borderTopRightRadius: radius.panel, padding: space[5], gap: space[3] }}>
          <Text style={{ ...mobileType.sectionTitle, color: colors.ink }}>Adjust these replies</Text>
          <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>Tell Claire what you want. Your direction applies only to this set.</Text>
          <TextInput
            value={guidance}
            onChangeText={setGuidance}
            placeholder="e.g. less formal, more like me, say I'm down but busy"
            placeholderTextColor={colors.neutral[400]}
            multiline
            maxLength={500}
            testID="reply-guidance-input"
            style={{
              minHeight: 42,
              borderWidth: 1,
              borderColor: colors.neutral[200],
              borderRadius: radius.control,
              backgroundColor: colors.cream,
              color: colors.ink,
              paddingHorizontal: 10,
              paddingVertical: 8,
              ...mobileType.body,
            }}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
          <TouchableOpacity onPress={() => setShowGuidance(false)} style={{ paddingHorizontal: 12, paddingVertical: 9 }}>
            <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600], fontWeight: '700' }}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleGenerate(true)}
            disabled={generating}
            testID="apply-reply-guidance-button"
            style={{ alignSelf: 'flex-start', marginTop: 7, backgroundColor: colors.ink, borderRadius: radius.control, paddingHorizontal: 14, paddingVertical: 10 }}
          >
            <Text style={{ ...mobileType.label, color: colors.lime }}>Regenerate</Text>
          </TouchableOpacity>
          </View>
        </View>
        </View>
      </Modal>

      {explanation && (
        <View testID="conversation-explanation" style={{ backgroundColor: colors.paper, borderRadius: radius.control, borderWidth: 1, borderColor: colors.infoBorder, padding: space[3], marginBottom: space[2] }}>
          <Text style={{ ...mobileType.label, color: colors.ink, marginBottom: 4 }}>What Claire sees</Text>
          <Text style={{ ...mobileType.bodySmall, color: colors.neutral[800] }}>{explanation.summary}</Text>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569', marginTop: 8 }}>Latest message</Text>
          <Text style={{ fontSize: 13, color: '#334155', lineHeight: 18 }}>{explanation.latestMessageIntent}</Text>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569', marginTop: 8 }}>How to respond</Text>
          <Text style={{ fontSize: 13, color: '#334155', lineHeight: 18 }}>{explanation.responseStrategy}</Text>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569', marginTop: 8 }}>Best next step</Text>
          <Text style={{ fontSize: 13, color: '#334155', lineHeight: 18 }}>{explanation.suggestedNextStep}</Text>
          {explanation.contextSignals.length > 0 && (
            <Text style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
              Context: {explanation.contextSignals.join(' · ')}
            </Text>
          )}
        </View>
      )}

      {suggestions.length === 0 && (
        generateError ? (
          <TouchableOpacity onPress={() => handleGenerate(true)} testID="retry-reply-options" style={{ alignSelf: 'flex-start', paddingVertical: 6 }}>
            <Text style={{ ...mobileType.label, color: colors.ink }}>Retry reply options</Text>
          </TouchableOpacity>
        ) : (
          <View testID="reply-options-loading" style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
            <ActivityIndicator size="small" color={colors.ink} />
            <Text style={{ ...mobileType.bodySmall, marginLeft: 8, color: colors.ink, fontWeight: '600' }}>
              {loading || generating ? 'Claire is preparing reply options…' : 'Preparing reply options…'}
            </Text>
          </View>
        )
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }} testID="ai-suggestion-scroll">
        {suggestions.map((suggestion, index) => (
          <View key={suggestion.id}>
            <TouchableOpacity
              onPress={() => handleSelectSuggestion(suggestion, index)}
              testID={`ai-suggestion-chip-${index}`}
              style={{ width: 232, minHeight: 112, backgroundColor: colors.paper, borderRadius: radius.control, padding: space[3], borderWidth: selectedIndex === index ? 2 : 1, borderColor: selectedIndex === index ? colors.ink : colors.neutral[200] }}
            >
              {/* Suggestion Text */}
              <Text style={{ ...mobileType.body, color: colors.ink, marginBottom: space[2], flex: 1 }} numberOfLines={3}>
                {suggestion.suggestion}
              </Text>

              {/* Actions */}
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <TouchableOpacity
                    onPress={() => handleFeedback(suggestion, 'positive')}
                    className={`p-1 mr-2 ${
                      suggestion.feedback === 'positive' ? 'bg-green-100 dark:bg-green-900/30 rounded' : ''
                    }`}
                  >
                    <ThumbsUp
                      size={14}
                      color={suggestion.feedback === 'positive' ? '#10b981' : '#6b7280'}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleFeedback(suggestion, 'negative')}
                    className={`p-1 ${
                      suggestion.feedback === 'negative' ? 'bg-red-100 dark:bg-red-900/30 rounded' : ''
                    }`}
                  >
                    <ThumbsDown
                      size={14}
                      color={suggestion.feedback === 'negative' ? '#ef4444' : '#6b7280'}
                    />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity accessibilityLabel="Use this reply"
                  onPress={() => handleSelectSuggestion(suggestion, index)}
                  testID={`ai-suggestion-use-${index}`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.ink, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 6 }}
                >
                  <Send size={12} color={colors.lime} />
                  <Text style={{ ...mobileType.label, color: colors.paper }}>Use</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>

            {/* Selected Indicator */}
            {suggestion.is_selected && (
              <View className="absolute top-0 right-0 bg-green-500 rounded-full px-1.5 py-0.5">
                <Text className="text-white text-xs">Used</Text>
              </View>
            )}
          </View>
        ))}
      </ScrollView>
      )}

      {/* Usage Tips */}
      {suggestions.length > 0 && selectedIndex === null && (
        <Text style={{ ...mobileType.label, color: colors.neutral[600], marginTop: space[2] }}>
          Tap a suggestion to use it, or swipe for more options
        </Text>
      )}
      {generateError && (
        <Text style={{ fontSize: 12, color: '#dc2626', marginTop: 8 }} testID="draft-reply-error">
          {generateError}
        </Text>
      )}
      {explainError && (
        <Text style={{ fontSize: 12, color: '#dc2626', marginTop: 8 }} testID="conversation-explanation-error">
          {explainError}
        </Text>
      )}
    </View>
  );
}
