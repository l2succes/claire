import { supabase } from '../supabase';

export interface LoopTransition {
  userId: string;
  loopId: string;
  expectedVersion: number;
  patch: Record<string, unknown>;
  actor: 'user' | 'detector' | 'system';
  kind: string;
  summary: string;
  payload?: Record<string, unknown>;
  operationKey?: string;
}

/** Version check, human precedence, canonical state and event commit together. */
export async function transitionLoop(input: LoopTransition): Promise<Record<string, any>> {
  const { data, error } = await supabase.rpc('apply_loop_transition', {
    p_user_id: input.userId, p_loop_id: input.loopId,
    p_expected_version: input.expectedVersion, p_patch: input.patch,
    p_actor: input.actor, p_kind: input.kind, p_summary: input.summary,
    p_payload: input.payload ?? {}, p_operation_key: input.operationKey ?? null,
  });
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  if (!data) throw new Error('Loop transition returned no row');
  return data;
}

export function loopMutationError(error: unknown): { status: number; error: string } {
  const code = (error as { code?: string })?.code;
  if (code === '40001') return { status: 409, error: 'This loop changed. Refresh and review it again.' };
  if (code === '23514') return { status: 409, error: (error as Error).message };
  return { status: 500, error: 'Failed to update loop' };
}
