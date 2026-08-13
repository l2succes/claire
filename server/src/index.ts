import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import * as Sentry from '@sentry/node';
import { config, platformConfig, matrixConfig, mockBridgeConfig, serverConfig } from './config';
import { initSentry } from './utils/sentry';
import { logger, stream } from './utils/logger';

import { supabase } from './services/supabase';
import { redis } from './services/redis';
import { sessionMonitor } from './services/session-monitor';
import { reminderScheduler } from './services/reminder-scheduler';
import { verifySchemaCached } from './services/schema-verification';
import { resolvePlatformMode } from './config/platform-mode';
import authRoutes from './routes/auth';
import messageRoutes from './routes/messages';
import { BridgeHttpClient } from './adapters/matrix/bridge-http-client';
import aiRoutes from './routes/ai';
import platformRoutes from './routes/platforms';
import conversationRoutes from './routes/conversations';
import preferencesRoutes from './routes/preferences';
import autoReplyRoutes from './routes/auto-reply';
import { aiRateLimit, authRateLimit } from './middleware/rate-limit';
import seedRoutes from './routes/seed';
import promiseRoutes from './routes/promises';
import pushTokenRoutes from './routes/push-tokens';
import contactRoutes from './routes/contacts';
import { platformManager } from './adapters';
import { aiProcessor } from './services/ai-processor';
import { conversationAssistant } from './services/conversation-assistant';
import { promiseDetector } from './services/promise-detector';
import { autoReplyEngine } from './services/auto-reply-engine';
import { pushNotificationService } from './services/push-notification';
import { Platform, PlatformStatus } from './adapters/types';
import { whatsappAdapter } from './adapters/whatsapp';
import { telegramAdapter } from './adapters/telegram';
import { imessageAdapter } from './adapters/imessage';
import { instagramAdapter } from './adapters/instagram';
import { MatrixBridgeAdapter } from './adapters/matrix';
import { mockBridgeAdapter } from './adapters/mock';

// Initialise Sentry as early as possible (no-op when SENTRY_DSN is unset)
initSentry();

const app = express();
const PORT = config.PORT;

// Railway terminates TLS at its edge and forwards the client address. Trust its
// immediately preceding proxy so rate limiting can use the real client IP and
// no longer emits noisy X-Forwarded-For validation errors.
app.set('trust proxy', 1);

async function notifyIncomingMessage(message: {
  userId: string;
  chatId: string;
  platform: string;
  senderName?: string;
  content: string;
  messageId: string;
}): Promise<void> {
  const { data: preferences, error } = await supabase
    .from('user_preferences')
    .select('notification_enabled, preferences')
    .eq('user_id', message.userId)
    .maybeSingle();
  if (error) {
    logger.debug('Notification preferences unavailable:', error.message);
    return;
  }

  const options = (preferences?.preferences || {}) as { notify_messages?: boolean };
  if (preferences?.notification_enabled === false || options.notify_messages === false) return;

  await pushNotificationService.sendToUser(message.userId, {
    title: message.senderName || 'New message',
    body: message.content.trim().slice(0, 160) || 'Sent you an update',
    sound: 'default',
    channelId: 'messages',
    data: {
      type: 'new_message',
      chatId: message.chatId,
      platform: message.platform,
      messageId: message.messageId,
    },
  });
}

// Sentry request handler — must come first in the middleware chain
if (config.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? (origin, callback) => {
        if (!origin || serverConfig.corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error(`Origin ${origin} is not allowed by CORS`));
      }
    : true,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('combined', { stream }));

// Routes
app.use('/auth', authRateLimit, authRoutes);
app.use('/messages', messageRoutes);
app.use('/ai', aiRateLimit, aiRoutes);
app.use('/platforms', platformRoutes);
app.use('/conversations', conversationRoutes);
app.use('/preferences', preferencesRoutes);
// Seed/reset route — only functional when MOCK_BRIDGE=true (guarded inside route)
app.use('/seed', seedRoutes);
app.use('/promises', promiseRoutes);
app.use('/push-tokens', pushTokenRoutes);
app.use('/contacts', contactRoutes);
app.use('/auto-reply', autoReplyRoutes);

