/** Extract only the connected account's own Matrix read receipts. A contact's
 * receipt, or a bridge delivery receipt, must never clear Claire's unread badge. */
export function ownReadReceiptEventIds(
  content: unknown,
  ownMatrixUserIds: readonly string[],
): string[] {
  if (!content || typeof content !== 'object') return [];
  const ownIds = new Set(ownMatrixUserIds);
  const eventIds: string[] = [];
  for (const [eventId, types] of Object.entries(content)) {
    if (!eventId.startsWith('$') || !types || typeof types !== 'object') continue;
    const read = (types as Record<string, unknown>)['m.read'];
    if (!read || typeof read !== 'object') continue;
    if (Object.keys(read).some((userId) => ownIds.has(userId))) eventIds.push(eventId);
  }
  return eventIds;
}
