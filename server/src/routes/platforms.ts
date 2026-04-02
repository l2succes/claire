/**
 * Platform Management Routes
 *
 * API endpoints for managing messaging platform connections.
 */

import { Router, Request, Response } from 'express';
import {
  platformManager,
  Platform,
  PlatformStatus,
} from '../adapters';
import { MatrixBridgeAdapter } from '../adapters/matrix';
import { platformConfig } from '../config';
import { logger } from '../utils/logger';
import { requireAuth } from '../middleware/auth';
import { BridgeHttpClient } from '../adapters/matrix/bridge-http-client';

const instagramBridgeClient = new BridgeHttpClient(
  process.env.INSTAGRAM_BRIDGE_URL || 'http://localhost:29319',
  process.env.INSTAGRAM_BRIDGE_SECRET || '',
  process.env.INSTAGRAM_BRIDGE_USER_ID || '@claire_bot:claire.local'
);

const router = Router();

// Apply auth to all routes except GET / (platform listing)
router.use((req, res, next) => {
  if (req.method === 'GET' && req.path === '/') return next();
  return requireAuth(req, res, next);
});

/**
 * GET /platforms
 * List all available platforms and their status
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const platforms = platformManager.getAvailablePlatforms();

    const platformInfo = platforms.map((platform) => {
      const adapter = platformManager.getAdapter(platform);
      return {
        platform,
        enabled: platformConfig[platform as keyof typeof platformConfig]?.enabled ?? false,
        authMethod: adapter?.authMethod,
        capabilities: adapter?.capabilities,
      };
    });

    res.json({
      success: true,
      platforms: platformInfo,
    });
  } catch (error) {
    logger.error('Error listing platforms:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list platforms',
    });
  }
});

/**
 * GET /platforms/:platform/status
 * Get connection status for a specific platform
 */
router.get('/:platform/status', async (req: Request, res: Response) => {
  try {
    const { platform } = req.params;
    const userId = req.user?.id; // Assuming auth middleware sets req.user

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    if (!Object.values(Platform).includes(platform as Platform)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid platform',
      });
    }

    const adapter = platformManager.getAdapter(platform as Platform);
    if (!adapter) {
      return res.status(404).json({
        success: false,
        error: 'Platform not available',
      });
    }

    const sessions = await adapter.getUserSessions(userId);

    // Disable caching so polling always gets fresh session state / QR codes
    res.setHeader('Cache-Control', 'no-store');

    return res.json({
      success: true,
      platform,
      sessions: sessions.map((s) => ({
        id: s.id,
        platform: s.platform,
        status: s.status,
        platformUserId: s.platformUserId,
        platformUsername: s.platformUsername,
        phoneNumber: s.phoneNumber,
        createdAt: s.createdAt,
        lastConnectedAt: s.lastConnectedAt,
        error: s.error,
        authData: s.authData,
      })),
    });
  } catch (error) {
    logger.error('Error getting platform status:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get platform status',
    });
  }
});

/**
 * POST /platforms/instagram/login/start
 * Start Instagram login via mautrix bridge HTTP API.
 * Creates a session and returns the bridge login_id + step_id for the client.
 */
router.post('/instagram/login/start', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const adapter = platformManager.getAdapter(Platform.INSTAGRAM);
    if (!adapter) {
      return res.status(404).json({ success: false, error: 'Instagram not available' });
    }

    const sessionId = `instagram-${userId}-${Date.now()}`;
    await adapter.createSession(userId, sessionId, { platform: Platform.INSTAGRAM } as never);

    // Get login flows and start one
    const flows = await instagramBridgeClient.getLoginFlows();
    const flowId = flows[0]?.id;
    if (!flowId) {
      return res.status(502).json({ success: false, error: 'No login flows available from bridge' });
    }

    const step = await instagramBridgeClient.startLogin(flowId);

    return res.json({ success: true, sessionId, loginId: step.login_id, stepId: step.step_id });
  } catch (error) {
    logger.error('Error starting Instagram login:', error);
    return res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to start Instagram login',
    });
  }
});

/**
 * POST /platforms/instagram/login/submit
 * Submit extracted cookies to the mautrix bridge to complete Instagram login.
 */
router.post('/instagram/login/submit', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { sessionId, loginId, stepId, cookies } = req.body as {
      sessionId: string;
      loginId: string;
      stepId: string;
      cookies: Record<string, string>;
    };

    if (!sessionId || !loginId || !stepId || !cookies) {
      return res.status(400).json({ success: false, error: 'sessionId, loginId, stepId, and cookies are required' });
    }

    const result = await instagramBridgeClient.submitCookies(loginId, stepId, cookies);

    if (result.type === 'complete') {
      const userLoginId = result.complete?.user_login_id;
      logger.info(`Instagram login complete for session ${sessionId}, user ${userLoginId}`);

      // Directly mark the session connected — the HTTP API flow doesn't guarantee
      // a Matrix bot message, so we can't rely on the event handler to do this.
      const matrixAdapter = platformManager.getAdapter(Platform.INSTAGRAM) as MatrixBridgeAdapter;
      await matrixAdapter.markSessionConnected(sessionId, userLoginId);

      return res.json({ success: true, userLoginId });
    }

    // Bridge returned another step (e.g. 2FA) — return it for future handling
    return res.json({ success: true, step: result });
  } catch (error) {
    logger.error('Error submitting Instagram cookies:', error);
    return res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to submit Instagram cookies',
    });
  }
});

/**
 * POST /platforms/:platform/connect
 * Create a new connection to a platform
 */
