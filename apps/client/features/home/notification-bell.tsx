import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { colors, mobileType } from '@claire/design-system';
import { useInAppNotifications } from '../../hooks/useInAppNotifications';

export function NotificationBell() {
  const { data } = useInAppNotifications();
  const unread = data?.unreadCount ?? 0;
  return (
    <Pressable
      testID="home-notifications"
      accessibilityRole="button"
      accessibilityLabel={`Notifications${unread ? `, ${unread} unread` : ''}`}
      onPress={() => router.push('/notifications')}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: colors.paper }}
    >
      <Bell size={21} color={colors.ink} />
      {unread > 0 ? (
        <View style={{ position: 'absolute', top: -5, right: -5, minWidth: 19, height: 19, paddingHorizontal: 3, borderRadius: 10, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.cream }}>
          <Text style={{ ...mobileType.monoLabel, fontSize: 9, lineHeight: 12, color: colors.paper }}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
