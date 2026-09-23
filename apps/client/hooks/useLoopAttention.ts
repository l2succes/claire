import { useQuery } from '@tanstack/react-query';
import { fetchLoopAttention, fetchLoopHealth } from '../services/loops';
import { useAuthStore } from '../stores/authStore';

/** Same durable attention queue the reminder worker maintains. */
export function useLoopAttention() {
  const userId = useAuthStore(state => state.user?.id);
  return useQuery({
    queryKey: ['loop-attention', userId], enabled: !!userId,
    queryFn: fetchLoopAttention, staleTime: 30_000, refetchInterval: 60_000,
  });
}

export function useLoopHealth() {
  const userId = useAuthStore(state => state.user?.id);
  const query = useQuery({ queryKey: ['loop-health', userId], enabled: !!userId, queryFn: fetchLoopHealth, staleTime: 30_000 });
  const health = query.data;
  const message = !health ? null
    : health.preferences?.aiEnabled === false ? 'AI processing is off. Claire is not tracking new follow-ups.'
    : health.preferences?.detectionEnabled === false ? 'Loop detection is off. Turn it on to track new follow-ups.'
    : health.detectionMode === 'off' || health.shadow ? 'Claire’s automatic follow-up processing is paused.'
    : !health.notificationsEnabled || health.preferences?.notificationsEnabled === false || health.preferences?.notifyLoops === false ? 'Follow-up notifications are off. Your loops remain available here.'
    : !health.enabledDevices ? 'No device is registered for follow-up notifications. Enable notifications on your device.'
    : health.oldestDirtyAt && Date.now() - Date.parse(health.oldestDirtyAt) > 15 * 60_000 ? 'Claire is catching up on conversations. Some follow-ups may be delayed.'
    : null;
  return { ...query, message };
}
