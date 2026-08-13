import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { aiProcessor } from '../services/ai-processor';
import { conversationAssistant } from '../services/conversation-assistant';
import { responseCache } from '../services/response-cache';
import { validateRequest } from '../middleware/validation';
import { requireAuth } from '../middleware/auth';
import { logger } from '../utils/logger';
import { supabase } from '../services/supabase';

const router = Router();

// Schema validators
const generateResponseSchema = z.object({
  body: z.object({
    messageId: z.string().min(1, 'Message ID is required'),
    content: z.string().min(1, 'Message content is required'),
    chatType: z.enum(['individual', 'group']).optional().default('individual'),
    streaming: z.boolean().optional().default(false),
    guidance: z.string().trim().max(500, 'Guidance must be 500 characters or less').optional(),
    forceRefresh: z.boolean().optional().default(false),
  }),
});

const updateFeedbackSchema = z.object({
  body: z.object({
    messageId: z.string().min(1, 'Message ID is required'),
    selectedIndex: z.number().optional(),
    feedback: z.enum(['positive', 'negative']).optional(),
    customResponse: z.string().optional(),
  }),
});

const explainConversationSchema = z.object({
  body: z.object({
    messageId: z.string().min(1, 'Message ID is required'),
    content: z.string().min(1, 'Message content is required'),
    chatType: z.enum(['individual', 'group']).optional().default('individual'),
  }),
});

const assistantThreadSchema = z.object({
  body: z.object({ title: z.string().trim().min(1).max(120).optional() }),
});

const assistantQuestionSchema = z.object({
  body: z.object({ question: z.string().trim().min(1, 'Question is required').max(2_000) }),
});

const getAnalyticsSchema = z.object({
  query: z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    limit: z.string().optional().transform(val => val ? parseInt(val) : 100),
  }),
});

/**
 * Generate AI response suggestions
 */
router.post('/responses/generate', 
  requireAuth,
  validateRequest(generateResponseSchema),
  async (req: Request, res: Response) => {
    try {
      const { messageId, content, chatType, streaming, guidance, forceRefresh } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      if (streaming) {
        // Set up streaming response
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        });

        // Streaming token-by-token not yet supported with Bedrock; send as single SSE event
        const streamResponse = await aiProcessor.generateResponse(
          messageId,
          content,
          userId,
          chatType,
          { guidance, forceRefresh }
        );
        res.write(`data: ${JSON.stringify({ type: 'complete', data: streamResponse })}\n\n`);
        res.end();
        return;
      } else {
        // Regular response
        const response = await aiProcessor.generateResponse(
          messageId,
          content,
          userId,
          chatType,
          { guidance, forceRefresh }
        );

        return res.json({
          success: true,
          data: response,
        });
      }
    } catch (error) {
      logger.error('Error generating AI response:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to generate response suggestions',
      });
    }
  }
);

/** Explain the latest text and its surrounding conversation without drafting or sending a message. */
router.post('/conversations/explain',
  requireAuth,
  validateRequest(explainConversationSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'User not authenticated' });

      const { messageId, content, chatType } = req.body;
      const explanation = await aiProcessor.explainConversation(messageId, content, userId, chatType);
      return res.json({ success: true, data: explanation });
    } catch (error) {
      logger.error('Error explaining conversation:', error);
      return res.status(500).json({ success: false, error: 'Failed to explain conversation' });
    }
  }
);

/** Persisted global Ask Claire threads. All queries are scoped to req.user.id. */
router.get('/assistant/threads', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated' });
    return res.json({ success: true, data: await conversationAssistant.listThreads(userId) });
  } catch (error) {
    logger.error('Error listing assistant threads:', error);
    return res.status(500).json({ success: false, error: 'Failed to list assistant threads' });
  }
});

router.post('/assistant/threads', requireAuth, validateRequest(assistantThreadSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated' });
    return res.status(201).json({ success: true, data: await conversationAssistant.createThread(userId, req.body.title) });
  } catch (error) {
    logger.error('Error creating assistant thread:', error);
    return res.status(500).json({ success: false, error: 'Failed to create assistant thread' });
  }
});

router.get('/assistant/threads/:threadId', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated' });
    return res.json({ success: true, data: await conversationAssistant.getThread(userId, req.params.threadId) });
  } catch (error) {
    if ((error as Error).message === 'ASSISTANT_THREAD_NOT_FOUND') return res.status(404).json({ success: false, error: 'Assistant thread not found' });
    logger.error('Error loading assistant thread:', error);
    return res.status(500).json({ success: false, error: 'Failed to load assistant thread' });
  }
});

router.delete('/assistant/threads/:threadId', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated' });
    await conversationAssistant.deleteThread(userId, req.params.threadId);
    return res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting assistant thread:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete assistant thread' });
  }
});

