import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Sparkles, RefreshCw } from 'lucide-react-native';
import { SmartCard } from './SmartCard';
import type { SmartCard as SmartCardType } from '../types/conversationSettings';

interface SmartCardListProps {
  cards: SmartCardType[];
  compact?: boolean;
  isGenerating?: boolean;
  onDismiss: (cardId: string) => void;
  onDraftMessage?: (text: string) => void;
  onActed?: (cardId: string) => void;
  onRefresh?: () => void;
}

export function SmartCardList({
  cards,
  compact,
  isGenerating,
  onDismiss,
  onDraftMessage,
  onActed,
  onRefresh,
}: SmartCardListProps) {
  if (!isGenerating && cards.length === 0) {
    return (
      <View style={{ paddingHorizontal: 16, paddingVertical: 20, alignItems: 'center', gap: 6 }}>
        <Sparkles size={20} color="#d1d5db" />
        <Text style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center' }}>
          Set a category above to get smart suggestions
        </Text>
      </View>
    );
  }

  return (
    <View style={{ paddingVertical: 12 }}>
      {/* Section header */}
      {!compact && (
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          marginBottom: 8,
        }}>
          <Sparkles size={14} color="#6366f1" />
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#6b7280', marginLeft: 6, flex: 1 }}>
            Smart Suggestions
          </Text>
          {onRefresh && (
            <TouchableOpacity onPress={onRefresh} style={{ padding: 4 }}>
              <RefreshCw size={14} color="#9ca3af" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {isGenerating ? (
        <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 12 }}>
          {[0, 1].map((i) => (
            <View
              key={i}
              style={{
                width: compact ? 200 : 280,
                height: compact ? 120 : 160,
                borderRadius: 16,
                backgroundColor: '#f3f4f6',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <ActivityIndicator size="small" color="#d1d5db" />
            </View>
          ))}
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
        >
          {cards.map((card) => (
            <SmartCard
              key={card.id}
              card={card}
              compact={compact}
              onDismiss={() => onDismiss(card.id)}
              onDraftMessage={onDraftMessage}
              onActed={() => onActed?.(card.id)}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}
