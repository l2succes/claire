import { createClient } from '@supabase/supabase-js';
import { supabaseConfig } from '../config';
import { logger } from '../utils/logger';

// Initialize Supabase client with service role key for server-side operations
export const supabase = createClient(
  supabaseConfig.url,
  supabaseConfig.serviceKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Initialize Supabase client with anon key for client-facing operations
export const supabasePublic = createClient(
  supabaseConfig.url,
  supabaseConfig.anonKey
);

// Auth helper functions
export const authHelpers = {
  /**
   * Verify a JWT token and get user
   */
  async verifyToken(token: string) {
    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      
      if (error) {
        logger.error('Token verification failed:', error);
        return null;
      }
      
      return user;
    } catch (error) {
      logger.error('Token verification error:', error);
      return null;
    }
  },

  /**
   * Create a new user
   */
  async createUser(email: string, password: string, metadata?: any) {
    try {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: metadata,
      });

      if (error) {
        logger.error('User creation failed:', error);
        throw error;
      }

      return data.user;
    } catch (error) {
      logger.error('User creation error:', error);
      throw error;
    }
  },

  /**
   * Update user metadata
   */
  async updateUserMetadata(userId: string, metadata: any) {
    try {
      const { data, error } = await supabase.auth.admin.updateUserById(
        userId,
        { user_metadata: metadata }
      );

      if (error) {
        logger.error('User update failed:', error);
        throw error;
      }

      return data.user;
    } catch (error) {
      logger.error('User update error:', error);
      throw error;
    }
  },

  /**
   * Delete a user
   */
  async deleteUser(userId: string) {
    try {
      const { error } = await supabase.auth.admin.deleteUser(userId);
      
      if (error) {
        logger.error('User deletion failed:', error);
        throw error;
      }
      
      return true;
    } catch (error) {
      logger.error('User deletion error:', error);
      throw error;
    }
  },
};

// Database helper functions
export const dbHelpers = {
  /**
   * Get user profile
   */
  async getUserProfile(userId: string) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      logger.error('Failed to get user profile:', error);
      return null;
    }

    return data;
  },

  /**
   * Update user profile
   */
  async updateUserProfile(userId: string, updates: any) {
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      logger.error('Failed to update user profile:', error);
      throw error;
    }

    return data;
  },

  /**
   * Create or update user profile
   */
  async upsertUserProfile(profile: any) {
    const { data, error } = await supabase
      .from('users')
      .upsert(profile)
      .select()
      .single();

    if (error) {
      logger.error('Failed to upsert user profile:', error);
      throw error;
    }

    return data;
  },
};

// Realtime subscriptions
export class RealtimeService {
  private subscriptions: Map<string, any> = new Map();

  /**
   * Subscribe to table changes
   */
  subscribeToTable(
    table: string,
    filter?: { column: string; value: any },
    callback?: (payload: any) => void
  ) {
    const channelName = filter 
      ? `${table}:${filter.column}=eq.${filter.value}`
      : `${table}:*`;

    if (this.subscriptions.has(channelName)) {
      return this.subscriptions.get(channelName);
    }

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: table,
          filter: filter ? `${filter.column}=eq.${filter.value}` : undefined,
        },
        (payload) => {
          logger.info(`Realtime event on ${table}:`, payload);
          if (callback) callback(payload);
        }
      )
      .subscribe();

    this.subscriptions.set(channelName, channel);
    return channel;
  }

  /**
   * Subscribe to presence (online users)
   */
  subscribeToPresence(channelName: string, userId: string) {
    const channel = supabase.channel(channelName);
    
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        logger.info('Presence sync:', state);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        logger.info('User joined:', key, newPresences);
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        logger.info('User left:', key, leftPresences);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: userId,
            online_at: new Date().toISOString(),
          });
        }
      });

    this.subscriptions.set(channelName, channel);
    return channel;
  }

  /**
   * Broadcast to channel
   */
  async broadcast(channelName: string, event: string, payload: any) {
    const channel = supabase.channel(channelName);
    
    await channel.send({
      type: 'broadcast',
      event,
      payload,
    });
  }

  /**
   * Unsubscribe from channel
   */
  async unsubscribe(channelName: string) {
    const channel = this.subscriptions.get(channelName);
    
    if (channel) {
      await supabase.removeChannel(channel);
      this.subscriptions.delete(channelName);
    }
  }

  /**
   * Unsubscribe from all channels
   */
  async unsubscribeAll() {
    for (const [name, channel] of this.subscriptions) {
      await supabase.removeChannel(channel);
    }
    this.subscriptions.clear();
  }
}

export const realtime = new RealtimeService();