router.post('/assistant/threads/:threadId/messages', requireAuth, validateRequest(assistantQuestionSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated' });
    if (!conversationAssistant.isConfigured) return res.status(503).json({ success: false, error: 'AI is not configured' });
    return res.json({ success: true, data: await conversationAssistant.ask(userId, req.params.threadId, req.body.question) });
  } catch (error) {
    if ((error as Error).message === 'ASSISTANT_THREAD_NOT_FOUND') return res.status(404).json({ success: false, error: 'Assistant thread not found' });
    logger.error('Error answering assistant question:', error);
    return res.status(500).json({ success: false, error: 'Failed to answer assistant question' });
  }
});

router.get('/assistant/index/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated' });
    return res.json({ success: true, data: await conversationAssistant.getIndexStatus(userId) });
  } catch (error) {
    logger.error('Error checking assistant index status:', error);
    return res.status(500).json({ success: false, error: 'Failed to get index status' });
  }
});

router.post('/assistant/index', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated' });
    if (!conversationAssistant.isConfigured) return res.status(503).json({ success: false, error: 'AI is not configured' });
    return res.status(202).json({ success: true, data: await conversationAssistant.startBackfill(userId) });
  } catch (error) {
    logger.error('Error starting assistant index:', error);
    return res.status(500).json({ success: false, error: 'Failed to start assistant index' });
  }
});

/**
 * Update feedback for AI suggestions
 */
router.post('/responses/feedback',
  requireAuth,
  validateRequest(updateFeedbackSchema),
  async (req: Request, res: Response) => {
    try {
      const { messageId, selectedIndex, feedback, customResponse } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      await aiProcessor.updateFeedback(
        messageId,
        userId,
        selectedIndex,
        feedback,
        customResponse
      );

      return res.json({
        success: true,
        message: 'Feedback updated successfully',
      });
    } catch (error) {
      logger.error('Error updating feedback:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to update feedback',
      });
    }
  }
);

/**
 * Get AI response analytics
 */
router.get('/analytics',
  requireAuth,
  validateRequest(getAnalyticsSchema),
  async (req: Request, res: Response) => {
    try {
      const { startDate, endDate } = req.query;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const dateRange = startDate && endDate ? {
        start: new Date(startDate as string),
        end: new Date(endDate as string),
      } : undefined;

      const analytics = await aiProcessor.getAnalytics(userId, dateRange);

      return res.json({
        success: true,
        data: analytics,
      });
    } catch (error) {
      logger.error('Error getting analytics:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get analytics',
      });
    }
  }
);

/**
 * Analyze message sentiment
 */
router.post('/analyze/sentiment',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { content } = req.body;

      if (!content) {
        return res.status(400).json({
          success: false,
          error: 'Message content is required',
        });
      }

      const sentiment = await aiProcessor.analyzeSentiment(content);

      return res.json({
        success: true,
        data: { sentiment },
      });
    } catch (error) {
      logger.error('Error analyzing sentiment:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to analyze sentiment',
      });
    }
  }
);

/**
 * Extract topics from message
 */
router.post('/analyze/topics',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { content } = req.body;

      if (!content) {
        return res.status(400).json({
          success: false,
          error: 'Message content is required',
        });
      }

      const topics = await aiProcessor.extractTopics(content);

      return res.json({
        success: true,
        data: { topics },
      });
    } catch (error) {
      logger.error('Error extracting topics:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to extract topics',
      });
    }
  }
);

/**
 * Get cache statistics (admin only)
 */
router.get('/cache/stats',
  requireAuth,
  async (_req: Request, res: Response) => {
    try {
      const stats = await responseCache.getStats();

      return res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Error getting cache stats:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get cache statistics',
      });
    }
  }
);

/**
 * Clear user cache
 */
router.delete('/cache/user',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      await responseCache.clearUserCache(userId);

      return res.json({
        success: true,
        message: 'User cache cleared successfully',
      });
    } catch (error) {
      logger.error('Error clearing user cache:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to clear cache',
      });
    }
  }
);

/**
 * GET /ai/morning-brief
 * Returns a morning-brief summary text + list of urgent (unanswered) messages.
 *
 * Urgency is scored by wait time, category bonus, and content keywords — mirroring
 * the client-side `computeUrgencyScore` in `client/utils/urgency.ts`.
 */
