import { createHash } from 'crypto';
import OpenAI from 'openai';
import { openaiConfig } from '../config';
import { logger } from '../utils/logger';
import { supabase } from './supabase';

export interface VoiceProfile {
  language: string;
  profile: string;
  sourceMessageCount: number;
  pendingMessageCount: number;
  status: 'idle' | 'building' | 'ready' | 'failed' | 'stale';
  lastError: string | null;
  generatedAt: string | null;
}

const PROFILE_SAMPLE_LIMIT = 350;
const REFRESH_AFTER_SENT_MESSAGES = 25;

function languageFor(text: string): string {
  const value = text.toLowerCase();
  const spanishSignals = /[¿¡ñáéíóú]|(^|[^a-záéíóúñ])(que|para|con|pero|gracias|como|vamos|porque|también|ahora|quiero|tengo|hola|jaja)(?=$|[^a-záéíóúñ])/g;
  return (value.match(spanishSignals)?.length || 0) >= 2 ? 'es' : 'en';
}

class VoiceProfileService {
  private openai = openaiConfig.apiKey ? new OpenAI({ apiKey: openaiConfig.apiKey }) : null;
  private activeBuilds = new Set<string>();

  get isConfigured() { return !!this.openai; }

  async list(userId: string): Promise<VoiceProfile[]> {
    const { data, error } = await supabase
      .from('user_voice_profiles')
      .select('language, profile, source_message_count, pending_message_count, status, last_error, generated_at')
      .eq('user_id', userId)
      .order('language');
    if (error) throw error;
    return (data || []).map(row => ({
      language: row.language,
      profile: row.profile,
      sourceMessageCount: row.source_message_count,
      pendingMessageCount: row.pending_message_count,
      status: row.status,
      lastError: row.last_error,
      generatedAt: row.generated_at,
    })) as VoiceProfile[];
  }

  async update(userId: string, language: string, profile: string): Promise<VoiceProfile> {
    const { data, error } = await supabase.from('user_voice_profiles').upsert({
      user_id: userId, language, profile: profile.trim(), status: 'ready', last_error: null,
      generated_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,language' })
      .select('language, profile, source_message_count, pending_message_count, status, last_error, generated_at').single();
    if (error) throw error;
    return {
      language: data.language, profile: data.profile, sourceMessageCount: data.source_message_count,
      pendingMessageCount: data.pending_message_count, status: data.status, lastError: data.last_error, generatedAt: data.generated_at,
    } as VoiceProfile;
  }

  async rebuild(userId: string): Promise<VoiceProfile[]> {
    if (!this.openai) throw new Error('NO_AI_PROVIDER');
    if (!this.activeBuilds.has(userId)) {
      this.activeBuilds.add(userId);
      void this.build(userId).finally(() => this.activeBuilds.delete(userId));
    }
    return this.list(userId);
  }

  async markSentMessage(userId: string): Promise<void> {
    const profiles = await this.list(userId).catch(() => []);
    const shouldBuild = profiles.length === 0 || profiles.some(profile => profile.pendingMessageCount >= REFRESH_AFTER_SENT_MESSAGES - 1);
    if (shouldBuild) void this.rebuild(userId).catch(error => logger.debug('Voice profile refresh skipped:', (error as Error).message));
    else {
      await Promise.all(profiles.map(profile => supabase.from('user_voice_profiles').update({
        pending_message_count: profile.pendingMessageCount + 1, status: 'stale', updated_at: new Date().toISOString(),
      }).eq('user_id', userId).eq('language', profile.language)));
    }
  }

  async guidanceFor(userId: string, recentMessages: Array<{ content: string; fromMe: boolean }>): Promise<string> {
    const language = languageFor(recentMessages.slice(-12).map(message => message.content).join(' '));
    const { data } = await supabase.from('user_voice_profiles').select('profile')
      .eq('user_id', userId).eq('language', language).maybeSingle();
    const ownExamples = recentMessages.filter(message => message.fromMe && message.content.trim()).slice(-12)
      .map(message => message.content.trim()).join('\n');
    const profile = data?.profile?.trim();
    if (!profile && !ownExamples) return '';
    return `Owner voice guidance (follow text patterns only; do not infer identity):\n${profile || 'Use the owner examples below.'}\n\nRecent messages written by the owner in this chat:\n${ownExamples || '(none)'}`;
  }

  private async build(userId: string): Promise<void> {
    try {
      const { data: messages, error } = await supabase.from('messages')
        .select('content, timestamp').eq('user_id', userId).eq('from_me', true).eq('is_deleted', false)
        .not('content', 'is', null).neq('content', '').order('timestamp', { ascending: false }).limit(5000);
      if (error) throw error;
      const grouped = new Map<string, string[]>();
      for (const row of messages || []) {
        const text = String(row.content || '').trim();
        if (!text) continue;
        const language = languageFor(text);
        grouped.set(language, [...(grouped.get(language) || []), text]);
      }
      for (const [language, allMessages] of grouped) {
        await supabase.from('user_voice_profiles').upsert({ user_id: userId, language, status: 'building', updated_at: new Date().toISOString() }, { onConflict: 'user_id,language' });
        const sample = allMessages.slice(0, PROFILE_SAMPLE_LIMIT).reverse().join('\n');
        const hash = createHash('sha256').update(allMessages.join('\n')).digest('hex');
        const completion = await this.openai!.chat.completions.create({
          model: openaiConfig.model, response_format: { type: 'json_object' }, temperature: 0.1, max_tokens: 350,
          messages: [
            { role: 'system', content: 'Summarize only observable writing patterns from the owner text. Never infer nationality, ethnicity, identity, age, gender, or dialect labels. Return JSON: {"profile":"..."}. Mention preferred sentence length, formality, punctuation, emoji, slang, directness, and code-switching. Write a concise instruction for a reply generator.' },
            { role: 'user', content: `Language bucket: ${language}\n\nOwner messages:\n${sample}` },
          ],
        });
        let profile = 'Keep the reply concise, natural, and consistent with the owner’s recent messages.';
        try { profile = JSON.parse(completion.choices[0]?.message.content || '{}').profile || profile; } catch { /* use fallback */ }
        await supabase.from('user_voice_profiles').upsert({
          user_id: userId, language, profile, source_message_count: allMessages.length, source_hash: hash,
          pending_message_count: 0, status: 'ready', last_error: null, generated_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,language' });
      }
    } catch (error) {
      logger.error('Voice profile build failed:', error);
      // No source messages are written to the error record.
      await supabase.from('user_voice_profiles').update({ status: 'failed', last_error: (error as Error).message, updated_at: new Date().toISOString() }).eq('user_id', userId);
    }
  }
}

export const voiceProfileService = new VoiceProfileService();
