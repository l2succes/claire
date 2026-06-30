/**
 * Auto-reply rule engine (issue #39)
 *
 * Evaluates enabled rules for a user against an incoming message.
 * Fires a reply when a rule matches, subject to per-rule rate caps.
 * Reuses response-safety.ts to validate outgoing content.
 */

import { logger } from '../utils/logger';
import { supabase } from './supabase';
import { responseSafety } from './response-safety';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TriggerType = 'keyword' | 'birthday' | 'thanks';

export interface AutoReplyRule {
  id: string;
  user_id: string;
  name: string;
  enabled: boolean;
  trigger_type: TriggerType;
  keywords?: string[];       // for 'keyword' trigger
  reply_template: string;
  platforms?: string[];      // null/empty = all platforms
  max_per_hour: number;
  max_per_day: number;
  created_at: string;
  updated_at: string;
}

export interface IncomingMessage {
  id: string;           // DB UUID of the saved message
  userId: string;
  chatId: string;
  platform: string;
  content: string;
  senderName?: string;
}

export interface AutoReplyResult {
  fired: boolean;
  ruleId?: string;
  ruleName?: string;
  reply?: string;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Patterns that indicate a "thanks" message */
const THANKS_PATTERNS = [
  /\b(thank(?:s| you)|thx|ty|cheers|appreciate)\b/i,
];

/** Patterns that indicate a birthday message */
const BIRTHDAY_PATTERNS = [
  /\b(happy\s+birth(?:day)?|hbd|bday)\b/i,
];

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

class AutoReplyEngine {
  /**
   * Evaluate all enabled rules for this user/message. Returns the first
   * matching rule's reply (rules are checked in creation order).
   */
  async evaluate(msg: IncomingMessage): Promise<AutoReplyResult> {
    const { data: rules, error } = await supabase
      .from('auto_reply_rules')
      .select('*')
      .eq('user_id', msg.userId)
      .eq('enabled', true)
      .order('created_at', { ascending: true });

    if (error) {
      logger.error('AutoReplyEngine: failed to load rules', error);
      return { fired: false, reason: 'db_error' };
    }

    if (!rules || rules.length === 0) {
      return { fired: false, reason: 'no_rules' };
    }

    for (const rule of rules as AutoReplyRule[]) {
      const matched = this.matchesTrigger(rule, msg);
      if (!matched) continue;

      // Platform filter
      if (rule.platforms && rule.platforms.length > 0 && !rule.platforms.includes(msg.platform)) {
        continue;
      }

      // Rate-cap check
      const capped = await this.isRateCapped(rule);
      if (capped) {
        logger.info(`AutoReplyEngine: rule ${rule.id} rate-capped`);
        continue;
      }

      // Build and safety-check the reply
      const raw = this.interpolate(rule.reply_template, msg.senderName);
      const safeResult = await responseSafety.validateAndFilter(
        { messageId: msg.id, suggestions: [raw], confidence: 1 },
        {}
      );
      const reply = safeResult.suggestions[0];

      // Log the fire event
      await this.logFire(rule.id, msg.userId, msg.chatId);

      logger.info(`AutoReplyEngine: rule "${rule.name}" fired for message ${msg.id}`);
      return { fired: true, ruleId: rule.id, ruleName: rule.name, reply };
    }

    return { fired: false, reason: 'no_match' };
  }

  // ---------------------------------------------------------------------------
  // Trigger matching
  // ---------------------------------------------------------------------------

  matchesTrigger(rule: AutoReplyRule, msg: IncomingMessage): boolean {
    switch (rule.trigger_type) {
      case 'keyword':
        return this.matchesKeyword(rule.keywords ?? [], msg.content);
      case 'birthday':
        return BIRTHDAY_PATTERNS.some((p) => p.test(msg.content));
      case 'thanks':
        return THANKS_PATTERNS.some((p) => p.test(msg.content));
      default:
        return false;
    }
  }

  private matchesKeyword(keywords: string[], content: string): boolean {
    if (keywords.length === 0) return false;
    const lower = content.toLowerCase();
    return keywords.some((kw) => lower.includes(kw.toLowerCase()));
  }

  // ---------------------------------------------------------------------------
  // Rate-cap enforcement
  // ---------------------------------------------------------------------------

  async isRateCapped(rule: AutoReplyRule): Promise<boolean> {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const oneDayAgo  = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    const { count: hourCount } = await supabase
      .from('auto_reply_log')
      .select('id', { count: 'exact', head: true })
      .eq('rule_id', rule.id)
      .gte('fired_at', oneHourAgo);

    if ((hourCount ?? 0) >= rule.max_per_hour) return true;

    const { count: dayCount } = await supabase
      .from('auto_reply_log')
      .select('id', { count: 'exact', head: true })
      .eq('rule_id', rule.id)
      .gte('fired_at', oneDayAgo);

    return (dayCount ?? 0) >= rule.max_per_day;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private interpolate(template: string, senderName?: string): string {
    return template.replace(/\{name\}/g, senderName || 'there');
  }

  private async logFire(ruleId: string, userId: string, chatId: string): Promise<void> {
    const { error } = await supabase.from('auto_reply_log').insert({
      rule_id: ruleId,
      user_id: userId,
      chat_id: chatId,
    });
    if (error) {
      logger.warn('AutoReplyEngine: failed to write fire log', error);
    }
  }
}

export const autoReplyEngine = new AutoReplyEngine();
