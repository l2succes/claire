import type { DesktopMessage } from './claire-api';

/**
 * Preserve the rendered timeline while a newer page arrives in the background.
 * Existing rows retain their position unless a newer server version of the
 * same message replaces them; genuinely new rows settle in timestamp order.
 */
export function mergeChronologicalMessages(current: DesktopMessage[], incoming: DesktopMessage[]) {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
}
