import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, ChevronLeft, RotateCcw } from 'lucide-react-native';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { MobileAvatar, MobileHeader, MobileIconButton, MobileState } from '../../components/mobile/claire-mobile';
import { useAuthStore } from '../../stores/authStore';
import {
  markAllInAppNotificationsRead,
  markInAppNotificationsRead,
  notificationFeedKey,
  useInAppNotifications,
} from '../../hooks/useInAppNotifications';
import { groupNotifications, type NotificationGroup } from './notification-groups';

function NotificationRow({ group, onPress }: { group: NotificationGroup; onPress: () => void }) {
  const item = group.latest;
  const isMessage = item.kind === 'message';
  const title = isMessage && item.is_group ? item.chat_name || 'Group chat' : item.title;
  const subtitle = isMessage && item.is_group
    ? `${item.sender_name || 'Someone'}: ${item.body}`
    : item.body;
  const time = new Date(item.created_at);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${group.unread ? 'Unread ' : ''}${title}. ${subtitle}`}
      onPress={onPress}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: space[3],
        paddingHorizontal: space[4], paddingVertical: space[3], minHeight: 82,
        backgroundColor: group.unread ? colors.sky : colors.paper,
        borderBottomWidth: 1, borderBottomColor: colors.neutral[200],
      }}
    >
      {isMessage ? (
        <MobileAvatar name={title} uri={item.avatar_url} isGroup={item.is_group} size={48} />
      ) : (
        <View style={{ width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.lime }}>
          <RotateCcw size={21} color={colors.ink} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <Text numberOfLines={1} style={{ flex: 1, ...mobileType.body, fontWeight: group.unread ? '800' : '700', color: colors.ink }}>{title}</Text>
          {group.unread ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.ink }} /> : null}
        </View>
        <Text numberOfLines={2} style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{subtitle}</Text>
        <Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>
          {group.ids.length > 1 ? `${group.ids.length} messages · ` : ''}
          {Number.isNaN(time.getTime()) ? '' : time.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </Text>
      </View>
    </Pressable>
  );
}

export function NotificationsScreen() {
  const userId = useAuthStore(state => state.user?.id);
  const queryClient = useQueryClient();
  const query = useInAppNotifications();
  const [saving, setSaving] = useState(false);
  const groups = useMemo(() => groupNotifications(query.data?.items ?? []), [query.data?.items]);
  const refresh = () => void query.refetch();

  const openGroup = (group: NotificationGroup) => {
    const item = group.latest;
    if (userId && group.unread) {
      void markInAppNotificationsRead(userId, group.ids)
        .then(() => queryClient.invalidateQueries({ queryKey: notificationFeedKey(userId) }))
        .catch(error => console.warn('Could not mark notification read:', error));
    }
    if (item.kind === 'loop' && item.loop_id) {
      router.push({ pathname: '/loops/[id]', params: { id: item.loop_id } });
    } else if (item.kind === 'message' && item.chat_id) {
      router.push({ pathname: '/chat/[chatId]', params: {
        chatId: item.chat_id,
        ...(item.message_id ? { highlightMessageId: item.message_id } : {}),
        chat_name: item.chat_name || '',
        contact_name: item.sender_name || '',
        platform: item.platform || '',
        is_group: item.is_group ? '1' : '0',
      } });
    }
  };

  const markAllRead = async () => {
    if (!userId || saving) return;
    setSaving(true);
    try {
      await markAllInAppNotificationsRead(userId);
      await queryClient.invalidateQueries({ queryKey: notificationFeedKey(userId) });
    } catch (error) {
      console.warn('Could not mark notifications read:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View testID="notifications-screen" style={{ flex: 1, backgroundColor: colors.cream }}>
      <MobileHeader
        title="Notifications"
        subtitle="Messages and follow-ups, all in one place."
        safeArea
        leading={<MobileIconButton label="Back" onPress={() => router.back()}><ChevronLeft size={22} color={colors.ink} /></MobileIconButton>}
        actions={query.data?.unreadCount ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Mark all notifications read" disabled={saving} onPress={() => void markAllRead()} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, padding: space[2] }}>
            <CheckCheck size={18} color={colors.ink} />
            <Text style={{ ...mobileType.label, color: colors.ink }}>Mark all read</Text>
          </Pressable>
        ) : undefined}
      />
      {query.isPending ? (
        <View style={{ padding: space[6] }}><ActivityIndicator color={colors.ink} /></View>
      ) : query.isError ? (
        <MobileState title="Couldn't load notifications" message="Check your connection and try again." action={
          <Pressable accessibilityRole="button" onPress={refresh} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ ...mobileType.bodySmall, fontWeight: '800', color: colors.ink }}>Try again</Text>
          </Pressable>
        } />
      ) : groups.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space[6], gap: space[3] }}>
          <Bell size={28} color={colors.ink} />
          <Text style={{ ...mobileType.body, fontWeight: '800', color: colors.ink }}>All caught up</Text>
          <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600], textAlign: 'center' }}>New message and follow-up alerts will appear here, even if push alerts are off.</Text>
        </View>
      ) : (
        <ScrollView refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={refresh} tintColor={colors.ink} />} contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 32 }}>
          <View style={{ borderWidth: 1, borderColor: colors.neutral[200], borderRadius: radius.card, overflow: 'hidden', backgroundColor: colors.paper }}>
            {groups.map(group => <NotificationRow key={group.latest.id} group={group} onPress={() => openGroup(group)} />)}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
