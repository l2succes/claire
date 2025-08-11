import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config';
import { logger, stream } from './utils/logger';
import { sessionMonitor } from './services/session-monitor';
import authRoutes from './routes/auth';
import messageRoutes from './routes/messages';
import aiRoutes from './routes/ai';
import { messageIngestion } from './services/message-ingestion';
import { messageQueue } from './services/message-queue';

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

// Start server
const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} in ${config.NODE_ENV} mode`);
  
  // Start session monitor
  sessionMonitor.start();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  sessionMonitor.stop();
  
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

export default app;