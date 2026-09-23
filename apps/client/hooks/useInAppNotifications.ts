import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../stores/authStore';

export interface InAppNotification {
  id: string;
  kind: 'message' | 'loop';
  chat_id: string | null;
  message_id: string | null;
  loop_id: string | null;
  title: string;
  body: string;
  sender_name: string | null;
  chat_name: string | null;
  avatar_url: string | null;
  platform: string | null;
  is_group: boolean;
  created_at: string;
  read_at: string | null;
}

const SELECT = 'id,kind,chat_id,message_id,loop_id,title,body,sender_name,chat_name,avatar_url,platform,is_group,created_at,read_at';
export const notificationFeedKey = (userId?: string) => ['in-app-notifications', userId] as const;

async function fetchNotifications(userId: string): Promise<{ items: InAppNotification[]; unreadCount: number }> {
  const [itemsResult, countResult] = await Promise.all([
    supabase.from('in_app_notifications').select(SELECT).eq('user_id', userId)
      .order('created_at', { ascending: false }).limit(100),
    supabase.from('in_app_notifications').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).is('read_at', null),
  ]);
  if (itemsResult.error) throw itemsResult.error;
  if (countResult.error) throw countResult.error;
  return { items: (itemsResult.data ?? []) as InAppNotification[], unreadCount: countResult.count ?? 0 };
}

export function useInAppNotifications() {
  const userId = useAuthStore(state => state.user?.id);
  return useQuery({
    queryKey: notificationFeedKey(userId),
    enabled: !!userId,
    queryFn: () => fetchNotifications(userId!),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export async function markInAppNotificationsRead(userId: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase.from('in_app_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId).in('id', ids).is('read_at', null);
  if (error) throw error;
}

export async function markAllInAppNotificationsRead(userId: string): Promise<void> {
  const { error } = await supabase.from('in_app_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId).is('read_at', null);
  if (error) throw error;
}

export async function markInAppConversationRead(userId: string, chatId: string): Promise<void> {
  const { error } = await supabase.from('in_app_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId).eq('chat_id', chatId).is('read_at', null);
  if (error) throw error;
}

export async function markInAppLoopRead(userId: string, loopId: string): Promise<void> {
  const { error } = await supabase.from('in_app_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId).eq('loop_id', loopId).is('read_at', null);
  if (error) throw error;
}

/** Keep Home's badge and the feed current after a foreground return or insert. */
export function useInAppNotificationRealtime(userId?: string) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    const refresh = () => { void queryClient.invalidateQueries({ queryKey: notificationFeedKey(userId) }); };
    const foreground = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    const channel = supabase.channel(`in-app-notifications:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'in_app_notifications', filter: `user_id=eq.${userId}` }, refresh)
      .subscribe();
    return () => { foreground.remove(); void supabase.removeChannel(channel); };
  }, [queryClient, userId]);
}
