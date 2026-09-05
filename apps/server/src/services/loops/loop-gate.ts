/**
 * The free stage: decide whether a window is worth spending a model call on.
 *
 * This is the single largest cost lever in the pipeline — it is expected to
 * remove 70–85% of calls at zero token cost. It is also pure and deterministic,
 * so it is exhaustively testable and behaves identically on every provider.
 *
 * Bias: when unsure, RUN. A missed loop is worse than a wasted call, and the
 * eval measures exactly that trade.
 *
 * See /docs/plans/loops-revamp §5.
 */

import { hasBroadcastMention, type LoopSensitivity } from '@claire/platform-catalog';

import type { WindowMessage } from './relevance';

/** First-person commitment: the user or a counterparty binding themselves. */
const COMMISSIVE =
  /\b(i['’]?ll|i will|i shall|i promise|i commit|i guarantee|will do|will send|will call|will get|let me|on it|i got (it|this)|i'?m going to|im going to|gonna|going to)\b/i;

/** Asking someone to do something. */
const DIRECTIVE =
  /\b(can you|could you|would you|will you|please|need you to|are you able|mind (sending|doing|checking)|don'?t forget|remember to|remind me)\b/i;

/** A time reference that could become a deadline. */
const TEMPORAL =
  /\b(today|tonight|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|this week|next month|end of (day|week|month)|eod|eow|by \d|at \d{1,2}\s*(am|pm|:)|\d{1,2}[:/]\d{2}|\d{1,2}[/-]\d{1,2})\b/i;

/** Planning language that opens a loop before any date exists. */
const PLANNING =
  /\b(let'?s|we should|catch up|meet up|grab (coffee|lunch|dinner|drinks)|schedule|set up a|book a|sync up|get together)\b/i;

/**
 * Resolution language. This family is what makes auto-close possible at all —
 * without it the pipeline can open loops but never notices them completing.
 */
const RESOLUTION =
  /\b(works|sounds good|confirmed|see you|deal|ok let'?s|i'?ll be there|done|sorted|sent|booked|just did|finished|handled|took care of|all set|got it)\b/i;

export type GateReason =
  | 'open_loops_present'
  | 'commissive'
  | 'directive'
  | 'temporal'
  | 'planning'
  | 'resolution'
  | 'watch_term'
  | 'self_commissive';

export type GateSkipReason =
  | 'sensitivity_off'
  | 'detection_disabled'
  | 'window_empty'
  | 'window_too_short'
  | 'no_human_message'
  | 'no_signal'
  | 'backoff';

export interface GateInput {
  platform: string;
  sensitivity: LoopSensitivity;
  detectionEnabled: boolean;
  /** Messages new since the cursor, excluding the overlap tail. */
  delta: WindowMessage[];
  /** Live loops already open in this chat. State may have changed even with no new intent signal. */
  openLoopCount: number;
  watchTerms?: readonly string[];
  /** Consecutive prior runs that produced no ops, used to back off chatty but loop-free chats. */
  consecutiveEmpty: number;
}

export interface GateDecision {
  run: boolean;
  reasons: GateReason[];
  skipReason: GateSkipReason | null;
  /** Total characters of human text considered, for observability. */
  consideredChars: number;
}

/** Minimum human text before a window can possibly contain a commitment. */
const MIN_WINDOW_CHARS = 12;

/**
 * How many distinct signals a window must fire to survive backoff. A chat that
 * has produced nothing many times running has to clear a higher bar, but never
 * an impossible one — open loops always re-run so resolutions are never missed.
 */
function requiredSignalsFor(consecutiveEmpty: number): number {
  if (consecutiveEmpty >= 10) return 3;
  if (consecutiveEmpty >= 5) return 2;
  return 1;
}

/**
 * Bridge and system senders never open loops. Most bridges send these as
 * m.notice, which is dropped earlier, but business auto-replies are m.text.
 *
 * Matching "bot" is deliberately fussy. `\bbot` never fires inside "ShopBot"
 * (both sides are word characters), while a naive /bot$/i would swallow the
 * real surnames Abbot and Talbot. So: the bare word, a separated suffix, or a
 * camelCase boundary — case-sensitively, which is what distinguishes ShopBot
 * from Abbot.
 */
function isMachineSender(message: WindowMessage): boolean {
  const name = message.senderName.trim();
  if (!name) return false;
  if (/^(bot|system|notice|no-?reply|automated)$/i.test(name)) return true;
  if (/[\s_.-](bot|assistant|notifications?)$/i.test(name)) return true;
  return /[a-z0-9]Bot$/.test(name);
}

export function evaluateGate(input: GateInput): GateDecision {
  const reasons: GateReason[] = [];
  const empty = (skipReason: GateSkipReason): GateDecision => ({
    run: false,
    reasons,
    skipReason,
    consideredChars: 0,
  });

  if (input.sensitivity === 'off') return empty('sensitivity_off');
  if (!input.detectionEnabled) return empty('detection_disabled');
  if (!input.delta.length && input.openLoopCount === 0) return empty('window_empty');

  const human = input.delta.filter((m) => !isMachineSender(m));
  const consideredChars = human.reduce((total, m) => total + m.content.trim().length, 0);

  // An open loop always justifies a pass: the window may contain the message
  // that resolves it, and resolution language alone is often too weak to fire
  // any other signal ("done", "ok"). This is why the pipeline can auto-close.
  if (input.openLoopCount > 0) {
    reasons.push('open_loops_present');
  }

  if (!human.length && !reasons.length) return empty('no_human_message');

  if (consideredChars < MIN_WINDOW_CHARS && !reasons.length) {
    return { run: false, reasons, skipReason: 'window_too_short', consideredChars };
  }

  const haystack = human.map((m) => m.content).join('\n');

  if (COMMISSIVE.test(haystack)) reasons.push('commissive');
  if (DIRECTIVE.test(haystack)) reasons.push('directive');
  if (TEMPORAL.test(haystack)) reasons.push('temporal');
  if (PLANNING.test(haystack)) reasons.push('planning');
  if (RESOLUTION.test(haystack)) reasons.push('resolution');

  const watchTerms = input.watchTerms ?? [];
  if (watchTerms.length) {
    const lowered = haystack.toLowerCase();
    if (watchTerms.some((term) => term && lowered.includes(term.toLowerCase()))) {
      reasons.push('watch_term');
    }
  }

  // The user binding themselves is the strongest possible signal and bypasses
  // backoff entirely — their own commitment must never be dropped for cost.
  const selfCommissive = human.some((m) => m.isSelf && COMMISSIVE.test(m.content));
  if (selfCommissive) reasons.push('self_commissive');

  if (!reasons.length) {
    return { run: false, reasons, skipReason: 'no_signal', consideredChars };
  }

  const bypassesBackoff =
    selfCommissive || reasons.includes('open_loops_present') || reasons.includes('watch_term');

  if (!bypassesBackoff && reasons.length < requiredSignalsFor(input.consecutiveEmpty)) {
    return { run: false, reasons, skipReason: 'backoff', consideredChars };
  }

  return { run: true, reasons, skipReason: null, consideredChars };
}

/**
 * A broadcast mention is not a gate skip — an @channel announcement can still
 * contain the user's own commitment. It is scored as a suppressor in
 * relevance.ts instead, where it can be weighed against other signals.
 */
export function windowHasBroadcast(platform: string, window: WindowMessage[]): boolean {
  return window.some((m) => m.mentionsRoom || hasBroadcastMention(platform, m.content));
}

export const GATE_PATTERNS = {
  COMMISSIVE,
  DIRECTIVE,
  TEMPORAL,
  PLANNING,
  RESOLUTION,
} as const;
