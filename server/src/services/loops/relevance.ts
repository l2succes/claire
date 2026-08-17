/**
 * Does this conversation actually concern the user?
 *
 * This is the single most important decision in the loop pipeline. Today's
 * detector has no answer for it — it sees one message with no group flag and no
 * sense of who the user is — so every commitment anyone makes in any group
 * becomes the user's loop. That is the biggest source of noise in the product.
 *
 * Three properties this file is built around:
 *
 *  1. **Deterministic.** No model call. It costs nothing, it is auditable, and
 *     it does not change behavior when the provider is swapped. Getting this
 *     wrong surfaces other people's business to the user, so it must not be a
 *     model output. See docs/AI_MODEL_SELECTION_AND_COSTS.md §3.
 *  2. **Pure.** No I/O. Every branch is table-testable.
 *  3. **Explainable.** Every decision returns the signals that produced it,
 *     stored on the loop so "why didn't Claire catch this?" is answerable.
 *
 * See docs/LOOPS_REVAMP_PLAN.md §6.
 */

import { loopSemanticsFor, type LoopSensitivity } from '@claire/platform-catalog';

export type { LoopSensitivity };

/** Who the user is, across every alias a bridge might render them as. */
export interface SelfIdentity {
  userId: string;
  /** Display names and first names, already normalized. */
  displayNames: string[];
  /** Handles without the leading @, already normalized. */
  handles: string[];
  /** Phone numbers reduced to their last 9 digits. */
  phones: string[];
  /** Platform contact ids for this user, used to match structured mentions. */
  contactIds: string[];
}

export interface WindowMessage {
  id: string;
  /** Short handle given to the model, e.g. "m7". */
  ref: string;
  senderName: string;
  isSelf: boolean;
  content: string;
  at: string;
  /** Structured mentions as platform contact ids. */
  mentions?: string[];
  /** @channel / @here / @everyone — addresses everyone, not one person. */
  mentionsRoom?: boolean;
  /** Set when this message replies to another in the same window. */
  replyToId?: string;
}

export interface ParticipantRef {
  identityKey: string;
  displayName: string;
  contactId?: string | null;
  isSelf?: boolean;
}

export interface RelevanceInput {
  platform: string;
  isGroup: boolean;
  /** Real audience size where the bridge reports it. */
  memberCount?: number | null;
  self: SelfIdentity;
  /** The full detection window, used for conversational adjacency. */
  window: WindowMessage[];
  /** The messages the model cited as evidence for this loop. */
  evidence: WindowMessage[];
  roster: ParticipantRef[];
  watchTerms?: readonly string[];
  /** Owner as judged by the extraction step. */
  llmOwner?: 'me' | 'them' | 'shared' | 'unknown';
  llmAddressed?: boolean;
  /** Name of the assignee when the model says someone else owes the work. */
  llmOwnerName?: string | null;
}

export interface RelevanceSignal {
  id: string;
  hit: boolean;
  weight: number;
  note?: string;
}

export interface RelevanceResult {
  score: number;
  addressed: boolean;
  /** Set when a hard-pass signal fired, bypassing the threshold. */
  hardPass: string | null;
  signals: RelevanceSignal[];
  reasons: string[];
}

/**
 * Base score. Chosen so that a group message with no positive signal at all
 * lands at 0.10 — comfortably below every threshold except `high`.
 */
const BASE_SCORE = 0.35;

const WEIGHTS = {
  mention_exact: 0.45,
  reply_to_me: 0.4,
  llm_assigned_to_me: 0.35,
  second_person_after_self: 0.3,
  watch_term: 0.3,
  last_speaker: 0.15,
  small_group: 0.15,
  named_other: -0.55,
  broadcast_mention: -0.35,
  broadcast: -0.3,
  no_self_signal: -0.25,
} as const;

