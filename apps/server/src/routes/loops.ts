import { transitionLoop, loopMutationError } from '../services/loops/loop-transition';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { supabase, type DbRow } from '../services/supabase';
import { validateRequest } from '../middleware/validation';
import { requireAuth } from '../middleware/auth';
import { logger } from '../utils/logger';
import { runLoopAgent } from '../services/loops/loop-agent';


const router = Router();

type LoopConversationRow = {
  id: string;
  message_id?: string | null;
  chat_id?: string | null;
  contact_name?: string | null;
  platform?: string | null;
  contact?: unknown;
  chat?: unknown;
  [key: string]: unknown;
};

async function hydrateLoopConversations(userId: string, rows: LoopConversationRow[]) {
  const messageIds = [...new Set(rows.map((row) => row.message_id).filter((id): id is string => Boolean(id)))];
  if (!messageIds.length) return rows;

  const { data: sources, error } = await supabase
    .from('messages')
    .select(`
      id, chat_id, contact_name, platform,
      contact:contacts!messages_contact_id_fkey(name, inferred_name, avatar_url),
      chat:chats!messages_chat_id_fkey(
        name, is_group, platform,
        contact:contacts!chats_contact_id_fkey(name, inferred_name, avatar_url)
      )
    `)
    .eq('user_id', userId)
    .in('id', messageIds);
  if (error) throw error;

  const byMessageId = new Map<string, DbRow>(
    (sources || []).map((source: DbRow) => [source.id as string, source]),
  );
  return rows.map((row) => {
    const source = row.message_id ? byMessageId.get(row.message_id) : null;
    if (!source) return row;
    const sourceChat = source.chat as { contact?: unknown } | null;
    return {
      ...row,
      chat_id: row.chat_id || source.chat_id,
      contact_name: row.contact_name || source.contact_name,
      platform: row.platform || source.platform,
      contact: source.contact || sourceChat?.contact || row.contact || null,
      chat: source.chat || row.chat || null,
    };
  });
}

// ---- Schema validators ----

const listLoopsSchema = z.object({
  query: z.object({
    expected_version: z.number().int().positive().optional(),
    status: z.enum(['open', 'waiting', 'snoozed', 'done', 'dropped']).optional(),
    platform: z.string().optional(),
    contact_id: z.string().uuid().optional(),
    limit: z.string().optional().transform(val => val ? Math.min(parseInt(val, 10), 200) : 50),
    offset: z.string().optional().transform(val => val ? parseInt(val, 10) : 0),
  }),
});

const updateLoopSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid loop ID'),
  }),
  body: z.object({
    status: z.enum(['open', 'waiting', 'snoozed', 'done', 'dropped']).optional(),
    owner: z.enum(['me', 'them', 'shared', 'unknown']).optional(),
    title: z.string().trim().min(1).max(200).optional(),
    content: z.string().trim().min(1).max(1_000).optional(),
    notes: z.string().optional(),
    deadline: z.string().datetime().nullable().optional(),
    deadline_precision: z.enum(['exact', 'day', 'week', 'month', 'none']).optional(),
    thread_state: z.enum(['proposed', 'negotiating', 'pending_confirmation', 'agreed', 'resolved']).optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
  }).refine(data => Object.keys(data).some(key => key !== 'expected_version'), {
    message: 'At least one field must be provided',
  }),
});

const createLoopSchema = z.object({
  body: z.object({
    content: z.string().trim().min(1).max(1_000),
    deadline: z.string().datetime().nullable().optional(),
    priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),
    chat_id: z.string().uuid().nullable().optional(),
  }),
});

const snoozeLoopSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid loop ID'),
  }),
  body: z.object({
    snooze_until: z.string().datetime('snooze_until must be a valid ISO datetime'),
  }),
});

const getLoopSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid loop ID'),
  }),
});

const deleteLoopSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid loop ID'),
  }),
});

const reviewLoopSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid loop ID'),
  }),
  body: z.object({
    action: z.enum(['done', 'dismiss', 'keep_open']),
    resolution: z.enum(['fulfilled', 'cancelled', 'expired', 'superseded']).optional(),
    suggestion_event_id: z.string().uuid().optional(),
  }),
});

// ---- Helper: ownership check ----

async function getOwnedLoop(id: string, userId: string) {
  const { data, error } = await supabase
    .from('loops')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return null;
  }
  return data;
}

// ---- Routes ----

