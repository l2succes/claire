import { memo } from 'react';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { User } from 'lucide-react-native';
import { Platform } from '../types/platform';

export interface UnifiedUpdateContact {
  id: string;
  name?: string | null;
  phone_number?: string | null;
  avatar_url?: string | null;
  platform?: Platform | null;
}

interface UnifiedUpdatesRailProps {
  contacts: UnifiedUpdateContact[];
  ownAvatarUrl?: string | null;
}

const PLATFORM_RING_COLORS: Record<Platform, string> = {
  [Platform.WHATSAPP]: '#22c55e',
  [Platform.TELEGRAM]: '#38bdf8',
  [Platform.INSTAGRAM]: '#ec4899',
  [Platform.IMESSAGE]: '#6366f1',
};

function UpdateBubble({
  label,
  avatarUrl,
  platform,
  isOwn = false,
}: {
  label: string;
  avatarUrl?: string | null;
  platform?: Platform | null;
  isOwn?: boolean;
}) {
  const ringColor = isOwn ? '#22c55e' : PLATFORM_RING_COLORS[platform || Platform.WHATSAPP];
  const testLabel = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`${label} update`}
      testID={`unified-update-${isOwn ? 'own' : `${platform || 'unknown'}-${testLabel}`}`}
      className="items-center mr-4"
      activeOpacity={0.8}
    >
      <View
        className="w-[68px] h-[68px] rounded-full border-[3px] items-center justify-center"
        style={{ borderColor: ringColor }}
      >
        <View className="w-[58px] h-[58px] rounded-full bg-gray-100 dark:bg-gray-700 items-center justify-center overflow-hidden">
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} className="w-full h-full" />
          ) : (
            <User size={28} color="#6b7280" />
          )}
        </View>
        {isOwn && (
          <View className="absolute right-0 bottom-0 w-6 h-6 rounded-full bg-green-500 border-2 border-white dark:border-gray-800 items-center justify-center">
            <Text className="text-white text-sm font-bold">+</Text>
          </View>
        )}
      </View>
      <Text className="text-xs text-gray-700 dark:text-gray-300 mt-1.5 max-w-[72px]" numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export const UnifiedUpdatesRail = memo(function UnifiedUpdatesRail({
  contacts,
  ownAvatarUrl,
}: UnifiedUpdatesRailProps) {
  return (
    <View className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 py-3" testID="unified-updates-rail">
      <Text className="px-4 mb-2 text-sm font-semibold text-gray-900 dark:text-white">
        Updates
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
        <UpdateBubble label="Your update" avatarUrl={ownAvatarUrl} isOwn />
        {contacts.map((contact) => (
          <UpdateBubble
            key={`${contact.platform || 'unknown'}:${contact.id}`}
            label={contact.name || contact.phone_number || 'Contact'}
            avatarUrl={contact.avatar_url}
            platform={contact.platform}
          />
        ))}
      </ScrollView>
    </View>
  );
});
