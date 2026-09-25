export const STALE_PROPOSAL_DAYS = 7;
const DAY_MS = 86_400_000;

export function staleProposalCutoff(now = new Date()): string {
  return new Date(now.getTime() - STALE_PROPOSAL_DAYS * DAY_MS).toISOString();
}

/**
 * Previously expired unconfirmed proposals inferred by the detector. An agreed loop,
 * a user-authored reminder, or a deliberately snoozed loop is never closed by
 * age alone; those go through the user's stale-loop review queue instead.
 */
export async function expireStaleProposals(_now = new Date()): Promise<number> {
  // Kept as a compatibility entry point. Aging is review work, never proof of
  // cancellation or completion. refresh_loop_reviews persists that attention.
  return 0;
}