/** Create a user-authored loop without requiring a source message. */
router.post(
  '/',
  requireAuth,
  validateRequest(createLoopSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'User not authenticated' });
      if (req.body.chat_id) {
        const { data: chat, error } = await supabase.from('chats').select('id').eq('id', req.body.chat_id).eq('user_id', userId).maybeSingle();
        if (error) throw error;
        if (!chat) return res.status(404).json({ error: 'Conversation not found' });
      }
      const { data, error } = await supabase
        .from('loops')
        .insert({
          user_id: userId,
          content: req.body.content,
          title: req.body.content.slice(0, 200),
          deadline: req.body.deadline || null,
          deadline_precision: req.body.deadline ? 'exact' : 'none',
          priority: req.body.priority,
          chat_id: req.body.chat_id || null,
          type: 'task',
          kind: 'task',
          from_me: true,
          owner: 'me',
          requester: 'me',
          thread_state: 'agreed',
          status: 'open',
          visibility: 'surfaced',
          source: 'user',
          user_edited: true,
          confidence: 1,
        })
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json({ success: true, data });
    } catch (error) {
      logger.error('Error creating loop:', error);
      return res.status(500).json({ success: false, error: 'Failed to create loop' });
    }
  }
);

/**
 * GET /loops
 * List loops for the authenticated user, with optional filters.
 */
router.get(
  '/',
  requireAuth,
  validateRequest(listLoopsSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const { status, platform, contact_id, limit, offset } = req.query as any;

      let query = supabase
        .from('loops')
        .select(`
          *,
          contact:contacts!loops_contact_id_fkey(name, inferred_name, avatar_url),
          chat:chats!loops_chat_id_fkey(
            name, is_group, platform,
            contact:contacts!chats_contact_id_fkey(name, inferred_name, avatar_url)
          )
        `, { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (status) query = query.eq('status', status);
      if (platform) query = query.eq('platform', platform);
      if (contact_id) query = query.eq('contact_id', contact_id);

      const { data, error, count } = await query.range(offset, offset + limit - 1);

      if (error) {
        logger.error('Error listing loops:', error);
        return res.status(500).json({ success: false, error: 'Failed to fetch loops' });
      }

      const hydrated = await hydrateLoopConversations(userId, (data || []) as LoopConversationRow[]);
      return res.json({ success: true, data: hydrated, total: count ?? 0 });
    } catch (error) {
      logger.error('Error in GET /loops:', error);
      const failure = loopMutationError(error);
      return res.status(failure.status).json({ success: false, error: failure.error });
    }
  }
);

/** Persisted attention, including work whose push was deferred by the budget. */
router.get('/attention', requireAuth, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'User not authenticated' });
  // The client uses this collection as both the review queue and its count.
  // A capped first page appears stuck as each action pulls in a replacement.
  const now = Date.now();
  const pageSize = 200;
  const attention = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from('loop_attention')
      .select('*,loop:loops(*)').eq('user_id', userId).lte('due_at', new Date(now).toISOString())
      .order('due_at').order('loop_id').range(offset, offset + pageSize - 1);
    if (error) return res.status(500).json({ error: 'Could not load attention' });
    const page = data ?? [];
    attention.push(...page.filter((item: any) => {
      const loop = item.loop;
      return loop?.row_version === item.row_version
        && ['open', 'waiting'].includes(loop.status)
        && loop.visibility === 'surfaced'
        && (!loop.reviewed_at || Date.parse(loop.reviewed_at) <= now - 48 * 60 * 60 * 1000);
    }));
    if (page.length < pageSize) break;
  }
  return res.json({ success: true, data: attention });
});

router.get('/health', requireAuth, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'User not authenticated' });
  const { data, error } = await supabase.rpc('loop_recovery_health', { p_user_id: userId });
  if (error) return res.status(500).json({ error: 'Could not load loop health' });
  return res.json({ success: true, data: { ...data, detectionMode: process.env.LOOP_DETECTION_MODE || 'off',
    shadow: process.env.LOOP_DETECTION_SHADOW === 'true', notificationsEnabled: process.env.LOOP_NOTIFICATIONS_ENABLED !== 'false', autoClose: 'review_required' } });
});

/**
 * GET /loops/:id?include=events,participants
 *
 * The details-page call. `include` is opt-in so the list screen's per-row
 * fetches stay cheap, and so the timeline — which can be long — is only paid
 * for when something is going to render it.
 *
 * Conversation hydration runs here too. The list endpoint has always done it
 * and the detail endpoint never did, which meant opening a loop lost the very
 * chat context that makes it readable.
 */
