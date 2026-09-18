/**
 * What kind of room is this?
 *
 * Groups do not get AI processing by default, which leaves the user with a
 * question they cannot answer in the abstract: "turn on AI for this group?".
 * "Work group · 12 people · Claire can track action items here" is answerable
 * in a second. That is the entire purpose of this file.
 *
 * It never enables anything. The classification selects banner copy and labels
 * the inbox row; `chats.ai_enabled` stays exactly as the user left it. A
 * classifier that silently switched processing on would make every one of its
 * mistakes a privacy incident.
 *
 * Cost discipline, in order:
 *   1. Free signals resolve most groups — the name alone is remarkably strong.
 *   2. Only the leftovers reach a model, on the cheap `triage` tier.
 *   3. A classified group is never looked at again (primary key on the table).
 */
import { z } from 'zod';

import { logger } from '../utils/logger';
import { supabase } from './supabase';
import { isAiProcessingEnabled } from './ai-policy';
import { callStructured } from './ai/structured';
import { NoProviderError } from './ai/structured';

export const GROUP_CATEGORIES = [
  'work',
  'planning',
  'family',
  'friends',
  'community',
  'announcement',
  'unknown',
] as const;

export type GroupCategory = (typeof GROUP_CATEGORIES)[number];

export const CLASSIFIER_PROMPT_VERSION = 'group-classify-v1';

/** Below this we show no label rather than a guess. Mirrored in the client. */
export const CATEGORY_DISPLAY_THRESHOLD = 0.6;

/** A group with fewer messages than this has no character yet — wait. */
const MIN_MESSAGES_TO_CLASSIFY = 20;

/** Sampling caps for the model path, matching the loop window budget. */
const SAMPLE_MAX_MESSAGES = 40;
const SAMPLE_MAX_CHARS = 3000;

export interface HeuristicInput {
  name: string | null;
  memberCount: number | null;
  messageCount: number;
  /** Messages the account owner sent here. Zero in a room you only receive. */
  selfMessageCount: number;
}

export interface Classification {
  category: GroupCategory;
  confidence: number;
  reason: string;
}

/**
 * Name patterns, as data so they can be table-tested.
 *
 * Ordered by how decisive the match is, not alphabetically: `community` runs
 * before `work` because "Parents Committee" contains "committee" and would
 * otherwise read as a work group, and `planning` runs before `friends` because
 * a birthday thread is logistics before it is socialising.
 */
const NAME_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  category: GroupCategory;
  confidence: number;
  reason: string;
}> = [
  {
    pattern: /residents?|building|\bhoa\b|tenants?|neighbou?rs?|\bpta\b|parents|grade \d|\bschool\b|apartment|condo|strata|community/i,
    category: 'community',
    confidence: 0.9,
    reason: 'The name reads like a building, school, or neighbourhood group',
  },
  {
    pattern: /\bfamily\b|\bfam\b|siblings|cousins|\bparents\b/i,
    category: 'family',
    confidence: 0.85,
    reason: 'The name reads like a family group',
  },
  {
    pattern: /trip|travel|vacation|holiday|wedding|birthday|party|reunion|bachelor(ette)?|\bmoving\b/i,
    category: 'planning',
    confidence: 0.8,
    reason: 'The name reads like a trip or event being organised',
  },
  {
    pattern: /standup|stand-up|sprint|\beng\b|\bdev\b|\bteam\b|\bproj(ect)?\b|client|onboarding|on-?call|launch|roadmap|\bqa\b|\bops\b/i,
    category: 'work',
    confidence: 0.75,
    reason: 'The name reads like a work or project group',
  },
];

/**
 * Free classification. Returns null for "inconclusive — ask the model", which
 * is a different answer from `unknown` (a confident "no category fits").
 */
