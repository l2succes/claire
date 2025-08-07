import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
import { Sparkles, Send, RefreshCw, ThumbsUp, ThumbsDown } from 'lucide-react-native';
import { supabase } from '../services/supabase';

interface ResponseSuggestionProps {
  messageId: string;
  chatId: string;
  suggestions?: string[];
  onSelectSuggestion: (suggestion: string) => void;
  onGenerateNew?: () => void;
  onFeedback?: (suggestionId: string, feedback: 'positive' | 'negative') => void;
}

interface AISuggestion {
  id: string;
  suggestion: string;
  confidence_score: number;
  is_selected?: boolean;
  feedback?: 'positive' | 'negative';
}

export function ResponseSuggestion({
  messageId,
  suggestions: propSuggestions,
  onSelectSuggestion,
  onGenerateNew,
  onFeedback,
}: ResponseSuggestionProps) {
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (propSuggestions && propSuggestions.length > 0) {
      // Use provided suggestions
      setSuggestions(
        propSuggestions.map((text, index) => ({
          id: `prop-${index}`,
          suggestion: text,
          confidence_score: 1,
        }))
      );
    } else {
      // Fetch from database
      fetchAISuggestions();
    }
  }, [messageId, propSuggestions]);

  const fetchAISuggestions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('ai_responses')
        .select('*')
        .eq('message_id', messageId)
        .order('confidence_score', { ascending: false })
        .limit(3);

      if (error) throw error;

      if (data && data.length > 0) {
        setSuggestions(
          data.map(item => ({
            id: item.id,
            suggestion: item.response_text,
            confidence_score: item.confidence_score,
            is_selected: item.is_selected,
            feedback: item.feedback,
          }))
        );
      }
    } catch (error) {
      console.error('Error fetching AI suggestions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSuggestion = async (suggestion: AISuggestion, index: number) => {
    setSelectedIndex(index);
    onSelectSuggestion(suggestion.suggestion);

    // Mark as selected in database if it's from DB
    if (!suggestion.id.startsWith('prop-')) {
      try {
        await supabase
          .from('ai_responses')
          .update({ is_selected: true })
          .eq('id', suggestion.id);
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
    if (!suggestion.id.startsWith('prop-')) {
      try {
        await supabase
          .from('ai_responses')
          .update({ feedback })
          .eq('id', suggestion.id);

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

  if (loading) {
    return (
      <View className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 mx-4 mb-2">
        <View className="flex-row items-center">
          <ActivityIndicator size="small" color="#3b82f6" />
          <Text className="ml-2 text-blue-600 dark:text-blue-400 text-sm">
            Generating AI suggestions...
          </Text>
        </View>
      </View>
    );
  }

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <View className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 mx-4 mb-2">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center">
          <Sparkles size={16} color="#3b82f6" />
          <Text className="ml-1 text-blue-600 dark:text-blue-400 text-sm font-medium">
            AI Suggestions
          </Text>
        </View>
        {onGenerateNew && (
          <TouchableOpacity
            onPress={onGenerateNew}
            className="flex-row items-center px-2 py-1"
          >
            <RefreshCw size={14} color="#3b82f6" />
            <Text className="ml-1 text-blue-600 dark:text-blue-400 text-xs">
              Regenerate
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Suggestions */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {suggestions.map((suggestion, index) => (
          <View key={suggestion.id} className="mr-2">
            <TouchableOpacity
              onPress={() => handleSelectSuggestion(suggestion, index)}
              className={`bg-white dark:bg-gray-800 rounded-lg p-2.5 min-w-[200] max-w-[280] ${
                selectedIndex === index ? 'border-2 border-blue-500' : 'border border-gray-200 dark:border-gray-700'
              }`}
            >
              {/* Confidence Score */}
              {suggestion.confidence_score < 1 && (
                <View className="flex-row items-center mb-1">
                  <Text className={`text-xs font-medium ${getConfidenceColor(suggestion.confidence_score)}`}>
                    {Math.round(suggestion.confidence_score * 100)}% confidence
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

      {/* Usage Tips */}
      {selectedIndex === null && (
        <Text className="text-xs text-gray-500 dark:text-gray-400 mt-2 italic">
          Tap a suggestion to use it, or swipe for more options
        </Text>
      )}
    </View>
  );
}