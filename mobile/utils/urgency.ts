import { ChatCategory } from '../types/conversationSettings';

export interface UrgencyInput {
  timestamp: string;
  from_me: boolean;
  content: string;
  category?: ChatCategory | null;
  importance?: number; // 1–5, default 3
}

export function computeUrgencyScore(input: UrgencyInput): number {
  if (input.from_me) return 0;

  const waitHours = (Date.now() - new Date(input.timestamp).getTime()) / 3_600_000;
  const waitScore = Math.min(50, waitHours * 5); // caps at 10h = 50pts

  const categoryBonus: Record<ChatCategory, number> = {
    business: 15,
    trip: 10,
    romantic: 8,
    friend: 5,
    personal: 5,
  };
  const catScore = input.category ? (categoryBonus[input.category] ?? 5) : 5;

  const content = input.content.toLowerCase();
  const contentBonus =
    (content.includes('?') ? 8 : 0) +
    (/urgent|asap|help|important|please/.test(content) ? 12 : 0);

  const importanceBonus = ((input.importance ?? 3) - 1) * 5; // 0–20

  return Math.min(100, Math.round(waitScore + catScore + contentBonus + importanceBonus));
}

export function formatWaitTime(timestamp: string): string {
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 2) return 'just now';
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
}
