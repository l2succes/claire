import { aiConfig } from '../config';
import { supabase } from './supabase';
import { logger } from '../utils/logger';

type StoredPreferences = { ai_enabled?: unknown };

/**
 * AI is opt-out at the account level. A missing preference preserves the
 * existing product behaviour; a database read failure fails closed so an
 * explicit privacy choice is never bypassed during an outage.
 */
export async function isAiProcessingEnabled(userId: string, profileId?: string): Promise<boolean> {
  let query = supabase
    .from('user_preferences')
    .select('preferences')
    .eq('user_id', userId);
  if (profileId) query = query.eq('profile_id', profileId);
  const { data, error } = await query.maybeSingle();
  if (error) {
    logger.warn('Could not verify AI processing preference', { errorCode: error.code || 'preference_read_failed' });
    return false;
  }
  return (data?.preferences as StoredPreferences | null)?.ai_enabled !== false;
}

export function aiProcessingDisclosure() {
  return {
    enabledByDefault: true,
    provider: aiConfig.provider,
    message: 'When enabled, Claire may send selected message context to the configured AI provider for suggestions, search, summaries, and related features.',
    operationsTelemetry: 'Operational telemetry contains timing, outcome, and service health metadata only; it does not contain message content.',
  };
}
