import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { aiProcessor } from '../services/ai-processor';
import { responseCache } from '../services/response-cache';
import { validateRequest } from '../middleware/validation';
import { requireAuth } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

// Schema validators
const generateResponseSchema = z.object({
  body: z.object({
    messageId: z.string().min(1, 'Message ID is required'),
    content: z.string().min(1, 'Message content is required'),
    chatType: z.enum(['individual', 'group']).optional().default('individual'),
    streaming: z.boolean().optional().default(false),
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
      const { messageId, content, chatType, streaming } = req.body;
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

        const streamingCallbacks = {
          onToken: (token: string) => {
            res.write(`data: ${JSON.stringify({ type: 'token', data: token })}\n\n`);
          },
          onComplete: (response: any) => {
            res.write(`data: ${JSON.stringify({ type: 'complete', data: response })}\n\n`);
            res.end();
          },
          onError: (error: Error) => {
            res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
            res.end();
          },
        };

        await aiProcessor.generateResponse(
          messageId,
          content,
          userId,
          chatType,
          streamingCallbacks
        );
      } else {
        // Regular response
        const response = await aiProcessor.generateResponse(
          messageId,
          content,
          userId,
          chatType
        );

        res.json({
          success: true,
          data: response,
        });
      }
    } catch (error) {
      logger.error('Error generating AI response:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate response suggestions',
      });
    }
  }
);

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

      res.json({
        success: true,
        message: 'Feedback updated successfully',
      });
    } catch (error) {
      logger.error('Error updating feedback:', error);
      res.status(500).json({
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

      res.json({
        success: true,
        data: analytics,
      });
    } catch (error) {
      logger.error('Error getting analytics:', error);
      res.status(500).json({
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

      res.json({
        success: true,
        data: { sentiment },
      });
    } catch (error) {
      logger.error('Error analyzing sentiment:', error);
      res.status(500).json({
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

      res.json({
        success: true,
        data: { topics },
      });
    } catch (error) {
      logger.error('Error extracting topics:', error);
      res.status(500).json({
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
  async (req: Request, res: Response) => {
    try {
      const stats = await responseCache.getStats();

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Error getting cache stats:', error);
      res.status(500).json({
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

      res.json({
        success: true,
        message: 'User cache cleared successfully',
      });
    } catch (error) {
      logger.error('Error clearing user cache:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to clear cache',
      });
    }
  }
);

export default router;