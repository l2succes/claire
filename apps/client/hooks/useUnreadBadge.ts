import { useEffect, useState } from 'react';
import { host, useBadgeCount } from '@claire/host';
import { useAuthStore } from '../stores/authStore';
import { supabase } from '../services/supabase';

/**
 * Mirrors the unified unread total on the host's Dock/taskbar badge.
 *
 * The count is summed in the database rather than derived from the loaded
 * inbox page, because the badge has to reflect every conversation, not just
 * the ones currently paged into the list.
 *
 * Hosts without a badge (a phone, a plain browser tab) skip the query
 * entirely — there is no point paying for a round trip whose result nothing
 * can display.
 */
export function useUnreadBadge(): void {
  const userId = useAuthStore((state) => state.user?.id);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [total, setTotal] = useState(0);

  const enabled = host.capabilities.badge && isAuthenticated && Boolean(userId);

  useEffect(() => {
    if (!enabled || !userId) {
      setTotal(0);
      return;
    }

    let cancelled = false;

    const refresh = async () => {
      const { data, error } = await supabase
        .from('chats')
        .select('unread_count')
        .eq('user_id', userId)
        .gt('unread_count', 0);

      if (cancelled || error || !data) return;
      setTotal(
        data.reduce(
          (sum: number, row: { unread_count?: number | null }) => sum + (row.unread_count ?? 0),
          0,
        ),
      );
    };

    void refresh();

    // Reuse the realtime stream the inbox already subscribes to rather than
    // polling; the badge only needs to move when a chat row does.
    const channel = supabase
      .channel(`unread-badge-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chats', filter: `user_id=eq.${userId}` },
        () => void refresh(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [enabled, userId]);

  useBadgeCount(enabled ? total : 0);
}
