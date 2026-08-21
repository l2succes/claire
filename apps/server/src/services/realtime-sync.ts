import { EventEmitter } from 'events';
import { supabase } from './supabase';
import { logger } from '../utils/logger';

interface RealtimeMessage {
  id: string;
  userId: string;
  type: 'message' | 'status' | 'typing' | 'presence';
  payload: any;
  timestamp: Date;
}

export class RealtimeSyncService extends EventEmitter {
  private userChannels: Map<string, any> = new Map();
  private messageBuffers: Map<string, RealtimeMessage[]> = new Map();
  // See session-monitor.ts: the DOM lib leaks in, so `setInterval` is not
  // guaranteed to hand back a `NodeJS.Timeout`.
  private syncIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();

  constructor() {
    super();
  }

  /**
   * Subscribe user to real-time updates
   */
  async subscribeUser(userId: string, socketId?: string) {
    try {
      // Create user-specific channel
      const channelName = `user:${userId}`;
      
      if (this.userChannels.has(channelName)) {
        logger.info(`User ${userId} already subscribed to realtime`);
        return;
      }

      const channel = supabase
        .channel(channelName)
        .on('broadcast', { event: '*' }, (payload) => {
          this.handleUserBroadcast(userId, payload);
        })
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          this.handlePresenceSync(userId, state);
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            // Track user presence
            await channel.track({
              user_id: userId,
              online_at: new Date().toISOString(),
              socket_id: socketId,
            });
            
            logger.info(`User ${userId} subscribed to realtime`);
            this.emit('user:subscribed', { userId, channelName });
          }
        });

      this.userChannels.set(channelName, channel);

      // Setup message batching for this user
      this.setupMessageBatching(userId);

      // Send initial sync data
      await this.sendInitialSync(userId);
    } catch (error) {
      logger.error(`Error subscribing user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Unsubscribe user from real-time updates
   */
  async unsubscribeUser(userId: string) {
    const channelName = `user:${userId}`;
    const channel = this.userChannels.get(channelName);
    
    if (channel) {
      await supabase.removeChannel(channel);
      this.userChannels.delete(channelName);
      
      // Clear message buffer and interval
      this.messageBuffers.delete(userId);
      const interval = this.syncIntervals.get(userId);
      if (interval) {
        clearInterval(interval);
        this.syncIntervals.delete(userId);
      }
      
      logger.info(`User ${userId} unsubscribed from realtime`);
      this.emit('user:unsubscribed', { userId });
    }
  }

  /**
   * Handle user broadcast events
   */
  private handleUserBroadcast(userId: string, payload: any) {
    logger.debug('Realtime event broadcast', { event: payload.event });
    
    // Buffer messages for batching
    if (payload.event.startsWith('message:')) {
      this.bufferMessage(userId, {
        id: `${Date.now()}-${Math.random()}`,
        userId,
        type: 'message',
        payload: payload.payload,
        timestamp: new Date(),
      });
    } else {
      // Emit immediately for non-message events
      this.emit(`user:${userId}:${payload.event}`, payload.payload);
    }
  }

  /**
   * Handle presence sync
   */
  private handlePresenceSync(userId: string, state: any) {
    const onlineUsers = Object.keys(state).map(key => state[key][0]);
    
    this.emit(`user:${userId}:presence`, {
      online: onlineUsers,
      count: onlineUsers.length,
    });
  }

  /**
   * Setup message batching for a user
   */
  private setupMessageBatching(userId: string) {
    // Initialize buffer
    this.messageBuffers.set(userId, []);
    
    // Setup flush interval (every 100ms)
    const interval = setInterval(() => {
      this.flushMessageBuffer(userId);
    }, 100);
    
    this.syncIntervals.set(userId, interval);
  }

  /**
   * Buffer message for batching
   */
  private bufferMessage(userId: string, message: RealtimeMessage) {
    const buffer = this.messageBuffers.get(userId) || [];
    buffer.push(message);
    this.messageBuffers.set(userId, buffer);
    
    // Flush immediately if buffer is large
    if (buffer.length >= 10) {
      this.flushMessageBuffer(userId);
    }
  }

  /**
   * Flush message buffer
   */
  private flushMessageBuffer(userId: string) {
    const buffer = this.messageBuffers.get(userId);
    if (!buffer || buffer.length === 0) return;
    
    // Clear buffer
    this.messageBuffers.set(userId, []);
    
    // Emit batched messages
    this.emit(`user:${userId}:messages:batch`, buffer);
    
    // Also broadcast via Supabase
    this.broadcastToUser(userId, 'messages:batch', buffer);
  }

  /**
   * Send initial sync data to user
   */
  private async sendInitialSync(userId: string) {
    try {
      const [{ data: messages }, { data: loops }, { data: contacts }] = await Promise.all([
        supabase
          .from('messages')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('loops')
          .select('*')
          .eq('user_id', userId)
          .in('status', ['pending', 'in_progress'])
          .order('created_at', { ascending: false }),
        supabase
          .from('contacts')
          .select('*')
          .eq('user_id', userId)
          .order('name', { ascending: true }),
      ]);

      // Send initial data
      this.broadcastToUser(userId, 'sync:initial', {
        messages: (messages ?? []).slice().reverse(),
        loops: loops ?? [],
        contacts: contacts ?? [],
        timestamp: new Date(),
      });
    } catch (error) {
      logger.error(`Error sending initial sync to user ${userId}:`, error);
    }
  }

  /**
   * Broadcast to specific user
   */
  async broadcastToUser(userId: string, event: string, data: any) {
    const channelName = `user:${userId}`;
    const channel = this.userChannels.get(channelName);
    
    if (channel) {
      await channel.send({
        type: 'broadcast',
        event,
        payload: data,
      });
    }
  }

  /**
   * Broadcast to multiple users
   */
  async broadcastToUsers(userIds: string[], event: string, data: any) {
    const promises = userIds.map(userId => 
      this.broadcastToUser(userId, event, data)
    );
    await Promise.all(promises);
  }

  /**
   * Send typing indicator
   */
  async sendTypingIndicator(userId: string, chatId: string, isTyping: boolean) {
    await this.broadcastToUser(userId, 'typing', {
      chatId,
      isTyping,
      timestamp: new Date(),
    });
  }

  /**
   * Get online users in a channel
   */
  async getOnlineUsers(channelName: string): Promise<string[]> {
    const channel = this.userChannels.get(channelName);
    if (!channel) return [];
    
    const state = channel.presenceState();
    return Object.keys(state).map(key => state[key][0].user_id);
  }

  /**
   * Sync message read status
   */
  async syncReadStatus(userId: string, messageIds: string[]) {
    try {
      // Update database
      await supabase
        .from('messages')
        .update({ is_read: true })
        .in('id', messageIds)
        .eq('user_id', userId);

      // Broadcast update
      await this.broadcastToUser(userId, 'messages:read', {
        messageIds,
        readAt: new Date(),
      });
    } catch (error) {
      logger.error('Error syncing read status:', error);
    }
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    // Unsubscribe all users
    for (const [, channel] of this.userChannels) {
      await supabase.removeChannel(channel);
    }
    this.userChannels.clear();
    
    // Clear all intervals
    for (const interval of this.syncIntervals.values()) {
      clearInterval(interval);
    }
    this.syncIntervals.clear();
    
    // Clear buffers
    this.messageBuffers.clear();
    
    logger.info('Realtime sync service cleaned up');
  }
}

// Export singleton instance
export const realtimeSync = new RealtimeSyncService();