router.post('/:platform/connect', async (req: Request, res: Response) => {
  try {
    const { platform } = req.params;
    const userId = req.user?.id;
    const { sessionId, ...config } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    if (!Object.values(Platform).includes(platform as Platform)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid platform',
      });
    }

    const adapter = platformManager.getAdapter(platform as Platform);
    if (!adapter) {
      return res.status(404).json({
        success: false,
        error: 'Platform not available',
      });
    }

    // Generate session ID if not provided
    const newSessionId = sessionId || `${platform}-${userId}-${Date.now()}`;

    const session = await adapter.createSession(userId, newSessionId, config);

    // For QR-based auth, return auth data
    const authData = await adapter.getAuthData(newSessionId);

    return res.json({
      success: true,
      session: {
        id: session.id,
        platform: session.platform,
        status: session.status,
        authMethod: session.authMethod,
      },
      authData,
    });
  } catch (error) {
    logger.error('Error connecting to platform:', error);
    return res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to connect to platform',
    });
  }
});

/**
 * DELETE /platforms/:platform/disconnect
 * Disconnect from a platform
 */
router.delete('/:platform/disconnect', async (req: Request, res: Response) => {
  try {
    const { platform } = req.params;
    const { sessionId } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID required',
      });
    }

    if (!Object.values(Platform).includes(platform as Platform)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid platform',
      });
    }

    const adapter = platformManager.getAdapter(platform as Platform);
    if (!adapter) {
      return res.status(404).json({
        success: false,
        error: 'Platform not available',
      });
    }

    // Verify session belongs to user
    const session = await adapter.getSession(sessionId);
    if (!session || session.userId !== userId) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    await adapter.disconnectSession(sessionId);

    return res.json({
      success: true,
      message: 'Disconnected from platform',
    });
  } catch (error) {
    logger.error('Error disconnecting from platform:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to disconnect from platform',
    });
  }
});

/**
 * GET /platforms/:platform/auth
 * Get authentication data (QR code, instructions, etc.)
 */
router.get('/:platform/auth/:sessionId', async (req: Request, res: Response) => {
  try {
    const { platform, sessionId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    if (!Object.values(Platform).includes(platform as Platform)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid platform',
      });
    }

    const adapter = platformManager.getAdapter(platform as Platform);
    if (!adapter) {
      return res.status(404).json({
        success: false,
        error: 'Platform not available',
      });
    }

    // Verify session belongs to user
    const session = await adapter.getSession(sessionId);
    if (!session || session.userId !== userId) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    const authData = await adapter.getAuthData(sessionId);

    return res.json({
      success: true,
      authData,
    });
  } catch (error) {
    logger.error('Error getting auth data:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get auth data',
    });
  }
});

/**
 * POST /platforms/:platform/reconnect
 * Reconnect an existing session
 */
router.post('/:platform/reconnect', async (req: Request, res: Response) => {
  try {
    const { platform } = req.params;
    const { sessionId } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID required',
      });
    }

    if (!Object.values(Platform).includes(platform as Platform)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid platform',
      });
    }

    const adapter = platformManager.getAdapter(platform as Platform);
    if (!adapter) {
      return res.status(404).json({
        success: false,
        error: 'Platform not available',
      });
    }

    // Verify session belongs to user
    const session = await adapter.getSession(sessionId);
    if (!session || session.userId !== userId) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    await adapter.reconnectSession(sessionId);

    const updatedSession = await adapter.getSession(sessionId);

    return res.json({
      success: true,
      session: {
        id: updatedSession?.id,
        status: updatedSession?.status,
        lastConnectedAt: updatedSession?.lastConnectedAt,
      },
    });
  } catch (error) {
    logger.error('Error reconnecting to platform:', error);
    return res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to reconnect to platform',
    });
  }
});

/**
 * GET /platforms/:platform/chats
 * Get chats from a platform session
 */
router.get('/:platform/chats/:sessionId', async (req: Request, res: Response) => {
  try {
    const { platform, sessionId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const adapter = platformManager.getAdapter(platform as Platform);
    if (!adapter) {
      return res.status(404).json({
        success: false,
        error: 'Platform not available',
      });
    }

    // Verify session belongs to user
    const session = await adapter.getSession(sessionId);
    if (!session || session.userId !== userId) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    if (session.status !== PlatformStatus.CONNECTED) {
      return res.status(400).json({
        success: false,
        error: 'Session not connected',
      });
    }

    const chats = await adapter.getChats(sessionId);

    return res.json({
      success: true,
      chats,
    });
  } catch (error) {
    logger.error('Error getting chats:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get chats',
    });
  }
});

/**
 * POST /platforms/:platform/send
 * Send a message via a platform
 */
router.post('/:platform/send', async (req: Request, res: Response) => {
  try {
    const { platform } = req.params;
    const { sessionId, chatId, content, replyToMessageId } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    if (!sessionId || !chatId || !content) {
      return res.status(400).json({
        success: false,
        error: 'Session ID, chat ID, and content are required',
      });
    }

    const adapter = platformManager.getAdapter(platform as Platform);
    if (!adapter) {
      return res.status(404).json({
        success: false,
        error: 'Platform not available',
      });
    }

    // Verify session belongs to user
    const session = await adapter.getSession(sessionId);
    if (!session || session.userId !== userId) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    if (session.status !== PlatformStatus.CONNECTED) {
      return res.status(400).json({
        success: false,
        error: 'Session not connected',
      });
    }

    if (!adapter.capabilities.canSendText) {
      return res.status(400).json({
        success: false,
        error: 'Platform does not support sending messages',
      });
    }

    const message = await adapter.sendMessage(sessionId, chatId, {
      content,
      replyToMessageId,
    });

    return res.json({
      success: true,
      message,
    });
  } catch (error) {
    logger.error('Error sending message:', error);
    return res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to send message',
    });
  }
});

export default router;
