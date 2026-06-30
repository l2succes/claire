import { logger } from '../utils/logger';
import { supabase } from './supabase';
import { aiProcessor } from './ai-processor';

// Typed wrapper to call the (private) callAI method on aiProcessor.
// We use a function rather than a module-level constant so that tests can
// replace aiProcessor's callAI at any time without rebinding.
function _callAI(system: string, user: string): Promise<string> {
  return (aiProcessor as unknown as { callAI(s: string, u: string): Promise<string> }).callAI(system, user);
}

export interface DetectedPromise {
  type: 'commitment' | 'deadline' | 'appointment' | 'task';
  /** The extracted promise text */
  text: string;
  /** ISO deadline string, if detected */
  deadline?: string;
  /** Contact name mentioned in the promise, if any */
  contact?: string;
  priority: 'low' | 'medium' | 'high';
  confidence: number;
  /** True when this result came from the regex fallback, not LLM */
  fromFallback?: boolean;
}

const LLM_SYSTEM_PROMPT = `You are a promise and commitment extractor. Given a message, identify any explicit or implied promises, commitments, deadlines, or task obligations.

Return ONLY a valid JSON object with this exact shape:
{
  "promises": [
    {
      "type": "commitment" | "deadline" | "appointment" | "task",
      "text": "the extracted promise text, verbatim or paraphrased",
      "deadline": "ISO 8601 date string if a deadline is present, else null",
      "contact": "name of person the promise is made to or about, else null",
      "priority": "low" | "medium" | "high",
      "confidence": 0.0 to 1.0
    }
  ]
}

Rules:
- If no promises are found, return {"promises": []}.
- "commitment": the speaker explicitly commits to doing something (I will, I'll, I promise, going to).
- "deadline": a hard due date is mentioned (by Friday, before EOD, etc.).
- "appointment": a scheduled meeting/call/session.
- "task": an obligation or reminder (need to, have to, remind me).
- Set confidence based on clarity: explicit phrase = 0.85-1.0, implied = 0.5-0.84.
- Omit deadline if a specific date cannot be determined.`;

// Simple in-process LRU-like cache for promise detection results (avoids
// burning LLM tokens for identical messages within the same process lifetime).
const detectionCache = new Map<string, DetectedPromise[]>();
const DETECTION_CACHE_MAX = 256;

