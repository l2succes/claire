import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { messageIngestion } from '../services/message-ingestion';
import { messageQueue } from '../services/message-queue';
import { realtimeSync } from '../services/realtime-sync';
import { whatsappAuth } from '../auth/whatsapp-auth';
import { supabase } from '../services/supabase';
import { validateRequest } from '../middleware/validation';
import { requireAuth } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

// Schema validators
const getMessagesSchema = z.object({
  query: z.object({
    limit: z.string().optional().transform(val => val ? parseInt(val) : 50),
    offset: z.string().optional().transform(val => val ? parseInt(val) : 0),
    chatId: z.string().optional(),
    search: z.string().optional(),
  }),
});

const sendMessageSchema = z.object({
  body: z.object({
    sessionId: z.string(),
    to: z.string(),
    message: z.string().min(1),
    quotedMessageId: z.string().optional(),
  }),
});

const markReadSchema = z.object({
  body: z.object({
    messageIds: z.array(z.string()),
  }),
});

/**
 * GET /messages
 * Get user messages with filtering and pagination
 */
router.get(
  '/',
  requireAuth,
  validateRequest(getMessagesSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id as string;
      const { limit, offset, chatId, search } = req.query as any;

      let messages;

      if (search) {
        messages = await messageIngestion.searchMessages(userId, search, limit);
      } else if (chatId) {
        messages = await messageIngestion.getChatMessages(userId, chatId, limit);
      } else {
        messages = await messageIngestion.getUserMessages(userId, limit, offset);
      }

      return res.json({
        messages,
        pagination: {
          limit,
          offset,
          total: messages.length,
        },
      });
    } catch (error) {
      logger.error('Failed to get messages:', error);
      return res.status(500).json({ error: 'Failed to retrieve messages' });
    }
  }
);

/**
 * GET /messages/chats
 * Get list of chats (conversations)
 */
router.get(
  '/chats',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id as string;

      const { data: chats, error } = await supabase
        .from('chats')
        .select('*, contact:contacts(*)')
        .eq('user_id', userId)
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (error) throw error;

      return res.json(chats ?? []);
    } catch (error) {
      logger.error('Failed to get chats:', error);
      return res.status(500).json({ error: 'Failed to retrieve chats' });
    }
  }
);

/**
 * GET /messages/stats
 * Get message statistics
 */
router.get(
  '/stats',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id as string;
      const startOfDay = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

      const baseCount = () =>
        supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId);

      const countFor = (
        build: (q: ReturnType<typeof baseCount>) => ReturnType<typeof baseCount>
      ) => build(baseCount());

      const [total, unread, replied, today] = await Promise.all([
        countFor(q => q),
        countFor(q => q.eq('from_me', false).or('status.is.null,status.neq.read')),
        countFor(q => q.eq('status', 'replied')),
        countFor(q => q.gte('timestamp', startOfDay)),
      ]);

      return res.json({
        total: total.count ?? 0,
        unread: unread.count ?? 0,
        replied: replied.count ?? 0,
        today: today.count ?? 0,
      });
    } catch (error) {
      logger.error('Failed to get message stats:', error);
      return res.status(500).json({ error: 'Failed to retrieve statistics' });
    }
  }
);

/**
 * GET /messages/queue/stats
 * Get message queue statistics
 */
router.get(
  '/queue/stats',
  requireAuth,
  async (_req: Request, res: Response) => {
    try {
      const stats = await messageQueue.getAllQueueStats();
      return res.json(stats);
    } catch (error) {
      logger.error('Failed to get queue stats:', error);
      return res.status(500).json({ error: 'Failed to retrieve queue statistics' });
    }
  }
);

/**
 * GET /messages/:messageId
 * Get specific message by ID
 */
router.get(
  '/:messageId',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id as string;
      const { messageId } = req.params;

      const { data: message, error } = await supabase
        .from('messages')
        .select('*, contact:contacts(*), chat:chats(*)')
        .eq('id', messageId)
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;
      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }

      return res.json(message);
    } catch (error) {
      logger.error('Failed to get message:', error);
      return res.status(500).json({ error: 'Failed to retrieve message' });
    }
  }
);

/**
 * POST /messages/send
 * Send a WhatsApp message
 */
