import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config, platformConfig, matrixConfig } from './config';
import { logger, stream } from './utils/logger';
import { supabase } from './services/supabase';
import { sessionMonitor } from './services/session-monitor';
import authRoutes from './routes/auth';
import messageRoutes from './routes/messages';
import aiRoutes from './routes/ai';
import platformRoutes from './routes/platforms';
import conversationRoutes from './routes/conversations';
import { platformManager } from './adapters';
import { aiProcessor } from './services/ai-processor';
import { whatsappAdapter } from './adapters/whatsapp';
import { telegramAdapter } from './adapters/telegram';
import { imessageAdapter } from './adapters/imessage';
import { instagramAdapter } from './adapters/instagram';
import { MatrixBridgeAdapter } from './adapters/matrix';

const app = express();
const PORT = config.PORT;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://claire.app'] // Update with your domain
    : true,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('combined', { stream }));

// Routes
app.use('/auth', authRoutes);
app.use('/messages', messageRoutes);
app.use('/ai', aiRoutes);
app.use('/platforms', platformRoutes);
app.use('/conversations', conversationRoutes);

// Handle Supabase email confirmation redirects
app.get('/', (req, res) => {
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
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const buffer = await upstream.arrayBuffer();
    return res.send(Buffer.from(buffer));
  } catch (err) {
    logger.error('Media proxy error:', err);
    return res.status(500).json({ error: 'Failed to fetch media' });
  }
});

// Health check
app.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.NODE_ENV,
  };
  
  res.json(health);
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  
  res.status(err.status || 500).json({
    error: config.NODE_ENV === 'production' 
      ? 'Internal server error'
      : err.message,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Initialize platform adapters
async function initializePlatforms() {
  const mode = matrixConfig.enabled ? 'matrix' : 'direct';
  logger.info(`Initializing platform adapters in ${mode} mode...`);

  if (matrixConfig.enabled) {
    // Matrix mode: Use MatrixBridgeAdapter for all platforms via bridges
    logger.info('Using Matrix bridges for platform integration');

    const matrixAdapter = new MatrixBridgeAdapter({
      homeserverUrl: matrixConfig.homeserverUrl!,
      serverName: matrixConfig.serverName!,
      adminAccessToken: matrixConfig.adminToken,
      botUserId: matrixConfig.botUserId,
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

  // Setup unified message handler BEFORE initialize so backfill is captured
  platformManager.onMessage(async (message) => {
    logger.info(`Message received from ${message.platform}: ${message.id}`);

    // Skip WhatsApp status broadcasts
    if (message.chatId === 'status@broadcast' || message.platformMetadata?.isStatus) {
      return;
    }

    try {
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

      // 2. Upsert message record
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
          contact_name: message.isFromMe ? null : (message.senderName || null),
          contact_phone: message.isFromMe ? null : message.senderId?.replace(/@.*/, '') || null,
          metadata: message.platformMetadata || null,
          media_url: (() => {
            const mxc = message.platformMetadata?.mediaUrl;
            if (!mxc || typeof mxc !== 'string') return null;
            const match = mxc.match(/^mxc:\/\/([^/]+)\/(.+)$/);
            return match ? `/media/${match[1]}/${match[2]}` : null;
          })(),
          media_mime_type: message.platformMetadata?.mediaInfo?.mimetype || null,
        }, { onConflict: 'whatsapp_id' })
        .select('id')
        .single();

      if (msgError) {
        logger.error('Failed to upsert message:', msgError);
      } else {
        logger.debug(`Message saved: ${message.platformMessageId}`);

        // Generate AI response suggestion for incoming messages (fire-and-forget)
        if (!message.isFromMe && savedMsg?.id && message.content?.trim()) {
          const chatType = message.chatType === 'group' ? 'group' : 'individual';
          aiProcessor.generateAndStore(savedMsg.id, message.content, message.userId, chatType)
            .catch((err) => logger.debug('AI suggestion skipped:', (err as Error).message));
        }
      }

      // 3. Upsert contact for the sender (if not from me)
      if (!message.isFromMe && message.senderId) {
        // Extract platform contact ID from ghost user ID
        // Patterns: @whatsapp_12345:... @_telegram_12345:... @meta_12345:... @_imessage_+15551234567:...
        const contactMatch = message.senderId.match(/@(?:whatsapp|_telegram|meta|_imessage)_([^:]+):/);
        const platformContactId = contactMatch?.[1];
        if (platformContactId) {
          const { error: contactError } = await supabase
            .from('contacts')
            .upsert({
              user_id: message.userId,
              platform: message.platform,
              platform_contact_id: platformContactId,
              whatsapp_id: platformContactId,
              name: message.senderName || platformContactId,
              phone_number: /^\d+$/.test(platformContactId) ? platformContactId : null,
            }, { onConflict: 'user_id,platform,platform_contact_id' });

          if (contactError) {
            logger.debug('Failed to upsert contact:', contactError);
          }
        }
      }

      // 3. Upsert contact for the sender (if not from me)
      if (!message.isFromMe && message.senderId) {
        // Extract platform contact ID from ghost user ID
        // Patterns: @whatsapp_12345:... @_telegram_12345:... @meta_12345:... @_imessage_+15551234567:...
        const contactMatch = message.senderId.match(/@(?:whatsapp|_telegram|meta|_imessage)_([^:]+):/);
        const platformContactId = contactMatch?.[1];
        if (platformContactId) {
          const { error: contactError } = await supabase
            .from('contacts')
            .upsert({
              user_id: message.userId,
              platform: message.platform,
              platform_contact_id: platformContactId,
              whatsapp_id: platformContactId,
              name: message.senderName || platformContactId,
              phone_number: /^\d+$/.test(platformContactId) ? platformContactId : null,
            }, { onConflict: 'user_id,platform,platform_contact_id' });

          if (contactError) {
            logger.debug('Failed to upsert contact:', contactError);
          }
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

  // Initialize platforms
  await initializePlatforms();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');

  sessionMonitor.stop();
  await platformManager.shutdown();

  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

export default app;