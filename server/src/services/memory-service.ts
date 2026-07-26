import { logger } from '../utils/logger';
import { supabase } from './supabase';

export interface MemoryEntry {
  key: string;
  value: string;
  confidence: number;
}

/**
 * Persist and retrieve per-contact memory facts.
 * Facts are extracted from messages and injected into AI prompts via context-builder.
 */
export class MemoryService {
  /**
   * Retrieve all memory entries for a given contact.
   * Returns entries sorted by key for deterministic prompt injection.
   */
  async getContactMemory(userId: string, contactId: string): Promise<MemoryEntry[]> {
    const { data, error } = await supabase
      .from('contact_memory')
      .select('key, value, confidence')
      .eq('user_id', userId)
      .eq('contact_id', contactId)
      .order('key', { ascending: true });

    if (error) {
      logger.error('Failed to fetch contact memory:', error);
      return [];
    }

    return (data ?? []).map((row) => ({
      key: row.key,
      value: row.value,
      confidence: row.confidence ?? 1.0,
    }));
  }

  /**
   * Upsert a memory entry (one fact per user+contact+key).
   * Lower-confidence entries never overwrite higher-confidence ones.
   */
  async upsertMemory(
    userId: string,
    contactId: string,
    key: string,
    value: string,
    confidence: number = 1.0,
    sourceMessageId?: string
  ): Promise<void> {
    // Check existing confidence so we don't downgrade a high-quality fact
    const { data: existing } = await supabase
      .from('contact_memory')
      .select('confidence')
      .eq('user_id', userId)
      .eq('contact_id', contactId)
      .eq('key', key)
      .single();

    if (existing && existing.confidence > confidence) {
      logger.debug(
        `Skipping memory upsert for ${contactId}/${key}: existing confidence ${existing.confidence} > new ${confidence}`
      );
      return;
    }

    const { error } = await supabase.from('contact_memory').upsert(
      {
        user_id: userId,
        contact_id: contactId,
        key,
        value,
        confidence,
        source_message_id: sourceMessageId ?? null,
      },
      { onConflict: 'user_id,contact_id,key' }
    );

    if (error) {
      logger.error('Failed to upsert contact memory:', error);
    } else {
      logger.debug(`Memory stored: ${contactId}/${key} = "${value}" (conf=${confidence})`);
    }
  }

  /**
   * Delete a specific memory entry.
   */
  async deleteMemory(userId: string, contactId: string, key: string): Promise<void> {
    const { error } = await supabase
      .from('contact_memory')
      .delete()
      .eq('user_id', userId)
      .eq('contact_id', contactId)
      .eq('key', key);

    if (error) {
      logger.error('Failed to delete contact memory:', error);
    }
  }

  /**
   * Format memory entries as a compact prompt snippet.
   * Returns empty string when there is nothing to inject.
   */
  formatForPrompt(entries: MemoryEntry[]): string {
    if (entries.length === 0) return '';
    const lines = entries.map((e) => `- ${e.key}: ${e.value}`).join('\n');
    return `What I remember about this person:\n${lines}\n`;
  }
}

export const memoryService = new MemoryService();
