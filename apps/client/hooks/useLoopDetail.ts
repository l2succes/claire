import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchLoopDetail, type LoopAttentionItem, type LoopDetail, type LoopItem } from '../services/loops';

export function useLoopDetail(userId: string | undefined, loopId: string | undefined) {
  const queryClient = useQueryClient();
  // Home and attention cards can open detail before the Loops tab is visited.
  // Use the row already on screen while refreshing events and participants.
  const preview = queryClient.getQueryData<LoopItem[]>(['mobile-loops', userId])?.find((loop) => loop.id === loopId)
    ?? queryClient.getQueryData<LoopItem[]>(['mobile-home-loops', userId])?.find((loop) => loop.id === loopId)
    ?? queryClient.getQueryData<LoopAttentionItem[]>(['loop-attention', userId])?.find((item) => item.loop_id === loopId)?.loop;

  const query = useQuery<LoopDetail>({
    queryKey: ['loop-detail', loopId],
    enabled: !!loopId && !!userId,
    queryFn: () => fetchLoopDetail(String(loopId)),
    initialData: preview,
    initialDataUpdatedAt: preview ? 0 : undefined,
  });
  const status = (query.error as { status?: number } | null)?.status;
  const unavailable = status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429;
  const hasUsableData = !!userId && !!query.data && !(query.isError && unavailable);
  return { ...query, hasUsableData, refreshFailed: query.isError && hasUsableData };
}
