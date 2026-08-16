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
import { platformManager, Platform, PlatformStatus } from '../adapters';

const router = Router();

// Schema validators
const getMessagesSchema = z.object({
  query: z.object({
    limit: z.string().optional().transform(val => val ? parseInt(val) : 50),
    offset: z.string().optional().transform(val => val ? parseInt(val) : 0),
    beforeTimestamp: z.string().datetime().optional(),
    beforeId: z.string().uuid().optional(),
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

const markChatReadSchema = z.object({
  body: z.object({
    sessionId: z.string().optional(),
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
      const { limit, offset, chatId, search, beforeTimestamp, beforeId } = req.query as any;

      let messages;

      if (search) {
        messages = await messageIngestion.searchMessages(userId, search, limit);
      } else if (chatId) {
        messages = beforeTimestamp && beforeId
          ? await messageIngestion.getChatMessagesBefore(userId, chatId, limit, { timestamp: beforeTimestamp, id: beforeId })
          : await messageIngestion.getChatMessages(userId, chatId, limit, offset);
      } else {
        messages = await messageIngestion.getUserMessages(userId, limit, offset);
      }

      return res.json({
        messages,
        pagination: {
          limit,
          offset,
          nextBefore: messages.length ? { timestamp: messages[messages.length - 1].timestamp, id: messages[messages.length - 1].id } : null,
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

      const chatRows = chats || [];
      const chatIds = chatRows.map((chat) => chat.id);
      if (!chatIds.length) return res.json([]);

      // A single batched lookup keeps inbox rows useful without an N+1 query.
      // `messages` is ordered newest first, so the first row for each chat is
      // its preview. The client remains free to ignore this additive field.
      const { data: latestMessages, error: latestError } = await supabase
        .from('messages')
        .select('id, chat_id, content, content_type, media_mime_type, timestamp, from_me')
        .eq('user_id', userId)
        .in('chat_id', chatIds)
        .order('timestamp', { ascending: false });
      if (latestError) throw latestError;

      const latestByChat = new Map<string, Record<string, unknown>>();
      for (const message of latestMessages || []) {
        if (message.chat_id && !latestByChat.has(message.chat_id)) latestByChat.set(message.chat_id, message);
      }

      return res.json(chatRows.map((chat) => ({
        ...chat,
        latest_message: latestByChat.get(chat.id) || null,
      })));
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

      const [total, unreadChats, replied, today] = await Promise.all([
        countFor(q => q),
        supabase
          .from('chats')
          .select('unread_count')
          .eq('user_id', userId)
          .gt('unread_count', 0),
        countFor(q => q.eq('status', 'replied')),
        countFor(q => q.gte('timestamp', startOfDay)),
      ]);

      const unread = (unreadChats.data || []).reduce(
        (sum, chat) => sum + (chat.unread_count || 0),
        0
      );

      return res.json({
        total: total.count ?? 0,
        unread,
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
        .select('*, contact:contacts(*), chat:chats!messages_chat_id_fkey(*)')
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
 * GET /messages/:messageId/context
 * Load a bounded chronological window around a cited message. This keeps
 * global-search deep links useful even when the target falls outside the
 * normal recent-message page.
 */
router.get(
  '/:messageId/context',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id as string;
      const { messageId } = req.params;
      const { data: target, error: targetError } = await supabase
        .from('messages')
        .select('id, chat_id, timestamp')
        .eq('id', messageId)
        .eq('user_id', userId)
        .maybeSingle();
      if (targetError) throw targetError;
      if (!target?.chat_id) return res.status(404).json({ error: 'Message not found' });

      const select = '*, contact:contacts(*), chat:chats!messages_chat_id_fkey(*)';
      const [before, after] = await Promise.all([
        supabase.from('messages').select(select)
          .eq('user_id', userId).eq('chat_id', target.chat_id)
          .lte('timestamp', target.timestamp)
          .order('timestamp', { ascending: false }).limit(50),
        supabase.from('messages').select(select)
          .eq('user_id', userId).eq('chat_id', target.chat_id)
          .gt('timestamp', target.timestamp)
          .order('timestamp', { ascending: true }).limit(50),
      ]);
      if (before.error) throw before.error;
      if (after.error) throw after.error;

      const messages = [...(before.data || []), ...(after.data || [])]
        .filter((message, index, rows) => rows.findIndex((candidate) => candidate.id === message.id) === index)
        .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
      return res.json({ chatId: target.chat_id, messages });
    } catch (error) {
      logger.error('Failed to retrieve message context:', error);
      return res.status(500).json({ error: 'Failed to retrieve message context' });
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

      const { data: messages, error: lookupError } = await supabase
        .from('messages')
        .select('id, chat_id, timestamp')
        .eq('user_id', userId)
        .in('id', messageIds);
      if (lookupError) throw lookupError;

      const chatIds = [...new Set((messages || []).map((message) => message.chat_id).filter(Boolean))];
      const readAt = new Date().toISOString();
      for (const chatId of chatIds) {
        const latestRead = (messages || [])
          .filter((message) => message.chat_id === chatId)
          .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0];
        const { error } = await supabase
          .from('chats')
          .update({
            unread_count: 0,
            last_read_at: readAt,
            last_read_message_id: latestRead?.id || null,
          })
          .eq('id', chatId)
          .eq('user_id', userId);
        if (error) throw error;
      }

      await realtimeSync.broadcastToUser(userId, 'messages:read', {
        messageIds,
        chatIds,
        readAt,
      });

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
 * POST /messages/chats/:chatId/read
 * Advance Claire's local read cursor and mirror a Matrix read receipt when a
 * connected session is available. The local write is the source of truth for
 * unread badges across web, iOS, and Android.
 */
router.post(
  '/chats/:chatId/read',
  requireAuth,
  validateRequest(markChatReadSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id as string;
      const { chatId } = req.params;
      const { sessionId } = req.body as { sessionId?: string };

      const { data: chat, error: chatError } = await supabase
        .from('chats')
        .select('id, platform, platform_chat_id')
        .eq('id', chatId)
        .eq('user_id', userId)
        .maybeSingle();
      if (chatError) throw chatError;
      if (!chat) return res.status(404).json({ error: 'Chat not found' });

      const { data: latest, error: messageError } = await supabase
        .from('messages')
        .select('id, platform_message_id, timestamp')
        .eq('chat_id', chatId)
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (messageError) throw messageError;

      const { error: updateError } = await supabase
        .from('chats')
        .update({
          unread_count: 0,
          last_read_at: new Date().toISOString(),
          last_read_message_id: latest?.id || null,
        })
        .eq('id', chatId)
        .eq('user_id', userId);
      if (updateError) throw updateError;

      if (sessionId && latest?.platform_message_id) {
        const adapter = platformManager.getAdapter(chat.platform as Platform);
        const session = await adapter?.getSession(sessionId);
        if (adapter && session?.userId === userId && session.status === PlatformStatus.CONNECTED) {
          try {
            await adapter.markAsRead(sessionId, chat.platform_chat_id, latest.platform_message_id);
          } catch (error) {
            logger.warn('Local read state saved, but Matrix receipt failed', { error });
          }
        }
      }

      return res.json({ success: true, chatId, unreadCount: 0 });
    } catch (error) {
      logger.error('Failed to mark chat read:', error);
      return res.status(500).json({ error: 'Failed to mark chat as read' });
    }
  }
);

/** Pinning is Claire-local inbox state and never mutates the source platform. */
router.patch('/chats/:chatId/pin', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id as string;
    const pinned = req.body?.pinned;
    if (typeof pinned !== 'boolean') return res.status(400).json({ error: 'pinned must be a boolean' });
    const { data, error } = await supabase.from('chats')
      .update({ is_pinned: pinned, pinned_at: pinned ? new Date().toISOString() : null })
      .eq('id', req.params.chatId).eq('user_id', userId)
      .select('id,is_pinned,pinned_at').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Chat not found' });
    return res.json({ success: true, chat: data });
  } catch (error) {
    logger.error('Failed to update chat pin:', error);
    return res.status(500).json({ error: 'Failed to update chat pin' });
  }
});

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
