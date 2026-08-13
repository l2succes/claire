import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, TextInput } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { Sparkles, Send, RefreshCw, ThumbsUp, ThumbsDown, SlidersHorizontal, Brain, Expand } from 'lucide-react-native';
import { supabase } from '../services/supabase';
import { platformsApi } from '../services/platforms';

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

  const getConfidenceColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600 dark:text-green-400';
    if (score >= 0.6) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-orange-600 dark:text-orange-400';
  };

  if (!messageContent) return null;

  return (
    <View
      style={{
        backgroundColor: '#eff6ff',
        borderRadius: 12,
        padding: 12,
        marginHorizontal: 16,
        marginBottom: 8,
      }}
      testID="ai-suggestion-strip"
    >
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <View className="flex-row items-center">
          <Sparkles size={16} color="#3b82f6" />
          <Text className="ml-1 text-blue-600 dark:text-blue-400 text-sm font-medium">
            Reply options
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <TouchableOpacity
            onPress={handleExplain}
            disabled={explaining}
            testID="ask-claire-button"
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 4 }}
          >
            {explaining ? <ActivityIndicator size="small" color="#2563eb" /> : <Brain size={14} color="#2563eb" />}
            <Text style={{ marginLeft: 4, color: '#2563eb', fontSize: 12, fontWeight: '600' }}>Ask Claire</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowGuidance(value => !value)}
            testID="reply-guidance-toggle"
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 4 }}
          >
            <SlidersHorizontal size={14} color="#2563eb" />
            <Text style={{ marginLeft: 4, color: '#2563eb', fontSize: 12, fontWeight: '600' }}>Guide</Text>
          </TouchableOpacity>
          {suggestions.length > 0 && (
            <TouchableOpacity
              onPress={() => handleGenerate(true, 'Make each option a little longer and more detailed, while keeping the same language and conversational style.')}
              disabled={generating}
              testID="make-reply-options-longer"
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 4 }}
            >
              <Expand size={14} color="#2563eb" />
              <Text style={{ marginLeft: 4, color: '#2563eb', fontSize: 12, fontWeight: '600' }}>Make longer</Text>
            </TouchableOpacity>
          )}
          {suggestions.length > 0 && (
            <TouchableOpacity
              onPress={() => handleGenerate(true)}
              disabled={generating}
              testID="regenerate-reply-options"
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 4 }}
            >
              <RefreshCw size={14} color="#2563eb" />
              <Text style={{ marginLeft: 4, color: '#2563eb', fontSize: 12, fontWeight: '600' }}>Regenerate</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {showGuidance && (
        <View style={{ marginBottom: 10 }} testID="reply-guidance-panel">
          <TextInput
            value={guidance}
            onChangeText={setGuidance}
            placeholder="e.g. warm, concise, and ask about Friday"
            placeholderTextColor="#64748b"
            multiline
            maxLength={500}
            testID="reply-guidance-input"
            style={{
              minHeight: 42,
              borderWidth: 1,
              borderColor: '#bfdbfe',
              borderRadius: 8,
              backgroundColor: '#fff',
              color: '#0f172a',
              paddingHorizontal: 10,
              paddingVertical: 8,
              fontSize: 13,
            }}
          />
          <TouchableOpacity
            onPress={() => handleGenerate(true)}
            disabled={generating}
            testID="apply-reply-guidance-button"
            style={{ alignSelf: 'flex-start', marginTop: 7, backgroundColor: '#2563eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 }}
          >
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Draft with guidance</Text>
          </TouchableOpacity>
        </View>
      )}

      {explanation && (
        <View testID="conversation-explanation" style={{ backgroundColor: '#ffffff', borderRadius: 10, borderWidth: 1, borderColor: '#bfdbfe', padding: 10, marginBottom: 10 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#1e3a8a', marginBottom: 4 }}>What Claire sees</Text>
          <Text style={{ fontSize: 13, color: '#1f2937', lineHeight: 18 }}>{explanation.summary}</Text>
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
            <Text style={{ color: '#2563eb', fontSize: 13, fontWeight: '700' }}>Retry reply options</Text>
          </TouchableOpacity>
        ) : (
          <View testID="reply-options-loading" style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
            <ActivityIndicator size="small" color="#2563eb" />
            <Text style={{ marginLeft: 8, color: '#2563eb', fontSize: 13, fontWeight: '600' }}>
              {loading || generating ? 'Claire is preparing reply options…' : 'Preparing reply options…'}
            </Text>
          </View>
        )
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} testID="ai-suggestion-scroll">
        {suggestions.map((suggestion, index) => (
          <View key={suggestion.id} className="mr-2">
            <TouchableOpacity
              onPress={() => handleSelectSuggestion(suggestion, index)}
              testID={`ai-suggestion-chip-${index}`}
              className={`bg-white dark:bg-gray-800 rounded-lg p-2.5 min-w-[200] max-w-[280] ${
                selectedIndex === index ? 'border-2 border-blue-500' : 'border border-gray-200 dark:border-gray-700'
              }`}
            >
              {/* Confidence Score */}
              {suggestion.confidence < 1 && (
                <View className="flex-row items-center mb-1">
                  <Text className={`text-xs font-medium ${getConfidenceColor(suggestion.confidence)}`}>
                    {Math.round(suggestion.confidence * 100)}% confidence
                  </Text>
                </View>
              )}

              {/* Suggestion Text */}
              <Text className="text-sm text-gray-800 dark:text-gray-200 mb-2" numberOfLines={3}>
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
                <TouchableOpacity
                  onPress={() => handleSelectSuggestion(suggestion, index)}
                  testID={`ai-suggestion-use-${index}`}
                  className="flex-row items-center bg-blue-500 rounded px-2 py-1"
                >
                  <Send size={12} color="#ffffff" />
                  <Text className="ml-1 text-white text-xs font-medium">Use</Text>
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
        <Text className="text-xs text-gray-500 dark:text-gray-400 mt-2 italic">
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
