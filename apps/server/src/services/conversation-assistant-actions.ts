const MAX_ASSISTANT_ACTIONS = 2;
const MEETING_LANGUAGE = /\b(meet|meeting|call|catch up|coffee|lunch|dinner|schedule|calendar|appointment)\b/i;

export interface AssistantAction {
  type: 'open_conversation' | 'open_calendar';
  label: string;
  chatId?: string;
  chatName?: string | null;
  platform?: string;
  isGroup?: boolean;
  title?: string;
  startsAt?: string;
}

interface CitationForAction {
  chatId: string;
  chatName: string | null;
  platform: string;
  isGroup: boolean;
  excerpt: string;
}

interface CompletionAction {
  type?: unknown;
  label?: unknown;
  sourceIndex?: unknown;
  title?: unknown;
  startsAt?: unknown;
}

function shortText(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === 'string' && value.trim()
    ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength)
    : fallback;
}

function sourceIndex(value: unknown, sourceCount: number): number | null {
  return Number.isInteger(value) && typeof value === 'number' && value >= 1 && value <= sourceCount ? value - 1 : null;
}

function validDate(value: unknown): string | undefined {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return undefined;
  return new Date(value).toISOString();
}

/** Only expose actions that can be proven from a cited message. */
export function selectAssistantActions<T extends CitationForAction>(
  citations: T[],
  rawActions: unknown,
  allowedSourceIndices: unknown,
): AssistantAction[] {
  if (!Array.isArray(rawActions)) return [];
  const allowed = new Set(
    (Array.isArray(allowedSourceIndices) ? allowedSourceIndices : [])
      .filter((value): value is number => Number.isInteger(value) && typeof value === 'number' && value >= 1 && value <= citations.length),
  );
  const actions: AssistantAction[] = [];

  for (const rawAction of rawActions) {
    if (!rawAction || typeof rawAction !== 'object' || actions.length >= MAX_ASSISTANT_ACTIONS) continue;
    const action = rawAction as CompletionAction;
    const index = sourceIndex(action.sourceIndex, citations.length);
    if (index === null || !allowed.has(index + 1)) continue;
    const citation = citations[index];

    if (action.type === 'open_conversation') {
      actions.push({
        type: 'open_conversation',
        label: shortText(action.label, 'Open conversation', 48),
        chatId: citation.chatId,
        chatName: citation.chatName,
        platform: citation.platform,
        isGroup: citation.isGroup,
      });
      continue;
    }

    if (action.type === 'open_calendar' && MEETING_LANGUAGE.test(citation.excerpt)) {
      actions.push({
        type: 'open_calendar',
        label: shortText(action.label, 'Plan meeting', 48),
        title: shortText(action.title, 'Meeting', 100),
        startsAt: validDate(action.startsAt),
      });
    }
  }

  return actions;
}
