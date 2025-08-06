import { redis } from './redis';
import { logger } from '../utils/logger';
import crypto from 'crypto';

interface CachedResponse {
  suggestions: string[];
  confidence: number;
  reasoning?: string;
  messageType?: string;
  timestamp: number;
  ttl: number;
}

class ResponseCache {
  private defaultTTL = 3600; // 1 hour in seconds
  private keyPrefix = 'ai_response:';

  /**
   * Generate cache key from message content and user context
   */
  private generateCacheKey(content: string, userId: string): string {
    const hash = crypto
      .createHash('sha256')
      .update(`${content}:${userId}`)
      .digest('hex')
      .substring(0, 16);
    
    return `${this.keyPrefix}${hash}`;
  }

  /**
   * Get cached response if available
   */
  async get(content: string, userId: string): Promise<CachedResponse | null> {
    try {
      const key = this.generateCacheKey(content, userId);
      const cached = await redis.get(key);
      
      if (!cached) return null;
      
      const response: CachedResponse = JSON.parse(cached);
      
      // Check if cache is still valid
      const now = Date.now();
      if (now - response.timestamp > response.ttl * 1000) {
        await this.delete(content, userId);
        return null;
      }
      
      logger.debug(`Cache hit for key: ${key}`);
      return response;
    } catch (error) {
      logger.error('Error getting cached response:', error);
      return null;
    }
  }

  /**
   * Cache a response
   */
  async set(
    content: string,
    userId: string,
    response: {
      suggestions: string[];
      confidence: number;
      reasoning?: string;
      messageType?: string;
    },
    ttl?: number
  ): Promise<void> {
    try {
      const key = this.generateCacheKey(content, userId);
      const cacheData: CachedResponse = {
        ...response,
        timestamp: Date.now(),
        ttl: ttl || this.defaultTTL,
      };
      
      await redis.setex(key, cacheData.ttl, JSON.stringify(cacheData));
      logger.debug(`Cached response for key: ${key}`);
    } catch (error) {
      logger.error('Error caching response:', error);
    }
  }

  /**
   * Delete cached response
   */
  async delete(content: string, userId: string): Promise<void> {
    try {
      const key = this.generateCacheKey(content, userId);
      await redis.del(key);
      logger.debug(`Deleted cache for key: ${key}`);
    } catch (error) {
      logger.error('Error deleting cached response:', error);
    }
  }

  /**
   * Clear all cached responses for a user
   */
  async clearUserCache(userId: string): Promise<void> {
    try {
      const pattern = `${this.keyPrefix}*${userId}*`;
      const keys = await redis.keys(pattern);
      
      if (keys.length > 0) {
        await redis.del(...keys);
        logger.info(`Cleared ${keys.length} cached responses for user ${userId}`);
      }
    } catch (error) {
      logger.error('Error clearing user cache:', error);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    totalKeys: number;
    memoryUsage: string;
    hitRate?: number;
  }> {
    try {
      const keys = await redis.keys(`${this.keyPrefix}*`);
      const info = await redis.info('memory');
      
      // Extract memory usage from info string
      const memoryMatch = info.match(/used_memory_human:(\S+)/);
      const memoryUsage = memoryMatch ? memoryMatch[1] : 'unknown';
      
      return {
        totalKeys: keys.length,
        memoryUsage,
      };
    } catch (error) {
      logger.error('Error getting cache stats:', error);
      return {
        totalKeys: 0,
        memoryUsage: 'unknown',
      };
    }
  }

  /**
   * Warm cache with common responses
   */
  async warmCache(commonResponses: Array<{
    content: string;
    userId: string;
    response: {
      suggestions: string[];
      confidence: number;
      reasoning?: string;
      messageType?: string;
    };
  }>): Promise<void> {
    try {
      const promises = commonResponses.map(({ content, userId, response }) =>
        this.set(content, userId, response, this.defaultTTL * 24) // Cache for 24 hours
      );
      
      await Promise.all(promises);
      logger.info(`Warmed cache with ${commonResponses.length} responses`);
    } catch (error) {
      logger.error('Error warming cache:', error);
    }
  }

  /**
   * Cleanup expired cache entries
   */
  async cleanup(): Promise<void> {
    try {
      const keys = await redis.keys(`${this.keyPrefix}*`);
      let deletedCount = 0;
      
      for (const key of keys) {
        const cached = await redis.get(key);
        if (cached) {
          try {
            const response: CachedResponse = JSON.parse(cached);
            const now = Date.now();
            
            if (now - response.timestamp > response.ttl * 1000) {
              await redis.del(key);
              deletedCount++;
            }
          } catch (parseError) {
            // Delete invalid cache entries
            await redis.del(key);
            deletedCount++;
          }
        }
      }
      
      if (deletedCount > 0) {
        logger.info(`Cleaned up ${deletedCount} expired cache entries`);
      }
    } catch (error) {
      logger.error('Error during cache cleanup:', error);
    }
  }

  /**
   * Set cache TTL based on response confidence
   */
  private calculateTTL(confidence: number): number {
    // Higher confidence responses cached longer
    if (confidence >= 0.9) return this.defaultTTL * 4; // 4 hours
    if (confidence >= 0.7) return this.defaultTTL * 2; // 2 hours
    if (confidence >= 0.5) return this.defaultTTL; // 1 hour
    return this.defaultTTL / 2; // 30 minutes
  }

  /**
   * Set response with confidence-based TTL
   */
  async setWithConfidenceTTL(
    content: string,
    userId: string,
    response: {
      suggestions: string[];
      confidence: number;
      reasoning?: string;
      messageType?: string;
    }
  ): Promise<void> {
    const ttl = this.calculateTTL(response.confidence);
    await this.set(content, userId, response, ttl);
  }
}

// Export singleton instance
export const responseCache = new ResponseCache();

// Schedule cleanup every hour
setInterval(() => {
  responseCache.cleanup().catch(error => {
    logger.error('Error in scheduled cache cleanup:', error);
  });
}, 3600 * 1000);