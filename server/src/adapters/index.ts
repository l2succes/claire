/**
 * Platform Manager
 *
 * Central registry and router for all messaging platform adapters.
 * Handles adapter initialization, message routing, and unified event handling.
 */

import {
  Platform,
  IPlatformAdapter,
  UnifiedMessage,
  PlatformEvent,
  PlatformEventData,
  PlatformSession,
  OutgoingMessage,
  UnifiedContact,
  UnifiedChat,
} from './types';
import { logger } from '../utils/logger';

// Re-export types for convenience
export * from './types';

type MessageHandler = (message: UnifiedMessage) => void | Promise<void>;
type EventHandler = (data: PlatformEventData) => void | Promise<void>;

class PlatformManager {
  private adapters: Map<Platform, IPlatformAdapter> = new Map();
  private messageHandlers: Set<MessageHandler> = new Set();
  private eventHandlers: Map<PlatformEvent, Set<EventHandler>> = new Map();
  private initialized: boolean = false;
  private matrixMode: boolean = false;
  private matrixAdapter: IPlatformAdapter | null = null;

  /**
   * Register a platform adapter
   */
  registerAdapter(adapter: IPlatformAdapter): void {
    if (this.adapters.has(adapter.platform)) {
      logger.warn(`Adapter for ${adapter.platform} already registered, replacing`);
    }
    this.adapters.set(adapter.platform, adapter);
    logger.info(`Platform adapter registered: ${adapter.platform}`);
  }

  /**
   * Set matrix mode - use a single adapter for all platforms
   * In matrix mode, the MatrixBridgeAdapter handles all platforms via bridges
   */
  setMatrixMode(adapter: IPlatformAdapter): void {
    this.matrixMode = true;
    this.matrixAdapter = adapter;

    // Register the matrix adapter for all platforms
    for (const platform of Object.values(Platform)) {
      this.adapters.set(platform as Platform, adapter);
    }

    logger.info('PlatformManager set to Matrix mode - all platforms via Matrix bridges');
  }

  /**
   * Check if running in matrix mode
   */
  isMatrixMode(): boolean {
    return this.matrixMode;
  }

  /**
   * Initialize all registered adapters
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('PlatformManager already initialized');
      return;
    }

    logger.info(`Initializing platform adapters (matrix mode: ${this.matrixMode})...`);

    if (this.matrixMode && this.matrixAdapter) {
      // In matrix mode, only initialize the single matrix adapter once
      try {
        await this.matrixAdapter.initialize();
        this.setupAdapterEventHandlers(this.matrixAdapter);
        logger.info('Matrix bridge adapter initialized for all platforms');
      } catch (error) {
        logger.error('Failed to initialize Matrix adapter:', error);
        throw error;
      }
    } else {
      // Direct mode - initialize each adapter separately
      for (const [platform, adapter] of this.adapters) {
        try {
          await adapter.initialize();
          this.setupAdapterEventHandlers(adapter);
          logger.info(`Platform adapter initialized: ${platform}`);
        } catch (error) {
          logger.error(`Failed to initialize ${platform} adapter:`, error);
        }
      }
    }

    this.initialized = true;
    logger.info('PlatformManager initialization complete');
  }

  /**
   * Setup event handlers for an adapter
   */
  private setupAdapterEventHandlers(adapter: IPlatformAdapter): void {
    // Forward message events to unified handler
    adapter.on('message', (data: PlatformEventData) => {
      this.handleIncomingMessage(data.data as UnifiedMessage);
      this.forwardEvent('message', data);
    });

    // Forward all other events
    const events: PlatformEvent[] = [
      'message_ack',
      'message_deleted',
      'message_edited',
      'typing',
      'presence',
      'session_ready',
      'session_disconnected',
      'session_error',
      'qr_code',
      'auth_failure',
    ];

    for (const event of events) {
      adapter.on(event, (data: PlatformEventData) => {
        this.forwardEvent(event, data);
      });
    }
  }

  /**
   * Handle incoming message from any platform
   */
  private handleIncomingMessage(message: UnifiedMessage): void {
    logger.debug(`Message received from ${message.platform}`, {
      messageId: message.id,
      chatId: message.chatId,
    });

    for (const handler of this.messageHandlers) {
      try {
        handler(message);
      } catch (error) {
        logger.error('Error in message handler:', error);
      }
    }
  }

