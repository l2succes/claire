import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateLoop, type LoopDetail } from '../services/loops';
import { invalidateLoopQueries, patchLoopQueries } from '../services/loop-query-cache';
import { useAuthStore } from '../stores/authStore';

/** User approval applies exactly the displayed snapshot; Undo is versioned too. */
export function useLoopProposal(original: LoopDetail, changes: Record<string, unknown>) {
  const client = useQueryClient();
  const userId = useAuthStore(state => state.user?.id);
  const [version, setVersion] = useState(original.row_version);
  const [applied, setApplied] = useState<LoopDetail | null>(null);
  const patch = Object.fromEntries(Object.entries(changes).filter(([key]) => ['status', 'deadline', 'owner'].includes(key))) as Parameters<typeof updateLoop>[1];
  const mutation = useMutation({
    mutationFn: async (undo: boolean) => {
      const next = undo ? Object.fromEntries(Object.keys(patch).map(key => [key, original[key as keyof LoopDetail] ?? null])) : patch;
      return updateLoop(original.id, next, version);
    },
    onSuccess: async (row, undo) => {
      setApplied(undo ? null : row);
      setVersion(row.row_version);
      patchLoopQueries(client, userId, row.id, row);
      await invalidateLoopQueries(client, userId, row.id);
    },
  });
  return { mutation, patch, applied: !!applied };
}
