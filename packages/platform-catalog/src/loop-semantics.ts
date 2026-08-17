/**
 * Per-platform conversation semantics for loop detection.
 *
 * The loop pipeline must contain no `if (platform === 'slack')` branches — every
 * platform difference lives here as data, so adding a bridge never means editing
 * the detector. See docs/LOOPS_REVAMP_PLAN.md §11.
 *
 * Platforms absent from the override table get DEFAULT_LOOP_SEMANTICS, which is
 * chosen to be the safe reading: handle-style mentions, no broadcast syntax,
 * reply-only threading, and normal group sensitivity.
 */

export type MentionStyle =
  /** Mentions render as a phone number in the message body (WhatsApp). */
  | 'phone'
  /** Mentions render as a stable @handle (Telegram, Instagram). */
  | 'handle'
  /** Mentions render as a display name; the real id is only in m.mentions (Slack). */
  | 'display_name'
  /** Mentions are only ever available structurally. */
  | 'structured';

export type ThreadingModel =
  | 'none'
  /** Point-to-point replies only (WhatsApp, Telegram, iMessage). */
  | 'reply'
  /** First-class threads that partition a channel (Slack, Discord). */
  | 'native_threads';

export type GroupModel =
  /** Group membership is the conversation (WhatsApp, Telegram, iMessage). */
  | 'participants'
  /** Channels with membership independent of who talks (Slack, Discord, IRC). */
  | 'channels';

export type LoopSensitivity = 'off' | 'low' | 'normal' | 'high';

export interface LoopSemantics {
  mentionStyle: MentionStyle;
  /** Tokens that address everyone. Never treat these as a personal mention. */
  broadcastMentions: readonly string[];
  threading: ThreadingModel;
  groupModel: GroupModel;
  /** Whether the bridge reports a real member count, or only distinct senders. */
  memberCountAvailable: boolean;
  /**
   * 'account' — one identity across the platform (WhatsApp: one phone number).
   * 'workspace' — a different identity per connection (Slack: per workspace),
   * so self-identity must be resolved per account, not per platform.
   */
  selfIdentityScope: 'account' | 'workspace';
  /** Sensitivity applied to a newly connected group conversation. */
  defaultGroupSensitivity: LoopSensitivity;
}

export const DEFAULT_LOOP_SEMANTICS: LoopSemantics = {
  mentionStyle: 'handle',
  broadcastMentions: [],
  threading: 'reply',
  groupModel: 'participants',
  memberCountAvailable: false,
  selfIdentityScope: 'account',
  defaultGroupSensitivity: 'normal',
};

/**
 * Only the deltas from DEFAULT_LOOP_SEMANTICS.
 *
 * Channel-based platforms default to 'low': a work Slack generates an order of
 * magnitude more traffic than a family group chat, and almost none of it is
 * addressed to any one person. Users opt channels in rather than opting a
 * firehose out.
 */
const LOOP_SEMANTICS_OVERRIDES: Readonly<Record<string, Partial<LoopSemantics>>> = {
  whatsapp: {
    // WhatsApp writes the phone number into the body, never the display name,
    // so text-matching "@Name" finds nothing. m.mentions is the only signal.
    mentionStyle: 'phone',
    memberCountAvailable: true,
  },
  telegram: {
    mentionStyle: 'handle',
    memberCountAvailable: true,
  },
  instagram: {
    mentionStyle: 'handle',
  },
  imessage: {
    mentionStyle: 'handle',
    threading: 'reply',
  },
  slack: {
    mentionStyle: 'display_name',
    broadcastMentions: ['@channel', '@here', '@everyone'],
    threading: 'native_threads',
    groupModel: 'channels',
    memberCountAvailable: true,
    // The same human has a different user id in every workspace.
    selfIdentityScope: 'workspace',
    defaultGroupSensitivity: 'low',
  },
  discord: {
    mentionStyle: 'display_name',
    broadcastMentions: ['@everyone', '@here'],
    threading: 'native_threads',
    groupModel: 'channels',
    memberCountAvailable: true,
    defaultGroupSensitivity: 'low',
  },
  messenger: {
    mentionStyle: 'handle',
    memberCountAvailable: true,
  },
  signal: {
    mentionStyle: 'handle',
    memberCountAvailable: true,
  },
  zulip: {
    // Zulip topics partition a stream the same way Slack threads do.
    mentionStyle: 'display_name',
    broadcastMentions: ['@all', '@everyone', '@stream'],
    threading: 'native_threads',
    groupModel: 'channels',
    defaultGroupSensitivity: 'low',
  },
  irc: {
    mentionStyle: 'handle',
    groupModel: 'channels',
    threading: 'none',
    defaultGroupSensitivity: 'low',
  },
};

/**
 * Loop semantics for a platform id, falling back to safe defaults for platforms
 * that have not been characterised yet.
 */
export function loopSemanticsFor(platformId: string): LoopSemantics {
  const override = LOOP_SEMANTICS_OVERRIDES[platformId];
  return override ? { ...DEFAULT_LOOP_SEMANTICS, ...override } : DEFAULT_LOOP_SEMANTICS;
}

/**
 * True when the text contains a broadcast mention for this platform.
 *
 * A broadcast mention addresses everyone, which makes it evidence a message is
 * NOT directed at one person — the opposite of how a personal mention scores.
 */
export function hasBroadcastMention(platformId: string, text: string): boolean {
  if (!text) return false;
  const { broadcastMentions } = loopSemanticsFor(platformId);
  if (!broadcastMentions.length) return false;
  const haystack = text.toLowerCase();
  return broadcastMentions.some((token) => haystack.includes(token.toLowerCase()));
}
