import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config, platformConfig, matrixConfig } from './config';
import { logger, stream } from './utils/logger';
import { sessionMonitor } from './services/session-monitor';
import authRoutes from './routes/auth';
import messageRoutes from './routes/messages';
import aiRoutes from './routes/ai';
import platformRoutes from './routes/platforms';
import { platformManager } from './adapters';
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

// Handle Supabase email confirmation redirects
app.get('/', (req, res) => {
  // If there's a hash fragment with tokens, serve the confirmation page
  res.sendFile(__dirname + '/routes/email-confirm.html');
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

  // Initialize all registered adapters
  await platformManager.initialize();

  // Setup unified message handler
  platformManager.onMessage((message) => {
    logger.info(`Message received from ${message.platform}: ${message.id}`);
    // TODO: Route to message ingestion service
  });

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