import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Check, CheckCheck, Clock, Pin, Sparkles, UserRound, UsersRound } from 'lucide-react-native';
import { colors, mobileType, space } from '@claire/design-system';
import { useState } from 'react';
import { PlatformBadge } from './PlatformIcon';
import { Platform } from '../types/platform';
import { formatInboxTimestamp } from '../utils/messageTimestamp';

interface MessageCardProps {
  message: {
    id: string;
    contact_name?: string;
    contact_avatar?: string;
    chat_name?: string;
    content: string;
    timestamp: string;
    from_me: boolean;
    is_group: boolean;
    status?: 'sent' | 'delivered' | 'read' | 'pending';
    unread_count?: number;
    has_ai_response?: boolean;
    has_open_loop?: boolean;
    platform?: Platform;
    is_pinned?: boolean;
  };
  variant?: 'default' | 'pinned' | 'recent';
  onPress: () => void;
  onLongPress?: () => void;
}

export function MessageCard({ message, variant = 'default', onPress, onLongPress }: MessageCardProps) {
  const [imageError, setImageError] = useState(false);
  const name = message.chat_name || message.contact_name || 'Unknown conversation';
  const isPinnedPresentation = variant === 'pinned';
  const isCompactPresentation = variant === 'recent';
  const statusIcon = message.status === 'read'
    ? <CheckCheck size={14} color={colors.focus} />
    : message.status === 'delivered'
      ? <CheckCheck size={14} color={colors.neutral[600]} />
      : message.status === 'sent'
        ? <Check size={14} color={colors.neutral[600]} />
        : message.status === 'pending'
          ? <Clock size={14} color={colors.warning} />
          : null;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}${message.unread_count ? `, ${message.unread_count} unread` : ''}`}
      testID={`message-card-${message.id}`}
      style={({ pressed }) => ({
        minHeight: isPinnedPresentation ? 82 : 70,
        marginHorizontal: isPinnedPresentation ? space[4] : 0,
        marginTop: isPinnedPresentation ? space[2] : 0,
        paddingHorizontal: isPinnedPresentation ? space[3] : space[4],
        paddingVertical: isPinnedPresentation ? 10 : space[3],
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        backgroundColor: isPinnedPresentation ? '#FFF8DC' : colors.cream,
        borderRadius: isPinnedPresentation ? 17 : 0,
        borderWidth: isPinnedPresentation ? 1 : 0,
        borderColor: isPinnedPresentation ? '#E5D69A' : 'transparent',
        borderBottomWidth: isPinnedPresentation ? 1 : 1,
        borderBottomColor: isPinnedPresentation ? '#E5D69A' : colors.neutral[200],
        opacity: pressed ? 0.64 : 1,
      })}
    >
      <View style={{ width: 42, height: 42, flexShrink: 0 }}>
        <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: message.is_group ? colors.sky : colors.blush, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {message.contact_avatar && !imageError ? (
            <Image source={{ uri: message.contact_avatar }} style={{ width: 42, height: 42 }} contentFit="cover" transition={120} onError={() => setImageError(true)} />
          ) : message.is_group ? <UsersRound size={20} color={colors.neutral[600]} /> : <UserRound size={20} color={colors.neutral[600]} />}
        </View>
        {message.platform ? <View style={{ position: 'absolute', right: -4, bottom: -3, borderRadius: 10, borderWidth: 2, borderColor: colors.cream, backgroundColor: colors.paper }}><PlatformBadge platform={message.platform} size={16} /></View> : null}
      </View>

      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          {message.is_pinned && !isPinnedPresentation ? <Pin size={13} color={colors.neutral[600]} fill={colors.neutral[600]} /> : null}
          <Text selectable numberOfLines={1} style={{ ...mobileType.body, flex: 1, fontWeight: message.unread_count ? '700' : '600', color: colors.ink }}>{name}</Text>
          <Text selectable testID="message-card-timestamp" style={{ ...mobileType.monoLabel, color: colors.neutral[400] }}>{formatInboxTimestamp(message.timestamp)}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          {message.from_me ? statusIcon : null}
          <Text selectable numberOfLines={1} style={{ ...mobileType.bodySmall, flex: 1, color: message.unread_count ? colors.neutral[800] : colors.neutral[600], fontWeight: message.unread_count ? '600' : '400' }}>
            {isCompactPresentation ? '' : message.from_me ? 'You: ' : ''}{message.content || 'Media'}
          </Text>
          {message.unread_count ? (
            <View style={{ minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ ...mobileType.label, color: colors.ink, fontVariant: ['tabular-nums'] }}>{message.unread_count}</Text>
            </View>
          ) : null}
        </View>
        {variant === 'default' && (message.has_open_loop || message.has_ai_response) ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], paddingTop: 2 }}>
            {message.has_open_loop ? <Text testID={`message-card-loop-badge-${message.id}`} style={{ ...mobileType.monoLabel, color: colors.warning }}>OPEN LOOP</Text> : null}
            {message.has_ai_response ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}><Sparkles size={11} color={colors.focus} /><Text style={{ ...mobileType.monoLabel, color: colors.focus }}>REPLY READY</Text></View> : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