// Handle Supabase email confirmation redirects
app.get('/', (_req, res) => {
  // If there's a hash fragment with tokens, serve the confirmation page
  res.sendFile(__dirname + '/routes/email-confirm.html');
});

// Matrix media proxy — serves mxc:// content via the admin token
// Client uses: GET /media/:server/:mediaId
app.get('/media/:server/:mediaId', async (req, res) => {
  if (!matrixConfig.enabled || !matrixConfig.homeserverUrl || !matrixConfig.adminToken) {
    return res.status(503).json({ error: 'Matrix not configured' });
  }
  const { server, mediaId } = req.params;
  const url = `${matrixConfig.homeserverUrl}/_matrix/client/v1/media/download/${server}/${mediaId}`;
  try {
    const upstream = await fetch(url, {
      headers: { Authorization: `Bearer ${matrixConfig.adminToken}` },
    });
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: 'Media not found' });
    }
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    // Matrix media IDs are immutable. Cache aggressively so scrolling an
    // inbox or reopening a chat does not re-download every attachment.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    const buffer = await upstream.arrayBuffer();
    return res.send(Buffer.from(buffer));
  } catch (err) {
    logger.error('Media proxy error:', err);
    return res.status(500).json({ error: 'Failed to fetch media' });
  }
});

// Health / readiness check — reports DB, Redis, and Matrix (when configured)
app.get('/health', async (_req, res) => {
  const checks: Record<
    string,
    { status: 'ok' | 'error'; latencyMs?: number; error?: string; detail?: unknown }
  > = {};

  // --- Supabase / DB ---
  try {
    const t0 = Date.now();
    const { error } = await supabase.from('chats').select('id').limit(1);
    checks.db = error
      ? { status: 'error', error: error.message }
      : { status: 'ok', latencyMs: Date.now() - t0 };
  } catch (err) {
    checks.db = { status: 'error', error: (err as Error).message };
  }

  // --- Schema drift (#99): deploy must not be ahead of the DB schema ---
  if (checks.db?.status === 'ok') {
    try {
      const t0 = Date.now();
      const result = await verifySchemaCached();
      checks.schema = result.ok
        ? { status: 'ok', latencyMs: Date.now() - t0 }
        : {
            status: 'error',
            error: `Schema drift: ${result.drift.map((d) => d.table).join(', ')}`,
            detail: result.drift,
          };
    } catch (err) {
      checks.schema = { status: 'error', error: (err as Error).message };
    }
  }

  // --- Redis ---
  try {
    const t0 = Date.now();
    const ok = await redis.ping();
    checks.redis = ok
      ? { status: 'ok', latencyMs: Date.now() - t0 }
      : { status: 'error', error: 'PONG not received' };
  } catch (err) {
    checks.redis = { status: 'error', error: (err as Error).message };
  }

  // --- Matrix (only when PLATFORM_MODE=matrix) ---
  if (matrixConfig.enabled && matrixConfig.homeserverUrl) {
    try {
      const t0 = Date.now();
      const resp = await fetch(`${matrixConfig.homeserverUrl}/_matrix/client/versions`, {
        signal: AbortSignal.timeout(3000),
      });
      checks.matrix = resp.ok
        ? { status: 'ok', latencyMs: Date.now() - t0 }
        : { status: 'error', error: `HTTP ${resp.status}` };
    } catch (err) {
      checks.matrix = { status: 'error', error: (err as Error).message };
    }
  }

  const allOk = Object.values(checks).every((c) => c.status === 'ok');
  const httpStatus = allOk ? 200 : 503;

  res.status(httpStatus).json({
    status: allOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.NODE_ENV,
    platformMode: resolvePlatformMode({
      mockBridge: mockBridgeConfig.enabled,
      platformMode: matrixConfig.mode,
    }),
    checks,
    mockBridge: mockBridgeConfig.enabled,
  });
});