router.get(
  '/:id',
  requireAuth,
  validateRequest(getLoopSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const { id } = req.params;
      const loop = await getOwnedLoop(id, userId);

      if (!loop) {
        return res.status(404).json({ success: false, error: 'Loop not found' });
      }

      const include = new Set(
        String(req.query.include ?? '')
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean),
      );

      const [hydrated] = await hydrateLoopConversations(userId, [loop as LoopConversationRow]);
      const data: Record<string, unknown> = { ...hydrated };
      if (loop.chat_id) {
        const { data: work, error } = await supabase.from('chat_loop_work').select('generation').eq('user_id', userId).eq('chat_id', loop.chat_id).maybeSingle();
        if (error) throw error;
        data.chat_generation = Number(work?.generation ?? 0);
      }

      if (include.has('events')) {
        // Ascending: the timeline reads as a story, oldest first.
        const { data: events, error } = await supabase
          .from('loop_events')
          .select('id, kind, actor, message_id, summary, payload, confidence, occurred_at')
          .eq('loop_id', id)
          .eq('user_id', userId)
          .order('occurred_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(200);

        if (error) {
          logger.warn('Failed to load loop events', { loopId: id, error: error.message });
        }
        data.events = (events ?? []).reverse();
      }

      if (include.has('participants')) {
        const { data: participants, error } = await supabase
          .from('loop_participants')
          .select('id, display_name, contact_id, is_self, role, evidence')
          .eq('loop_id', id)
          .eq('user_id', userId);

        if (error) {
          logger.warn('Failed to load loop participants', { loopId: id, error: error.message });
        }
        data.participants = participants ?? [];
      }

      return res.json({ success: true, data });
    } catch (error) {
      logger.error('Error in GET /loops/:id:', error);
      const failure = loopMutationError(error);
      return res.status(failure.status).json({ success: false, error: failure.error });
    }
  }
);

/**
 * GET /loops/:id/events
 *
 * Keyset-paginated timeline for loops whose history outgrows the 200 the detail
 * endpoint inlines.
 */
router.get(
  '/:id/events',
  requireAuth,
  validateRequest(getLoopSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const { id } = req.params;
      if (!(await getOwnedLoop(id, userId))) {
        return res.status(404).json({ success: false, error: 'Loop not found' });
      }

      const limit = Math.min(Number(req.query.limit) || 50, 200);
      let query = supabase
        .from('loop_events')
        .select('id, kind, actor, message_id, summary, payload, confidence, occurred_at')
        .eq('loop_id', id)
        .eq('user_id', userId)
        .order('occurred_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(limit);

      const after = typeof req.query.after === 'string' ? req.query.after : null;
      if (after) query = query.gt('occurred_at', after);

      const { data, error } = await query;
      if (error) {
        logger.warn('Failed to page loop events', { loopId: id, error: error.message });
        return res.status(500).json({ success: false, error: 'Failed to load events' });
      }

      return res.json({ success: true, data: data ?? [] });
    } catch (error) {
      logger.error('Error in GET /loops/:id/events:', error);
      const failure = loopMutationError(error);
      return res.status(failure.status).json({ success: false, error: failure.error });
    }
  }
);

/**
 * POST /loops/:id/agent/messages
 *
 * Ask Claire for help closing this loop. The agent can read and propose; it has
 * no tool that sends a message or writes externally, so a proposal returned
 * here is inert until the user acts on it.
 */
router.post(
  '/:id/agent/messages',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
      if (!question || question.length > 1000) {
        return res.status(400).json({ success: false, error: 'A question of up to 1000 characters is required' });
      }

      const result = await runLoopAgent({ userId, loopId: req.params.id, question });
      return res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Error in POST /loops/:id/agent/messages:', error);
      const failure = loopMutationError(error);
      return res.status(failure.status).json({ success: false, error: failure.error });
    }
  }
);

/**
 * POST /loops/:id/review
 *
 * Persist a decision from either the stale-loop queue or an evidenced
 * “Claire thinks this is done” suggestion. `keep_open` is a real write so the
 * same review does not return until later conversation evidence clears it.
 */
