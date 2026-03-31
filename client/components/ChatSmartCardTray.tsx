import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, Keyboard } from 'react-native';
import { Sparkles, ChevronUp, ChevronDown } from 'lucide-react-native';
import { SmartCardList } from './SmartCardList';
import type { SmartCard } from '../types/conversationSettings';

interface ChatSmartCardTrayProps {
  cards: SmartCard[];
  onDismiss: (cardId: string) => void;
  onDraftMessage: (text: string) => void;
  onActed?: (cardId: string) => void;
}

const COLLAPSED_HEIGHT = 48;
const EXPANDED_HEIGHT = 180;

export function ChatSmartCardTray({ cards, onDismiss, onDraftMessage, onActed }: ChatSmartCardTrayProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const heightAnim = useRef(new Animated.Value(EXPANDED_HEIGHT)).current;

  useEffect(() => {
    Animated.timing(heightAnim, {
      toValue: isExpanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [isExpanded, heightAnim]);

  // Auto-collapse when keyboard opens
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setIsExpanded(false));
    return () => showSub.remove();
  }, []);

  if (cards.length === 0) return null;

  return (
    <Animated.View style={{
      height: heightAnim,
      borderTopWidth: 1,
      borderTopColor: '#e5e7eb',
      backgroundColor: '#ffffff',
      overflow: 'hidden',
    }}>
      {/* Tray header */}
      <TouchableOpacity
        onPress={() => setIsExpanded(!isExpanded)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          height: COLLAPSED_HEIGHT,
        }}
      >
        <Sparkles size={14} color="#6366f1" />
        <Text style={{ fontSize: 13, fontWeight: '600', color: '#6b7280', marginLeft: 6, flex: 1 }}>
          {cards.length} suggestion{cards.length !== 1 ? 's' : ''}
        </Text>
        {isExpanded ? (
          <ChevronDown size={16} color="#9ca3af" />
        ) : (
          <ChevronUp size={16} color="#9ca3af" />
        )}
      </TouchableOpacity>

      {/* Card scroll */}
      {isExpanded && (
        <SmartCardList
          cards={cards}
          compact
          onDismiss={onDismiss}
          onDraftMessage={onDraftMessage}
          onActed={onActed}
        />
      )}
    </Animated.View>
  );
}