class PromiseDetector {
  // Regex patterns — kept as fallback when LLM is unavailable or returns empty
  private readonly patterns: Record<string, RegExp[]> = {
    commitment: [
      /\b(i will|i'll|i shall|i promise|i commit|i guarantee)\b/i,
      /\b(will do|will send|will call|will meet|will be there)\b/i,
      /\b(going to|gonna)\s+\w+/i,
      /\b(promise to|commit to|guarantee to)\b/i,
    ],
    deadline: [
      /\b(by|before|until|till)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|tonight|next week|next month|end of)/i,
      /\b(deadline|due date|due by|submit by)\b/i,
      /\b(\d{1,2}[:/]\d{2}\s*(am|pm)?)\b/i,
      /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/i,
    ],
    appointment: [
      /\b(meeting|appointment|call|interview|session)\s+(at|on|scheduled)/i,
      /\b(see you|meet you|call you)\s+(at|on|tomorrow|today)/i,
      /\b(let's meet|let's call|let's discuss)\b/i,
    ],
    task: [
      /\b(need to|have to|must|should|supposed to)\s+\w+/i,
      /\b(todo|to do|task|action item)\b/i,
      /\b(remind me|don't forget|remember to)\b/i,
    ],
  };

  /**
   * Detect promises in a message.
   * Tries LLM-based extraction first; falls back to regex on failure or when AI
   * is not configured.
   */
  async detectPromises(
    messageId: string,
    content: string,
    userId: string,
    fromMe: boolean
  ): Promise<DetectedPromise[]> {
    if (!content || content.trim().length === 0) return [];

    try {
      let promises: DetectedPromise[] = [];

      if (aiProcessor.isConfigured) {
        promises = await this.detectWithLLM(content);
      }

      // Fall back to regex when LLM returns nothing or is unavailable
      if (promises.length === 0) {
        promises = this.detectWithPatterns(content);
      }

      const unique = this.deduplicatePromises(promises);

      if (unique.length > 0) {
        await this.storePromises(messageId, userId, unique, fromMe);
      }

      return unique;
    } catch (error) {
      logger.error('Error detecting promises:', error);
      return [];
    }
  }

  /**
   * LLM-based promise extraction using the shared aiProcessor.
   * Uses a lightweight in-process cache to avoid duplicate API calls.
   */
  async detectWithLLM(content: string): Promise<DetectedPromise[]> {
    if (detectionCache.has(content)) {
      logger.debug('Promise detector: in-process cache hit');
      return detectionCache.get(content)!;
    }

    const userPrompt = `Extract all promises, commitments, deadlines, and tasks from this message:\n\n"${content}"`;

    let raw: string;
    try {
      raw = await _callAI(LLM_SYSTEM_PROMPT, userPrompt);
    } catch (err) {
      logger.warn('Promise detector LLM call failed, will fall back to regex:', (err as Error).message);
      return [];
    }

    try {
      // Strip optional markdown fences
      const jsonText = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const parsed = JSON.parse(jsonText);
      const promises: DetectedPromise[] = (parsed.promises ?? [])
        .map((p: any) => ({
          type: (['commitment', 'deadline', 'appointment', 'task'].includes(p.type)
            ? p.type
            : 'commitment') as DetectedPromise['type'],
          text: typeof p.text === 'string' ? p.text : '',
          deadline: p.deadline ?? undefined,
          contact: p.contact ?? undefined,
          priority: (['low', 'medium', 'high'].includes(p.priority)
            ? p.priority
            : 'medium') as DetectedPromise['priority'],
          confidence: typeof p.confidence === 'number' ? Math.min(1, Math.max(0, p.confidence)) : 0.7,
        }))
        .filter((p: DetectedPromise) => p.text.length > 0);

      // Evict oldest entry when cache is full
      if (detectionCache.size >= DETECTION_CACHE_MAX) {
        detectionCache.delete(detectionCache.keys().next().value as string);
      }
      detectionCache.set(content, promises);

      return promises;
    } catch (parseErr) {
      logger.warn('Promise detector: failed to parse LLM JSON:', (parseErr as Error).message);
      return [];
    }
  }

  /**
   * Regex-based fallback. Returns DetectedPromise[] with fromFallback: true.
   * Exposed as public so it can be unit-tested independently.
   */
  detectWithPatterns(content: string): DetectedPromise[] {
    const detected: DetectedPromise[] = [];

    for (const [type, patterns] of Object.entries(this.patterns)) {
      for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match) {
          detected.push({
            type: type as DetectedPromise['type'],
            text: this.extractSentence(content, match.index ?? 0),
            deadline: this.extractDeadline(content),
            priority: this.determinePriority(content),
            confidence: 0.7,
            fromFallback: true,
          });
          break; // one match per type
        }
      }
    }

    return detected;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private extractSentence(content: string, startIndex: number): string {
    const sentences = content.split(/[.!?]+/);
    for (const sentence of sentences) {
      const idx = content.indexOf(sentence);
      if (idx <= startIndex && idx + sentence.length >= startIndex) {
        return sentence.trim();
      }
    }
    return content.substring(startIndex, Math.min(startIndex + 100, content.length));
  }

  private extractDeadline(content: string): string | undefined {
    const now = new Date();

    if (/\btomorrow\b/i.test(content)) {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      return d.toISOString();
    }
    if (/\b(today|tonight)\b/i.test(content)) return now.toISOString();
    if (/\bnext week\b/i.test(content)) {
      const d = new Date(now);
      d.setDate(d.getDate() + 7);
      return d.toISOString();
    }
    if (/\bnext month\b/i.test(content)) {
      const d = new Date(now);
      d.setMonth(d.getMonth() + 1);
      return d.toISOString();
    }

    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (let i = 0; i < days.length; i++) {
      if (new RegExp(`\\b${days[i]}\\b`, 'i').test(content)) {
        const diff = ((i - now.getDay() + 7) % 7) || 7;
        const d = new Date(now);
        d.setDate(d.getDate() + diff);
        return d.toISOString();
      }
    }

    return undefined;
  }

  private determinePriority(content: string): 'low' | 'medium' | 'high' {
    if (/\b(urgent|asap|immediately|critical|important|priority|emergency)\b/i.test(content)) return 'high';
    if (/\b(whenever|when you can|no rush|if possible|maybe)\b/i.test(content)) return 'low';
    return 'medium';
  }

  private deduplicatePromises(promises: DetectedPromise[]): DetectedPromise[] {
    const unique: DetectedPromise[] = [];
    for (const p of promises) {
      const isDupe = unique.some(
        (u) => u.type === p.type && this.similarity(u.text, p.text) > 0.8
      );
      if (!isDupe) unique.push(p);
    }
    return unique;
  }

  private similarity(a: string, b: string): number {
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;
    if (longer.length === 0) return 1;
    return (longer.length - this.editDistance(longer, shorter)) / longer.length;
  }

  private editDistance(s1: string, s2: string): number {
    const m: number[][] = Array.from({ length: s2.length + 1 }, (_, i) => [i]);
    for (let j = 0; j <= s1.length; j++) m[0][j] = j;
    for (let i = 1; i <= s2.length; i++) {
      for (let j = 1; j <= s1.length; j++) {
        m[i][j] =
          s2[i - 1] === s1[j - 1]
            ? m[i - 1][j - 1]
            : 1 + Math.min(m[i - 1][j - 1], m[i][j - 1], m[i - 1][j]);
      }
    }
    return m[s2.length][s1.length];
  }

  private async storePromises(
    messageId: string,
    userId: string,
    promises: DetectedPromise[],
    fromMe: boolean
  ): Promise<void> {
    try {
      const records = promises.map((p) => ({
        message_id: messageId,
        user_id: userId,
        type: p.type,
        content: p.text,
        deadline: p.deadline ?? null,
        priority: p.priority,
        confidence: p.confidence,
        from_me: fromMe,
        status: 'pending',
        created_at: new Date().toISOString(),
      }));
      await supabase.from('promises').insert(records);
      logger.info(`Stored ${promises.length} promise(s) for message ${messageId}`);
    } catch (error) {
      logger.error('Error storing promises:', error);
    }
  }
}

export const promiseDetector = new PromiseDetector();