router.post(
  '/:id/review',
  requireAuth,
  validateRequest(reviewLoopSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'User not authenticated' });

      const existing = await getOwnedLoop(req.params.id, userId);
      if (!existing) return res.status(404).json({ success: false, error: 'Loop not found' });

      const now = new Date().toISOString();
      const { action, suggestion_event_id: suggestionEventId } = req.body;
      const updates: Record<string, unknown> = { reviewed_at: now, user_edited: true,
        ...(action === 'keep_open' && existing.thread_state === 'resolved' && ['open','waiting'].includes(existing.status) ? { thread_state: 'pending_confirmation' } : {}) };
      let eventKind = 'user_edit';
      let summary = 'Kept open after review';
      let resolution: string | null = null;

      if (action === 'done') {
        resolution = req.body.resolution ?? 'fulfilled';
        Object.assign(updates, {
          status: 'done',
          thread_state: 'resolved',
          resolution,
          completed_at: now,
          resolved_at: now,
        });
        eventKind = 'resolved';
        summary = 'Marked done after review';
      } else if (action === 'dismiss') {
        resolution = 'user_dismissed';
        Object.assign(updates, {
          status: 'dropped',
          thread_state: 'resolved',
          resolution,
          resolved_at: now,
        });
        eventKind = 'resolved';
        summary = 'Dismissed after review';
      }

      const data = await transitionLoop({
        loopId: req.params.id, userId, expectedVersion: existing.row_version,
        patch: Object.fromEntries(Object.entries(updates).filter(([key]) => !['user_edited','completed_at','resolved_at'].includes(key))),
        actor: 'user', kind: eventKind, summary,
        payload: { action, resolution, ...(suggestionEventId ? { reviewedSuggestionEventId: suggestionEventId } : {}) },
      });

      return res.json({ success: true, data });
    } catch (error) {
      logger.error('Error in POST /loops/:id/review:', error);
      const failure = loopMutationError(error);
      return res.status(failure.status).json({ success: false, error: failure.error });
    }
  },
);

/**
 * PATCH /loops/:id
 * Update workflow, ownership, notes, deadline, or priority of a loop.
 */
router.patch(
  '/:id',
  requireAuth,
  validateRequest(updateLoopSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const { id } = req.params;

      // Verify ownership first
      const existing = await getOwnedLoop(id, userId);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Loop not found' });
      }

      const data = await transitionLoop({
        userId, loopId: id, expectedVersion: req.body.expected_version ?? existing.row_version,
        patch: { ...Object.fromEntries(Object.entries(req.body).filter(([key]) => key !== 'expected_version')),
          ...('deadline' in req.body && !('deadline_precision' in req.body) ? { deadline_precision: req.body.deadline ? 'exact' : 'none' } : {}) },
        actor: 'user', kind: req.body.status === 'open' || req.body.status === 'waiting' ? 'reopened' : 'user_edit',
        summary: 'Updated by you',
      });

      return res.json({ success: true, data });
    } catch (error) {
      logger.error('Error in PATCH /loops/:id:', error);
      const failure = loopMutationError(error);
      return res.status(failure.status).json({ success: false, error: failure.error });
    }
  }
);

/**
 * POST /loops/:id/snooze
 * Snooze a loop by updating its deadline.
 */
router.post(
  '/:id/snooze',
  requireAuth,
  validateRequest(snoozeLoopSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const { id } = req.params;
      const { snooze_until } = req.body;

      const existing = await getOwnedLoop(id, userId);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Loop not found' });
      }

      if (new Date(snooze_until).getTime() <= Date.now()) return res.status(400).json({ error: 'Choose a future snooze time' });
      const data = await transitionLoop({
        userId, loopId: id, expectedVersion: existing.row_version,
        patch: { snoozed_until: snooze_until, status: 'snoozed' },
        actor: 'user', kind: 'user_edit', summary: 'Snoozed by you',
      });

      return res.json({ success: true, data });
    } catch (error) {
      logger.error('Error in POST /loops/:id/snooze:', error);
      const failure = loopMutationError(error);
      return res.status(failure.status).json({ success: false, error: failure.error });
    }
  }
);

/**
 * DELETE /loops/:id
 * Soft-delete (cancel) a loop.
 */
router.delete(
  '/:id',
  requireAuth,
  validateRequest(deleteLoopSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const { id } = req.params;

      const existing = await getOwnedLoop(id, userId);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Loop not found' });
      }

      await transitionLoop({
        userId, loopId: id, expectedVersion: existing.row_version,
        patch: { status: 'dropped', resolution: 'user_dismissed' },
        actor: 'user', kind: 'resolved', summary: 'Dismissed by you',
      });

      return res.status(204).send();
    } catch (error) {
      logger.error('Error in DELETE /loops/:id:', error);
      const failure = loopMutationError(error);
      return res.status(failure.status).json({ success: false, error: failure.error });
    }
  }
);

export default router;
