import type { ReactionChip, ReactionRow } from './types';

/**
 * Reactions are stored one row per (message, reactor, emoji) but rendered as one
 * chip per distinct emoji. Insertion order of first appearance is preserved so
 * chips do not reshuffle as more reactions arrive.
 */
export function groupReactions(rows: ReactionRow[]): ReactionChip[] {
  const byEmoji = new Map<string, ReactionChip>();
  for (const row of rows) {
    const existing = byEmoji.get(row.emoji);
    const name = row.reactor_name || undefined;
    if (existing) {
      existing.count += 1;
      existing.mine = existing.mine || row.from_me;
      if (name && !existing.reactors.includes(name)) existing.reactors.push(name);
      continue;
    }
    byEmoji.set(row.emoji, {
      emoji: row.emoji,
      count: 1,
      mine: row.from_me,
      reactors: name ? [name] : [],
    });
  }
  return [...byEmoji.values()];
}

/** Rows keyed by the message they belong to, which is how the UI consumes them. */
export type ReactionsByMessage = Record<string, ReactionRow[]>;

export function groupReactionsByMessage(rows: ReactionRow[]): ReactionsByMessage {
  const byMessage: ReactionsByMessage = {};
  for (const row of rows) {
    if (!row.message_id) continue;
    (byMessage[row.message_id] ||= []).push(row);
  }
  return byMessage;
}

/**
 * Insert or replace one row.
 *
 * Two rows are the same reaction when they share the id, or when they are the
 * caller's own reaction with the same emoji on the same message. That second
 * case is what lets a realtime INSERT replace the optimistic row the user just
 * created, instead of rendering the same reaction twice — the direct analogue of
 * `mergeChatMessage`'s local-send matching.
 */
export function upsertReactionRow(prev: ReactionsByMessage, row: ReactionRow): ReactionsByMessage {
  if (!row?.message_id) return prev;
  const existing = prev[row.message_id] || [];
  const index = existing.findIndex(
    (candidate) =>
      candidate.id === row.id ||
      (candidate.from_me && row.from_me && candidate.emoji === row.emoji),
  );
  const next = [...existing];
  if (index >= 0) next[index] = { ...next[index], ...row };
  else next.push(row);
  return { ...prev, [row.message_id]: next };
}

/**
 * Remove one row. A DELETE payload may carry only the id, so fall back to
 * scanning every message when `message_id` is absent.
 */
export function removeReactionRow(
  prev: ReactionsByMessage,
  row: { id?: string; message_id?: string | null },
): ReactionsByMessage {
  if (!row?.id) return prev;
  const messageIds = row.message_id ? [row.message_id] : Object.keys(prev);
  let changed = false;
  const next: ReactionsByMessage = { ...prev };
  for (const messageId of messageIds) {
    const rows = next[messageId];
    if (!rows) continue;
    const filtered = rows.filter((candidate) => candidate.id !== row.id);
    if (filtered.length === rows.length) continue;
    changed = true;
    if (filtered.length) next[messageId] = filtered;
    else delete next[messageId];
  }
  return changed ? next : prev;
}

/**
 * The six WhatsApp defaults. Deliberately conservative: Telegram limits
 * non-premium accounts to a server-defined set and Instagram DMs allow only a
 * few, so an arbitrary emoji can be silently dropped by the bridge — the worst
 * failure mode. The picker offers these plus an escape hatch to the OS keyboard.
 */
export const QUICK_REACTIONS: ReadonlyArray<{ emoji: string; name: string }> = [
  { emoji: '❤️', name: 'heart' },
  { emoji: '👍', name: 'thumbs-up' },
  { emoji: '😂', name: 'joy' },
  { emoji: '😮', name: 'open-mouth' },
  { emoji: '😢', name: 'cry' },
  { emoji: '🙏', name: 'pray' },
];

/**
 * Emoji arrive from several bridges with inconsistent variation selectors, so
 * `❤️` (with U+FE0F) and `❤` would otherwise group as two separate chips.
 * Normalize on both write and read.
 */
export function normalizeEmoji(emoji: string): string {
  return emoji.normalize('NFC');
}