/** First-person commitment. "I'll send it", "I promise", "let me grab that". */
const COMMISSIVE = /\b(i['’]?ll|i will|i'?m going to|im going to|i can|i shall|i promise|i commit|let me|on it|i got (it|this)|will do)\b/i;

/** Second-person address. Deliberately narrow — "you" is very common. */
const SECOND_PERSON = /\b(you|your|you'?re|u|ur)\b/i;

/** How many messages back from the evidence still count as "just spoke". */
const ADJACENCY_WINDOW = 3;

/** Normalize a name or handle for comparison across bridges. */
export function normalizeAlias(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Reduce a phone number to its last 9 digits, which survives country-code drift. */
export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.length > 9 ? digits.slice(-9) : digits;
}

/** Threshold a loop must clear to be surfaced at a given sensitivity. */
export function relevanceThreshold(sensitivity: LoopSensitivity): number {
  switch (sensitivity) {
    case 'off':
      return Number.POSITIVE_INFINITY;
    case 'low':
      return 0.8;
    // `high` means "watch this conversation closely": surface ambient and
    // unclaimed items too, and suppress only what is explicitly someone
    // else's. A signal-free message scores 0.10, so this is the floor that
    // admits it while `named_other` (which clamps to 0) still does not.
    case 'high':
      return 0.1;
    case 'normal':
    default:
      return 0.55;
  }
}

/**
 * Clamp to 0..1 and round to 4dp.
 *
 * The rounding is load-bearing, not cosmetic: summing the weights accumulates
 * IEEE-754 error (0.35 - 0.25 yields 0.09999999999999998), which makes a score
 * that should sit exactly on a threshold fall just under it. It also keeps the
 * stored `relevance_signals` readable.
 */
function clamp01(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 10_000) / 10_000;
}

/** Does this text name the user, by any alias? */
function mentionsSelfByText(text: string, self: SelfIdentity): boolean {
  if (!text) return false;
  const aliases = [...self.displayNames, ...self.handles].filter(Boolean);
  if (!aliases.length) return false;

  // Match "@alias" or a standalone alias token. Compare normalized so
  // punctuation and accents in either the message or the alias don't matter.
  const tokens = text.split(/[\s,.;:!?()[\]{}"'“”]+/).filter(Boolean);
  for (const raw of tokens) {
    const token = normalizeAlias(raw.replace(/^@/, ''));
    if (token && aliases.includes(token)) return true;
  }

  const digits = normalizePhone(text);
  return digits.length >= 9 && self.phones.some((phone) => digits.includes(phone));
}

/** Does this message's structured mention list include the user? */
function mentionsSelfStructurally(message: WindowMessage, self: SelfIdentity): boolean {
  if (!message.mentions?.length || !self.contactIds.length) return false;
  return message.mentions.some((id) => self.contactIds.includes(id));
}

/**
 * Score how strongly a candidate loop concerns the user.
 *
 * Two signals are hard passes and bypass the threshold entirely: a 1:1 DM
 * (there is nobody else it could concern) and the user having committed to
 * something themselves (their own words bind them regardless of audience).
 */
export function scoreRelevance(input: RelevanceInput): RelevanceResult {
  const signals: RelevanceSignal[] = [];
  const reasons: string[] = [];
  const evidence = input.evidence.length ? input.evidence : input.window.slice(-1);

  const record = (id: string, hit: boolean, weight: number, note?: string) => {
    signals.push({ id, hit, weight: hit ? weight : 0, note });
    if (hit && note) reasons.push(note);
    return hit;
  };

  // --- Hard passes ---------------------------------------------------------

  if (!input.isGroup) {
    record('dm', true, 0, 'Direct conversation — nobody else it could concern');
    return { score: 1, addressed: true, hardPass: 'dm', signals, reasons };
  }
  record('dm', false, 0);

  const selfCommitted = evidence.some((m) => m.isSelf && COMMISSIVE.test(m.content));
  if (record('self_commitment', selfCommitted, 0, 'You committed to this yourself')) {
    return { score: 1, addressed: true, hardPass: 'self_commitment', signals, reasons };
  }

  // --- Positive signals ----------------------------------------------------

  const structuralMention = evidence.some((m) => mentionsSelfStructurally(m, input.self));
  const textualMention = evidence.some((m) => mentionsSelfByText(m.content, input.self));
  const mentioned = structuralMention || textualMention;
  record(
    'mention_exact',
    mentioned,
    WEIGHTS.mention_exact,
    mentioned ? (structuralMention ? 'You were mentioned' : 'Your name appears in the message') : undefined,
  );

  const selfMessageIds = new Set(input.window.filter((m) => m.isSelf).map((m) => m.id));
  const repliedToSelf = evidence.some((m) => m.replyToId && selfMessageIds.has(m.replyToId));
  record('reply_to_me', repliedToSelf, WEIGHTS.reply_to_me, repliedToSelf ? 'Replies to something you sent' : undefined);

  const assignedToMe = input.llmOwner === 'me' || input.llmAddressed === true;
  record('llm_assigned_to_me', assignedToMe, WEIGHTS.llm_assigned_to_me, assignedToMe ? 'Addressed to you' : undefined);

  // Second person only counts near something the user said — otherwise "you"
  // in a group is almost always aimed at whoever spoke last, not the user.
  const spokeRecently = (() => {
    const firstEvidenceIndex = input.window.findIndex((m) => m.id === evidence[0]?.id);
    if (firstEvidenceIndex < 0) return false;
    const start = Math.max(0, firstEvidenceIndex - ADJACENCY_WINDOW);
    return input.window.slice(start, firstEvidenceIndex).some((m) => m.isSelf);
  })();
  const secondPerson = spokeRecently && evidence.some((m) => !m.isSelf && SECOND_PERSON.test(m.content));
  record('second_person_after_self', secondPerson, WEIGHTS.second_person_after_self,
    secondPerson ? 'Addressed in second person right after you spoke' : undefined);

  const watchTerms = input.watchTerms ?? [];
  const watchHit = watchTerms.length > 0 && evidence.some((m) => {
    const haystack = m.content.toLowerCase();
    return watchTerms.some((term) => term && haystack.includes(term.toLowerCase()));
  });
  record('watch_term', watchHit, WEIGHTS.watch_term, watchHit ? 'Matches a term you asked to watch' : undefined);

  const lastThree = input.window.slice(-ADJACENCY_WINDOW);
  const lastSpeaker = lastThree.some((m) => m.isSelf);
  record('last_speaker', lastSpeaker, WEIGHTS.last_speaker);

  // Audience size. member_count is the real figure; the sender-derived roster
  // badly understates a large channel where few people post.
  const audience = input.memberCount ?? input.roster.length;
  record('small_group', audience > 0 && audience <= 4, WEIGHTS.small_group);

  // --- Negative signals ----------------------------------------------------

  // The most important suppressor: the work is explicitly someone else's.
  const namedOther = (() => {
    if (!input.llmOwnerName) return false;
    const named = normalizeAlias(input.llmOwnerName);
    if (!named) return false;
    const isSelf = [...input.self.displayNames, ...input.self.handles].includes(named);
    if (isSelf) return false;
    const matchesRoster = input.roster.some(
      (p) => !p.isSelf && normalizeAlias(p.displayName) === named,
    );
    return matchesRoster && !mentioned;
  })();
  record('named_other', namedOther, WEIGHTS.named_other,
    namedOther ? `Assigned to ${input.llmOwnerName}, not you` : undefined);

  // A broadcast mention addresses everyone, which is affirmative evidence the
  // message is not aimed at one person. Without this, every @channel
  // announcement in a busy workspace becomes a loop.
  const semantics = loopSemanticsFor(input.platform);
  const broadcastMention = evidence.some((m) => {
    if (m.mentionsRoom) return true;
    if (!semantics.broadcastMentions.length) return false;
    const haystack = m.content.toLowerCase();
    return semantics.broadcastMentions.some((token) => haystack.includes(token.toLowerCase()));
  }) && !structuralMention;
  record('broadcast_mention', broadcastMention, WEIGHTS.broadcast_mention,
    broadcastMention ? 'Addressed to the whole channel' : undefined);

  // Audience size penalises *ambient* traffic, not messages aimed at the user.
  // Without this exemption a direct @-mention in a big channel is cancelled out
  // by the channel being big, which is exactly backwards.
  const personallyAddressed = mentioned || repliedToSelf;
  record('broadcast', audience >= 25 && !personallyAddressed, WEIGHTS.broadcast);

  const noSelfSignal = !mentioned && !repliedToSelf && !secondPerson && !selfCommitted;
  record('no_self_signal', noSelfSignal, WEIGHTS.no_self_signal,
    noSelfSignal ? 'Nothing ties this message to you' : undefined);

  const score = clamp01(BASE_SCORE + signals.reduce((total, s) => total + s.weight, 0));

  return {
    score,
    addressed: mentioned || repliedToSelf || assignedToMe || secondPerson,
    hardPass: null,
    signals,
    reasons,
  };
}

export interface RelevanceDecision extends RelevanceResult {
  surfaced: boolean;
  threshold: number;
  /** Set when the loop is suppressed, for the shadow record and the eval harness. */
  suppressedReason: string | null;
}

/**
 * Apply a chat's sensitivity to a score.
 *
 * `off` suppresses everything, including hard passes — it is the user saying
 * "never make loops from this conversation", which must outrank every signal.
 */
export function decideRelevance(
  input: RelevanceInput,
  sensitivity: LoopSensitivity,
): RelevanceDecision {
  const result = scoreRelevance(input);
  const threshold = relevanceThreshold(sensitivity);

  if (sensitivity === 'off') {
    return {
      ...result,
      surfaced: false,
      threshold,
      suppressedReason: 'sensitivity_off',
    };
  }

  const surfaced = result.hardPass !== null || result.score >= threshold;
  return {
    ...result,
    surfaced,
    threshold,
    suppressedReason: surfaced ? null : dominantSuppressor(result),
  };
}

/** The negative signal most responsible for a suppression, for explainability. */
function dominantSuppressor(result: RelevanceResult): string {
  const negatives = result.signals.filter((s) => s.hit && s.weight < 0);
  if (!negatives.length) return 'below_threshold';
  return negatives.reduce((worst, s) => (s.weight < worst.weight ? s : worst)).id;
}
