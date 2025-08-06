import Redis from 'ioredis';
import { redisConfig } from '../config';
import { logger } from '../utils/logger';

class RedisService {
  private client: Redis | null = null;
  private subscriber: Redis | null = null;
  private publisher: Redis | null = null;

  constructor() {
    this.connect();
  }

  private connect() {
    try {
      // Main client for general operations
      this.client = new Redis({
        host: redisConfig.host,
        port: redisConfig.port,
        password: redisConfig.password,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
      });

      // Separate clients for pub/sub
      this.subscriber = new Redis({
        host: redisConfig.host,
        port: redisConfig.port,
        password: redisConfig.password,
      });

      this.publisher = new Redis({
        host: redisConfig.host,
        port: redisConfig.port,
        password: redisConfig.password,
      });

      this.client.on('connect', () => {
        logger.info('Redis connected');
      });

      this.client.on('error', (error) => {
        logger.error('Redis error:', error);
      });

      this.client.on('close', () => {
        logger.warn('Redis connection closed');
      });

    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  // Key-value operations
  async get(key: string): Promise<string | null> {
    if (!this.client) throw new Error('Redis not connected');
    return await this.client.get(key);
  }

  async set(key: string, value: string): Promise<void> {
    if (!this.client) throw new Error('Redis not connected');
    await this.client.set(key, value);
  }

  async setex(key: string, seconds: number, value: string): Promise<void> {
    if (!this.client) throw new Error('Redis not connected');
    await this.client.setex(key, seconds, value);
  }

  async del(key: string): Promise<void> {
    if (!this.client) throw new Error('Redis not connected');
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    if (!this.client) throw new Error('Redis not connected');
    const result = await this.client.exists(key);
    return result === 1;
  }

  async expire(key: string, seconds: number): Promise<void> {
    if (!this.client) throw new Error('Redis not connected');
    await this.client.expire(key, seconds);
  }

  async ttl(key: string): Promise<number> {
    if (!this.client) throw new Error('Redis not connected');
    return await this.client.ttl(key);
  }

  async keys(pattern: string): Promise<string[]> {
    if (!this.client) throw new Error('Redis not connected');
    return await this.client.keys(pattern);
  }

  // Hash operations
  async hget(key: string, field: string): Promise<string | null> {
    if (!this.client) throw new Error('Redis not connected');
    return await this.client.hget(key, field);
  }

  async hset(key: string, field: string, value: string): Promise<void> {
    if (!this.client) throw new Error('Redis not connected');
    await this.client.hset(key, field, value);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    if (!this.client) throw new Error('Redis not connected');
    return await this.client.hgetall(key);
  }

  async hdel(key: string, field: string): Promise<void> {
    if (!this.client) throw new Error('Redis not connected');
    await this.client.hdel(key, field);
  }

  // List operations
  async lpush(key: string, value: string): Promise<void> {
    if (!this.client) throw new Error('Redis not connected');
    await this.client.lpush(key, value);
  }

  async rpush(key: string, value: string): Promise<void> {
    if (!this.client) throw new Error('Redis not connected');
    await this.client.rpush(key, value);
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    if (!this.client) throw new Error('Redis not connected');
    return await this.client.lrange(key, start, stop);
  }

  async llen(key: string): Promise<number> {
    if (!this.client) throw new Error('Redis not connected');
    return await this.client.llen(key);
  }

  // Set operations
  async sadd(key: string, member: string): Promise<void> {
    if (!this.client) throw new Error('Redis not connected');
    await this.client.sadd(key, member);
  }

  async srem(key: string, member: string): Promise<void> {
    if (!this.client) throw new Error('Redis not connected');
    await this.client.srem(key, member);
  }

  async smembers(key: string): Promise<string[]> {
    if (!this.client) throw new Error('Redis not connected');
    return await this.client.smembers(key);
  }

  async sismember(key: string, member: string): Promise<boolean> {
    if (!this.client) throw new Error('Redis not connected');
    const result = await this.client.sismember(key, member);
    return result === 1;
  }

  // Pub/Sub operations
  async publish(channel: string, message: string): Promise<void> {
    if (!this.publisher) throw new Error('Redis publisher not connected');
    await this.publisher.publish(channel, message);
  }

  async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    if (!this.subscriber) throw new Error('Redis subscriber not connected');
    
    await this.subscriber.subscribe(channel);
    
    this.subscriber.on('message', (receivedChannel, message) => {
      if (receivedChannel === channel) {
        callback(message);
      }
    });
  }

  async unsubscribe(channel: string): Promise<void> {
    if (!this.subscriber) throw new Error('Redis subscriber not connected');
    await this.subscriber.unsubscribe(channel);
  }

  // Session management specific methods
  async saveSession(sessionId: string, data: any, ttlSeconds: number = 86400): Promise<void> {
    const key = `session:${sessionId}`;
    await this.setex(key, ttlSeconds, JSON.stringify(data));
  }

  async getSession(sessionId: string): Promise<any | null> {
    const key = `session:${sessionId}`;
    const data = await this.get(key);
    return data ? JSON.parse(data) : null;
  }

  async deleteSession(sessionId: string): Promise<void> {
    const key = `session:${sessionId}`;
    await this.del(key);
  }

  async extendSession(sessionId: string, ttlSeconds: number = 86400): Promise<void> {
    const key = `session:${sessionId}`;
    await this.expire(key, ttlSeconds);
  }

  // Clean up
  async disconnect(): Promise<void> {
    if (this.client) await this.client.quit();
    if (this.subscriber) await this.subscriber.quit();
    if (this.publisher) await this.publisher.quit();
  }

  // Utility methods
  async ping(): Promise<boolean> {
    if (!this.client) return false;
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  async flushdb(): Promise<void> {
    if (!this.client) throw new Error('Redis not connected');
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Cannot flush database in production');
    }
    await this.client.flushdb();
  }
}

// Export singleton instance
export const redis = new RedisService();