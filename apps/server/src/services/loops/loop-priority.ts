export type LoopOwner = 'me' | 'them' | 'shared' | 'unknown';
export type LoopState = 'proposed' | 'negotiating' | 'pending_confirmation' | 'agreed' | 'resolved';

export interface PriorityInput {
  status: string;
  visibility: string;
  owner: LoopOwner;
  state: LoopState | null;
  deadline: string | null;
  snoozedUntil?: string | null;
  confidence: number;
  relevance: number;
  lastEvidenceAt?: string | null;
  override?: number | null;
  now?: Date;
}

export interface PriorityResult {
  score: number;
  eligible: boolean;
  breakdown: Record<string, number | boolean>;
}

export function calculateLoopPriority(input: PriorityInput): PriorityResult {
  const now = input.now ?? new Date();
  const quiet = input.visibility !== 'surfaced' || !['open', 'waiting'].includes(input.status)
    || !!input.snoozedUntil && new Date(input.snoozedUntil) > now;
  if (quiet) return { score: 0, eligible: false, breakdown: { eligible: false } };
  const due = input.deadline ? new Date(input.deadline) : null;
  const days = due ? (due.getTime() - now.getTime()) / 86_400_000 : Infinity;
  // A stale, long-overdue loop should not crowd out a genuinely imminent one.
  // We still surface it, but reserve the top urgency band for the last 48h.
  const urgency = days < 0
    ? days >= -2 ? 35 : days >= -7 ? 8 : 0
    : days < 1 ? 27 : days <= 3 ? 20 : days <= 7 ? 10 : 0;
  const responsibility = input.owner === 'me' ? 15 : input.owner === 'shared' ? 10 : input.owner === 'them' ? 7 : 0;
  const commitment = input.state === 'agreed' ? 12 : input.state === 'pending_confirmation' ? 8 : input.state === 'negotiating' ? 3 : 0;
  const relevance = Math.round(Math.max(0, Math.min(1, input.relevance)) * 12);
  const confidence = Math.round(Math.max(0, Math.min(1, input.confidence)) * 8);
  const ageDays = input.lastEvidenceAt ? (now.getTime() - new Date(input.lastEvidenceAt).getTime()) / 86_400_000 : 0;
  const freshness = ageDays >= 3 && ageDays <= 21 ? 8 : ageDays >= 1 ? 4 : 0;
  const override = Math.max(-25, Math.min(25, input.override ?? 0));
  return { score: Math.max(0, Math.min(100, urgency + responsibility + commitment + relevance + confidence + freshness + override)), eligible: true, breakdown: { eligible: true, urgency, responsibility, commitment, relevance, confidence, freshness, override } };
}