router.post(
  '/send',
  requireAuth,
  validateRequest(sendMessageSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id as string;
      const { sessionId, to, message } = req.body;

      // Verify session belongs to user
      const session = await whatsappAuth.getSession(sessionId);
      if (!session || session.userId !== userId) {
        return res.status(403).json({ error: 'Invalid session' });
      }

      // Check if session is connected
      if (!whatsappAuth.isSessionConnected(sessionId)) {
        return res.status(400).json({ error: 'WhatsApp not connected' });
      }

      // Send message via WhatsApp
      const sentMessage = await whatsappAuth.sendMessage(sessionId, to, message);

      if (!sentMessage) {
        return res.status(500).json({ error: 'Failed to send message' });
      }

      // Ensure a chat row exists for the recipient (messages.chat_id is NOT NULL).
      const { data: chatRow } = await supabase
        .from('chats')
        .upsert(
          { user_id: userId, whatsapp_chat_id: to, is_group: false },
          { onConflict: 'user_id,whatsapp_chat_id' }
        )
        .select('id')
        .single();

      // Store in database
      const { data: storedMessage, error: storeError } = await supabase
        .from('messages')
        .insert({
          user_id: userId,
          chat_id: chatRow?.id,
          whatsapp_id: sentMessage.id._serialized,
          content: message,
          from_me: true,
          type: 'text',
          status: 'sent',
          timestamp: new Date(sentMessage.timestamp * 1000).toISOString(),
        })
        .select('*')
        .single();

      if (storeError) throw storeError;

      // Broadcast via realtime
      await realtimeSync.broadcastToUser(userId, 'message:sent', storedMessage);

      return res.json({
        message: storedMessage,
        whatsappId: sentMessage.id._serialized,
      });
    } catch (error) {
      logger.error('Failed to send message:', error);
      return res.status(500).json({ error: 'Failed to send message' });
    }
  }
);

/**
 * POST /messages/mark-read
 * Mark messages as read
 */
router.post(
  '/mark-read',
  requireAuth,
  validateRequest(markReadSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id as string;
      const { messageIds } = req.body;

      await realtimeSync.syncReadStatus(userId, messageIds);

      return res.json({
        success: true,
        markedCount: messageIds.length,
      });
    } catch (error) {
      logger.error('Failed to mark messages as read:', error);
      return res.status(500).json({ error: 'Failed to mark messages as read' });
    }
  }
);

/**
 * POST /messages/typing
 * Send typing indicator
 */
router.post(
  '/typing',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id as string;
      const { chatId, isTyping } = req.body;

      await realtimeSync.sendTypingIndicator(userId, chatId, isTyping);

      return res.json({ success: true });
    } catch (error) {
      logger.error('Failed to send typing indicator:', error);
      return res.status(500).json({ error: 'Failed to send typing indicator' });
    }
  }
);

/**
 * POST /messages/:messageId/snooze
 * Snooze a message until a future time; it resurfaces in the inbox after that.
 */
const snoozeMessageSchema = z.object({
  body: z.object({
    // ISO timestamp or minutes from now
    snooze_until: z.string().optional(),
    snooze_minutes: z.number().int().positive().optional(),
  }).refine((d) => d.snooze_until || d.snooze_minutes, {
    message: 'Provide snooze_until or snooze_minutes',
  }),
});

router.post(
  '/:messageId/snooze',
  requireAuth,
  validateRequest(snoozeMessageSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id as string;
      const { messageId } = req.params;
      const { snooze_until, snooze_minutes } = req.body;

      const snoozeDate = snooze_until
        ? new Date(snooze_until)
        : new Date(Date.now() + (snooze_minutes as number) * 60_000);

      if (isNaN(snoozeDate.getTime()) || snoozeDate <= new Date()) {
        return res.status(400).json({ error: 'snooze_until must be a future timestamp' });
      }

      const { data, error } = await supabase
        .from('messages')
        .update({ snoozed_until: snoozeDate.toISOString() })
        .eq('id', messageId)
        .eq('user_id', userId)
        .select('id, snoozed_until')
        .single();

      if (error || !data) {
        return res.status(404).json({ error: 'Message not found' });
      }

      return res.json({ success: true, message: data });
    } catch (error) {
      logger.error('Failed to snooze message:', error);
      return res.status(500).json({ error: 'Failed to snooze message' });
    }
  }
);

/**
 * DELETE /messages/:messageId/snooze
 * Un-snooze a message (clear snoozed_until)
 */
router.delete(
  '/:messageId/snooze',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id as string;
      const { messageId } = req.params;

      const { data, error } = await supabase
        .from('messages')
        .update({ snoozed_until: null })
        .eq('id', messageId)
        .eq('user_id', userId)
        .select('id')
        .single();

      if (error || !data) {
        return res.status(404).json({ error: 'Message not found' });
      }

      return res.json({ success: true });
    } catch (error) {
      logger.error('Failed to un-snooze message:', error);
      return res.status(500).json({ error: 'Failed to un-snooze message' });
    }
  }
);

/**
 * DELETE /messages/:messageId
 * Delete a message (soft delete)
 */
router.delete(
  '/:messageId',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id as string;
      const { messageId } = req.params;

      // Soft delete by flagging and blanking content
      const { data: message, error } = await supabase
        .from('messages')
        .update({ content: '[Message deleted]', is_deleted: true })
        .eq('id', messageId)
        .eq('user_id', userId)
        .select('*')
        .single();

      if (error || !message) {
        return res.status(404).json({ error: 'Message not found' });
      }

      // Broadcast deletion
      await realtimeSync.broadcastToUser(userId, 'message:deleted', {
        messageId,
        deletedAt: new Date(),
      });

      return res.json({ success: true, message });
    } catch (error) {
      logger.error('Failed to delete message:', error);
      return res.status(500).json({ error: 'Failed to delete message' });
    }
  }
);

export default router;
