import { upsertReactionRow, type ChatTimeline, type ChatMessage } from '@claire/chat-core';

/** Keep a queued reaction attached when its local message gains a server ID. */
export function pendingReactions(timeline: ChatTimeline, events: Array<{
  id: string; kind: string; target?: ChatMessage; emoji?: string; message: ChatMessage;
}>) {
  let reactions = timeline.reactions;
  for (const event of events) {
    if (event.kind !== 'reaction' || !event.target || !event.emoji) continue;
    const target = event.target;
    const message = timeline.messages.find((row) => row.id === target.id
      || (!!target.platform_message_id && row.platform_message_id === target.platform_message_id)
      || (!!target.metadata?.clientRequestId && row.metadata?.clientRequestId === target.metadata.clientRequestId));
    const messageId = message?.id || target.id;
    if ((reactions[messageId] || []).some((row) => row.from_me && row.emoji === event.emoji)) continue;
    reactions = upsertReactionRow(reactions, { id: event.id, message_id: messageId, emoji: event.emoji,
      from_me: true, reactor_id: 'self', reacted_at: event.message.timestamp });
  }
  return reactions;
}