// Error handling middleware
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  if (config.SENTRY_DSN) {
    Sentry.captureException(err);
  }
  res.status(err.status || 500).json({
    error: config.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Initialize platform adapters
async function initializePlatforms() {
  if (mockBridgeConfig.enabled) {
    // Mock mode: replace all real adapters with a scripted fake adapter
    logger.info('MOCK_BRIDGE=true — using mock bridge adapter (no Docker/Matrix required)');
    platformManager.setMatrixMode(mockBridgeAdapter);
  } else {
    const mode = matrixConfig.enabled ? 'matrix' : 'direct';
    logger.info(`Initializing platform adapters in ${mode} mode...`);

    // #96: direct mode in production diverges from the documented Matrix
    // architecture. Config validation already blocks a *silent* default, so
    // reaching here means direct mode was chosen explicitly — flag it loudly.
    if (config.NODE_ENV === 'production' && mode === 'direct') {
      logger.warn(
        '⚠️  Running platform adapters in DIRECT mode in production — this diverges ' +
          'from the documented Synapse/mautrix architecture. Set PLATFORM_MODE=matrix if unintended.'
      );
    }

    if (matrixConfig.enabled) {
      // Matrix mode: Use MatrixBridgeAdapter for all platforms via bridges
      logger.info('Using Matrix bridges for platform integration');

      const matrixAdapter = new MatrixBridgeAdapter({
        homeserverUrl: matrixConfig.homeserverUrl!,
        serverName: matrixConfig.serverName!,
        adminAccessToken: matrixConfig.adminToken,
        botUserId: matrixConfig.botUserId,
        configuredSelfGhostIds: {
          [Platform.WHATSAPP]: (process.env.WHATSAPP_SELF_GHOST_IDS || '')
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean),
        },
        resolveSelfGhostIds: async (platform, platformUserId) => {
          if (platform !== Platform.WHATSAPP || !process.env.WHATSAPP_BRIDGE_SECRET) {
            return [];
          }

          const bridge = new BridgeHttpClient(
            process.env.WHATSAPP_BRIDGE_URL || 'http://mautrixwhatsapp.railway.internal:29318',
            process.env.WHATSAPP_BRIDGE_SECRET,
            process.env.WHATSAPP_BRIDGE_USER_ID || '@claire_bot:claire.local'
          );
          // The provisioning resolver returns the bridge's canonical phone
          // ghost. Keep it as an additional exact alias; deployment-known LID
          // aliases above cover primary-device events until mautrix exposes
          // the phone<->LID map through provisioning.
          const resolved = await bridge.resolveIdentifier(platformUserId, platformUserId);
          return resolved.mxid ? [resolved.mxid] : [];
        },
      });

      platformManager.setMatrixMode(matrixAdapter);
    } else {
      // Direct mode: Use native platform adapters
      logger.info('Using direct platform adapters');

      if (platformConfig.whatsapp.enabled) {
        platformManager.registerAdapter(whatsappAdapter);
      }
      if (platformConfig.telegram.enabled) {
        platformManager.registerAdapter(telegramAdapter);
      }
      if (platformConfig.imessage.enabled) {
        platformManager.registerAdapter(imessageAdapter);
      }
      if (platformConfig.instagram.enabled) {
        platformManager.registerAdapter(instagramAdapter);
      }
    }
  }

  // Setup unified message handler BEFORE initialize so backfill is captured
  platformManager.onMessage(async (message) => {
    logger.debug(`Message received from ${message.platform}: ${message.id}`);

    // Skip WhatsApp status broadcasts
    if (message.chatId === 'status@broadcast' || message.platformMetadata?.isStatus) {
      return;
    }

    try {
      // Fast-path: skip duplicate messages (backfill replay) without touching the DB further
      const { data: existing } = await supabase
        .from('messages')
        .select('id')
        .eq('whatsapp_id', message.platformMessageId)
        .maybeSingle();

      if (existing) {
        return; // already processed — skip chat/AI/contact upserts
      }

      logger.info(`New message from ${message.platform}: ${message.platformMessageId}`);

      // 1. Upsert chat record to get its UUID
      const { data: chat, error: chatError } = await supabase
        .from('chats')
        .upsert({
          user_id: message.userId,
          whatsapp_chat_id: message.chatId,
          platform_chat_id: message.chatId,
          platform: message.platform,
          name: message.chatName || message.chatId,
          is_group: message.chatType === 'group',
          last_message_at: message.timestamp,
        }, { onConflict: 'user_id,platform,platform_chat_id' })
        .select('id')
        .single();

      if (chatError || !chat) {
        logger.error('Failed to upsert chat:', chatError);
        return;
      }

      // History replays and own-device messages must never create unread
      // badges. Only a newly inserted live incoming message increments the
      // local conversation counter below.
      const isBackfill = message.platformMetadata?.syncKind === 'backfill';

      // Link incoming messages to the resolved Matrix contact. This gives the
      // inbox a stable avatar/name relationship instead of trying to infer it
      // from the latest message row on every render.
      let contactId: string | null = null;
      const senderContactId = !message.isFromMe
        ? message.senderId?.match(/@(?:whatsapp|_telegram|meta|_imessage)_([^:]+):/)?.[1] || null
        : null;
      if (senderContactId) {
        const platformContactId = senderContactId;
        {
          const { data: contact, error: contactError } = await supabase
            .from('contacts')
            .upsert({
              user_id: message.userId,
              platform: message.platform,
              platform_contact_id: platformContactId,
              whatsapp_id: platformContactId,
              name: message.senderName || platformContactId,
              phone_number: /^\d+$/.test(platformContactId) ? platformContactId : null,
            }, { onConflict: 'user_id,platform,platform_contact_id' })
            .select('id')
            .single();
          if (contactError) {
            logger.debug('Failed to upsert contact:', contactError);
          } else {
            contactId = contact?.id || null;
          }
        }
      }
      if (contactId && message.chatType === 'individual') {
        await supabase.from('chats').update({ contact_id: contactId }).eq('id', chat.id);
      }

      // 2. Insert message record (ignoreDuplicates as a safety net)
      const { data: savedMsg, error: msgError } = await supabase
        .from('messages')
        .upsert({
          user_id: message.userId,
          chat_id: chat.id,
          whatsapp_id: message.platformMessageId,
          platform_message_id: message.platformMessageId,
          platform: message.platform,
          content: message.content,
          from_me: message.isFromMe,
          type: message.contentType,
          content_type: message.contentType,
          timestamp: message.timestamp,
          is_group: message.chatType === 'group',
          contact_id: contactId,
          contact_name: message.isFromMe ? null : (message.senderName || null),
          contact_phone: message.isFromMe ? null : senderContactId,
          metadata: message.platformMetadata || null,
          media_url: (() => {
            const mediaUrl = message.platformMetadata?.mediaUrl;
            if (!mediaUrl || typeof mediaUrl !== 'string') return null;
            if (mediaUrl.startsWith('/media/')) return mediaUrl;
            const match = mediaUrl.match(/^mxc:\/\/([^/]+)\/(.+)$/)
              || mediaUrl.match(/\/_matrix\/(?:client\/v1\/media|media\/v3)\/(?:thumbnail|download)\/([^/]+)\/([^?]+)/);
            return match ? `/media/${encodeURIComponent(match[1])}/${encodeURIComponent(match[2])}` : mediaUrl;
          })(),
          media_mime_type:
            (message.platformMetadata?.mediaInfo as { mimetype?: string } | undefined)?.mimetype || null,
        }, { onConflict: 'whatsapp_id', ignoreDuplicates: true })
        .select('id')
        .maybeSingle();

      if (msgError) {
        logger.error('Failed to upsert message:', msgError);
      } else {
        logger.debug(`Message saved: ${message.platformMessageId}`);

        if (!message.isFromMe && !isBackfill && savedMsg?.id) {
          const { error: unreadError } = await supabase.rpc('increment_chat_unread', {
            target_chat_id: chat.id,
            target_user_id: message.userId,
          });
          if (unreadError) {
            logger.warn('Failed to increment chat unread count', { error: unreadError });
          }
        }

        if (!message.isFromMe && savedMsg?.id) {
          void notifyIncomingMessage({
            userId: message.userId,
            chatId: chat.id,
            platform: message.platform,
            senderName: message.senderName,
            content: message.content,
            messageId: savedMsg.id,
          }).catch((error) => logger.debug('Incoming push notification skipped:', (error as Error).message));
        }

        // Generate AI response suggestion for incoming messages (fire-and-forget)
        if (!message.isFromMe && savedMsg?.id && message.content?.trim() && aiProcessor.isConfigured) {
          const chatType = message.chatType === 'group' ? 'group' : 'individual';
          aiProcessor.generateAndStore(savedMsg.id, message.content, message.userId, chatType)
            .catch((err) => logger.debug('AI suggestion skipped:', (err as Error).message));
        }

        // Keep the global Ask Claire index current for new text/caption rows.
        if (savedMsg?.id && message.content?.trim() && conversationAssistant.isConfigured) {
          void conversationAssistant.indexMessage({
            id: savedMsg.id,
            user_id: message.userId,
            content: message.content,
            contact_name: message.isFromMe ? null : (message.senderName || null),
            from_me: message.isFromMe,
            timestamp: message.timestamp instanceof Date ? message.timestamp.toISOString() : String(message.timestamp),
            platform: message.platform,
          }).catch((err) => logger.debug('Conversation assistant index skipped:', (err as Error).message));
        }

        // Detect and persist promises (fire-and-forget, both inbound and outbound)
        if (savedMsg?.id && message.content?.trim()) {
          promiseDetector.detectPromises(savedMsg.id, message.content, message.userId, message.isFromMe)
            .catch((err) => logger.debug('Promise detection skipped:', (err as Error).message));
        }

        // Evaluate auto-reply rules for incoming messages (fire-and-forget)
        if (!message.isFromMe && message.content?.trim()) {
          autoReplyEngine.evaluate({
            id: savedMsg?.id ?? message.platformMessageId,
            userId: message.userId,
            chatId: message.chatId,
            platform: message.platform,
            content: message.content,
            senderName: message.senderName,
          }).then(async (result) => {
            if (result.fired && result.reply) {
              logger.info(`Auto-reply rule "${result.ruleName}" fired — reply queued for chat ${message.chatId}`);
              try {
                const sessions = await platformManager.getUserSessions(message.userId);
                const session = sessions.find(
                  (candidate) =>
                    candidate.platform === message.platform &&
                    candidate.status === PlatformStatus.CONNECTED,
                );
                if (session) {
                  await platformManager.sendMessage(
                    message.platform,
                    session.id,
                    message.chatId,
                    { content: result.reply },
                  );
                } else {
                  logger.warn(`Auto-reply: no active session for user ${message.userId} on ${message.platform}`);
                }
              } catch (err) {
                logger.warn('Auto-reply send failed:', (err as Error).message);
              }
            }
          }).catch((err: Error) => logger.debug('Auto-reply evaluation skipped:', err.message));
        }
      }

    } catch (err) {
      logger.error('Error saving message to DB:', err);
    }
  });

  // Initialize all registered adapters (after handler is registered so backfill is captured)
  await platformManager.initialize();

  logger.info('Platform adapters initialized');
}

// Start server
const server = app.listen(PORT, async () => {
  logger.info(`Server running on port ${PORT} in ${config.NODE_ENV} mode`);

  // Start session monitor
  sessionMonitor.start();

  // Start promise reminder scheduler
  reminderScheduler.start();

  // Initialize platforms
  await initializePlatforms();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');

  sessionMonitor.stop();
  await reminderScheduler.stop();
  await platformManager.shutdown();

  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

export default app;
