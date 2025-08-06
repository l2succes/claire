import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { whatsappAuth } from '../auth/whatsapp-auth';
import { supabase } from '../services/supabase';
import { validateRequest } from '../middleware/validation';
import { requireAuth } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

// Schema validators
const createSessionSchema = z.object({
  body: z.object({
    sessionName: z.string().optional(),
  }),
});

const getSessionSchema = z.object({
  params: z.object({
    sessionId: z.string(),
  }),
});

/**
 * POST /auth/session/create
 * Create a new WhatsApp session and get QR code
 */
router.post(
  '/session/create',
  requireAuth,
  validateRequest(createSessionSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Generate session ID
      const sessionId = `${userId}-${Date.now()}`;
      
      // Create WhatsApp session
      const session = await whatsappAuth.createSession(userId, sessionId);
      
      // Store in database
      const { error } = await supabase
        .from('whatsapp_sessions')
        .insert({
          id: sessionId,
          userId,
          phoneNumber: '',
          sessionData: {},
          isActive: false,
        });

      if (error) {
        logger.error('Failed to store session in database:', error);
      }

      res.json({
        sessionId: session.id,
        status: session.status,
        qrCode: session.qrCode,
      });
    } catch (error) {
      logger.error('Failed to create WhatsApp session:', error);
      res.status(500).json({ error: 'Failed to create session' });
    }
  }
);

/**
 * GET /auth/session/:sessionId/qr
 * Get QR code for a session
 */
router.get(
  '/session/:sessionId/qr',
  requireAuth,
  validateRequest(getSessionSchema),
  async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const userId = req.user?.id;

      // Verify session belongs to user
      const session = await whatsappAuth.getSession(sessionId);
      if (!session || session.userId !== userId) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const qrCode = await whatsappAuth.getQRCode(sessionId);
      
      if (!qrCode) {
        return res.status(404).json({ 
          error: 'QR code not available',
          status: session.status 
        });
      }

      res.json({ qrCode, status: session.status });
    } catch (error) {
      logger.error('Failed to get QR code:', error);
      res.status(500).json({ error: 'Failed to get QR code' });
    }
  }
);

/**
 * GET /auth/session/:sessionId/status
 * Get session status
 */
router.get(
  '/session/:sessionId/status',
  requireAuth,
  validateRequest(getSessionSchema),
  async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const userId = req.user?.id;

      const session = await whatsappAuth.getSession(sessionId);
      if (!session || session.userId !== userId) {
        return res.status(404).json({ error: 'Session not found' });
      }

      res.json({
        id: session.id,
        status: session.status,
        phoneNumber: session.phoneNumber,
        error: session.error,
      });
    } catch (error) {
      logger.error('Failed to get session status:', error);
      res.status(500).json({ error: 'Failed to get session status' });
    }
  }
);

/**
 * GET /auth/sessions
 * Get all sessions for the current user
 */
router.get('/sessions', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const sessions = await whatsappAuth.getUserSessions(userId);
    
    res.json({
      sessions: sessions.map(s => ({
        id: s.id,
        status: s.status,
        phoneNumber: s.phoneNumber,
        createdAt: s.createdAt,
        lastConnected: s.lastConnected,
      })),
    });
  } catch (error) {
    logger.error('Failed to get user sessions:', error);
    res.status(500).json({ error: 'Failed to get sessions' });
  }
});

/**
 * DELETE /auth/session/:sessionId
 * Disconnect a session
 */
router.delete(
  '/session/:sessionId',
  requireAuth,
  validateRequest(getSessionSchema),
  async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const userId = req.user?.id;

      const session = await whatsappAuth.getSession(sessionId);
      if (!session || session.userId !== userId) {
        return res.status(404).json({ error: 'Session not found' });
      }

      await whatsappAuth.disconnectSession(sessionId);
      
      // Update database
      await supabase
        .from('whatsapp_sessions')
        .update({ isActive: false })
        .eq('id', sessionId);

      res.json({ message: 'Session disconnected' });
    } catch (error) {
      logger.error('Failed to disconnect session:', error);
      res.status(500).json({ error: 'Failed to disconnect session' });
    }
  }
);

/**
 * POST /auth/login
 * Login with email/password (Supabase auth)
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return res.status(401).json({ error: error.message });
    }

    res.json({
      user: data.user,
      session: data.session,
    });
  } catch (error) {
    logger.error('Login failed:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * POST /auth/signup
 * Sign up with email/password
 */
router.post('/signup', async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
      },
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({
      user: data.user,
      session: data.session,
    });
  } catch (error) {
    logger.error('Signup failed:', error);
    res.status(500).json({ error: 'Signup failed' });
  }
});

/**
 * POST /auth/logout
 * Logout current session
 */
router.post('/logout', requireAuth, async (req: Request, res: Response) => {
  try {
    await supabase.auth.signOut();
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Logout failed:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

export default router;