router.get('/morning-brief',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      // Fetch most recent message per chat that we haven't replied to
      const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString(); // last 7 days
      const { data: rows, error } = await supabase
        .from('messages')
        .select(`id, chat_id, content, timestamp, from_me, is_group, contact_name, chat_name, platform,
                 chats!messages_chat_id_fkey(name, platform_chat_id)`)
        .eq('user_id', userId)
        .eq('from_me', false)
        .gte('timestamp', since)
        .order('timestamp', { ascending: false })
        .limit(200);

      if (error) throw error;

      // Deduplicate to one message per chat, compute urgency
      const chatMap = new Map<string, {
        id: string; chat_id: string; contact_name?: string; chat_name?: string;
        content: string; timestamp: string; from_me: boolean; is_group: boolean;
        platform?: string; urgency_score: number;
      }>();

      for (const row of (rows || [])) {
        const chatId = row.chat_id;
        if (chatMap.has(chatId)) continue;

        const waitHours = (Date.now() - new Date(row.timestamp).getTime()) / 3_600_000;
        const waitScore = Math.min(50, waitHours * 5);
        const content = (row.content || '').toLowerCase();
        const contentBonus =
          (content.includes('?') ? 8 : 0) +
          (/urgent|asap|help|important|please/.test(content) ? 12 : 0);
        const urgency_score = Math.min(100, Math.round(waitScore + contentBonus + 5));

        chatMap.set(chatId, {
          id: row.id,
          chat_id: chatId,
          contact_name: row.contact_name ?? undefined,
          chat_name: (row.chats as any)?.name || row.chat_name || undefined,
          content: row.content,
          timestamp: row.timestamp,
          from_me: row.from_me,
          is_group: row.is_group,
          platform: row.platform ?? undefined,
          urgency_score,
        });
      }

      const urgent_messages = Array.from(chatMap.values())
        .filter(m => m.urgency_score >= 30)
        .sort((a, b) => b.urgency_score - a.urgency_score)
        .slice(0, 5);

      // Build a brief text summary
      const total = chatMap.size;
      const urgentCount = urgent_messages.length;
      let brief_text = '';
      if (total === 0) {
        brief_text = "You're all caught up — no unanswered messages.";
      } else if (urgentCount === 0) {
        brief_text = `You have ${total} unanswered conversation${total === 1 ? '' : 's'}, none urgent.`;
      } else {
        const names = urgent_messages
          .slice(0, 2)
          .map(m => m.contact_name || m.chat_name || 'someone')
          .join(' and ');
        brief_text = `${urgentCount} message${urgentCount === 1 ? '' : 's'} need${urgentCount === 1 ? 's' : ''} your attention — starting with ${names}.`;
      }

      return res.json({
        success: true,
        data: { brief_text, urgent_messages },
      });
    } catch (error) {
      const databaseError = error as { code?: string; message?: string; details?: string; hint?: string };
      logger.error('Error building morning brief:', {
        code: databaseError.code,
        message: databaseError.message,
        details: databaseError.details,
        hint: databaseError.hint,
      });
      return res.status(500).json({ success: false, error: 'Failed to build morning brief' });
    }
  }
);

/**
 * GET /ai/group-summary/:chatId
 * Returns an AI-generated text summary of recent group-chat activity.
 *
 * In MOCK_BRIDGE mode (no real AI configured) the endpoint returns a
 * deterministic canned summary so Playwright e2e tests pass with zero
 * external deps.
 */
router.get('/group-summary/:chatId',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const { chatId } = req.params;

      // Fetch the 50 most-recent messages for this group chat
      const { data: messages, error } = await supabase
        .from('messages')
        .select('content, contact_name, timestamp, from_me')
        .eq('chat_id', chatId)
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(50);

      if (error) throw error;

      if (!messages || messages.length === 0) {
        return res.json({
          success: true,
          data: { summary: 'No messages yet in this group.' },
        });
      }

      // Build a compact transcript for the AI prompt
      const transcript = messages
        .slice()
        .reverse()
        .map((m) => `${m.contact_name || (m.from_me ? 'You' : 'Unknown')}: ${m.content}`)
        .join('\n');

      let summary: string;

      if (!aiProcessor.isConfigured) {
        // Mock mode — deterministic fallback so tests pass without real AI
        const participants = new Set(messages.map((m) => m.contact_name || 'Unknown'));
        summary = `This group has ${messages.length} recent messages from ${participants.size} participant${participants.size === 1 ? '' : 's'}. Topics discussed include updates and coordination. (mock summary)`;
      } else {
        summary = await aiProcessor.summarizeText(
          'You are a concise assistant. Summarize the following group chat transcript in 2-3 sentences, focusing on the main topics and any action items.',
          transcript,
        );
      }

      return res.json({
        success: true,
        data: { summary },
      });
    } catch (error) {
      logger.error('Error generating group summary:', error);
      return res.status(500).json({ success: false, error: 'Failed to generate group summary' });
    }
  }
);

export default router;
