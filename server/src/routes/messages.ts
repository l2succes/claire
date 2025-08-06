import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { messageIngestion } from '../services/message-ingestion';
import { messageQueue } from '../services/message-queue';
import { realtimeSync } from '../services/realtime-sync';
import { whatsappAuth } from '../auth/whatsapp-auth';
import { prisma } from '../services/prisma';
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
      const userId = req.user?.id;
      const { limit, offset, chatId, search } = req.query as any;

      let messages;
      
      if (search) {
        messages = await messageIngestion.searchMessages(userId, search, limit);
      } else if (chatId) {
        messages = await messageIngestion.getChatMessages(userId, chatId, limit);
      } else {
        messages = await messageIngestion.getUserMessages(userId, limit, offset);
      }

      res.json({
        messages,
        pagination: {
          limit,
          offset,
          total: messages.length,
        },
      });
    } catch (error) {
      logger.error('Failed to get messages:', error);
      res.status(500).json({ error: 'Failed to retrieve messages' });
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
      const userId = req.user?.id;
      const { messageId } = req.params;

      const message = await prisma.message.findFirst({
        where: {
          id: messageId,
          userId,
        },
        include: {
          sender: true,
          receiver: true,
          group: true,
          promises: true,
        },
      });

      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }

      res.json(message);
    } catch (error) {
      logger.error('Failed to get message:', error);
      res.status(500).json({ error: 'Failed to retrieve message' });
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
      const userId = req.user?.id;
      const { sessionId, to, message, quotedMessageId } = req.body;

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

      // Store in database
      const storedMessage = await prisma.message.create({
        data: {
          userId,
          whatsappMessageId: sentMessage.id._serialized,
          content: message,
          timestamp: new Date(sentMessage.timestamp * 1000),
          isFromMe: true,
          isRead: false,
          isReplied: false,
          replyStatus: 'SENT',
        },
      });

      // Broadcast via realtime
      await realtimeSync.broadcastToUser(userId, 'message:sent', storedMessage);

      res.json({
        message: storedMessage,
        whatsappId: sentMessage.id._serialized,
      });
    } catch (error) {
      logger.error('Failed to send message:', error);
      res.status(500).json({ error: 'Failed to send message' });
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
      const userId = req.user?.id;
      const { messageIds } = req.body;

      await realtimeSync.syncReadStatus(userId, messageIds);

      res.json({ 
        success: true,
        markedCount: messageIds.length,
      });
    } catch (error) {
      logger.error('Failed to mark messages as read:', error);
      res.status(500).json({ error: 'Failed to mark messages as read' });
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
      const userId = req.user?.id;

      // Get unique chats with last message
      const chats = await prisma.$queryRaw`
        WITH latest_messages AS (
          SELECT DISTINCT ON (COALESCE(sender_id, receiver_id, group_id))
            *,
            COALESCE(sender_id, receiver_id, group_id) as chat_id
          FROM messages
          WHERE user_id = ${userId}
          ORDER BY COALESCE(sender_id, receiver_id, group_id), timestamp DESC
        )
        SELECT 
          lm.*,
          c.name as contact_name,
          c.avatar_url as contact_avatar,
          g.name as group_name
        FROM latest_messages lm
        LEFT JOIN contacts c ON lm.chat_id = c.id
        LEFT JOIN groups g ON lm.chat_id = g.id
        ORDER BY lm.timestamp DESC
      `;

      res.json(chats);
    } catch (error) {
      logger.error('Failed to get chats:', error);
      res.status(500).json({ error: 'Failed to retrieve chats' });
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
      const userId = req.user?.id;

      const [totalMessages, unreadCount, repliedCount, todayCount] = await Promise.all([
        prisma.message.count({ where: { userId } }),
        prisma.message.count({ where: { userId, isRead: false, isFromMe: false } }),
        prisma.message.count({ where: { userId, isReplied: true } }),
        prisma.message.count({
          where: {
            userId,
            timestamp: {
              gte: new Date(new Date().setHours(0, 0, 0, 0)),
            },
          },
        }),
      ]);

      res.json({
        total: totalMessages,
        unread: unreadCount,
        replied: repliedCount,
        today: todayCount,
      });
    } catch (error) {
      logger.error('Failed to get message stats:', error);
      res.status(500).json({ error: 'Failed to retrieve statistics' });
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
  async (req: Request, res: Response) => {
    try {
      const stats = await messageQueue.getAllQueueStats();
      res.json(stats);
    } catch (error) {
      logger.error('Failed to get queue stats:', error);
      res.status(500).json({ error: 'Failed to retrieve queue statistics' });
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
      const userId = req.user?.id;
      const { chatId, isTyping } = req.body;

      await realtimeSync.sendTypingIndicator(userId, chatId, isTyping);

      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to send typing indicator:', error);
      res.status(500).json({ error: 'Failed to send typing indicator' });
    }
  }
);

/**
 * DELETE /messages/:messageId
 * Delete a message
 */
router.delete(
  '/:messageId',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      const { messageId } = req.params;

      // Soft delete by updating content
      const message = await prisma.message.update({
        where: {
          id: messageId,
          userId,
        },
        data: {
          content: '[Message deleted]',
          metadata: {
            deleted: true,
            deletedAt: new Date(),
          },
        },
      });

      // Broadcast deletion
      await realtimeSync.broadcastToUser(userId, 'message:deleted', {
        messageId,
        deletedAt: new Date(),
      });

      res.json({ success: true, message });
    } catch (error) {
      logger.error('Failed to delete message:', error);
      res.status(500).json({ error: 'Failed to delete message' });
    }
  }
);

export default router;