export function classifyByHeuristics(input: HeuristicInput): Classification | null {
  // Too early to tell, and too early to spend a call finding out. A six-message
  // group has no character yet; it will be reconsidered as it fills up.
  if (input.messageCount < MIN_MESSAGES_TO_CLASSIFY) return null;

  // Shape before name, deliberately. A 210-person room the user has never
  // spoken in is a broadcast whatever it is nominally about — "Neighborhood
  // Updates" at that size is an announcement channel, not a conversation the
  // user is part of. The name only tells you the topic; this tells you whether
  // anything there could be addressed to them.
  if ((input.memberCount ?? 0) > 50 && input.selfMessageCount === 0) {
    return {
      category: 'announcement',
      confidence: 0.85,
      reason: 'A large group you have never posted in',
    };
  }

  const name = input.name?.trim() ?? '';
  if (name) {
    for (const rule of NAME_PATTERNS) {
      if (rule.pattern.test(name)) {
        return { category: rule.category, confidence: rule.confidence, reason: rule.reason };
      }
    }
  }

  return null;
}

const classificationSchema = z.object({
  category: z.enum(GROUP_CATEGORIES),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(120),
});

const SYSTEM_PROMPT = `You label group chats so a user can decide whether an assistant should process them.

Categories:
- work: a team, project, client, or professional coordination group
- planning: organising a specific trip, event, or occasion; time-bounded logistics
- family: a family group
- friends: social chatter between friends
- community: a building, neighbourhood, school, parents, or membership group
- announcement: a large room where a few people broadcast and most only read
- unknown: genuinely unclear

Answer only about what kind of group it is. Do not judge importance, do not summarise the
conversation, and do not describe individual people. The reason must be one short phrase
addressed to the user, under 12 words, e.g. "Coordinating a sprint with your team".`;

/**
 * One bounded call on the cheap tier. Returns null on any failure — an
 * unclassified group falls back to generic banner copy, which is a fine outcome
 * and never worth blocking or retrying a chat screen over.
 */
