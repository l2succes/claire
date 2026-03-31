import { View, Text, TouchableOpacity, Linking, Platform as RNPlatform } from 'react-native';
import {
  MapPin, Plane, Calendar, Bell, Sparkles, X,
} from 'lucide-react-native';
import type { SmartCard as SmartCardType, SmartCardType as CardType } from '../types/conversationSettings';

const CARD_COLORS: Record<CardType, string> = {
  maps: '#10b981',
  flight: '#3b82f6',
  datetime: '#8b5cf6',
  reminder: '#f59e0b',
  action: '#6366f1',
};

const CARD_ICONS: Record<CardType, typeof MapPin> = {
  maps: MapPin,
  flight: Plane,
  datetime: Calendar,
  reminder: Bell,
  action: Sparkles,
};

interface SmartCardProps {
  card: SmartCardType;
  compact?: boolean;
  onDismiss?: () => void;
  onDraftMessage?: (text: string) => void;
  onActed?: () => void;
}

export function SmartCard({ card, compact, onDismiss, onDraftMessage, onActed }: SmartCardProps) {
  const color = CARD_COLORS[card.card_type] || '#6366f1';
  const Icon = CARD_ICONS[card.card_type] || Sparkles;
  const payload = card.payload as Record<string, any>;

  const handleCTA = () => {
    onActed?.();

    switch (card.card_type) {
      case 'maps': {
        const { lat, lng, address } = payload;
        const query = lat && lng ? `${lat},${lng}` : encodeURIComponent(address || card.title);
        Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
        break;
      }
      case 'flight': {
        const url = payload.search_url ||
          `https://www.google.com/travel/flights?q=flights+from+${encodeURIComponent(payload.origin || '')}+to+${encodeURIComponent(payload.destination || '')}`;
        Linking.openURL(url);
        break;
      }
      case 'datetime': {
        if (payload.draft_message && onDraftMessage) {
          onDraftMessage(payload.draft_message);
        } else {
          const calUrl = RNPlatform.OS === 'ios' ? 'calshow:' : 'content://com.android.calendar/time/';
          Linking.openURL(calUrl);
        }
        break;
      }
      case 'reminder': {
        if (payload.draft_message && onDraftMessage) {
          onDraftMessage(payload.draft_message);
        }
        break;
      }
      case 'action': {
        if (payload.draft_message && onDraftMessage) {
          onDraftMessage(payload.draft_message);
        } else if (payload.action_url) {
          Linking.openURL(payload.action_url);
        }
        break;
      }
    }
  };

  const ctaLabel = (() => {
    switch (card.card_type) {
      case 'maps': return 'Open in Maps';
      case 'flight': return 'Search Flights';
      case 'datetime': return payload.draft_message ? 'Suggest in Chat' : 'Add to Calendar';
      case 'reminder': return payload.draft_message ? 'Send Now' : 'Set Reminder';
      case 'action': return payload.action_label || 'Take Action';
    }
  })();

  const width = compact ? 200 : 280;
  const titleSize = compact ? 14 : 16;
  const subtitleSize = compact ? 12 : 13;
  const ctaHeight = compact ? 32 : 40;
  const ctaFontSize = compact ? 13 : 14;

  return (
    <View style={{
      width,
      borderRadius: 16,
      backgroundColor: '#f9fafb',
      borderWidth: 1,
      borderColor: '#e5e7eb',
      padding: compact ? 10 : 14,
      gap: compact ? 6 : 10,
    }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={{
          width: compact ? 28 : 32,
          height: compact ? 28 : 32,
          borderRadius: compact ? 14 : 16,
          backgroundColor: color + '20',
          justifyContent: 'center',
          alignItems: 'center',
          marginRight: 8,
        }}>
          <Icon size={compact ? 14 : 16} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: titleSize, fontWeight: '600', color: '#111827' }} numberOfLines={1}>
            {card.title}
          </Text>
          {card.subtitle && (
            <Text style={{ fontSize: subtitleSize, color: '#6b7280', marginTop: 1 }} numberOfLines={compact ? 1 : 2}>
              {card.subtitle}
            </Text>
          )}
        </View>
        {!compact && onDismiss && (
          <TouchableOpacity onPress={onDismiss} style={{ padding: 2, marginLeft: 4 }}>
            <X size={16} color="#9ca3af" />
          </TouchableOpacity>
        )}
      </View>

      {/* Body — full cards only */}
      {!compact && card.card_type === 'maps' && payload.rating && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 13, color: '#f59e0b' }}>
            {'★'.repeat(Math.round(payload.rating))}{'☆'.repeat(5 - Math.round(payload.rating))}
          </Text>
          {payload.price_level && (
            <Text style={{ fontSize: 13, color: '#6b7280' }}>{payload.price_level}</Text>
          )}
        </View>
      )}

      {!compact && card.card_type === 'flight' && payload.origin_code && payload.dest_code && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 4 }}>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>{payload.origin_code}</Text>
            <Text style={{ fontSize: 11, color: '#6b7280' }}>{payload.origin}</Text>
          </View>
          <View style={{ flex: 1, height: 1, backgroundColor: '#d1d5db', marginHorizontal: 4 }} />
          <Plane size={14} color="#3b82f6" />
          <View style={{ flex: 1, height: 1, backgroundColor: '#d1d5db', marginHorizontal: 4 }} />
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>{payload.dest_code}</Text>
            <Text style={{ fontSize: 11, color: '#6b7280' }}>{payload.destination}</Text>
          </View>
        </View>
      )}

      {!compact && card.card_type === 'reminder' && payload.recurring && (
        <View style={{
          alignSelf: 'flex-start',
          backgroundColor: '#fef3c7',
          borderRadius: 8,
          paddingHorizontal: 8,
          paddingVertical: 3,
        }}>
          <Text style={{ fontSize: 11, color: '#92400e', fontWeight: '500' }}>
            {payload.frequency === 'weekly' ? 'Weekly' : 'Daily'}
          </Text>
        </View>
      )}

      {/* CTA */}
      <TouchableOpacity
        onPress={handleCTA}
        style={{
          backgroundColor: color,
          borderRadius: compact ? 8 : 10,
          height: ctaHeight,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#ffffff', fontSize: ctaFontSize, fontWeight: '600' }}>{ctaLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}
