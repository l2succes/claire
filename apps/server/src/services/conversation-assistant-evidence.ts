import type { DbRow, supabase } from './supabase';

const EVIDENCE_WINDOW_MS = 43_200_000;
const NEIGHBORS_PER_SIDE = 4;
const NEIGHBOR_TEXT_LIMIT = 280;
const EXCERPT_LIMIT = 1_600;

export interface EvidenceAnchor {
  messageId: string;
  chatId: string;
  excerpt: string;
  senderName: string;
  fromMe: boolean;
  timestamp: string;
}

/**
 * The conversation around a matched message, with the match marked. Each side
 * is read outward from the anchor: a single ascending read of the time window
 * would stop at its limit before reaching the anchor in a busy chat. Returns
 * null when there is no context to add or it could not be read.
 */
export async function loadEvidenceExcerpt(
  db: Pick<typeof supabase, 'from'>,
  userId: string,
  anchor: EvidenceAnchor,
): Promise<string | null> {
  const anchorTime = new Date(anchor.timestamp).getTime();
  const neighbors = () => db.from('messages')
    .select('id, content, contact_name, from_me, timestamp')
    .eq('user_id', userId).eq('chat_id', anchor.chatId).eq('is_deleted', false)
    .neq('id', anchor.messageId).not('content', 'is', null);

  const [earlier, later] = await Promise.all([
    neighbors()
      .gte('timestamp', new Date(anchorTime - EVIDENCE_WINDOW_MS).toISOString()).lte('timestamp', anchor.timestamp)
      .order('timestamp', { ascending: false }).order('id', { ascending: false }).limit(NEIGHBORS_PER_SIDE),
    neighbors()
      .gte('timestamp', anchor.timestamp).lte('timestamp', new Date(anchorTime + EVIDENCE_WINDOW_MS).toISOString())
      .order('timestamp', { ascending: true }).order('id', { ascending: true }).limit(NEIGHBORS_PER_SIDE),
  ]);
  if (earlier.error || later.error) return null;

  const before: DbRow[] = [...(earlier.data || [])].reverse();
  // Messages sharing the anchor's timestamp can come back on both sides.
  const seen = new Set(before.map((row) => row.id));
  const after: DbRow[] = (later.data || []).filter((row: DbRow) => !seen.has(row.id));
  if (!before.length && !after.length) return null;

  const line = (row: DbRow) =>
    `${row.from_me ? 'You' : row.contact_name || anchor.senderName}: ${String(row.content || '').slice(0, NEIGHBOR_TEXT_LIMIT)}`;
  const anchorLine = `→ ${anchor.fromMe ? 'You' : anchor.senderName}: ${anchor.excerpt}`;

  // Any overflow comes out of the surrounding context, never the match.
  const throughAnchor = [...before.map(line), anchorLine].join('\n').slice(-EXCERPT_LIMIT);
  return [throughAnchor, ...after.map(line)].join('\n').slice(0, EXCERPT_LIMIT);
}
