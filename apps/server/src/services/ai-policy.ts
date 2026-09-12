import { aiConfig } from '../config';
import { supabase } from './supabase';
import { logger } from '../utils/logger';

type StoredPreferences = { ai_enabled?: unknown };

/**
 * AI is opt-out at the account level. A missing preference preserves the
 * existing product behaviour; a database read failure fails closed so an
 * explicit privacy choice is never bypassed during an outage.
 */
export async function isAiProcessingEnabled(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('preferences')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    logger.warn('Could not verify AI processing preference', { errorCode: error.code || 'preference_read_failed' });
    return false;
  }
  return (data?.preferences as StoredPreferences | null)?.ai_enabled !== false;
}

/**
 * Per-chat AI scope, layered under the account switch above.
 *
 * Groups are opt-in: most group traffic concerns nobody in particular, so
 * generating a draft reply or a follow-up for every message spends money on
 * output the user did not ask for and buries the inbox. A 1:1 has no such
 * ambiguity, so it stays on.
 *
 * NULL means the user has not chosen, so the default applies — and keeps
 * applying if the default ever changes. An explicit true/false is theirs.
 */
export function chatAiProcessingEnabled(
  chat: { is_group?: boolean | null; ai_enabled?: boolean | null } | null | undefined
): boolean {
  if (!chat) return false;
  return chat.ai_enabled ?? !chat.is_group;
}

/**
 * Async form for callers holding only a chat id — the loop worker, cron, and
 * anything replaying outside the ingest path. Fails closed like the account
 * check above, so an outage never widens processing.
 */
export async function chatAiScope(userId: string, chatId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('chats')
    .select('is_group, ai_enabled')
    .eq('id', chatId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) {
    logger.warn('Could not verify chat AI scope', { errorCode: error?.code || 'chat_scope_read_failed' });
    return false;
  }
  return chatAiProcessingEnabled(data);
}

export function aiProcessingDisclosure() {
  return {
    enabledByDefault: true,
    provider: aiConfig.provider,
    message: 'When enabled, Claire may send selected message context to the configured AI provider for suggestions, search, summaries, and related features.',
    groupChats: 'Group chats are excluded by default: Claire stores and searches them but generates no suggestions, follow-ups, or summaries until you turn a group on. Claire does read a sample of a group once to describe what kind of group it is, so it can tell you what turning it on would do.',
    operationsTelemetry: 'Operational telemetry contains timing, outcome, and service health metadata only; it does not contain message content.',
  };
}