async function classifyByModel(
  name: string | null,
  memberCount: number | null,
  sample: string
): Promise<Classification | null> {
  try {
    const result = await callStructured<Classification>({
      role: 'triage',
      label: 'group.classify',
      system: SYSTEM_PROMPT,
      prompt: [
        `Group name: ${name || '(none)'}`,
        `Members: ${memberCount ?? 'unknown'}`,
        '',
        'Recent messages:',
        sample,
      ].join('\n'),
      schema: classificationSchema,
      schemaName: 'GroupClassification',
      maxOutputTokens: 200,
      temperature: 0,
    });
    return result.object;
  } catch (error) {
    if (error instanceof NoProviderError) {
      logger.debug('[group-classifier] no provider configured');
      return null;
    }
    logger.warn('[group-classifier] model classification failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/** Collapses a burst of messages in one group into a single classification run. */
const inFlight = new Set<string>();

interface ChatFacts {
  name: string | null;
  memberCount: number | null;
  messageCount: number;
  selfMessageCount: number;
}

async function loadChatFacts(userId: string, chatId: string): Promise<ChatFacts | null> {
  const [chatResult, totalResult, selfResult] = await Promise.all([
    supabase.from('chats').select('name, member_count, is_group').eq('id', chatId).eq('user_id', userId).maybeSingle(),
    supabase.from('messages').select('id', { count: 'exact', head: true }).eq('chat_id', chatId).eq('user_id', userId),
    supabase.from('messages').select('id', { count: 'exact', head: true }).eq('chat_id', chatId).eq('user_id', userId).eq('from_me', true),
  ]);

  if (chatResult.error || !chatResult.data || !chatResult.data.is_group) return null;

  return {
    name: chatResult.data.name ?? null,
    memberCount: chatResult.data.member_count ?? null,
    messageCount: totalResult.count ?? 0,
    selfMessageCount: selfResult.count ?? 0,
  };
}

/**
 * The sample the model sees. Bounded on both axes, and truncated per message so
 * one long forward cannot crowd out the rest of the conversation's character.
 */
async function loadSample(userId: string, chatId: string): Promise<string> {
  const { data, error } = await supabase
    .from('messages')
    .select('content, contact_name, from_me, timestamp')
    .eq('chat_id', chatId)
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .not('content', 'is', null)
    .order('timestamp', { ascending: false })
    .limit(SAMPLE_MAX_MESSAGES);
  if (error || !data) return '';

  const lines: string[] = [];
  let chars = 0;
  for (const row of data) {
    const content = String(row.content ?? '').trim();
    if (!content) continue;
    const sender = row.from_me ? 'You' : row.contact_name || 'Someone';
    const line = `${sender}: ${content.slice(0, 200)}`;
    if (chars + line.length > SAMPLE_MAX_CHARS) break;
    lines.push(line);
    chars += line.length;
  }
  return lines.reverse().join('\n');
}

async function persist(
  userId: string,
  chatId: string,
  classification: Classification,
  method: 'heuristic' | 'model',
  signals: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase.from('chat_classifications').upsert(
    {
      user_id: userId,
      chat_id: chatId,
      category: classification.category,
      confidence: classification.confidence,
      method,
      reason: classification.reason,
      signals,
      prompt_version: method === 'model' ? CLASSIFIER_PROMPT_VERSION : null,
      classified_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,chat_id' }
  );
  if (error) logger.warn('[group-classifier] could not persist', { error: error.message });
}

/**
 * Classify one group, at most once.
 *
 * `force` re-runs a group that already has a row — used when the user asks for
 * a re-read. It still refuses to overwrite an explicit user correction: that
 * row is the ground truth we would otherwise be trying to learn.
 */
export async function classifyGroup(
  userId: string,
  chatId: string,
  options: { force?: boolean } = {}
): Promise<Classification | null> {
  const { data: existing } = await supabase
    .from('chat_classifications')
    .select('category, confidence, reason, method')
    .eq('user_id', userId)
    .eq('chat_id', chatId)
    .maybeSingle();

  if (existing?.method === 'user') {
    return { category: existing.category as GroupCategory, confidence: existing.confidence, reason: existing.reason ?? '' };
  }
  if (existing && !options.force) {
    return { category: existing.category as GroupCategory, confidence: existing.confidence, reason: existing.reason ?? '' };
  }

  const facts = await loadChatFacts(userId, chatId);
  if (!facts) return null;

  const heuristic = classifyByHeuristics(facts);
  if (heuristic) {
    await persist(userId, chatId, heuristic, 'heuristic', {
      memberCount: facts.memberCount,
      messageCount: facts.messageCount,
      selfMessageCount: facts.selfMessageCount,
    });
    return heuristic;
  }

  // Null from the heuristics is either "too early" or "inconclusive". Too early
  // must not reach the model: the point of waiting is to spend nothing yet.
  if (facts.messageCount < MIN_MESSAGES_TO_CLASSIFY) return null;

  // Reading a group's content to classify it is exactly the processing the
  // account switch declines, so this path must honour it or it becomes the hole
  // in the wall. Heuristics above are free and content-free, so they still run.
  if (!(await isAiProcessingEnabled(userId))) return null;

  const sample = await loadSample(userId, chatId);
  if (!sample) return null;

  const classified = await classifyByModel(facts.name, facts.memberCount, sample);
  if (!classified) return null;

  await persist(userId, chatId, classified, 'model', {
    memberCount: facts.memberCount,
    messageCount: facts.messageCount,
    selfMessageCount: facts.selfMessageCount,
  });
  return classified;
}

/**
 * Fire-and-forget entry point for the ingest path.
 *
 * No queue: a classification is one-shot per group and the durable guard is the
 * table's primary key, so the only thing needing coordination is a burst of
 * messages arriving before the first run finishes. An in-process set covers
 * that; a second server racing it loses the upsert harmlessly.
 */
export async function scheduleGroupClassification(userId: string, chatId: string): Promise<void> {
  const key = `${userId}:${chatId}`;
  if (inFlight.has(key)) return;
  inFlight.add(key);
  try {
    await classifyGroup(userId, chatId);
  } catch (error) {
    logger.debug('[group-classifier] classification failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    inFlight.delete(key);
  }
}
