import { Router, Request, Response } from 'express';
import { z } from 'zod';
import path from 'path';
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
 * GET /auth/confirm
 * Handle email confirmation redirects
 */
router.get('/confirm', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, 'email-confirm.html'));
});

/**
 * GET /auth/callback
 * Handle OAuth callback redirects (Google, etc.)
 * This is a simple passthrough that extracts tokens and redirects to the app
 */
router.get('/callback', (req: Request, res: Response) => {
  // Return HTML that handles the OAuth callback
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Authentication Successful</title>
      <meta charset="utf-8">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          margin: 0;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          text-align: center;
        }
        .container {
          padding: 2rem;
        }
        h1 {
          font-size: 2rem;
          margin-bottom: 1rem;
        }
        p {
          font-size: 1.1rem;
          opacity: 0.9;
        }
        .spinner {
          margin: 2rem auto;
          width: 50px;
          height: 50px;
          border: 4px solid rgba(255,255,255,0.3);
          border-top: 4px solid white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="spinner"></div>
        <h1>Authentication Successful</h1>
        <p>Redirecting you back to the app...</p>
      </div>
      <script>
        // Extract tokens from URL hash
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);

        // If this is in a popup window, send message to opener
        if (window.opener) {
          window.opener.postMessage({
            type: 'oauth-callback',
            hash: hash
          }, window.location.origin);
          window.close();
        } else {
          // If not in popup, redirect to app with tokens
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');

          if (accessToken) {
            // Redirect to app with tokens
            window.location.href = \`/\#access_token=\${accessToken}&refresh_token=\${refreshToken || ''}\`;
          } else {
            // No tokens, redirect to signin
            window.location.href = '/';
          }
        }
      </script>
    </body>
    </html>
  `);
});

/**
 * POST /auth/session/create-test
 * Create a test WhatsApp session (development only)
 */
router.post('/session/create-test', async (req: Request, res: Response) => {
  try {
    // Only allow in development mode
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Test mode not available in production' });
    }

    const testUserId = 'test-user-123';
    const sessionId = `test-${Date.now()}`;
    
    // Return mock QR code for testing
    res.json({
      sessionId,
      status: 'qr',
      qrCode: 'https://via.placeholder.com/280x280/10b981/ffffff?text=Test+QR+Code',
    });
  } catch (error) {
    logger.error('Failed to create test session:', error);
    res.status(500).json({ error: 'Failed to create test session' });
  }
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
        .from('platform_sessions')
        .insert({
          id: sessionId,
          user_id: userId,
          phone_number: '',
          session_data: {},
          status: 'qr',
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
        .from('platform_sessions')
        .update({ status: 'disconnected' })
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