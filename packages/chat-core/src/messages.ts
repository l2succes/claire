import type { ChatMessage } from './types';

/**
 * Messages the user just sent carry a client-generated id until the server
 * confirms them. Both clients use the same two prefixes.
 */
export function isLocalSend(id: string): boolean {
  return id.startsWith('optimistic-') || id.startsWith('local-');
}

/**
 * Fold one incoming message into a list.
 *
 * The subtle case is the middle branch: an outgoing message arrives from the
 * server with a real id while the optimistic copy is still on screen under a
 * local id. Matching on content lets the real row *replace* the placeholder
 * rather than appearing beside it as a duplicate.
 */
export function mergeChatMessage(prev: ChatMessage[], incoming: ChatMessage): ChatMessage[] {
  if (prev.some((message) => message.id === incoming.id)) {
    return prev.map((message) => (message.id === incoming.id ? { ...message, ...incoming } : message));
  }
  if (incoming.from_me) {
    const localIndex = prev.findIndex(
      (message) => isLocalSend(message.id) && message.content === incoming.content,
    );
    if (localIndex >= 0) {
      const next = [...prev];
      next[localIndex] = { ...prev[localIndex], ...incoming, id: incoming.id };
      return next;
    }
  }
  return [...prev, incoming];
}

/**
 * A refetch returns only what the server knows, so a send still in flight would
 * vanish from the list and reappear a moment later. Carry those pending rows
 * across, dropping any the server has meanwhile confirmed.
 */
export function keepPendingSends(serverMessages: ChatMessage[], current: ChatMessage[]): ChatMessage[] {
  const pending = current.filter(
    (message) =>
      isLocalSend(message.id) &&
      !serverMessages.some(
        (row) => row.id === message.id || (row.from_me && row.content === message.content),
      ),
  );
  return [...serverMessages, ...pending].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
}

/**
 * Merge a freshly fetched page into the rendered timeline.
 *
 * Distinct from `mergeChatMessage`, which folds in a single message and
 * reconciles optimistic sends: this is the batch case, deduping by id so a
 * newer server copy replaces the rendered one, then restoring timestamp order.
 *
 * Generic over the row shape because the two clients carry different message
 * types — desktop's has nullable content and a `delivery_state` mobile has no
 * concept of — and only `id` and `timestamp` matter here.
 */
export function mergeChronologicalMessages<T extends { id: string; timestamp: string }>(
  current: T[],
  incoming: T[],
): T[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort(
    (left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp),
  );
}

/**
 * Normalize whatever the send endpoint returned into a ChatMessage, keeping the
 * optimistic row's id so the list does not re-key and jump. The payload is
 * typed `unknown` because the shape differs per platform adapter.
 */
export function chatMessageFromSend(payload: unknown, fallback: ChatMessage): ChatMessage {
  if (!payload || typeof payload !== 'object') return fallback;
  const raw = payload as Record<string, unknown>;
  const platformMessageId =
    typeof raw.platformMessageId === 'string'
      ? raw.platformMessageId
      : typeof raw.platform_message_id === 'string'
        ? raw.platform_message_id
        : undefined;
  const timestampValue = raw.timestamp;
  const timestamp =
    typeof timestampValue === 'string'
      ? new Date(timestampValue).toISOString()
      : timestampValue instanceof Date
        ? timestampValue.toISOString()
        : fallback.timestamp;
  return {
    ...fallback,
    id: fallback.id,
    content: typeof raw.content === 'string' ? raw.content : fallback.content,
    timestamp,
    from_me: true,
    ...(platformMessageId ? { platform_message_id: platformMessageId } : {}),
  };
}

/**
 * The bridge could not fetch the attachment. Show a placeholder rather than the
 * raw error text.
 */
export function isBridgeFailure(content?: string | null): boolean {
  if (!content) return false;
  return (
    content.startsWith('* Failed to bridge media') || content.startsWith('Failed to bridge media')
  );
}
