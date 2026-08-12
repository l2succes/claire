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
import { loginWithCredentials, submitTwoFactorCode } from '../services/instagram-login';

// Railway services cannot reach each other through localhost. Keep localhost
// for Docker/local development, but use the private-network bridge address in
// Railway unless an explicit URL is configured.
const defaultInstagramBridgeUrl =
  process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID
    ? 'http://mautrixinstagram.railway.internal:29319'
    : 'http://localhost:29319';

const instagramBridgeClient = new BridgeHttpClient(
  process.env.INSTAGRAM_BRIDGE_URL || defaultInstagramBridgeUrl,
  process.env.INSTAGRAM_BRIDGE_SECRET || process.env.IG_PROVISIONING_SECRET || '',
  process.env.INSTAGRAM_BRIDGE_USER_ID || '@claire_bot:claire.local'
);

const whatsappBridgeClient = new BridgeHttpClient(
  process.env.WHATSAPP_BRIDGE_URL || 'http://mautrixwhatsapp.railway.internal:29318',
  process.env.WHATSAPP_BRIDGE_SECRET || '',
  process.env.WHATSAPP_BRIDGE_USER_ID || '@claire_bot:claire.local'
);

const router = Router();
const INSTAGRAM_LOGIN_URL = 'https://www.instagram.com/accounts/login/';
const REQUIRED_INSTAGRAM_COOKIES = ['sessionid', 'csrftoken', 'mid', 'ig_did', 'ds_user_id'];

function parseCookieString(cookieSource: string): Record<string, string> {
  const normalized = cookieSource
    .replace(/^cookie:\s*/i, '')
    .replace(/\r?\n/g, ';');

  return normalized
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex === -1) return acc;

      const name = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();
      if (name && value) {
        acc[name] = value;
      }
      return acc;
    }, {});
}

function extractCookieStringFromCurl(curlCommand: string): string | null {
  const headerMatch = curlCommand.match(/(?:-H|--header)\s+['"]cookie:\s*([^'"]+)['"]/i);
  if (headerMatch?.[1]) {
    return headerMatch[1];
  }

  const cookieFlagMatch = curlCommand.match(/(?:-b|--cookie)\s+['"]([^'"]+)['"]/i);
  if (cookieFlagMatch?.[1]) {
    return cookieFlagMatch[1];
  }

  return null;
}

function resolveInstagramCookies(body: {
  cookies?: Record<string, string>;
  cookieHeader?: string;
  cookieString?: string;
  curlCommand?: string;
}): Record<string, string> {
  if (body.cookies && Object.keys(body.cookies).length > 0) {
    return body.cookies;
  }

  const rawCookieString =
    body.cookieHeader
    || body.cookieString
    || (body.curlCommand ? extractCookieStringFromCurl(body.curlCommand) : null);

  if (!rawCookieString) {
    throw new Error('Instagram cookies were not provided');
  }

  return parseCookieString(rawCookieString);
}

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

    // Matrix uses one adapter for several bridge platforms. Filter here so
    // /platforms/whatsapp/status can never make Telegram or Instagram appear
    // connected in the client cache.
    const sessions = (await adapter.getUserSessions(userId)).filter(
      (session) => session.platform === platform,
    );

    // Disable caching so polling always gets fresh session state / QR codes
    res.setHeader('Cache-Control', 'no-store');

    return res.json({
      success: true,
      platform,
      sessions: sessions.map((s) => ({
        id: s.id,
        platform: s.platform,
        status: s.status,
        authMethod: s.authMethod,
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
    const client = req.body?.client === 'web' ? 'web' : 'native';
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

    return res.json({
      success: true,
      sessionId,
      loginId: step.login_id,
      stepId: step.step_id,
      stepType: step.type,
      instructions: step.instructions,
      loginUrl: INSTAGRAM_LOGIN_URL,
      requiredCookies: client === 'web' ? REQUIRED_INSTAGRAM_COOKIES : undefined,
    });
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

    const { sessionId, loginId, stepId, cookies, cookieHeader, cookieString, curlCommand } = req.body as {
      sessionId: string;
      loginId: string;
      stepId: string;
      cookies?: Record<string, string>;
      cookieHeader?: string;
      cookieString?: string;
      curlCommand?: string;
    };

    if (!sessionId || !loginId || !stepId) {
      return res.status(400).json({ success: false, error: 'sessionId, loginId, and stepId are required' });
    }

    const resolvedCookies = resolveInstagramCookies({
      cookies,
      cookieHeader,
      cookieString,
      curlCommand,
    });

    if (!resolvedCookies.sessionid) {
      return res.status(400).json({
        success: false,
        error: 'The provided Instagram cookies do not include sessionid',
      });
    }

    const result = await instagramBridgeClient.submitCookies(loginId, stepId, resolvedCookies);

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
 * POST /platforms/instagram/login/credentials
 * Web-only: login with username/password via server-side Puppeteer.
 * On success, submits extracted cookies to the mautrix bridge automatically.
 */
router.post('/instagram/login/credentials', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required' });
    }

    const result = await loginWithCredentials(username, password);

    if (result.status === 'success' && result.cookies) {
      // The client already created a provisioning login in /login/start before
      // opening this credential form. Return cookies to complete *that same*
      // flow via /login/submit. Starting another bridge login here left the
      // original session pending and made a successful sign-in look failed.
      return res.json({ success: true, cookies: result.cookies });
    }

    if (result.status === 'two_factor_required') {
      return res.json({
        success: true,
        status: 'two_factor_required',
        loginId: result.twoFactorInfo?.loginId,
        message: result.twoFactorInfo?.message,
      });
    }

    if (result.status === 'challenge_required') {
      return res.json({
        success: false,
        status: 'challenge_required',
        error: result.error,
      });
    }

    return res.status(400).json({ success: false, error: result.error || 'Login failed' });
  } catch (error) {
    logger.error('Error in Instagram credential login:', error);
    return res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to login with credentials',
    });
  }
});

