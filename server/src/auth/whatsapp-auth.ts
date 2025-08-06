import { Client, LocalAuth, Message } from 'whatsapp-web.js';
import * as qrcode from 'qrcode';
import { EventEmitter } from 'events';
import { whatsappConfig } from '../config';
import { redis } from '../services/redis';
import { logger } from '../utils/logger';

export interface WhatsAppSession {
  id: string;
  userId: string;
  phoneNumber: string;
  status: 'initializing' | 'qr' | 'authenticated' | 'ready' | 'disconnected' | 'failed';
  qrCode?: string;
  error?: string;
  createdAt: Date;
  lastConnected: Date;
}

export class WhatsAppAuthService extends EventEmitter {
  private clients: Map<string, Client> = new Map();
  private sessions: Map<string, WhatsAppSession> = new Map();

  constructor() {
    super();
    this.restoreExistingSessions();
  }

  /**
   * Create a new WhatsApp Web session for a user
   */
  async createSession(userId: string, sessionId: string): Promise<WhatsAppSession> {
    if (this.clients.has(sessionId)) {
      throw new Error('Session already exists');
    }

    const session: WhatsAppSession = {
      id: sessionId,
      userId,
      phoneNumber: '',
      status: 'initializing',
      createdAt: new Date(),
      lastConnected: new Date(),
    };

    this.sessions.set(sessionId, session);
    await this.saveSessionToRedis(session);

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: sessionId,
        dataPath: whatsappConfig.sessionPath,
      }),
      puppeteer: {
        headless: whatsappConfig.puppeteerHeadless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
        ],
      },
    });

    this.setupClientListeners(client, sessionId);
    this.clients.set(sessionId, client);

    // Initialize the client
    await client.initialize();

    return session;
  }

  /**
   * Setup event listeners for WhatsApp client
   */
  private setupClientListeners(client: Client, sessionId: string) {
    // QR Code generation
    client.on('qr', async (qr: string) => {
      logger.info(`QR code generated for session ${sessionId}`);
      
      const qrDataUrl = await qrcode.toDataURL(qr);
      const session = this.sessions.get(sessionId);
      
      if (session) {
        session.status = 'qr';
        session.qrCode = qrDataUrl;
        await this.saveSessionToRedis(session);
        this.emit('qr', { sessionId, qrCode: qrDataUrl });
      }
    });

    // Authentication successful
    client.on('authenticated', async () => {
      logger.info(`Session ${sessionId} authenticated`);
      
      const session = this.sessions.get(sessionId);
      if (session) {
        session.status = 'authenticated';
        session.qrCode = undefined;
        await this.saveSessionToRedis(session);
        this.emit('authenticated', { sessionId });
      }
    });

    // Client ready
    client.on('ready', async () => {
      logger.info(`Session ${sessionId} ready`);
      
      const info = client.info;
      const session = this.sessions.get(sessionId);
      
      if (session && info) {
        session.status = 'ready';
        session.phoneNumber = info.wid.user;
        session.lastConnected = new Date();
        await this.saveSessionToRedis(session);
        this.emit('ready', { sessionId, phoneNumber: session.phoneNumber });
      }
    });

    // Authentication failure
    client.on('auth_failure', async (msg: string) => {
      logger.error(`Authentication failed for session ${sessionId}: ${msg}`);
      
      const session = this.sessions.get(sessionId);
      if (session) {
        session.status = 'failed';
        session.error = msg;
        await this.saveSessionToRedis(session);
        this.emit('auth_failure', { sessionId, error: msg });
      }
    });

    // Disconnection
    client.on('disconnected', async (reason: string) => {
      logger.warn(`Session ${sessionId} disconnected: ${reason}`);
      
      const session = this.sessions.get(sessionId);
      if (session) {
        session.status = 'disconnected';
        session.error = reason;
        await this.saveSessionToRedis(session);
        this.emit('disconnected', { sessionId, reason });
      }
    });

    // Message received
    client.on('message', async (message: Message) => {
      this.emit('message', { sessionId, message });
    });

    // Message acknowledgment
    client.on('message_ack', async (message: Message, ack: number) => {
      this.emit('message_ack', { sessionId, message, ack });
    });
  }

  /**
   * Get QR code for a session
   */
  async getQRCode(sessionId: string): Promise<string | null> {
    const session = await this.getSession(sessionId);
    return session?.qrCode || null;
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<WhatsAppSession | null> {
    let session = this.sessions.get(sessionId);
    
    if (!session) {
      // Try to load from Redis
      const redisData = await redis.get(`whatsapp:session:${sessionId}`);
      if (redisData) {
        session = JSON.parse(redisData);
        this.sessions.set(sessionId, session);
      }
    }
    
    return session || null;
  }

  /**
   * Get all sessions for a user
   */
  async getUserSessions(userId: string): Promise<WhatsAppSession[]> {
    const sessions: WhatsAppSession[] = [];
    
    // Get from memory
    this.sessions.forEach((session) => {
      if (session.userId === userId) {
        sessions.push(session);
      }
    });
    
    // Also check Redis for any missed sessions
    const keys = await redis.keys(`whatsapp:session:*`);
    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        const session = JSON.parse(data) as WhatsAppSession;
        if (session.userId === userId && !sessions.find(s => s.id === session.id)) {
          sessions.push(session);
        }
      }
    }
    
    return sessions;
  }

  /**
   * Disconnect a session
   */
  async disconnectSession(sessionId: string): Promise<void> {
    const client = this.clients.get(sessionId);
    
    if (client) {
      await client.destroy();
      this.clients.delete(sessionId);
    }
    
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'disconnected';
      await this.saveSessionToRedis(session);
    }
  }

  /**
   * Send a message
   */
  async sendMessage(sessionId: string, to: string, message: string): Promise<Message | null> {
    const client = this.clients.get(sessionId);
    
    if (!client) {
      throw new Error('Session not found or not connected');
    }
    
    const chatId = to.includes('@') ? to : `${to}@c.us`;
    return await client.sendMessage(chatId, message);
  }

  /**
   * Save session to Redis
   */
  private async saveSessionToRedis(session: WhatsAppSession): Promise<void> {
    const key = `whatsapp:session:${session.id}`;
    await redis.setex(key, 86400, JSON.stringify(session)); // Expire after 24 hours
  }

  /**
   * Restore existing sessions on startup
   */
  private async restoreExistingSessions(): Promise<void> {
    try {
      const keys = await redis.keys('whatsapp:session:*');
      
      for (const key of keys) {
        const data = await redis.get(key);
        if (data) {
          const session = JSON.parse(data) as WhatsAppSession;
          
          // Only restore sessions that were previously ready
          if (session.status === 'ready') {
            this.sessions.set(session.id, session);
            
            // Try to reconnect
            try {
              await this.reconnectSession(session.id);
            } catch (error) {
              logger.error(`Failed to restore session ${session.id}:`, error);
            }
          }
        }
      }
      
      logger.info(`Restored ${this.sessions.size} WhatsApp sessions`);
    } catch (error) {
      logger.error('Failed to restore sessions:', error);
    }
  }

  /**
   * Reconnect an existing session
   */
  private async reconnectSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: sessionId,
        dataPath: whatsappConfig.sessionPath,
      }),
      puppeteer: {
        headless: whatsappConfig.puppeteerHeadless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
        ],
      },
    });

    this.setupClientListeners(client, sessionId);
    this.clients.set(sessionId, client);
    
    session.status = 'initializing';
    await this.saveSessionToRedis(session);
    
    await client.initialize();
  }

  /**
   * Check if a session is connected
   */
  isSessionConnected(sessionId: string): boolean {
    const client = this.clients.get(sessionId);
    const session = this.sessions.get(sessionId);
    return !!(client && session?.status === 'ready');
  }

  /**
   * Get client for a session (internal use)
   */
  getClient(sessionId: string): Client | undefined {
    return this.clients.get(sessionId);
  }
}

// Export singleton instance
export const whatsappAuth = new WhatsAppAuthService();