import { EventEmitter } from 'events';
import { whatsappAuth } from '../auth/whatsapp-auth';
import { supabase, realtime } from './supabase';
import { redis } from './redis';
import { logger } from '../utils/logger';

interface SessionHealth {
  sessionId: string;
  userId: string;
  status: 'healthy' | 'warning' | 'critical' | 'disconnected';
  lastCheck: Date;
  consecutiveFailures: number;
  error?: string;
}

export class SessionMonitorService extends EventEmitter {
  private monitoringInterval: NodeJS.Timeout | null = null;
  private sessionHealth: Map<string, SessionHealth> = new Map();
  private readonly CHECK_INTERVAL = 30000; // 30 seconds
  private readonly MAX_FAILURES = 3;
  private readonly RECONNECT_DELAY = 5000; // 5 seconds

  constructor() {
    super();
    this.setupEventListeners();
  }

  /**
   * Start monitoring all active sessions
   */
  start() {
    if (this.monitoringInterval) {
      return;
    }

    logger.info('Starting session monitor service');
    
    // Initial check
    this.checkAllSessions();
    
    // Set up periodic monitoring
    this.monitoringInterval = setInterval(() => {
      this.checkAllSessions();
    }, this.CHECK_INTERVAL);
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('Session monitor service stopped');
    }
  }

  /**
   * Setup event listeners for WhatsApp auth events
   */
  private setupEventListeners() {
    // Listen for WhatsApp auth events
    whatsappAuth.on('ready', ({ sessionId, phoneNumber }) => {
      this.updateSessionHealth(sessionId, 'healthy');
      this.notifySessionStatus(sessionId, 'connected', { phoneNumber });
    });

    whatsappAuth.on('disconnected', ({ sessionId, reason }) => {
      this.updateSessionHealth(sessionId, 'disconnected', reason);
      this.notifySessionStatus(sessionId, 'disconnected', { reason });
      
      // Attempt automatic reconnection
      setTimeout(() => {
        this.attemptReconnect(sessionId);
      }, this.RECONNECT_DELAY);
    });

    whatsappAuth.on('auth_failure', ({ sessionId, error }) => {
      this.updateSessionHealth(sessionId, 'critical', error);
      this.notifySessionStatus(sessionId, 'auth_failed', { error });
    });
  }

  /**
   * Check all active sessions
   */
  private async checkAllSessions() {
    try {
      // Get all active sessions from database
      const { data: sessions, error } = await supabase
        .from('whatsapp_sessions')
        .select('*')
        .eq('isActive', true);

      if (error) {
        logger.error('Failed to fetch active sessions:', error);
        return;
      }

      for (const session of sessions || []) {
        await this.checkSession(session.id, session.userId);
      }
    } catch (error) {
      logger.error('Error checking sessions:', error);
    }
  }

  /**
   * Check individual session health
   */
  private async checkSession(sessionId: string, userId: string) {
    try {
      const isConnected = whatsappAuth.isSessionConnected(sessionId);
      const client = whatsappAuth.getClient(sessionId);
      
      let health = this.sessionHealth.get(sessionId) || {
        sessionId,
        userId,
        status: 'healthy',
        lastCheck: new Date(),
        consecutiveFailures: 0,
      };

      if (!client) {
        // Client doesn't exist, session is dead
        health.status = 'disconnected';
        health.error = 'Client not found';
        health.consecutiveFailures++;
      } else if (!isConnected) {
        // Client exists but not connected
        health.status = 'warning';
        health.consecutiveFailures++;
        
        if (health.consecutiveFailures >= this.MAX_FAILURES) {
          health.status = 'critical';
        }
      } else {
        // Session is healthy
        health.status = 'healthy';
        health.consecutiveFailures = 0;
        health.error = undefined;
      }

      health.lastCheck = new Date();
      this.sessionHealth.set(sessionId, health);

      // Store health status in Redis
      await redis.hset(
        'session:health',
        sessionId,
        JSON.stringify(health)
      );

      // Take action based on health status
      if (health.status === 'critical' || health.status === 'disconnected') {
        await this.handleUnhealthySession(sessionId, health);
      }

      // Emit health status event
      this.emit('health-check', health);
      
    } catch (error) {
      logger.error(`Error checking session ${sessionId}:`, error);
    }
  }

  /**
   * Handle unhealthy session
   */
  private async handleUnhealthySession(sessionId: string, health: SessionHealth) {
    logger.warn(`Session ${sessionId} is unhealthy:`, health);

    // Update database
    await supabase
      .from('whatsapp_sessions')
      .update({
        isActive: false,
        updatedAt: new Date().toISOString(),
      })
      .eq('id', sessionId);

    // Notify user via realtime
    await realtime.broadcast(
      `user:${health.userId}`,
      'session-unhealthy',
      {
        sessionId,
        status: health.status,
        error: health.error,
      }
    );

    // Attempt reconnection for critical sessions
    if (health.status === 'critical') {
      await this.attemptReconnect(sessionId);
    }
  }

  /**
   * Attempt to reconnect a session
   */
  private async attemptReconnect(sessionId: string) {
    try {
      logger.info(`Attempting to reconnect session ${sessionId}`);
      
      const session = await whatsappAuth.getSession(sessionId);
      if (!session) {
        logger.error(`Session ${sessionId} not found for reconnection`);
        return;
      }

      // Only attempt reconnect if session was previously authenticated
      if (session.status === 'ready' || session.status === 'disconnected') {
        await whatsappAuth.createSession(session.userId, sessionId);
        
        // Update health status
        this.updateSessionHealth(sessionId, 'warning', 'Reconnecting');
        
        // Notify user
        await realtime.broadcast(
          `user:${session.userId}`,
          'session-reconnecting',
          { sessionId }
        );
      }
    } catch (error) {
      logger.error(`Failed to reconnect session ${sessionId}:`, error);
    }
  }

  /**
   * Update session health status
   */
  private updateSessionHealth(
    sessionId: string,
    status: SessionHealth['status'],
    error?: string
  ) {
    const health = this.sessionHealth.get(sessionId) || {
      sessionId,
      userId: '',
      status,
      lastCheck: new Date(),
      consecutiveFailures: 0,
    };

    health.status = status;
    health.error = error;
    health.lastCheck = new Date();

    if (status === 'healthy') {
      health.consecutiveFailures = 0;
    }

    this.sessionHealth.set(sessionId, health);
  }

  /**
   * Notify session status change via Supabase Realtime
   */
  private async notifySessionStatus(
    sessionId: string,
    event: string,
    data: any
  ) {
    try {
      const session = await whatsappAuth.getSession(sessionId);
      if (!session) return;

      await realtime.broadcast(
        `user:${session.userId}`,
        `session-${event}`,
        {
          sessionId,
          timestamp: new Date().toISOString(),
          ...data,
        }
      );
    } catch (error) {
      logger.error('Failed to notify session status:', error);
    }
  }

  /**
   * Get session health status
   */
  getSessionHealth(sessionId: string): SessionHealth | undefined {
    return this.sessionHealth.get(sessionId);
  }

  /**
   * Get all session health statuses
   */
  getAllSessionHealth(): SessionHealth[] {
    return Array.from(this.sessionHealth.values());
  }

  /**
   * Force health check for a specific session
   */
  async forceHealthCheck(sessionId: string, userId: string) {
    await this.checkSession(sessionId, userId);
  }
}

// Export singleton instance
export const sessionMonitor = new SessionMonitorService();