/**
 * POST /platforms/instagram/login/2fa
 * Submit a 2FA verification code for an in-progress credential login.
 */
router.post('/instagram/login/2fa', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { loginId, code } = req.body as { loginId?: string; code?: string };
    if (!loginId || !code) {
      return res.status(400).json({ success: false, error: 'loginId and code are required' });
    }

    const result = await submitTwoFactorCode(loginId, code);

    if (result.status === 'success' && result.cookies) {
      // Continue the provisioning session from /login/start. See the matching
      // credential path above for why a second bridge login is incorrect.
      return res.json({ success: true, cookies: result.cookies });
    }

    return res.status(400).json({
      success: false,
      error: result.error || '2FA verification failed',
    });
  } catch (error) {
    logger.error('Error in Instagram 2FA verification:', error);
    return res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to verify 2FA code',
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

    // Connection creation is idempotent per user and platform. This is the
    // server-side authority that protects against stale mobile caches, rapid
    // taps, and two clients opening the login screen at the same time.
    const existingSessions = (await adapter.getUserSessions(userId)).filter(
      (existing) => existing.platform === platform,
    );
    const connectedSession = existingSessions.find(
      (existing) => existing.status === PlatformStatus.CONNECTED,
    );
    if (connectedSession) {
      return res.status(409).json({
        success: false,
        code: 'already_connected',
        error: `${platform} is already connected`,
        session: {
          id: connectedSession.id,
          platform: connectedSession.platform,
          status: connectedSession.status,
          authMethod: connectedSession.authMethod,
        },
      });
    }

    const resumableSession = existingSessions.find((existing) => (
      existing.status === PlatformStatus.AWAITING_AUTH
      || existing.status === PlatformStatus.AUTHENTICATING
      || existing.status === PlatformStatus.RECONNECTING
      || existing.status === PlatformStatus.INITIALIZING
    ));
    if (resumableSession) {
      const authData = await adapter.getAuthData(resumableSession.id);
      return res.json({
        success: true,
        resumed: true,
        session: {
          id: resumableSession.id,
          platform: resumableSession.platform,
          status: resumableSession.status,
          authMethod: resumableSession.authMethod,
        },
        authData,
      });
    }

    // Generate session ID if not provided
    const newSessionId = sessionId || `${platform}-${userId}-${Date.now()}`;

    if (platform === Platform.WHATSAPP && process.env.WHATSAPP_BRIDGE_SECRET) {
      const flow = await whatsappBridgeClient.startLogin('phone');
      const codeStep = await whatsappBridgeClient.submitUserInput(
        flow.login_id,
        flow.step_id,
        { phone_number: config.phoneNumber }
      );

      const session = await (adapter as MatrixBridgeAdapter).createSession(
        userId,
        newSessionId,
        { platform: Platform.WHATSAPP, phoneNumber: config.phoneNumber, skipBridgeAuth: true } as never
      );
      const pairingCode = codeStep.display_and_wait?.data;
      await (adapter as MatrixBridgeAdapter).setSessionAuthData(
        session.id,
        pairingCode ? { pairingCode } : undefined
      );

      if (codeStep.type === 'display_and_wait') {
        // This is a long-poll request by design. The bridge only keeps the
        // pairing process alive while this endpoint is being held open.
        void whatsappBridgeClient
          .waitForDisplayAndWait(flow.login_id, codeStep.step_id, codeStep.txn_id)
          .then(async (result) => {
            if (result.type === 'complete') {
              await (adapter as MatrixBridgeAdapter).markSessionConnected(
                session.id,
                result.complete?.user_login_id
              );
              logger.info(`WhatsApp login complete for session ${session.id}`);
              return;
            }

            await (adapter as MatrixBridgeAdapter).markSessionFailed(
              session.id,
              `WhatsApp login returned an unexpected ${result.type} step`
            );
          })
          .catch(async (error) => {
            const message = (error as Error).message || 'WhatsApp login failed';
            logger.error(`WhatsApp pairing flow failed for session ${session.id}:`, error);
            await (adapter as MatrixBridgeAdapter).markSessionFailed(session.id, message);
          });
      }

      return res.json({
        success: true,
        session: {
          id: session.id,
          platform: session.platform,
          status: session.status,
          authMethod: session.authMethod,
        },
        authData: {
          method: 'pairing_code',
          pairingCode,
          status: session.status,
        },
      });
    }

    const session = await adapter.createSession(userId, newSessionId, config);

    // For QR-based auth, return auth data
    const authData = await adapter.getAuthData(session.id);

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
    const errorMessage = (error as Error).message || 'Failed to connect to platform';

    // WhatsApp applies its own pairing-code rate limit. Preserve that status so
    // clients can distinguish a cooldown from an invalid phone number/code.
    if (errorMessage.toLowerCase().includes('rate limited by whatsapp')) {
      return res.status(429).json({
        success: false,
        error: errorMessage,
      });
    }

    return res.status(500).json({
      success: false,
      error: errorMessage,
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
        platform: updatedSession?.platform,
        status: updatedSession?.status,
        authMethod: updatedSession?.authMethod,
        platformUserId: updatedSession?.platformUserId,
        platformUsername: updatedSession?.platformUsername,
        phoneNumber: updatedSession?.phoneNumber,
        createdAt: updatedSession?.createdAt,
        lastConnectedAt: updatedSession?.lastConnectedAt,
        error: updatedSession?.error,
        authData: updatedSession?.authData,
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