  /**
   * Forward events to registered handlers
   */
  private forwardEvent(event: PlatformEvent, data: PlatformEventData): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (error) {
          logger.error(`Error in ${event} event handler:`, error);
        }
      }
    }
  }

  // Public API

  /**
   * Get an adapter by platform
   */
  getAdapter(platform: Platform): IPlatformAdapter | undefined {
    return this.adapters.get(platform);
  }

  /**
   * Get all available platforms
   */
  getAvailablePlatforms(): Platform[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Check if a platform is registered
   */
  hasPlatform(platform: Platform): boolean {
    return this.adapters.has(platform);
  }

  /**
   * Subscribe to incoming messages from all platforms
   */
  onMessage(handler: MessageHandler): void {
    this.messageHandlers.add(handler);
  }

  /**
   * Unsubscribe from incoming messages
   */
  offMessage(handler: MessageHandler): void {
    this.messageHandlers.delete(handler);
  }

  /**
   * Subscribe to a specific event type
   */
  onEvent(event: PlatformEvent, handler: EventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  /**
   * Unsubscribe from a specific event type
   */
  offEvent(event: PlatformEvent, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  // Session management shortcuts

  /**
   * Create a session on a specific platform
   */
  async createSession(
    platform: Platform,
    userId: string,
    sessionId: string,
    config?: unknown
  ): Promise<PlatformSession> {
    const adapter = this.adapters.get(platform);
    if (!adapter) {
      throw new Error(`Platform ${platform} not registered`);
    }
    return adapter.createSession(userId, sessionId, config);
  }

  /**
   * Get a session by ID across all platforms
   */
  async getSession(sessionId: string): Promise<PlatformSession | null> {
    for (const adapter of this.adapters.values()) {
      const session = await adapter.getSession(sessionId);
      if (session) {
        return session;
      }
    }
    return null;
  }

  /**
   * Get all sessions for a user across all platforms
   */
  async getUserSessions(userId: string): Promise<PlatformSession[]> {
    const sessions: PlatformSession[] = [];
    for (const adapter of this.adapters.values()) {
      const adapterSessions = await adapter.getUserSessions(userId);
      sessions.push(...adapterSessions);
    }
    return sessions;
  }

  /**
   * Disconnect a session
   */
  async disconnectSession(platform: Platform, sessionId: string): Promise<void> {
    const adapter = this.adapters.get(platform);
    if (!adapter) {
      throw new Error(`Platform ${platform} not registered`);
    }
    await adapter.disconnectSession(sessionId);
  }

  // Messaging shortcuts

  /**
   * Send a message via a specific platform
   */
  async sendMessage(
    platform: Platform,
    sessionId: string,
    chatId: string,
    message: OutgoingMessage
  ): Promise<UnifiedMessage> {
    const adapter = this.adapters.get(platform);
    if (!adapter) {
      throw new Error(`Platform ${platform} not registered`);
    }
    return adapter.sendMessage(sessionId, chatId, message);
  }

  /**
   * Get contacts from a specific platform session
   */
  async getContacts(platform: Platform, sessionId: string): Promise<UnifiedContact[]> {
    const adapter = this.adapters.get(platform);
    if (!adapter) {
      throw new Error(`Platform ${platform} not registered`);
    }
    return adapter.getContacts(sessionId);
  }

  /**
   * Get chats from a specific platform session
   */
  async getChats(platform: Platform, sessionId: string): Promise<UnifiedChat[]> {
    const adapter = this.adapters.get(platform);
    if (!adapter) {
      throw new Error(`Platform ${platform} not registered`);
    }
    return adapter.getChats(sessionId);
  }

  /**
   * Shutdown all adapters
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down PlatformManager...');

    for (const [platform, adapter] of this.adapters) {
      try {
        await adapter.shutdown();
        logger.info(`Platform adapter shutdown: ${platform}`);
      } catch (error) {
        logger.error(`Error shutting down ${platform} adapter:`, error);
      }
    }

    this.messageHandlers.clear();
    this.eventHandlers.clear();
    this.initialized = false;

    logger.info('PlatformManager shutdown complete');
  }
}

// Export singleton instance
export const platformManager = new PlatformManager();
