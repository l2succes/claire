import { logger } from '../../utils/logger';
import { supabase } from '../supabase';
import { recordEvent } from './loop-store';

export const STALE_PROPOSAL_DAYS = 7;
const DAY_MS = 86_400_000;

interface StaleProposalRow {
  id: string;
  user_id: string;
  title: string | null;
  content: string;
  last_evidence_at: string;
}

export function staleProposalCutoff(now = new Date()): string {
  return new Date(now.getTime() - STALE_PROPOSAL_DAYS * DAY_MS).toISOString();
}

/**
 * Expire only unconfirmed proposals inferred by the detector. An agreed loop,
 * a user-authored reminder, or a deliberately snoozed loop is never closed by
 * age alone; those go through the user's stale-loop review queue instead.
 */
export async function expireStaleProposals(now = new Date()): Promise<number> {
  const cutoff = staleProposalCutoff(now);
  const { data, error } = await supabase
    .from('loops')
    .select('id,user_id,title,content,last_evidence_at')
    .eq('source', 'detector')
    .eq('visibility', 'surfaced')
    .in('status', ['open', 'waiting'])
    .in('thread_state', ['proposed', 'negotiating'])
    .not('last_evidence_at', 'is', null)
    .lte('last_evidence_at', cutoff)
    .limit(500);

  if (error) {
    logger.error('[loops] failed to load stale proposals:', error.message);
    return 0;
  }

  let expired = 0;
  for (const loop of (data || []) as StaleProposalRow[]) {
    const { data: applied, error: updateError } = await supabase
      .from('loops')
      .update({
        status: 'dropped',
        thread_state: 'resolved',
        resolution: 'expired',
        resolved_at: now.toISOString(),
      })
      .eq('id', loop.id)
      .eq('user_id', loop.user_id)
      .in('status', ['open', 'waiting'])
      .select('id')
      .maybeSingle();

    if (updateError) {
      logger.warn('[loops] failed to expire stale proposal', { loopId: loop.id, error: updateError.message });
      continue;
    }
    if (!applied) continue;

    await recordEvent({
      loopId: loop.id,
      userId: loop.user_id,
      kind: 'resolved',
      actor: 'system',
      summary: `Expired after ${STALE_PROPOSAL_DAYS} days without confirmation`,
      payload: { resolution: 'expired', lastEvidenceAt: loop.last_evidence_at },
      occurredAt: now.toISOString(),
    });
    expired += 1;
  }

  if (expired) logger.info('[loops] expired stale proposals', { expired, cutoff });
  return expired;
}
